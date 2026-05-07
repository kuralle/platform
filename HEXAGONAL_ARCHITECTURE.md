# Kuralle Architecture — Ports & Adapters

Status: **locked architecture pattern** — used by Drizzle codegen, the runtime
host, every platform port, and every deployment target. Companion doc to
`DATA_MODEL.md` (the schema) and `INTERFACE_DESIGNS_RuntimeHost.md` (the
runtime port chosen via `/design-an-interface`).

---

## 1. The pattern, named honestly

Hexagonal Architecture (Alistair Cockburn, 2005), aka Ports and Adapters. The
domain — the agent editor, the conversation lifecycle, the projection worker —
expresses what it needs as **ports** (TypeScript interfaces). Two adapter
packages provide platform-specific implementations: `@kuralle/platform-cloudflare`
and `@kuralle/platform-node`. The deployment entry points wire one adapter
into the domain at startup.

This is not a future option. **Both adapters ship from day one.** The Node
adapter exists not because we want to deploy on Fly tomorrow but because if
we don't write it, Cloudflare-isms leak into the domain and the rewrite cost
goes up linearly.

```
                    ┌──────────────────────────────────────────────┐
                    │                  DOMAIN                       │
                    │         (zero platform imports)               │
                    │                                               │
                    │   packages/core      ← schemas, repositories  │
                    │   packages/api       ← oRPC routers           │
                    │   packages/db        ← Drizzle schema         │
                    │   packages/runtime   ← AriaFlow wiring        │
                    │                                               │
                    │      depends only on                          │
                    │      packages/platform/interface.ts           │
                    └──────────────────────────────────────────────┘
                                       │
                                       ▼
              ┌───────────────────────────────────────────────────┐
              │          packages/platform/interface.ts            │
              │     KvStore · BlobStore · MessageQueue ·           │
              │     ActorHost · SessionStore · RuntimeHost ·       │
              │     AuthAdapter · LlmGateway                       │
              └───────────────────────────────────────────────────┘
                          ▲                          ▲
                          │                          │
        ┌─────────────────┴───────────┐  ┌──────────┴────────────────┐
        │ @kuralle/platform-cloudflare │  │ @kuralle/platform-node    │
        │  Workers · DO · Container    │  │ Hono · Redis · BullMQ ·   │
        │  KV · R2 · Queues · Hyperdr. │  │ S3 · Fly Machines API     │
        └──────────────────────────────┘  └───────────────────────────┘
                          ▲                          ▲
                          │                          │
        ┌─────────────────┴────────────┐  ┌──────────┴────────────────┐
        │   deployments/cloudflare      │  │   deployments/node         │
        │   api-worker.ts · DO classes  │  │   api-server.ts ·          │
        │   webhook-worker.ts ·         │  │   webhook-server.ts ·      │
        │   projector-worker.ts ·       │  │   projector-service.ts ·   │
        │   workspace-voice-do.ts ·     │  │   runtime-service.ts ·     │
        │   voice-container/Dockerfile  │  │   messaging-service.ts     │
        └───────────────────────────────┘  └────────────────────────────┘
```

The horizontal lines are the architectural seams. The vertical arrows show
where each layer is allowed to import from. `core/` cannot import from
`platform/cloudflare/` directly — only from `platform/interface.ts`. This
is the discipline.

---

## 2. The eight ports

Eight TypeScript interfaces in `packages/platform/interface.ts`. Each has a
Cloudflare adapter and a Node adapter. The domain code never knows which is
running.

### 2.1 `KvStore` — hot config cache

```typescript
export interface KvStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** Atomic get-or-compute. Single-flight per key within a process. */
  getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    opts?: { ttlSeconds?: number }
  ): Promise<T>;
}
```

Used for: workspace config (vertical, region, complianceMode), tool
catalogue snapshots, model alias → SDK binding, prompt-block resolved text.

| Adapter | Implementation |
|---|---|
| Cloudflare | Workers KV binding |
| Node | Redis (`ioredis`) |

### 2.2 `BlobStore` — durable binary storage

