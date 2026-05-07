# Kuralle · Data Model (v3 — locked)

Status: **locked schema specification** — Drizzle codegen unblocked.

This is the single source of truth. Companion docs: `HEXAGONAL_ARCHITECTURE.md`
(ports & adapters), `INTERFACE_DESIGNS_RuntimeHost.md` (runtime host port
chosen via `/design-an-interface`), `scripts/sink-spike/FINDINGS.md` (what
AriaFlow actually emits at sink time). Historical record:
`DATA_MODEL_v2_PROPOSAL.md`, `DATA_MODEL_v2_ARCHITECT_REVIEW.md`,
`DESIGN_PATTERNS_REVIEW.md`, `MASTRA_PATTERNS_REVIEW.md` — kept for audit
trail, no longer authoritative.

> **Auth + tenancy are owned by [better-auth].** Identity (`user`, `session`,
> `account`, `verification`), organization plugin (`organization`, `member`,
> `invitation`), and apiKey plugin (`apikey`) ship through
> `npx @better-auth/cli generate`. Custom columns are added via better-auth's
> `additionalFields` config — not by editing the generated SQL.
>
> Throughout this doc we keep the **product** vocabulary "workspace"
> (matching `useWorkspace()` in the UI) but the underlying table is
> better-auth's `organization`. Read `workspace ≡ organization` and
> `membership ≡ member`.

[better-auth]: https://www.better-auth.com/docs/plugins/organization

---

## 0 · What this has to do

The schema must back every screen, serialise into AriaFlow primitives without
translation, and carry the full lifecycle of a unified communication inbox:
voice + WhatsApp + Messenger + Instagram + web chat + SMS.

Concretely:

- **Every screen → a write home or explicit read path.** No orphans.
- **AriaFlow primitives preserved.** The runtime imports `Agent`,
  `FlowAgent`, `FlowManager`, `Runtime`, `Tool`, `MemoryService`,
  `SessionStore`. The schema serialises to those shapes.
- **Channel-polymorphic from day one.** Voice and WhatsApp ship in v1;
  Messenger, Instagram, web chat, SMS slot in without restructuring.
- **AriaFlow is the runtime, Cloudflare is the platform** — but the
  schema is platform-agnostic. Hexagonal architecture means the same
  schema runs against the Cloudflare adapter or the Node/Fly adapter.
- **Audit-grade.** HIPAA / FERPA / TCPA / EU AI Act compliance. Append-only
  audit log, soft-delete with retention windows, partition-archive monthly.
- **Multi-region ready.** `organization.region` carries from day one; routing
  middleware reads it; data-locality enforced via per-region Hyperdrive /
  PgBouncer endpoints.

What this doc deliberately does **not** decide:

- Physical sharding / read-replica placement
- Stripe price IDs / exact billing meters
- Concrete embedding model selection (we model the column, not the value)

---

## 1 · Tenancy strategy

**Shared schema, `workspaceId` on every domain table.** Standard SaaS pattern.
Hard isolation (DB-per-tenant) reserved for enterprise escape hatches.

```
user ──┐                                        (better-auth core)
       ├── member (user × organization + role)  (organization plugin)
       ├── invitation                           (organization plugin)
       ├── session / account / verification     (better-auth core)
organization ──┐                                (organization plugin = "workspace")
               ├── apikey                       (apiKey plugin)
               ├── agents · agent_versions
               ├── kb_documents · kb_chunks
               ├── conversations · voice_calls · messaging_threads
               ├── runtime_sessions · session_checkpoints · runtime_deployments
               ├── batches · batch_recipients
               ├── channel_connections · channel_endpoints · routing_rules
               ├── tools · tool_catalog_providers
               ├── widgets (presentational config only)
               ├── secrets · webhooks · webhook_deliveries
               ├── audit_log_events
               ├── agent_guardrails · guardrail_events · agent_eval_criteria
               ├── billing_subscriptions · usage_events · monthly_receipts
               ├── workspace_compliance_posture · compliance_evaluations
               └── voices
```

### Roles

Strict ladder, four levels — each strictly contains the one below:

| Role     | Workspace settings | Billing | Invite | Edit agents/docs/workflows | Read |
|----------|--------------------|---------|--------|----------------------------|------|
| `owner`  | ✓ + delete         | ✓       | ✓      | ✓                          | ✓    |
| `admin`  | ✓                  |         | ✓      | ✓                          | ✓    |
| `member` |                    |         |        | ✓                          | ✓    |
| `viewer` |                    |         |        |                            | ✓    |

Registered via better-auth's `access()` config.

### Row-level enforcement

Two layers:

1. **Application-side guard.** A `withWorkspace(req)` middleware reads
   `session.activeOrganizationId` and scopes every query through the
   `AgentRepository` / `ConversationRepository` / etc. — no raw `db.select()`
   in route handlers.
2. **Postgres RLS, deferred.** RLS policies land post-MVP via `CREATE POLICY`
   statements (no schema change). Two GUCs: `app.workspace_id` and
   `app.workspace_role`. Stricter policy on `secrets` and
   `channel_connections.credentialsSecretId` — owner+admin only.

### Personal workspaces

Every user gets exactly one `personal: true` workspace on signup.
Single users are a degenerate case of a workspace; bolting tenancy on later
costs 10× more than designing it in.

---

## 2 · Domain map

```
              ┌──────────┐     ┌────────────┐
              │   user   │◄────│   member   │────►┐    (better-auth)
              └──────────┘     └────────────┘     │
                                                  ▼
                                        ┌────────────────┐
                                        │  organization  │   (= "workspace")
                                        └────────────────┘
                                                  │
       ┌──────────────────────┬───────────────────┼──────────────────────┬──────────────────┐
       ▼                      ▼                   ▼                      ▼                  ▼
 ┌──────────┐         ┌────────────────┐   ┌──────────────┐      ┌──────────────┐    ┌──────────┐
 │  agents  │         │ kb_documents   │   │ conversations │      │   batches   │    │ channel_ │
 │   ↓      │         │  + kb_chunks   │   │   + voice_    │      │  + batch_    │    │ connect. │
 │ agent_   │         └────────────────┘   │     calls     │      │  recipients  │    │   ↓      │
 │ versions │                              │   + messaging_│      └──────────────┘    │ channel_ │
 │ (snapshot│                              │     threads   │                          │ endpoints│
 │  jsonb)  │                              └──────────────┘                          │   ↓      │
 │   ↓      │                                      │                                  │ routing_ │
 │ projection                                conversation_turns                       │  rules   │
 │  tables  │                                conversation_tool_calls                  └──────────┘
 │  (read)  │                                conversation_extracted_fields
 └──────────┘                                conversation_evals
                                             runtime_sessions
                                                   ├─ session_checkpoints
                                                   └─ runtime_deployments
        Workspace-scoped supporting:
          tools · tool_catalog_providers · voices · secrets
          webhooks · webhook_deliveries · audit_log_events
          agent_guardrails · guardrail_events · agent_eval_criteria
          billing_subscriptions · usage_events · monthly_receipts
          workspace_compliance_posture · compliance_evaluations
```

