# Story Brief — `S3-03` Cloudflare `MessagingDO` + WhatsApp webhook + `wrangler.jsonc`

> **Role.** You are a senior runtime engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) with deep expertise in **Cloudflare Workers + Durable Objects, the DO hibernation contract (`state.blockConcurrencyWhile`, `alarm()`, `state.storage`), Hono webhook handlers, Meta WhatsApp Cloud API webhook semantics (`X-Hub-Signature-256` HMAC, `hub.mode=subscribe` GET handshake), TypeScript ESM, and miniflare-based local CF dev (`wrangler dev`)**. You have shipped per-conversation DO patterns in production where hibernation correctness is the difference between "agent remembers context" and "agent re-introduces itself every message." You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. **Before writing the DO, you `bun add @ariaflowagents/cf-agent@1.0.0 -F server` and `cat node_modules/.bun/@ariaflowagents+cf-agent@1.0.0*/node_modules/@ariaflowagents/cf-agent/dist/*.d.ts`** to read the actual exported base class shape. You verify Meta webhook semantics against `node_modules/.bun/@ariaflowagents+messaging-meta@1.0.0*/node_modules/@ariaflowagents/messaging-meta/dist/server.d.ts`. You verify `wrangler dev` config against `node_modules/.bun/wrangler*/dist/*.d.ts`. You prefer DO patterns that survive cold-start (`blockConcurrencyWhile` on every state restore) over patterns that "usually work." You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun run check-types`, `bun run lint`, the new `apps/server` test suite, and a wrangler-dev-driven integration test exiting 0.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule — user reverts silently). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every input/output schema. No premature abstractions; no speculative extensibility.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. **Do NOT touch files owned by S3-04 (projector worker, BullMQ adapter, projector lag SLO) or S3-05 (conversations router/hooks/F1/F2).** If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-03] cf-agent: MessagingDO + wrangler.jsonc + Meta webhook handler`. Do NOT push. One commit per story.

---

## 1. Goal

Ship the Cloudflare adapter for `MessagingRuntimeHost` per `INTERFACE_DESIGNS_RuntimeHost.md §5` synthesis. Concrete shape:

1. **`MessagingDO` class** — one Durable Object instance per conversation, keyed by `threadKey = 'whatsapp:<wa_id>'`. Hibernates between messages per `INTERFACE_DESIGNS_RuntimeHost.md §C`. Uses `state.blockConcurrencyWhile` to make `runtime_sessions.workingMemory` restore atomic on cold-start. Uses `@ariaflowagents/cf-agent`'s base (extends or composes — IC reads the `.d.ts` and picks per the actual shape).

2. **`apps/server/wrangler.jsonc`** — declares the `MessagingDO` `[[durable_objects.bindings]]`, sixteen `[[queues.producers]]` named `turns-shard-0` .. `turns-shard-15`, the `META_*` env vars (mirroring `packages/infra/alchemy.run.ts`), `PUBLIC_BASE_URL`, and a `wrangler dev` config that runs locally with miniflare (no real CF account).

3. **WhatsApp webhook handler** at `apps/server/src/webhooks/meta.ts` — Hono routes:
   - `GET /webhooks/meta` — verify handshake (`hub.mode=subscribe`, `hub.verify_token=${META_VERIFY_TOKEN}` → return `hub.challenge`).
   - `POST /webhooks/meta` — verify `X-Hub-Signature-256` HMAC via `verifySignature` from `@ariaflowagents/messaging-meta/server`, parse + normalize via `normalizeWebhook`, extract `wa_id` per inbound message, look up (or insert) `messaging_threads` row, look up `channel_endpoints` (by `phoneNumberId`), get the workspace + agent, dispatch to DO via `idFromName('whatsapp:' + wa_id)`.

The DO emits `MessagingEvent`s through the S3-02 adapter and writes them to a per-shard queue via the `MessageQueue` port (S3-04 owns the consumer side; S3-03 only wires the producer). Tests run against `wrangler dev` (miniflare); real CF + sandbox Meta is deferred to S3-06.

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — confirms sprint 3 is active.
2. `sprints/sprint-3/PLAN.md` — full sprint plan; story `S3-03` section is the spec; **§0 locks the AriaFlow + Meta env + Cloudflare decisions**.
3. `sprints/WBS.md` § Sprint 3 → row `S3-03`.
4. `sprints/sprint-2/HANDOFF.md` — read-me-first traps for sprint 3. Especially:
   - Hooks-only frontend access rule (S3-03 ships server-side only — no `apps/web/` edits).
   - `bun -F server gen:openapi --check` is wired; the webhook handler is a Hono route (NOT an oRPC procedure), so OpenAPI does NOT change for this story.
   - "S3-03 specifically (Cloudflare adapter for `MessagingRuntimeHost`) will need either CF preview credentials or a `wrangler dev` setup" — this story does the wrangler dev setup; real CF is deferred.