```typescript
export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array | ReadableStream, opts?: BlobPutOpts): Promise<void>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, opts?: { expiresIn?: number; method?: 'GET' | 'PUT' }): Promise<string>;
  list(prefix: string, opts?: { cursor?: string; limit?: number }): Promise<BlobListResult>;
}

export interface BlobPutOpts {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface BlobListResult {
  keys: ReadonlyArray<{ key: string; size: number; uploadedAt: Date }>;
  nextCursor: string | null;
}
```

Used for: conversation audio recordings, KB document originals, transcript
JSONL archives, audit log Glacier exports, future agent bundles, widget embed
asset bundles.

| Adapter | Implementation |
|---|---|
| Cloudflare | R2 binding |
| Node | `@aws-sdk/client-s3` (against R2 or S3) |

R2 is **S3-compatible**, so the Node adapter can talk to R2 from off-Cloudflare
deployments. Saves one ops migration if we go cross-cloud.

### 2.3 `MessageQueue` — sink path

```typescript
export interface MessageQueue {
  publish<T>(topic: string, payload: T, opts?: PublishOpts): Promise<void>;
  publishBatch<T>(topic: string, payloads: T[], opts?: PublishOpts): Promise<void>;
  consume<T>(
    topic: string,
    handler: (msg: ConsumeMessage<T>) => Promise<void>,
    opts?: ConsumeOpts
  ): ConsumerHandle;
}

export interface PublishOpts {
  /** Idempotency key for at-most-once semantics. */
  idempotencyKey?: string;
  /** Per-message routing hint; consumer can use it for sharding. */
  routingKey?: string;
}

export interface ConsumeMessage<T> {
  payload: T;
  attempt: number;
  ack(): Promise<void>;
  nack(opts?: { requeue?: boolean; reason?: string }): Promise<void>;
}

export interface ConsumeOpts {
  concurrency?: number;
  visibilityTimeoutMs?: number;
  maxRetries?: number;
}

export interface ConsumerHandle {
  stop(): Promise<void>;
}
```

Used for: hot append-only streams (`conversation_turns`, `conversation_tool_calls`,
`usage_events`, `guardrail_events`, `audit_log_events`, `webhook_deliveries`,
`session_checkpoints`).

| Adapter | Implementation |
|---|---|
| Cloudflare | Queues bindings (16 sharded queues, see Council §81) |
| Node | BullMQ on Redis |

### 2.4 `RuntimeHost` — agent execution

The full design lives in `INTERFACE_DESIGNS_RuntimeHost.md`. Synthesis: two
channel-typed interfaces (`VoiceRuntimeHost`, `MessagingRuntimeHost`) plus a
`RuntimePlatformDiagnostics` interface, all assembled into a `RuntimePlatform`
factory.

```typescript
export interface RuntimePlatform {
  readonly voice: VoiceRuntimeHost;
  readonly messaging: MessagingRuntimeHost;
  readonly diagnostics: RuntimePlatformDiagnostics;
}
```

| Adapter | Voice | Messaging |
|---|---|---|
| Cloudflare | `WorkspaceVoiceDO` + Container per workspace | DO per conversation, hibernation |
| Node | Fly Machine per workspace, scheduler-managed | Pooled Bun service, sticky-routed via consistent-hash |
| In-memory (tests) | `Map<WorkspaceId, FakeHost>` | `Map<ConversationId, History>` |

### 2.5 `SessionStore` — per-conversation runtime state

This is **AriaFlow's** interface, not Kuralle's. Re-exported for clarity.
Used by the AriaFlow `Runtime` inside a `RuntimeHost` to persist working
memory and flow state.

```typescript
export type { SessionStore } from '@ariaflowagents/core';
```

AriaFlow already ships adapters: `@ariaflowagents/postgres-store`,
`@ariaflowagents/redis-store`, `@ariaflowagents/upstash-store`. Both Kuralle
adapter packages can pick the AriaFlow store that matches.

| Adapter pairing | SessionStore |
|---|---|
| Cloudflare runtime | `@ariaflowagents/postgres-store` (via Hyperdrive) for durable + DO storage for hot session |
| Node runtime | `@ariaflowagents/postgres-store` (via PgBouncer) + Redis for hot |

### 2.6 `AuthAdapter` — better-auth binding