---

## 3 · Identity, tenancy, auth — owned by better-auth

Generated from better-auth's schema (core + `organization` + `apiKey`).
We don't author migrations for these — we configure better-auth and let
`npx @better-auth/cli generate` emit the Drizzle files.

Generated columns marked `// bA`; our extensions marked `// +ext`.

### `user` (better-auth core)

```ts
user {
  id            text       primary key   // bA — nanoid via advanced.generateId
  email         text       unique not null
  emailVerified boolean    default false
  name          text       not null
  image         text                      // bA
  createdAt     timestamp  default now()
  updatedAt     timestamp
  // +ext via additionalFields
  systemRole    enum('user','staff','superadmin') default 'user'
  lastSeenAt    timestamp
}
indexes: (email), (lastSeenAt desc)
```

### `session`, `account`, `verification` (better-auth core)

Standard better-auth shapes. `session.activeOrganizationId` set by the
organization plugin and read by `withWorkspace` middleware.

### `organization` (= workspace)

```ts
organization {
  id              text       primary key   // bA — ws_<nanoid>
  name            text       not null
  slug            text       unique not null
  logo            text
  metadata        text                      // bA — JSON; avoid; prefer +ext
  createdAt       timestamp  default now()
  // +ext
  vertical        enum('home-services','appointment-services','education')
  environment     enum('production','staging','sandbox')   default 'production'
  region          enum('us-east-1','us-west-2','eu-west-1') default 'us-east-1'
  isPersonal      boolean    default false
  createdByUserId text       references user(id)
  updatedAt       timestamp
  deletedAt       timestamp
  complianceMode  enum('none','hipaa','ferpa','tcpa') default 'none'
}
indexes: (slug), (createdByUserId), (deletedAt) where deletedAt is null
```

### `member` (organization plugin)

```ts
member {
  id              text       primary key
  userId          text       references user(id) on delete cascade
  organizationId  text       references organization(id) on delete cascade
  role            text       not null  -- 'owner' | 'admin' | 'member' | 'viewer'
  createdAt       timestamp  default now()
  // +ext
  invitedBy       text       references user(id)
  lastActiveAt    timestamp
  unique (userId, organizationId)
}
indexes: (organizationId, role), (userId)
```

### `invitation` (organization plugin)

Pending memberships. better-auth issues tokens, handles accept/decline.

### `apikey` (apiKey plugin)

Programmatic access. better-auth owns hashing, prefix display, rate-limit
metadata. We attach to organization via `+ext` column.

```ts
apikey {
  // ...all bA fields...
  // +ext
  organizationId  text       references organization(id) on delete cascade
  revokedAt       timestamp
}
indexes: (organizationId, revokedAt), (start)
```

---

## 4 · Knowledge base

### `kb_documents`

Workspace-shared. Source of truth lives here; agents reference via
`agent_versions.snapshot.kbAttachments`.

```ts
kb_documents {
  id              text       primary key  // kb_<nanoid>
  workspaceId     text       references organization(id) on delete cascade
  folder          text
  name            text       not null
  source          enum('file','url','text') not null
  sourceUrl       text
  storageKey      text                              // R2 key
  contentText     text
  sizeBytes       integer    not null
  status          enum('ready','indexing','needs_refresh','failed') default 'indexing'
  ragIndexed      boolean    default false
  embeddingModel  text
  autoSync        boolean    default false
  lastSyncedAt    timestamp
  createdByUserId text       references user(id)
  createdAt       timestamp  default now()
  updatedAt       timestamp
  deletedAt       timestamp
}
indexes: (workspaceId, deletedAt) where deletedAt is null,
         (workspaceId, folder), (workspaceId, status)
```

### `kb_chunks`

RAG chunks. `pgvector` extension. Engine-managed, not exposed in UI.

```ts
kb_chunks {
  id          text       primary key
  documentId  text       references kb_documents(id) on delete cascade
  ordinal     integer    not null
  content     text       not null
  embedding   vector(1024)
  tokenCount  integer
  createdAt   timestamp  default now()
}
indexes: (documentId, ordinal),
         using ivfflat (embedding vector_cosine_ops) with (lists = 100)
```

`pgvector` stays as v1 (NOT Vectorize) — transactional updates with
`kb_documents`, RLS isolation, single source of truth. Promote to Vectorize
only if `kb_chunks` exceeds 10M rows OR ivfflat lookup p95 exceeds 50ms.

---

## 5 · Agents — two-row split (Mastra-pattern)

### `agents` — thin metadata record

```ts
agents {
  id                text       primary key  // ag_<nanoid>
  workspaceId       text       references organization(id) on delete cascade
  status            enum('draft','published','archived') not null default 'draft'
  activeVersionId   text       references agent_versions(id)        // FK to live version
  authorUserId      text       references user(id)
  metadata          jsonb                                            // free-form
  createdAt         timestamp  default now()
  updatedAt         timestamp
  deletedAt         timestamp
}
indexes: (workspaceId, deletedAt) where deletedAt is null,
         (workspaceId, status),
         (workspaceId, updatedAt desc)
```

The agent record is **just a pointer**. No prompts, models, tool refs, or
config. All configuration lives in `agent_versions`.

### `agent_versions` — full snapshot