5. **`INTERFACE_DESIGNS_RuntimeHost.md §5`** — the synthesis chosen for `RuntimeHost`. S3-03 ships the messaging half; S4 will ship voice. **§C (DO hibernation contract) is load-bearing** — every detail in this section becomes a code decision.
6. `USER_JOURNEYS.md §5 (3b)` — M5 connector wizard for WhatsApp; you don't ship the wizard (that was S3-01) but the webhook URL convention is in here: `${PUBLIC_BASE_URL}/webhooks/meta`.
7. **`USER_JOURNEYS.md §9b`** — the WhatsApp messager journey; the inbound flow your handler implements.
8. `DATA_MODEL.md §9` — `messaging_threads`, `conversations`, `runtime_sessions`, `runtime_deployments`, `session_checkpoints`, `conversation_turns` (with `messageId` dedup unique index — used for replay-idempotency at the projector). You write to `messaging_threads` + `runtime_sessions`; you do NOT write to `conversation_turns` (that's S3-04 projector).
9. `scripts/sink-spike/FINDINGS.md` — empirical AriaFlow event volumes; the DO emits ~7 events/turn at message mode + ~9 hooks/turn (already verified by S3-02 fixture).
10. `packages/runtime/src/adapter/agent-config.ts` — S3-02 just shipped this. The DO calls `irToAgentConfig(ir, opts)` then runs an AriaFlow agent loop with hooks built from `buildHarnessHooks({ queue, conversationId })`. The opts shape (`resolveModel`, `resolveTool`, etc.) is the IC's responsibility to wire from the workspace's secret store + tool registry.
11. `packages/runtime/src/adapter/hooks.ts` — read what `buildHarnessHooks` returns and how it publishes to the `MessageQueue` port.
12. `packages/runtime/src/adapter/events.ts` — `MessagingEvent` discriminated union. Verify shape; do NOT modify.
13. `packages/platform/src/interface.ts` — the `MessageQueue` port. The DO uses this port; the production CF binding gets wired in `packages/platform/src/cloudflare/message-queue.ts` (already exists from S0/S2; verify it can publish to a sharded queue name).
14. `packages/platform/src/cloudflare/message-queue.ts` — current implementation. Verify it accepts the shard name; if not, extend it (don't rewrite). The 16-shard math `hash(conversationId) % 16` is YOUR responsibility to implement here OR in a wrapper at the DO call-site.
15. **`apps/server/src/index.ts`** — current Hono app. You add the webhook routes here OR mount a sub-app from `apps/server/src/webhooks/meta.ts`.
16. **`apps/server/src/env.ts`** — the `getEnvSync` shim from S3-01. The DO and webhook handlers read env through this shim, NOT `process.env` directly.
17. `packages/api/src/routers/channels.ts` — example of how `META_*` env is consumed; mirror the pattern for the webhook handler.
18. `apps/server/src/__tests__/channels.connect.test.ts` — example integration-test bootstrap pattern; mirror.
19. `packages/core/src/test-utils.ts` — `seedWorkspace`, `createTestDb`, `releaseTestDb`. Use these; do NOT raw-`client.query()`-INSERT fixtures.
20. **Verify the `@ariaflowagents/cf-agent` API surface** — before writing the `MessagingDO`, run `cat node_modules/.bun/@ariaflowagents+cf-agent@1.0.0*/node_modules/@ariaflowagents/cf-agent/dist/*.d.ts` (after installing with `bun add @ariaflowagents/cf-agent@1.0.0 -F server`) and read every export. The brief expects an `AIChatAgent`-style base — if the actual exported class name differs, **adopt the actual name verbatim** and document the mapping in the commit body. Do NOT invent class/method names.
21. **Verify the `@ariaflowagents/messaging-meta/server` subpath exports** — `verifySignature({ appSecret, rawBody, signatureHeader })` and `normalizeWebhook(payload)` returning `NormalizedWebhookEvents`. (Already verified 2026-05-08; documented in `packages/runtime/src/clients/meta-whatsapp.ts`.) The webhook handler imports from `@ariaflowagents/messaging-meta/server` (subpath) NOT the main module.

---

## 3. Files to create or modify

(If a file you need is missing from this list, stop and flag — don't silently add to scope.)

### Cloudflare DO (`apps/server/src/durable-objects/`)
- `apps/server/src/durable-objects/MessagingDO.ts` (new) — class extending `@ariaflowagents/cf-agent`'s base (or composing it; verify the .d.ts).
  - `fetch(req: Request): Promise<Response>` — inbound message envelope handler.
  - `alarm(): Promise<void>` — hibernation wake handler (no-op for now or `runtime_sessions` heartbeat write — IC picks; document in commit body).
  - `state.blockConcurrencyWhile(restoreWorkingMemory)` on every cold-start — restore from `runtime_sessions.workingMemory` (DB column) before any new request handling.
  - `processInbound(envelope: NormalizedMessage): Promise<void>` — internal helper that runs the agent loop, emits events to the per-shard queue, persists `runtime_sessions` updates.
  - `runtime_sessions.workingMemory` updates persisted via `state.storage` AND the DB row (DB is the source of truth; DO state is the hot cache).
- `apps/server/src/durable-objects/MessagingDO.test.ts` (new) — unit-level tests using `wrangler` `unstable_dev` OR direct DO instantiation:
  - Cold-start restore: synthetic two-turn flow with explicit hibernate-and-wake; assert `workingMemory` from turn 1 is visible in turn 2.
  - DO routing identity: two POSTs with the same `wa_id` route to the same `idFromName` → same DO instance ID.
  - Shard math determinism: a unit test asserts `shardKeyForConversation(conversationId)` is deterministic and uniform-ish over 1000 random UUIDs.
- `apps/server/src/durable-objects/shard.ts` (new, small file) — `shardKeyForConversation(conversationId: string): string` returning `turns-shard-${hash % 16}`. FNV-1a or `crypto.subtle.digest('SHA-256', ...)` truncated — IC picks; documents reason. This is the boundary between S3-03 (producer) and S3-04 (consumer); both must use the SAME function. **S3-03 owns this file.** S3-04's projector imports it.
- `apps/server/src/durable-objects/shard.test.ts` (new) — determinism + uniform-ish distribution.

### Wrangler config
- `apps/server/wrangler.jsonc` (new) — declares:
  - `name`, `main`, `compatibility_date` (today: 2026-05-08), `compatibility_flags` if needed.
  - `[[durable_objects.bindings]]` with `name = "MESSAGING_DO"` and `class_name = "MessagingDO"`.
  - `[[queues.producers]]` × 16 named `turns-shard-0` .. `turns-shard-15` with binding names `TURNS_SHARD_0` .. `TURNS_SHARD_15` (or a single binding `TURNS_QUEUES` if cf-agent's pattern prefers; IC picks per the actual `wrangler` types).
  - `[[migrations]]` block declaring the `MessagingDO` class as a `new_classes` migration tag.
  - `vars` block with `META_APP_ID`, `META_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID`, `PUBLIC_BASE_URL`. Secret bindings (`META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`) NOT inlined — set via `wrangler secret put` or `.dev.vars` at runtime; document in commit body.
  - `dev` block with port `8787` (default; document if changed).
  - JSON5 / JSONC comments allowed; document each binding inline.

### Webhook handler (`apps/server/src/webhooks/`)
- `apps/server/src/webhooks/meta.ts` (new) — Hono `Hono<{ Bindings: Env, Variables: ... }>` sub-app:
  - `GET /` → verify handshake. Reads `c.req.query('hub.mode')`, `c.req.query('hub.verify_token')`, `c.req.query('hub.challenge')`. If mode === 'subscribe' AND verify_token matches `META_VERIFY_TOKEN`, return `c.text(challenge, 200)`. Else `c.text('Forbidden', 403)`.
  - `POST /` → HMAC verify against `META_APP_SECRET`:
    - Read raw body via `await c.req.text()`.
    - Read `X-Hub-Signature-256` header (`c.req.header(...)`).
    - Call `verifySignature({ appSecret, rawBody, signatureHeader })` from `@ariaflowagents/messaging-meta/server`. On false → 401.
    - Parse `JSON.parse(rawBody)`; pass to `normalizeWebhook(...)`.
    - For each `NormalizedMessage` event:
      - Resolve `phoneNumberId` from the event payload (the field carried in WhatsApp Cloud API webhooks).
      - Lookup `channel_endpoints` by `(channel_kind = 'whatsapp', identifier = phoneNumberId)` → workspaceId + attachedAgentId.
      - Lookup or insert `messaging_threads` keyed by `(workspaceId, channelEndpointId, threadKey = 'whatsapp:<wa_id>')`.
      - Compute `conversationId` (from the messaging_thread row).
      - Get DO via `c.env.MESSAGING_DO.idFromName('whatsapp:' + wa_id)` and `c.env.MESSAGING_DO.get(id)`.
      - `await stub.fetch(internalRequestForInboundMessage(envelope))` to dispatch.
    - Return `c.text('OK', 200)`.
  - The `Env` type extends Cloudflare's `Env` interface with the META vars + DO binding.
- `apps/server/src/webhooks/meta.test.ts` (new) — unit tests:
  - GET handshake happy path → 200 + challenge echoed.
  - GET handshake wrong verify_token → 403.
  - POST valid signature → routes to DO (mock the DO binding); inserts/finds `messaging_threads` row.
  - POST invalid signature → 401.
  - POST missing `X-Hub-Signature-256` header → 401.
- `apps/server/src/webhooks/meta-fixtures.ts` (new) — synthetic Meta webhook payloads:
  - `metaWebhookInbound(opts)` → `{ rawBody, signature }` tuple computed against a test secret.
  - `metaWebhookMalformed()` → invalid-shape payload.

### Repository expansion (`packages/core/src/repositories/`)
- `packages/core/src/repositories/conversation.ts` — **expand only with the `messagingThread` lookup-or-insert helper** if it doesn't exist. The webhook handler needs:
  - `findOrCreateMessagingThread({ workspaceId, channelEndpointId, threadKey })` returning `{ thread, conversationId }`.
  - This is a single-tx helper; it inserts a `messaging_threads` row + a parent `conversations` row if neither exists, otherwise returns the existing pair. Uses `findEndpointById`-style cache invalidation.
- `packages/core/src/repositories/conversation.test.ts` — expand with idempotency tests: calling `findOrCreateMessagingThread` twice yields the same thread + conversation pair.

### Wiring
- `apps/server/src/index.ts` — mount the webhook routes (`app.route('/webhooks/meta', metaWebhook)` or similar). Add `MessagingDO` to the exported entry types so wrangler picks it up.
- `apps/server/package.json` — add `@ariaflowagents/cf-agent@1.0.0`. Verify pin via `bun pm view @ariaflowagents/cf-agent version` before committing (latest stable is 1.0.0 as of 2026-05-08). Verify `wrangler` is already a dep (it should be, via the existing Alchemy setup); if not, add it as a `devDependency` to `apps/server/package.json` ONLY (not root).

### Migration
- **None expected.** The `messaging_threads`, `conversations`, `runtime_sessions` tables already exist (DATA_MODEL.md §9 was created in earlier sprints). If you discover a missing column the DO needs, surface it as a flag — do NOT silently add to scope.

### What you do NOT touch
- `packages/runtime/src/adapter/**` — S3-02 just shipped this, do not modify.
- `packages/runtime/src/projector/**` — S3-04's territory.
- `packages/api/src/routers/conversations.ts`, `apps/web/src/hooks/api/conversations.ts`, F1/F2 routes — S3-05's territory.
- `packages/platform/src/node/message-queue.ts` (BullMQ) — S3-04's territory.
- `packages/runtime/src/instrumentation/slo.ts` — S3-04 expands this with `SLO_PROJECTOR_LAG_*`; you don't.
- `apps/server/openapi.json` — webhook handler is Hono, not oRPC; openapi does not regen for this story.
- `packages/api-client/**` — same reason.

---

## 4. Acceptance criteria (numbered, in priority order)

1. `apps/server/src/durable-objects/MessagingDO.ts` exists and extends/composes `@ariaflowagents/cf-agent`'s base verbatim (class name from the `.d.ts`). `state.blockConcurrencyWhile` wraps every cold-start `workingMemory` restore.
2. `apps/server/wrangler.jsonc` declares the `MessagingDO` DO binding + 16 queue producers + Meta env vars + `PUBLIC_BASE_URL`. `wrangler dev` boots cleanly (`bun -F server dev:wrangler` exit 0; if no script exists, add it).
3. `apps/server/src/webhooks/meta.ts` Hono sub-app handles GET + POST routes correctly per §3 above.
4. **HMAC verify is correctness, not performance** — invalid signature → 401, missing header → 401, wrong verify token → 403. Tests cover all three paths.
5. **DO routing by `threadKey`**: two POSTs with the same `wa_id` route to the same DO instance ID. Verified by a test that captures the `idFromName` calls and asserts equality.
6. **Hibernation restores `workingMemory`**: synthetic two-turn flow with hibernate-and-wake sandwich; assert turn 2 sees turn 1's working memory snapshot. Test uses `state.blockConcurrencyWhile` directly OR `wrangler unstable_dev` — IC picks based on what's faster + reliable.
7. **Shard math** at `apps/server/src/durable-objects/shard.ts` is deterministic, public, and importable. S3-04's projector will import it.
8. `findOrCreateMessagingThread` is idempotent — two calls with the same `threadKey` yield the same `messaging_threads` row + same `conversationId`.
9. **Hexagonal discipline:** `apps/server/src/durable-objects/**` and `apps/server/src/webhooks/**` import from `@kuralle/runtime`, `@kuralle/core`, `@kuralle/db`, `@ariaflowagents/cf-agent`, `@ariaflowagents/messaging-meta/server`, `hono`, and `cloudflare:workers`-type modules. No imports from `apps/web/`. ESLint forbidden-import rule (S0-06) verifies.
10. **`@ariaflowagents/cf-agent@1.0.0`** pinned in `apps/server/package.json`. Root `package.json` unchanged (memory rule).
11. **Tests green:** `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test`, `bun -F server test`, `bun -F web test`, `bun -F server gen:openapi --check` all exit 0. The new tests (`MessagingDO.test.ts`, `webhooks/meta.test.ts`, `shard.test.ts`, expanded `conversation.test.ts`) cover the four hibernation/routing/HMAC/idempotency paths.
12. **Demo artifact:** `sprints/sprint-3/artifacts/S3-03-do-hibernation-trace.txt` — vitest/wrangler verbose output showing the two-turn-with-hibernate test cycle (cold start → blockConcurrencyWhile → state restore → response).

---

## 5. What NOT to do (anti-scope to prevent drift)

- Do **not** ship the projector worker. S3-04.
- Do **not** wire `conversation_turns` writes from the DO directly. Events go to the queue; the projector writes the rows.
- Do **not** ship the conversations oRPC procedures or frontend hooks. S3-05.
- Do **not** ship `BullMQ` Node adapter changes. S3-04.
- Do **not** add `SLO_PROJECTOR_LAG_*` constants. S3-04.
- Do **not** edit `apps/server/openapi.json` — webhook handler is Hono, not oRPC.
- Do **not** add deps to root `package.json` (memory rule).
- Do **not** raw-`client.query()`-INSERT fixtures. Use `seedWorkspace` from `@kuralle/core/test-utils`.
- Do **not** invent `@ariaflowagents/cf-agent` class/method names — use whatever the `.d.ts` actually exposes.
- Do **not** silently change AMENDMENT-002 (`apikey.organizationId → referenceId`) or any RFC. If you find a contradiction, stop and flag.
- Do **not** skip `state.blockConcurrencyWhile` on cold-start. Hibernation correctness is non-negotiable.
- Do **not** push to remote.

---

## 6. Test plan (you author)

- **DO unit (`MessagingDO.test.ts`):** cold-start restore; two-message routing; idempotent inbound dispatch.
- **Webhook unit (`webhooks/meta.test.ts`):** GET handshake (good/bad verify_token); POST HMAC (valid/invalid/missing); POST happy path routes to DO mock + creates messaging_thread row.
- **Shard unit (`shard.test.ts`):** determinism; uniform-ish distribution over 1000 random UUIDs (≤2× variance per shard expected).
- **Repo unit (`conversation.test.ts`):** `findOrCreateMessagingThread` idempotency.
- **Wrangler dev integration (optional, gated):** `bun -F server test:wrangler` (new script) runs `wrangler unstable_dev` and POSTs to `/webhooks/meta` end-to-end. If `wrangler unstable_dev` is flaky in this environment, document the gating and skip.

---

## 7. When you're done

```bash
bun install --frozen-lockfile && \
bun run check-types --force && \
bun run lint && \
bun -F @kuralle/core test && \
bun -F @kuralle/runtime test && \
bun -F server test && \
bun -F web test && \
bun -F server gen:openapi --check
```

All exit 0. Then `git add` every file in §3 and:
```
git commit -m "[S3-03] cf-agent: MessagingDO + wrangler.jsonc + Meta webhook handler"
```

Commit body must include:
- Which `@ariaflowagents/cf-agent` class names you used (verbatim from `.d.ts`).
- The shard-math choice (FNV-1a / SHA-256 / etc.) and why.
- Whether `wrangler unstable_dev` was used or skipped, and why.
- Any `runtime_sessions.workingMemory` schema-shape detail you locked down.
- One bullet per acceptance criterion confirming met / partial / missed.
- Any anti-scope items you nearly drifted into and stopped.

If any acceptance criterion is unmet at the end, **do not commit a partial story**. Stop, name what's blocking, and ask. Manager will salvage if needed.