```typescript
export interface AuthAdapter {
  /** Resolve a request to its session + active organization. */
  resolveSession(req: Request): Promise<ResolvedSession | null>;
  /** Issue a session token (used by widget embed flow). */
  issueWidgetToken(opts: { workspaceId: string; channelEndpointId: string; ttlSeconds: number }): Promise<string>;
  /** Verify and decode a widget token. */
  verifyWidgetToken(token: string): Promise<{ workspaceId: string; channelEndpointId: string } | null>;
}

export interface ResolvedSession {
  userId: string;
  sessionId: string;
  activeOrganizationId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}
```

Better-auth ships adapters for both runtimes — Cloudflare and Node. Wraps the
`organization` plugin's session resolution so the rest of the codebase doesn't
import `better-auth` directly.

### 2.7 `ActorHost` — generic actor primitive

A narrow port for use cases that don't fit `RuntimeHost` (workflows, batch
processors, scheduled jobs).

```typescript
export interface ActorHost {
  /** Get or create an actor handle. Pinned by id; same id always routes to same actor. */
  actor<T extends ActorClass>(klass: T, id: string): ActorRef<InstanceType<T>>;
}

export interface ActorRef<T> {
  call<K extends keyof T>(method: K, ...args: T[K] extends (...a: infer A) => any ? A : never):
    Promise<T[K] extends (...a: any[]) => Promise<infer R> ? R : never>;
}

export interface ActorClass {
  new (state: ActorState): unknown;
}

export interface ActorState {
  storage: KvStore;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}
```

Used for: outbound batch worker (one actor per batch), workspace policy
worker (one actor per workspace), webhook delivery retry actor.

| Adapter | Implementation |
|---|---|
| Cloudflare | Durable Object with `idFromName` |
| Node | Pooled Bun process with consistent-hash routing on actor id, Redis-backed `state.storage` |

### 2.8 `LlmGateway` — provider proxy

```typescript
export interface LlmGateway {
  /** Returns a configured provider client routed through the gateway. */
  client(provider: 'openai' | 'anthropic' | 'google' | 'custom'): LlmProviderClient;
  /** Pre-flight rate-limit check; returns retry-after-ms if quota exceeded. */
  checkQuota(workspaceId: string, model: string): Promise<{ allowed: boolean; retryAfterMs?: number }>;
}
```

| Adapter | Implementation |
|---|---|
| Cloudflare | Cloudflare AI Gateway (per-workspace routing) |
| Node | Cloudflare AI Gateway (it works from anywhere) OR LiteLLM proxy as fallback |

AI Gateway is platform-agnostic — the URL works from any deployment.

---

## 3. Where each piece lives

```
packages/
├── core/                              # ── DOMAIN: zero platform imports
│   ├── schemas/                       # Zod: AgentIR, ConversationIR, …
│   ├── repositories/                  # AgentRepository, ChannelRepository, …
│   ├── services/                      # publishAgent, routeConversation, projectSnapshot, …
│   └── events/                        # HookEvent, StreamEvent (AriaFlow shapes)
│
├── api/                               # ── DOMAIN: oRPC routers
│   ├── routers/                       # agents, conversations, channels, tools, kb, …
│   └── procedures/                    # one file per procedure, depends only on core/
│
├── db/                                # ── DOMAIN: Drizzle schema + queries
│   ├── schema/                        # one file per aggregate root
│   └── migrations/
│
├── runtime/                           # ── DOMAIN: AriaFlow + Kuralle wiring
│   ├── adapter/                       # IR → AriaFlow primitives translator
│   ├── hooks/                         # HarnessHooks → MessageQueue
│   └── projector/                     # snapshot → projection-table writes
│
├── platform/                          # ── PORTS
│   ├── interface.ts                   # the eight ports
│   ├── cloudflare/                    # ── CF ADAPTER
│   │   ├── kv-store.ts
│   │   ├── blob-store.ts
│   │   ├── message-queue.ts
│   │   ├── runtime-host/
│   │   │   ├── voice.ts               # WorkspaceVoiceDO + Container provisioning
│   │   │   ├── messaging.ts           # ConversationDO with hibernation
│   │   │   └── diagnostics.ts
│   │   ├── actor-host.ts
│   │   ├── auth-adapter.ts
│   │   └── llm-gateway.ts
│   ├── node/                          # ── NODE ADAPTER
│   │   ├── kv-store.ts                # Redis
│   │   ├── blob-store.ts              # S3-API client (R2 or S3)
│   │   ├── message-queue.ts           # BullMQ
│   │   ├── runtime-host/
│   │   │   ├── voice.ts               # Fly Machines API + scheduler
│   │   │   ├── messaging.ts           # pooled Bun service + Redis state
│   │   │   └── diagnostics.ts
│   │   ├── actor-host.ts
│   │   ├── auth-adapter.ts
│   │   └── llm-gateway.ts
│   └── memory/                        # ── IN-MEMORY ADAPTER (tests)
│       └── …                          # all eight ports, Map-backed
│
└── deployments/                       # ── ENTRY POINTS
    ├── cloudflare/
    │   ├── api-worker.ts              # entry: createCloudflareBindings + createApp
    │   ├── webhook-worker.ts
    │   ├── projector-worker.ts
    │   ├── workspace-voice-do.ts      # the DO class
    │   ├── messaging-do.ts
    │   ├── voice-container/
    │   │   ├── Dockerfile             # Bun + AriaFlow + livekit-plugin-transport-ws
    │   │   └── server.mjs             # ports adapted from aria-flow's fly-voice-agent
    │   └── wrangler.toml
    └── node/
        ├── api-server.ts              # entry: createNodeBindings + createApp
        ├── webhook-server.ts
        ├── projector-service.ts
        ├── runtime-service.ts         # voice agent process (mirrors voice-container)
        ├── messaging-service.ts       # pooled messaging actor host
        └── docker-compose.dev.yml     # local Postgres + Redis + MinIO
```