```ts
agent_versions {
  id                  text       primary key  // av_<nanoid>
  agentId             text       references agents(id) on delete cascade
  versionNumber       integer    not null
  versionKind         enum('auto_save','manual_save','publish') not null default 'manual_save'
  parentVersionId     text       references agent_versions(id)         // git-style forward compat
  changeSummary       text
  changedFields       text[]    default '{}'
  publishedByUserId   text       references user(id)
  publishedAt         timestamp  default now()

  // Snapshot — the AgentIR Zod-validated jsonb
  snapshot            jsonb      not null
    -- Shape is locked by AgentIR Zod schema in packages/core/schemas:
    --   {
    --     name, description,
    --     instructions: string,                    // flat text in v1; AgentInstructionBlock[] in v2
    --     model: { provider, name, temperature, ... },
    --     defaultOptions: { ... },
    --     toolAttachments:    Record<toolId,    { description?, rules? }>,
    --     workflowAttachments: Record<wfId,      { description? }>,
    --     subagentAttachments: Record<agentId,   { description? }>,
    --     integrationTools:   Record<tcpId,     { selectedTools[] }>,
    --     mcpClientAttachments: Record<clientId, { allowedTools[] }>,
    --     kbAttachments:      [{ documentId }],
    --     guardrailGraph:     StoredProcessorGraph,
    --     scorerAttachments:  Record<criterionId, { weight, samplingRate }>,
    --     voiceConfig:        { pipelineMode, ttsModel, ttsVoiceId, sttModel, ... },
    --     channelConfig:      Record<channelKind, { ... }>,
    --     complianceConfig:   { retentionDays, redactionPatterns, disclosureScript, ... },
    --     requestContextSchema: <JSON Schema>,
    --   }

  // Codegen bundle (forward compat — nullable v1)
  bundleStorageKey    text                                      // R2 key
  bundleHash          text                                      // sha256
  bundleStatus        enum('pending','building','ready','failed')
  bundleSizeBytes     integer
  builderVersion      text
  builtAt             timestamp

  unique (agentId, versionNumber)
}
indexes: (agentId, publishedAt desc),
         (agentId, versionKind, publishedAt desc),
         (bundleHash)
```

**Drafts are unpublished versions.** `agent.status='draft'` + version row with
no `agent.activeVersionId` pointing at it. No `agent_drafts` table.

**Auto-save** writes new version rows with `versionKind='auto_save'` every 30s
debounced from the editor SPA. Nightly prune deletes auto-save rows older than
7 days OR keeps last 10 per agent.

### Projection tables (rebuilt from snapshot on publish)

The snapshot is the source of truth. Editor + supervisor screen queries go
through projection tables, never jsonb-path queries.

```ts
agent_tool_attachments {
  agentVersionId    text       references agent_versions(id) on delete cascade
  toolId            text       references tools(id) on delete cascade
  source            enum('native','workflow','subagent','integration','mcp') not null
  config            jsonb                              // per-attachment overrides
  addedAt           timestamp  default now()
  primary key (agentVersionId, toolId, source)
}
indexes: (toolId)                                      // 'which agents use this tool'

agent_kb_attachments {
  agentVersionId    text       references agent_versions(id) on delete cascade
  documentId        text       references kb_documents(id) on delete cascade
  attachedAt        timestamp  default now()
  primary key (agentVersionId, documentId)
}
indexes: (documentId)                                  // 'which agents use this doc'

agent_guardrails {
  id                text       primary key
  agentVersionId    text       references agent_versions(id) on delete cascade
  name              text       not null
  direction         enum('input','output','both') not null
  evaluationModel   text       not null
  prompt            text       not null
  onTrigger         enum('block','redact','flag','escalate') default 'block'
  enabled           boolean    default true
  ordinal           integer    not null
}
indexes: (agentVersionId, direction, ordinal)

agent_eval_criteria {
  id                text       primary key
  agentVersionId    text       references agent_versions(id) on delete cascade
  name              text       not null
  description       text
  kind              enum('success','data','safety') not null
  rubric            text       not null
  weight            real       default 1
  ordinal           integer    not null
  unique (agentVersionId, name)
}
indexes: (agentVersionId, kind, ordinal)
```

The projection worker writes these on publish. Synchronous in v1 (same
transaction as `agent_versions` insert). Async via Cloudflare Queues if
publish latency exceeds 200ms p95 — schema accommodates with
`agent_versions.projectionsReady boolean` (deferred).

### `voices`

```ts
voices {
  id           text       primary key
  workspaceId  text       references organization(id) on delete cascade  -- NULL = stock catalog
  externalId   text                                  // provider's voice id
  provider     enum('elevenlabs','cartesia','openai','google','deepgram')
  name         text       not null
  language     text       not null
  style        text
  isCloned     boolean    default false
  previewUrl   text
  createdAt    timestamp  default now()
}
indexes: (workspaceId), (provider, externalId)
```

---

## 6 · Workflows (AriaFlow `FlowConfig`)

Workflow data lives inside `agent_versions.snapshot.workflow` jsonb.
Projection tables for editor/supervisor queries:

```ts
workflow_nodes_projection {
  agentVersionId      text       references agent_versions(id) on delete cascade
  nodeId              text       not null     // unique within version
  kind                enum('subagent','extraction','dispatch',
                           'transfer-agent','transfer-number','end')
  title               text       not null
  positionX           integer
  positionY           integer
  primary key (agentVersionId, nodeId)
}
indexes: (agentVersionId, kind)

workflow_edges_projection {
  id                  text       primary key
  agentVersionId      text       references agent_versions(id) on delete cascade
  sourceNodeId        text       not null
  targetNodeId        text       not null
  conditionType       enum('llm','expression','none')
  conditionLabel      text
}
indexes: (agentVersionId, sourceNodeId), (agentVersionId, targetNodeId)
```

Extraction node fields are part of `agent_versions.snapshot.workflow.nodes[].extractionFields[]`
(JSON shape: `{name, type, required, description, ordinal}`). The runtime
synthesizes Zod from these — never persisted as Zod, always JSON Schema-shaped.

---

## 7 · Tools

```ts
tools {
  id                text       primary key  // tool_<nanoid>
  workspaceId       text       references organization(id) on delete cascade   -- NULL = global system catalog
  name              text       not null     // 'service_titan.search_techs'
  displayName       text
  description       text
  kind              enum('webhook','mcp','client','system') not null
  catalogProviderId text       references tool_catalog_providers(id)            -- NULL for native
  externalToolKey   text                                                         -- 'gmail.send_email' for catalog tools
  inputSchema       jsonb                   // Zod-as-JSON-Schema
  outputSchema      jsonb
  config            jsonb      not null
    -- per-kind shape:
    --   webhook: { url, method, auth, headers }
    --   mcp:     { serverUrl, allowedTools[] }
    --   client:  { sdkRegistrationKey }   -- runtime resolves via SDK
    --   system:  { systemToolId }         -- resolves to in-binary impl
  status            enum('active','deprecated','error','deleted') default 'active'
  lastValidatedAt   timestamp
  createdAt         timestamp  default now()
  updatedAt         timestamp
  deletedAt         timestamp
  unique (workspaceId, name)
}
indexes: (workspaceId, kind), (workspaceId, status),
         (catalogProviderId, externalToolKey)
```

`direct` was dropped (`system` is canonical for built-ins).

### `tool_catalog_providers`