---

## 4. The wiring: deployment entry points

### Cloudflare entry (`deployments/cloudflare/api-worker.ts`)

```typescript
import { Hono } from 'hono';
import { createCloudflareBindings } from '@kuralle/platform/cloudflare';
import { createApp } from '@kuralle/api';

export interface Env {
  // KV bindings
  WORKSPACE_CONFIG_KV: KVNamespace;
  TOOL_CATALOG_KV: KVNamespace;

  // R2
  RECORDINGS_BUCKET: R2Bucket;
  KB_DOCS_BUCKET: R2Bucket;
  ARCHIVES_BUCKET: R2Bucket;

  // Queues (16 sharded for sink)
  CONVERSATION_EVENTS: Queue;
  USAGE_EVENTS: Queue;
  AUDIT_EVENTS: Queue;

  // DO bindings
  WORKSPACE_VOICE_DO: DurableObjectNamespace;
  MESSAGING_DO: DurableObjectNamespace;

  // Postgres + auth
  HYPERDRIVE: Hyperdrive;
  AUTH_SECRETS: SecretsStoreSecret;

  // AI Gateway
  AI_GATEWAY_URL: string;
  AI_GATEWAY_TOKEN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const bindings = createCloudflareBindings(c.env);
  c.set('bindings', bindings);
  await next();
});

app.route('/api', createApp());

export default {
  fetch: app.fetch,
};

// DO classes exported alongside
export { WorkspaceVoiceDO } from './workspace-voice-do';
export { MessagingDO } from './messaging-do';
```

### Node entry (`deployments/node/api-server.ts`)

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createNodeBindings } from '@kuralle/platform/node';
import { createApp } from '@kuralle/api';

const bindings = createNodeBindings({
  redisUrl: process.env.REDIS_URL!,
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    bucket: { recordings: 'kuralle-recordings', kbDocs: 'kuralle-kb', archives: 'kuralle-archives' },
  },
  postgresUrl: process.env.DATABASE_URL!,
  flyApiToken: process.env.FLY_API_TOKEN,
  flyAppName: process.env.FLY_APP_NAME ?? 'kuralle-voice',
  aiGateway: {
    url: process.env.AI_GATEWAY_URL!,
    token: process.env.AI_GATEWAY_TOKEN!,
  },
});

const app = new Hono();
app.use('*', async (c, next) => {
  c.set('bindings', bindings);
  await next();
});
app.route('/api', createApp());

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

**The only line that differs between deployments is the binding factory.** The
`createApp()` is the same. The router is the same. The repositories are the
same. The Drizzle schema is the same. This is the test of the architecture.

---

## 5. The pattern stack

The full pattern composition behind Kuralle's architecture, with attribution:

| Pattern | Source | Where it lives |
|---|---|---|
| **Hexagonal Architecture / Ports & Adapters** | Cockburn, 2005 | `platform/interface.ts` defines ports; `platform/cloudflare/`, `platform/node/`, `platform/memory/` provide adapters |
| **Aggregate Root** | Evans, *DDD* ch. 6 | `agents`, `conversations`, `channel_endpoints`, `tool_catalog_providers`, `batches`, `kb_documents` are aggregate roots; everything else is owned |
| **Declarative Apply / Reconciliation** | Kubernetes API conventions | `agents.publish` accepts an `AgentIR`; backend diffs against current projection, reconciles in one transaction |
| **Memento** | GoF, *Design Patterns* p. 283 | `agent_versions.snapshot jsonb` stores the IR verbatim at publish; rollback = re-decompose |
| **Repository + Identity Map cache** | Fowler, *PoEAA* | `AgentRepository`, `ConversationRepository`, etc. — one per aggregate root, cache-aware |
| **Anti-Corruption Layer** | Evans, *DDD* ch. 14 | `runtime/adapter/` translates `AgentIR` to AriaFlow primitives; AriaFlow shape changes don't leak into the editor or DB |
| **CQRS-lite** | Young, 2010 | Snapshot is the write model; projection tables are the read model. Same source, two indexed surfaces |
| **Channel-typed handles** | Synthesized in `INTERFACE_DESIGNS_RuntimeHost.md` | `VoiceRuntimeHost` and `MessagingRuntimeHost` as separate interfaces; `RuntimePlatform` factory dispatches |

Five of these are well-known. The sixth (channel-typed handles) was chosen
explicitly via parallel design contest. The seventh (CQRS-lite) is the answer
to "if the snapshot is jsonb, how do we keep editor queries fast?"

---

## 6. Discipline that keeps this honest

The architecture survives only if these rules are enforced. Document them
once; review against them every PR.

1. **No file in `core/`, `api/`, `db/`, or `runtime/` may import from
   `platform/cloudflare/` or `platform/node/`.** Only from
   `platform/interface.ts`. ESLint rule + CI check.
2. **Both adapters build in CI, every PR.** If the Node adapter doesn't
   compile, the PR is red — even if production is on Cloudflare. This is
   the test of the architecture.
3. **The in-memory adapter is not optional.** Every port has a Map-backed
   implementation in `platform/memory/`. Used by domain tests. If a port
   is added, its memory adapter is added in the same PR.
4. **End-to-end smoke test on both adapters per release.** A test that
   POSTs an `AgentIR` to `agents.publish`, dispatches an inbound message,
   and asserts the projector wrote rows runs against both deployments
   before any release tag is cut.
5. **Adapter packages are independently versioned.** Bumping
   `@kuralle/platform-cloudflare` doesn't force a Node redeploy. Domain
   stays stable; adapters evolve.
6. **Ports never leak adapter types.** No `R2Bucket`, no `KVNamespace`,
   no `RedisClient` in `platform/interface.ts`. Only platform-neutral
   shapes (`Uint8Array`, `Date`, `string`).
7. **Compliance enforcement is in `core/`, not in adapters.** HIPAA
   timeout clamps, FERPA isolation rules, TCPA disclosure injection —
   all in domain code. Adapters carry out instructions; they don't
   interpret compliance modes.

---

## 7. What this enables (and at what cost)

### Enables

- **Lift-and-shift to Fly/Railway in days, not months.** When the day comes
  (enterprise on-prem, Cloudflare pricing change, sovereign-deploy demand), the
  switch is `process.env.KURALLE_PLATFORM = 'fly'`.
- **Local development without Cloudflare tooling.** Developers run
  `bun run dev:node` against `docker-compose` (Postgres + Redis + MinIO).
  No Wrangler, no Miniflare, no DO local emulator quirks.
- **Customer-specific deployments are a packaging exercise.** An enterprise
  who wants on-prem in their own AWS account: deploy `deployments/node/`
  against their RDS + ElastiCache + S3. No domain code changes.
- **Per-channel adapter mixing.** A workspace can run voice on CF (fast edge)
  and messaging on Fly (cheap pooling) via a `HybridRuntimePlatform`. Falls
  out of the channel-typed `RuntimePlatform` shape.
- **Honest testing.** Domain tests use the in-memory adapter; no
  mocks-of-mocks, no test framework lock-in.