```ts
tool_catalog_providers {
  id                  text       primary key  // tcp_<nanoid>
  workspaceId         text       references organization(id) on delete cascade
  kind                enum('composio','arcade','pipedream','mcp-custom','mcp-self-hosted') not null
  displayName         text       not null
  mcpServerUrl        text       not null
  authMode            enum('oauth','api-key','none')
  credentialsSecretId text       references secrets(id)
  status              enum('connected','degraded','error','disabled') default 'connected'
  lastSyncedAt        timestamp                -- last full catalogue pull
  toolsetIds          text[]    default '{}'   -- selected toolset ids
  metadata            jsonb
  createdAt           timestamp  default now()
}
indexes: (workspaceId, kind)
```

**Freshness contract:** pull-on-edit with 15-min cache + nightly resync +
runtime guard on tool-error. Catalogue tools that disappear get
`tools.status='deprecated'`; runtime filters to `status='active'` at
hydration.

---

## 8 · Channels — first-class primitive

### `channel_kind` enum

```
voice          -- PSTN/SIP/Twilio Media Streams (WebSocket transport)
whatsapp       -- Meta WhatsApp Cloud API
messenger      -- Meta Messenger
instagram      -- Meta Instagram Business
web_chat       -- our embedded widget (WebSocket)
sms            -- Twilio SMS (post-MVP, modeled now)
```

### `channel_connections`

Replaces `telephony_connectors`. Generalises to all providers.

```ts
channel_connections {
  id                  text       primary key  // ch_<nanoid>
  workspaceId         text       references organization(id) on delete cascade
  channelKind         channel_kind not null
  provider            text       not null
    -- 'twilio-native' | 'twilio-byo' | 'sip' | 'smartpbx' |
    -- 'meta-whatsapp-cloud' | 'meta-messenger' | 'meta-instagram' |
    -- 'web-widget' | 'twilio-sms'
  displayName         text       not null
  status              enum('connected','available','coming-soon','error','degraded') not null
  credentialsSecretId text       references secrets(id)
  config              jsonb      not null
  capabilities        text[]    default '{}'
  createdAt           timestamp  default now()
  updatedAt           timestamp
  deletedAt           timestamp
}
indexes: (workspaceId, channelKind), (workspaceId, status)
```

For `web-widget`: each workspace gets one synthetic `channel_connections` row
of `provider='web-widget'`. Avoids nullable `connectionId` on
`channel_endpoints`.

### `channel_endpoints`

The addressable identity per channel.

```ts
channel_endpoints {
  id                      text       primary key  // ce_<nanoid>
  workspaceId             text       references organization(id) on delete cascade
  connectionId            text       references channel_connections(id) on delete cascade  not null
  channelKind             channel_kind not null    -- denormalized but with CHECK trigger; see §15
  identifier              text       not null
    -- E.164 for voice/sms/whatsapp; pageId for messenger; igId for instagram;
    -- widget embed token id for web_chat
  displayName             text
  attachedAgentId         text       references agents(id)        -- nullable
  attachedAgentVersionId  text       references agent_versions(id) -- pinned revision
  routingRulesId          text       references routing_rules(id) -- nullable
  publicWebhookUrl        text                                     -- POST endpoint Meta/Twilio call
  publicStreamUrl         text                                     -- WSS endpoint Twilio Media Streams / widget dials
  metadata                jsonb                                    -- presentational config (widget theme, recording flag, etc.)
  createdAt               timestamp  default now()
  releasedAt              timestamp
  unique (channelKind, identifier)
  check (attachedAgentId IS NOT NULL OR routingRulesId IS NOT NULL)
}
indexes: (workspaceId, channelKind, attachedAgentId),
         (publicStreamUrl), (publicWebhookUrl)
```

Subsumes:
- `phone_numbers` — voice/sms rows
- WhatsApp number → agent wiring
- Embed token → agent wiring (the `widgets` table dissolves; presentational
  config moves to `channel_endpoints.metadata` jsonb)

### `routing_rules`

For multi-agent web widget routing. WhatsApp/voice typically use
`attachedAgentId` directly; web widgets use rules.

```ts
routing_rules {
  id                  text       primary key  // rr_<nanoid>
  channelEndpointId   text       references channel_endpoints(id) on delete cascade
  ruleKind            enum('path','query_param','header','default') not null
  pattern             text                                  -- '/sales/*', 'page=support', null for default
  agentId             text       references agents(id) not null
  priority            integer    default 0                  -- lower = higher priority
  createdAt           timestamp  default now()
}
indexes: (channelEndpointId, priority)
```

Router evaluation: if `endpoints.routingRulesId IS NULL` → use
`attachedAgentId`. Otherwise match request path/query against rules,
pick highest-priority match, fall back to `ruleKind='default'`.

---

## 9 · Conversations & runtime

### `conversations` — polymorphic root

```ts
conversations {
  id                  text       primary key  // cv_<nanoid>
  workspaceId         text       references organization(id) on delete cascade
  agentId             text       references agents(id)
  agentVersionId      text       references agent_versions(id)   -- pinned at call start
  bundleHash          text                                       -- runtime artifact pin (nullable v1)
  channelKind         channel_kind not null
  channelEndpointId   text       references channel_endpoints(id)
  threadKey           text       not null
    -- Format: '{channelKind}:{threadId}'
    -- voice → 'voice:<call-sid>' or 'voice:<livekit-room>' (contained behind transport)
    -- whatsapp → 'whatsapp:<wa_id>'
    -- messenger → 'messenger:<psid>'
    -- instagram → 'instagram:<igsid>'
    -- web_chat → 'web:<browser-session>'
    -- sms → 'sms:<phone-pair>'
  direction           enum('inbound','outbound')
  participantId       text                                       -- E.164 / WA id / PSID
  participantName     text
  startedAt           timestamp  default now()
  endedAt             timestamp                                  -- NULL = live (voice) or open (chat)
  durationSec         integer
  outcome             enum('booked','qualified','missed','voicemail',
                          'abandoned','escalated','resolved','dropped')
  recordingStorageKey text                                       -- R2 key
  costUsd             real
  evalsPassed         integer    default 0
  evalsTotal          integer    default 0
  topics              text[]    default '{}'
  metadata            jsonb                                      -- batch_id, dynamic vars, etc

  -- Runtime + archive pointers
  deploymentId        text       references runtime_deployments(id)   -- which container/DO handled this
  turnsArchiveKey     text                                            -- R2 JSONL after archive
  guardrailEventsArchiveKey text

  unique (workspaceId, threadKey, startedAt)
}
indexes: (workspaceId, channelKind, startedAt desc),
         (workspaceId, endedAt) where endedAt is null,
         (agentId, startedAt desc),
         (workspaceId, threadKey),
         (deploymentId, startedAt desc),
         (bundleHash)
```

### `voice_calls` — sidecar (voice only)

```ts
voice_calls {
  conversationId      text       primary key references conversations(id) on delete cascade
  callerId            text       not null     -- E.164
  twilioCallSid       text
  livekitRoom         text                    -- if LiveKit fallback used (post-MVP)
  ringingTimeoutSec   integer    default 60
  voicemailDetected   boolean    default false
  warmTransferTo      text                    -- agent id or E.164
  hangupBy            enum('caller','agent','system','transfer')
}
indexes: (twilioCallSid), (livekitRoom)
```

### `messaging_threads` — sidecar (messaging channels)

Tracks the WindowTracker (24h for WhatsApp, 7d Instagram tag).

```ts
messaging_threads {
  workspaceId         text       references organization(id) on delete cascade
  threadKey           text       not null
  channelEndpointId   text       references channel_endpoints(id)
  lastInboundAt       timestamp
  windowExpiresAt     timestamp                  -- denormalised: lastInboundAt + 24h
  lastTemplateAt      timestamp
  lastConversationId  text       references conversations(id)   -- WindowTracker hot-path optimization
  primary key (workspaceId, threadKey)
}
indexes: (workspaceId, windowExpiresAt)
```

### `conversation_turns`

```ts
conversation_turns {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade
  ordinal         integer    not null
  speaker         enum('agent','caller','system')
  text            text       not null                -- sourced from onMessage hook, not text-deltas
  messageId       text                                -- platform message id (WA wamid, etc)
  mediaPayload    jsonb                               -- media refs; null on voice
  deliveryStatus  enum('sending','sent','delivered','read','failed')
  statusUpdatedAt timestamp
  timestampSec    integer    not null                -- offset from conversation start (voice); 0 for messaging
  evalVerdict     enum('passed','failed','warning')
  workflowNodeId  text                                -- which node was active
  tokensInput     integer
  tokensOutput    integer
  latencyMs       integer                            -- LLM call latency from onTokensUpdate
  contextUtilization real                            -- 0..1 of context window
  modelUsed       text                               -- 'gpt-4o-mini', etc
  createdAt       timestamp  default now()
  unique (conversationId, ordinal)
}
indexes: (conversationId, ordinal),
         (conversationId, messageId)                  -- de-dup webhook replay
```

### `conversation_tool_calls`

```ts
conversation_tool_calls {
  id              text       primary key
  turnId          text       references conversation_turns(id) on delete cascade
  toolId          text       references tools(id)
  toolName        text       not null
  input           jsonb
  output          jsonb
  durationMs      integer
  errorMessage    text
  createdAt       timestamp  default now()
}
indexes: (turnId)
```

### `conversation_extracted_fields`

Sourced from `tool-result` events where `result.__flow_transition === true`.

```ts
conversation_extracted_fields {
  conversationId  text       references conversations(id) on delete cascade
  label           text       not null
  value           text
  primary key (conversationId, label)
}
```

### `conversation_evals`

```ts
conversation_evals {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade
  criterionId     text       references agent_eval_criteria(id)
  rubricSnapshot  text       not null    -- the rubric text at scoring time, never re-evaluated
  score           real
  passed          boolean
  details         jsonb
  scoredAt        timestamp  default now()
}
indexes: (conversationId), (criterionId)
```

`rubricSnapshot` is **non-nullable** — locked from v1 to avoid backfill.

### `runtime_sessions`

AriaFlow's `Session` shape. Single-writer per session.

```ts
runtime_sessions {
  id                text       primary key
  conversationId    text       references conversations(id) on delete cascade  unique
  agentId           text       references agents(id)
  agentVersionId    text       references agent_versions(id)
  deploymentId      text       references runtime_deployments(id)
  workingMemory     jsonb                                   -- AriaFlow SessionWorkingMemory
  flowStateByAgent  jsonb                                   -- per-agent flow snapshot
  routingState      jsonb                                   -- current handoff target
  sequenceNumber    integer    default 0                    -- monotonic; supervisor polls this
  lastCheckpointAt  timestamp
  createdAt         timestamp  default now()
}
indexes: (conversationId), (deploymentId)
```

### `session_checkpoints`

```ts
session_checkpoints {
  id          text       primary key
  sessionId   text       references runtime_sessions(id) on delete cascade
  trigger     enum('tool-result','tool-error','flow-transition','handoff','manual')
  state       jsonb      not null     -- SessionWorkingMemory snapshot
  createdAt   timestamp  default now()
}
indexes: (sessionId, createdAt desc)
```

### `runtime_deployments` — runtime instance lifecycle

```ts
runtime_deployments {
  id                      text       primary key  // dep_<nanoid>
  workspaceId             text       references organization(id) on delete cascade
  kind                    enum('voice_dedicated','messaging_pooled') not null
  status                  enum('provisioning','ready','draining','terminated','failed') not null
  region                  text       not null
  platform                enum('cloudflare','fly','railway','self-hosted') not null
  bundleHash              text
  imageDigest             text
  agentVersionIds         text[]    default '{}'   -- agent versions hosted in this deployment
  actorAddress            text                      -- platform-opaque handle (DO id, Fly Machine id, k8s pod)
  startedAt               timestamp  default now()
  lastHeartbeatAt         timestamp
  terminatedAt            timestamp
  terminationReason       enum('idle_timeout','manual','crashed','migrated','hipaa_isolation_end','platform')
  resourceTier            enum('lite','basic','standard','pro')
  maxConcurrentSessions   integer
  activeSessionCount      integer    default 0
  totalSessionsServed     integer    default 0
  complianceMode          enum('none','hipaa','ferpa','tcpa') not null
  isolationKind           enum('per-conversation','per-workspace','pooled') not null
}
indexes: (workspaceId, kind, status),
         (workspaceId, terminatedAt) where terminatedAt is null,
         (lastHeartbeatAt) where status = 'ready',
         (workspaceId, startedAt desc)
```

Append-only at the row level — terminated rows stay queryable for 90 days
(cost attribution, audit), pruned to cold storage thereafter.

---

## 10 · Outbound batches

### `batches`