### Costs

- **Two adapter packages to maintain.** Bug fixes happen twice. Mitigation:
  shared test suite that runs against all three adapters (CF, Node, memory).
- **No CF-only optimizations.** No D1, no Pages Functions tricks, no
  Workers-AI direct binding. The team can't reach for these without
  either breaking the abstraction or skipping it.
- **Edge-proximity loss on Node.** A Node deployment runs in one region
  (or a small set). For users far from that region, CF's edge POPs win
  by 50–250ms. Acceptable for a regional product, painful for global SaaS.
  Mitigation: regional Node deploys per `organization.region`.
- **Slightly higher engineering tax up front.** The first port to ship
  takes 2× longer because both adapters are written in parallel. Pays
  off after the third port.
- **Surface-area pressure when ports are added.** Every new port forces:
  (a) interface in `platform/interface.ts`, (b) CF adapter,
  (c) Node adapter, (d) memory adapter, (e) test suite. Discourages
  speculative ports.

The costs are real. The architecture is worth them only if the team
commits to the discipline in §6 — otherwise CF-isms leak into `core/`
within six months and the rewrite cost goes up.

---

## 8. What's NOT a port (deliberately)

These are CF-specific or AriaFlow-specific dependencies the architecture
intentionally lets through, with reasons.

- **Drizzle ORM** is not a port. We use Drizzle directly in
  `db/`. Reason: SQL is the universal language; Drizzle's TS bindings work on
  both Workers and Node runtimes; abstracting Drizzle would gain nothing.
- **AriaFlow is not a port.** `runtime/` imports `@ariaflowagents/core`
  directly. Reason: AriaFlow IS the runtime; abstracting it means abstracting
  what we're building on, which is what `runtime-host` already does at the
  process-hosting layer. The Anti-Corruption Layer in `runtime/adapter/`
  insulates against AriaFlow shape changes without abstracting AriaFlow itself.
- **Zod is not a port.** Universal across runtimes; no adapter needed.
- **better-auth is not a port** — but its session resolution is wrapped in
  `AuthAdapter` to keep auth concerns out of `core/`. Better-auth itself runs
  in both Workers and Node natively.
- **Hono is not a port.** Used directly in `api/`. Reason: Hono runs
  identically on Workers and Node; routing-layer abstraction would be
  pure ceremony.

---

## 9. Migration paths (forward compatibility)

The architecture deliberately supports three future migrations without rewrite:

1. **Add a new platform adapter.** A customer demands GCP + Pub/Sub + GCS.
   Write `@kuralle/platform-gcp`. Implement the eight ports. Add a deployment
   target. Domain code unchanged.
2. **Replace one port without replacing the others.** Cloudflare deprecates
   Queues for some new primitive. Update `platform/cloudflare/message-queue.ts`.
   Domain code unchanged. Other ports unchanged.
3. **Mix adapters per workspace.** A workspace's `organization.region` and
   `complianceMode` can route to a different adapter. The `runtime_deployments`
   table records `platform` per row. Cross-platform fleets are not v1 but the
   schema accommodates them.

The architecture does NOT support, by design:

- **Adding a new aggregate root without going through `core/`.** No shortcut.
- **Skipping the IR for "simple" agents.** Every write goes through
  `AgentIR → publish → snapshot → projection`.
- **Direct Drizzle access from outside `db/`.** Repositories own queries.

---

## 10. References

- Alistair Cockburn, "Hexagonal Architecture" (2005). https://alistair.cockburn.us/hexagonal-architecture/
- Eric Evans, *Domain-Driven Design* (2003). Aggregate Root: ch. 6. ACL: ch. 14.
- Martin Fowler, *Patterns of Enterprise Application Architecture* (2002).
  Repository, Identity Map, Service Layer.
- Gamma et al., *Design Patterns* (1994). Memento p. 283.
- Greg Young, "CQRS Documents" (2010).
- Kubernetes API Conventions: https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md
- AriaFlow runtime: `/Users/mithushancj/Documents/asyncdot/openscoped/aria-flow`
- Mastra patterns we adopted: `MASTRA_PATTERNS_REVIEW.md`
- Runtime host design comparison: `INTERFACE_DESIGNS_RuntimeHost.md`
- Schema source of truth: `DATA_MODEL.md`