```ts
batches {
  id                  text       primary key  // batch_<nanoid>
  workspaceId         text       references organization(id) on delete cascade
  name                text       not null
  agentId             text       references agents(id)
  channelKind         channel_kind not null     -- voice | whatsapp | sms
  channelEndpointId   text       references channel_endpoints(id)
  vertical            enum('home-services','appointment-services','education')
  status              enum('draft','scheduled','running','paused','completed','failed')
  scheduledFor        timestamp
  concurrency         integer    default 8
  totalRecipients     integer    not null
  completed           integer    default 0
  booked              integer    default 0
  failed              integer    default 0
  costUsd             real       default 0
  recoveredRevenueUsd real       default 0
  createdByUserId     text       references user(id)
  createdAt           timestamp  default now()
  updatedAt           timestamp
}
indexes: (workspaceId, status), (workspaceId, scheduledFor)
```

### `batch_recipients`

```ts
batch_recipients {
  id                text       primary key
  batchId           text       references batches(id) on delete cascade
  identifier        text       not null              -- E.164 for voice/SMS, WA id for WhatsApp
  dynamicVariables  jsonb                            -- template tokens
  status            enum('pending','vetting','dnc','queued','dialing','completed','failed','deferred')
  conversationId    text       references conversations(id)
  attemptCount      integer    default 0
  scheduledFor      timestamp
  lastAttemptAt     timestamp
  errorMessage      text
}
indexes: (batchId, status), (conversationId)
```

---

## 11 · Settings, secrets, webhooks, audit

### `secrets`

KMS-envelope encryption.

```ts
secrets {
  id              text       primary key
  workspaceId     text       references organization(id) on delete cascade
  name            text       not null
  ciphertext      bytea      not null
  kmsKeyId        text       not null
  scope           enum('workspace','agent','channel') default 'workspace'
  agentId         text       references agents(id)
  lastUsedAt      timestamp
  createdByUserId text       references user(id)
  createdAt       timestamp  default now()
  rotatedAt       timestamp
  unique (workspaceId, agentId, name)
}
indexes: (workspaceId, name)
```

RLS policy stricter than other workspace tables: owner/admin only for SELECT.

### `webhooks`

```ts
webhooks {
  id              text       primary key
  workspaceId     text       references organization(id) on delete cascade
  url             text       not null
  events          text[]    not null     -- ['conversation.completed','batch.completed', …]
  signingSecret   text       not null     -- returned once on create
  active          boolean    default true
  createdAt       timestamp  default now()
}
indexes: (workspaceId, active)
```

### `webhook_deliveries`

```ts
webhook_deliveries {
  id              text       primary key
  webhookId       text       references webhooks(id) on delete cascade
  conversationId  text       references conversations(id)
  deliveryKind    enum('conversation_completed','batch_completed','call_initiation_failure',
                       'audio_ready','transcription_ready') not null
  payload         jsonb
  responseStatus  integer
  responseBody    text
  attemptCount    integer    default 1
  deliveredAt     timestamp
  createdAt       timestamp  default now()
}
indexes: (webhookId, createdAt desc), (conversationId)
```

Per-delivery-kind retry policy: `transcription_ready` retries 5×;
`audio_ready` fire-and-forget; `call_initiation_failure` retries 3×.

### `audit_log_events`

Append-only. Partitioned by month from day one.

```ts
audit_log_events {
  id           text       primary key
  workspaceId  text       references organization(id) on delete cascade
  actorUserId  text       references user(id)
  actorKind    enum('user','api_key','system')
  apiKeyId     text       references apikey(id)
  event        text       not null     -- 'agent.published' | 'kb.document.deleted' …
  resourceKind text                     -- 'agent' | 'kb_document' …
  resourceId   text
  diff         jsonb                    -- {before: jsonb|null, after: jsonb|null}
  ipAddress    inet
  userAgent    text
  createdAt    timestamp  default now()
} partition by range (createdAt) -- monthly partitions
indexes: (workspaceId, createdAt desc),
         (workspaceId, event, createdAt desc),
         (resourceKind, resourceId, createdAt desc)
```

Retention: hot in Postgres for 90 days; partition-archive to S3 Glacier
Instant Retrieval; `audit_log_events_archive_index(eventId, partitionKey, s3Key)`
for per-event lookup. Retention floor: 6 years (HIPAA).

---

## 12 · Compliance

### `workspace_compliance_posture`

Per-workspace posture, refreshed every 15 min by a worker.

```ts
workspace_compliance_posture {
  workspaceId   text       references organization(id) on delete cascade  primary key
  hipaa         enum('active','action-required','violation','inactive')
  ferpa         enum('active','action-required','violation','inactive')
  tcpa          enum('active','action-required','violation','inactive')
  euAiAct       enum('active','action-required','violation','inactive')
  evaluatedAt   timestamp
  details       jsonb
}
```

### `compliance_evaluations`

Append-only.

```ts
compliance_evaluations {
  id           text       primary key
  workspaceId  text       references organization(id) on delete cascade
  regulation   enum('hipaa','ferpa','tcpa','eu-ai-act')
  passed       boolean
  failures     jsonb
  evaluatedAt  timestamp  default now()
}
indexes: (workspaceId, regulation, evaluatedAt desc)
```

### `guardrail_events`

When a guardrail (`agent_guardrails`) fires.

```ts
guardrail_events {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade
  turnId          text       references conversation_turns(id)
  guardrailId     text       references agent_guardrails(id)
  triggeredAt     timestamp  default now()
  matchedText     text                       -- redacted in long-term store
  action          enum('blocked','redacted','flagged','escalated')
}
indexes: (conversationId, triggeredAt)
```

---

## 13 · Billing & ROI receipt

### `billing_subscriptions`

```ts
billing_subscriptions {
  workspaceId          text       references organization(id) on delete cascade  primary key
  stripeCustomerId     text       unique
  stripeSubscriptionId text       unique
  plan                 enum('free','starter','pro','business','enterprise')
  status               enum('trialing','active','past_due','canceled')
  trialEndsAt          timestamp
  currentPeriodEnd     timestamp
  hipaaAddon           boolean    default false
  ferpaAddon           boolean    default false
}
```

### `usage_events`

Sourced from AriaFlow's `onTokensUpdate` hook (input + output tokens, model,
latencyMs, contextUtilization). Append-only; nightly aggregated into
`monthly_receipts`.

```ts
usage_events {
  id              text       primary key
  workspaceId     text       references organization(id) on delete cascade
  agentId         text       references agents(id)
  agentVersionId  text       references agent_versions(id)
  conversationId  text       references conversations(id)
  kind            enum('llm_input_tokens','llm_output_tokens','tts_seconds',
                       'stt_seconds','minutes','tool_call','rag_query','seat',
                       'container_seconds','do_seconds','queue_messages')
  quantity        real       not null
  unitCostUsd     real
  totalCostUsd    real
  occurredAt      timestamp  default now()
}
indexes: (workspaceId, occurredAt),
         (workspaceId, kind, occurredAt),
         (conversationId)
```

### `monthly_receipts`

```ts
monthly_receipts {
  id                       text       primary key
  workspaceId              text       references organization(id) on delete cascade
  month                    text       not null   -- 'YYYY-MM'
  recoveredRevenueUsd      real       not null
  costUsd                  real       not null
  roiMultiplier            real       not null
  comparisonDeltaPct       real
  perAgent                 jsonb      not null   -- v2: split into monthly_receipt_per_agent
  publishedAt              timestamp  default now()
  pdfStorageKey            text                  -- R2 key
  unique (workspaceId, month)
}
indexes: (workspaceId, month desc)
```

---

## 14 · Write paths (sink architecture)

The schema is written from five distinct paths. Each table is in exactly one
class.

| Class | Tables | Write path | Source |
|---|---|---|---|
| **Hot append-only** | `conversation_turns`, `conversation_tool_calls`, `conversation_extracted_fields`, `usage_events`, `guardrail_events`, `audit_log_events`, `webhook_deliveries`, `session_checkpoints` | Cloudflare Queue (16 sharded by `hash(workspaceId) % 16`) → projector worker → Postgres | `HarnessHooks` |
| **Live state** | `runtime_sessions` (workingMemory, flowStateByAgent, routingState, sequenceNumber) | Direct Postgres write from runtime worker | `HarnessHooks` + stream `flow-transition`/`handoff` |
| **Live UI fanout** | (none — read-only consumers of stream sink) | WebSocket from RuntimeHost → F3 supervisor screen | Stream sink (NOT Postgres NOTIFY) |
| **Slow-mutating config** | `agents`, `agent_versions`, `tools`, `tool_catalog_providers`, `kb_documents`, `channel_connections`, `channel_endpoints`, `routing_rules`, `secrets`, `webhooks` | Direct synchronous Postgres | API Worker (oRPC handlers) |
| **Aggregates** | `monthly_receipts`, `workspace_compliance_posture` | Async worker (cron) | Computed from `usage_events` + `conversation_evals` + `audit_log_events` |
| **Observability** | (no Postgres tables) | OTel / Datadog | AriaFlow `custom`, `knowledge-*` events |

Write paths are platform-agnostic — implemented once in `core/`, run on
either Cloudflare or Node deployment. See `HEXAGONAL_ARCHITECTURE.md`.

---

## 15 · Cross-cutting decisions

### IDs

Prefixed nanoids: `<prefix>_<nanoid(10)>`.

```
ws_     organization
u_      user
ag_     agents
av_     agent_versions
kb_     kb_documents
cv_     conversations
batch_  batches
ce_     channel_endpoints
ch_     channel_connections
rr_     routing_rules
tool_   tools
tcp_    tool_catalog_providers
dep_    runtime_deployments
key_    apikey
```

### Timestamps

Every table: `createdAt` (default `now()`), `updatedAt` (Drizzle trigger).

### Soft delete

Tables: `agents`, `kb_documents`, `tools`, `organization`, `channel_connections`.
Column: `deletedAt`. Default reads exclude rows where `deletedAt IS NOT NULL`.
Nightly hard-delete after 30 days.

### Append-only tables

`agent_versions`, `audit_log_events`, `usage_events`, `session_checkpoints`,
`webhook_deliveries`, `conversation_turns`, `conversation_tool_calls`,
`guardrail_events`, `compliance_evaluations`, `runtime_deployments` (with
`terminatedAt`). Never deleted via UI; TTL-archived to cold storage per §11.

### Encryption

- **At rest:** Postgres native encryption / RDS KMS. No application-level work.
- **Sensitive payloads:** `secrets.ciphertext` envelope-encrypted via AWS KMS.
  Rotated 90-day default. Worker fetches data key via signed request.
- **Transcript redaction:** `conversation_turns.text` post-processed by
  redactor (per `agent_versions.snapshot.complianceConfig.redactionPatterns`)
  before persistence.

### Multi-region

`organization.region` is the routing key. Application-side data-locality
middleware reads workspace's region cookie/JWT claim and routes to the
correct cluster. Tables don't move; workspace's row in every table lives
in the cluster matching its region. Migration is an explicit data-export
job, not automatic.

### Indexing rules

- Every workspace-scoped table has `(workspaceId, …)` leading index on hot path
- Foreign keys are indexed
- "Live" rows (`endedAt IS NULL`, `deletedAt IS NULL`) get partial indexes
- Append-only tables monthly-partitioned where projected > 50M rows/year

### Denormalization integrity guards

- `channel_endpoints.channelKind` denormalized from `channel_connections.channelKind`
  → CHECK trigger enforces match. Drop if maintenance burden exceeds value.
- `conversations.bundleHash` denormalized from
  `agent_versions.bundleHash` → no enforcement; drift is informational.

---

## 16 · AriaFlow primitive ↔ table mapping

| AriaFlow primitive          | Table(s)                                                |
|-----------------------------|---------------------------------------------------------|
| `Agent` / `LLMAgent`        | `agents` + `agent_versions.snapshot`                    |
| `FlowAgent`                 | `agent_versions.snapshot.workflow`                      |
| `TriageAgent`               | `agent_versions.snapshot.subagentAttachments`           |
| `CompositeAgent`            | composition in app code                                 |
| `FlowConfig` / `FlowGraph`  | `agent_versions.snapshot.workflow` + projection tables  |
| `FlowNode` (subagent)       | `workflow_nodes_projection` (kind=subagent)             |
| `ExtractionNodeConfig`      | inside `agent_versions.snapshot.workflow.nodes[].extractionFields[]` |
| `Tool` (createTool)         | `tools` (kind=system or webhook or mcp)                 |
| `createHandoffTool`         | derived at runtime from `subagentAttachments`           |
| `createHttpTool`            | `tools` (kind=webhook)                                  |
| `MemoryService`             | `runtime_sessions.workingMemory`                        |
| `SessionStore`              | `runtime_sessions` + `session_checkpoints`              |
| `EvalRunner`                | `conversation_evals` + `agent_eval_criteria`            |
| `Hooks`                     | code-only (sourced into Cloudflare Queues from running runtime) |
| `Guards / ToolEnforcer`     | code-only (configured by `agent_guardrails`)            |
| `InjectionQueue`            | `agent_versions.snapshot.instructions` (template vars)  |

---

## 17 · Screen ↔ table coverage

| Screen                              | Reads                                                          | Writes                                  |
|-------------------------------------|----------------------------------------------------------------|-----------------------------------------|
| A1 sign-in                          | `user`, `session` (better-auth)                                | `session`, `audit_log_events`           |
| A3 onboarding                       | —                                                              | `organization`, `member`                |
| A4 templates                        | (template catalogue, code)                                     | `agents`, `agent_versions`              |
| A5 / B1 home                        | `agents`, `conversations`, `usage_events`, `workspace_compliance_posture` | —                          |
| C1 agents list                      | `agents`, `agent_versions`, `voices`                           | —                                       |
| C2 Behavior / C3 Models / C8 Compl. | `agents`, `agent_versions`, `voices`, `secrets`                | `agent_versions` (auto_save + publish)  |
| Knowledge tab                       | `agent_kb_attachments` (projection), `kb_documents`            | `agent_versions` snapshot               |
| Workflow tab                        | `workflow_nodes_projection`, `workflow_edges_projection`, `tools` | `agent_versions` snapshot           |
| C10 test drawer                     | `agents`, `agent_versions`, `tools`, `runtime_sessions`        | `runtime_sessions`, `session_checkpoints` |
| `/knowledge` list                   | `kb_documents`, `agent_kb_attachments`                         | `kb_documents`                          |
| `/knowledge/$docId`                 | `kb_documents`, `agent_kb_attachments` (projection)            | `kb_documents`                          |
| F1 conversations list               | `conversations`                                                | —                                       |
| F2 conversation detail              | `conversations`, `conversation_turns`, `conversation_tool_calls`, `conversation_evals`, `conversation_extracted_fields`, `guardrail_events` | — |
| F3 live supervisor                  | `conversations`, `conversation_turns` (live), `runtime_sessions` (sequenceNumber poll), `runtime_deployments` | `conversation_turns` (operator inject) |
| G1 batches                          | `batches`                                                      | —                                       |
| G2 batch wizard                     | `agents`, `channel_endpoints`                                  | `batches`, `batch_recipients`           |
| D1 telephony                        | `channel_connections` (channelKind=voice)                      | `channel_connections`                   |
| D2 phone numbers                    | `channel_endpoints` (channelKind=voice)                        | `channel_endpoints`                     |
| H1 widget                           | `channel_endpoints` (channelKind=web_chat) + `metadata` jsonb  | `channel_endpoints.metadata`            |
| I1 workspace settings               | `organization`, `apikey`, `webhooks`, `secrets`, `billing_subscriptions`, `tool_catalog_providers` | all of the above              |
| I4 workspace compliance             | `workspace_compliance_posture`, `compliance_evaluations`, `audit_log_events`, `guardrail_events` | —                          |
| L5 monthly ROI receipt              | `monthly_receipts`                                             | —                                       |

Every screen has a write home or explicit read path. No orphans.

---

## 18 · Drizzle codegen sequence

**Block — generate in the first migration:**

1. `npx @better-auth/cli generate` — better-auth core + organization + apiKey
2. `+ext` columns on `user`, `organization`, `member`, `apikey` via `additionalFields`
3. Two-row agent split (`agents` thin + `agent_versions` fat with all snapshot columns + `versionKind` + `parentVersionId`)
4. Projection tables (`agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`)
5. `channel_connections` + `channel_endpoints` (nullable `attachedAgentId`, `publicWebhookUrl`, `publicStreamUrl`) + `routing_rules`
6. `conversations` polymorphic + `voice_calls` + `messaging_threads` (with `lastConversationId`)
7. `conversation_turns` (with `messageId` dedup index) + `conversation_tool_calls` + `conversation_extracted_fields`
8. `conversation_evals` with non-nullable `rubricSnapshot`
9. `tools` + `tool_catalog_providers` + 4-kind enum + `status`/`lastValidatedAt`
10. `agent_guardrails` + `guardrail_events`
11. `runtime_sessions` (with `sequenceNumber`, `deploymentId`) + `session_checkpoints` + `runtime_deployments`
12. `audit_log_events` partitioned monthly with `{before, after}` diff jsonb shape
13. `usage_events` + `monthly_receipts` + `billing_subscriptions`
14. `kb_documents` + `kb_chunks` + `pgvector` extension
15. `voices` + stock catalog seed
16. `secrets`, `webhooks`, `webhook_deliveries`
17. `batches` + `batch_recipients`
18. `workspace_compliance_posture` + `compliance_evaluations`

**Defer — additive, no ALTER TABLE on central tables:**

- `prompt_blocks` + `prompt_block_versions` (v2)
- `workspace_policies` (v2 — replaces two-tier guardrail inheritance)
- Conditional variants in jsonb (additive shape change)
- `agent_versions.projectionsReady` (when async projection worker ships)
- Codegen bundle worker (columns already nullable in §5)
- RLS `CREATE POLICY` statements
- Cold-archive pipeline
- Multi-region sharding
- Vectorize migration for `kb_chunks`

---

## 19 · What's next after sign-off

1. **Confirm better-auth 1.5.5 works on Cloudflare Workers runtime.** If
   not, this is a blocker that resets §3 — swap auth lib or wait on
   better-auth's Workers adapter. Without confirmation, codegen is paused.
2. **`npx @better-auth/cli generate`** to emit auth schema files.
3. **Translate the rest of this document** into Drizzle schema files in
   `packages/db/src/schema/`, one file per aggregate root.
4. **Generate initial migration; commit.**
5. **Wire seed script:** on `user.created`, better-auth's hook creates a
   personal `organization`. Plus a sample workspace ("Calderon HVAC")
   with mock fixtures matching the UI.
6. **Build `packages/platform/interface.ts`** per `HEXAGONAL_ARCHITECTURE.md`
   §2 (eight ports).
7. **Build `@kuralle/platform-cloudflare` and `@kuralle/platform-memory`
   in parallel.** Memory adapter exercises domain tests.
8. **Build `@kuralle/platform-node` in parallel** — even before Node deploys
   to staging. Both adapters MUST build in CI.
9. **Stand up the AriaFlow runtime adapter** in `runtime/adapter/` —
   translates `AgentIR` → `AriaFlow.AgentConfig`.
10. **Write the projection worker** that decomposes `agent_versions.snapshot`
    into projection tables on publish (synchronous v1).

Council adjourned. Architecture locked. Codegen unblocked.

[Bullet Train post]: https://blog.bullettrain.co/teams-should-be-an-mvp-feature/
[Blitz multi-tenancy guide]: https://blitzjs.com/docs/multitenancy
