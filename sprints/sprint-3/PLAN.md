# Sprint 3 — Plan

**Sprint name:** First channel + first conversation
**Sprint goal (one sentence):** A real WhatsApp inbound message is received, routed by E.164 to a workspace+agent, processed by an AriaFlow-backed MessagingDO via the runtime adapter, and persisted via Cloudflare Queue → projector worker into `conversations` + `conversation_turns` + `usage_events`; F1 list and F2 detail render the live conversation through generated hooks.
**Sprint window:** 2026-05-08 → 2026-05-09 (single-session sprint, condensed from WBS-default 1-week cadence)
**Author (main session):** Claude Opus 4.7 (1M context) · 2026-05-08

---

## 0. Pre-execution decisions (locked with user 2026-05-08)

The session paused once at start to resolve three flag-worthy ambiguities; answers are now locked into every brief.

1. **AriaFlow source — `@ariaflowagents/*` npm org.** Four packages get installed in this sprint, each pinned to **1.0.0** (verified via `bun pm view <pkg> version` 2026-05-08):
   - `@ariaflowagents/core@1.0.0` — agent framework + `AgentConfig` shape (S3-02 adapter target).
   - `@ariaflowagents/messaging@1.0.0` — messaging interfaces + AriaFlow adapter (Hono-based `WhatsAppHandler` etc.).
   - `@ariaflowagents/messaging-meta@1.0.0` — Meta platform clients (WhatsApp Cloud API client, Embedded Signup callback handling, webhook HMAC verify).
   - `@ariaflowagents/cf-agent@1.0.0` — Cloudflare Workers + Durable Object integration (`AIChatAgent`-style `MessagingDO`, hibernation contract).
2. **Meta WhatsApp sandbox creds — env-var schema (delegated to manager).** `@kuralle/env` gets five new vars, schema-validated with Zod and required only in non-`test` `NODE_ENV`:
   - `META_APP_ID` — Meta App ID.
   - `META_APP_SECRET` — Meta App Secret (signed-request validation).
   - `META_SYSTEM_USER_TOKEN` — long-lived system user token (graph API auth).
   - `META_VERIFY_TOKEN` — webhook GET-verify shared secret.
   - `META_PHONE_NUMBER_ID` — sandbox Phone Number ID (S3-06 SLO test target).
   The user has stated they have the values and will populate `.env.local` once the schema lands. Tests stub via `META_*` injection in `apps/server/src/__tests__/setup.ts`.
3. **Cloudflare runtime — `wrangler dev` (no real CF account this sprint).** S3-03 + S3-04 + S3-06 all run against `wrangler dev` using miniflare's local Durable Objects + local Queues bindings. Real CF preview deploy stays in `BL-S0-01` (Neon + CF integration sprint). `apps/server/wrangler.jsonc` is created in S3-03 with `[[durable_objects.bindings]]` for `MessagingDO` and `[[queues.consumers]]` + `[[queues.producers]]` for the 16 shards (`turns-shard-0` .. `turns-shard-15`).

---

## 1. Stories

Six stories. Per-story flow per memory `feedback_per_story_kimi_review.md`: brief → `pi/deepseek-v4-pro` IC bg → atomic `[S3-{nn}]` commit → `pi/kimi-k2.6` gate bg → manager `[S3-{nn}-fix]` → next IC.

### `S3-01` — `ChannelRepository` expansion + 5 oRPC procedures + Meta connector wizard half + env-var schema

**Description:** Expand `ChannelRepository` (read-only today at `packages/core/src/repositories/channel.ts`) with `connect`, `attach`, `detach`, `endpointsList` write paths. Ship 5 oRPC procedures on a new `channelsRouter` (`channels.connect`, `channels.list` already exists, `channels.endpoints.list`, `channels.endpoints.attach`, `channels.endpoints.detach`); each procedure has explicit Zod input + output schemas; OpenAPI grows by 4 ops. Wire the M5 connector wizard's WhatsApp half: the user enters Meta App credentials → server calls Meta Embedded Signup callback (via `@ariaflowagents/messaging-meta`'s Cloud API client) → `channel_connections` row inserted with provider `meta-whatsapp-cloud` → list available phone numbers (Graph API GET `/{appId}/phone_numbers`) → user picks one → `channel_endpoints` row inserted with `identifier = phoneNumberId` and `kind = 'whatsapp'` → server auto-registers the webhook URL (POST `/{phoneNumberId}/subscribed_apps` with `publicWebhookUrl = ${PUBLIC_BASE_URL}/webhooks/meta`) per `USER_JOURNEYS.md §5 (3b)`. Add five Meta env vars to `@kuralle/env` per §0 above. Add the four `@ariaflowagents/*` deps to `apps/server/package.json` and (where used) `packages/runtime/package.json`. Polymorphic CHECK trigger on `channel_endpoints.channelKind ↔ channel_connections.channelKind` (`DATA_MODEL.md §15`) — hand-authored `_meta.sql` migration alongside any drizzle-kit-emitted diff.

**Acceptance criteria** (numbered, in priority order):
1. `ChannelRepository` exposes `connect(opts)`, `attach(opts)`, `detach(opts)`, `endpointsList(opts)`, plus existing `findById` / `findManyByWorkspace`. All write methods take a Drizzle transaction handle (so the wizard can compose with the M5 OAuth flow inside one tx) and invalidate the identity-map cache after `tx.commit()` per S2-01 contract.
2. Five oRPC procedures on `channelsRouter` at `packages/api/src/routers/channels.ts`: `list` (existing — verify still hooked through `ChannelRepository`), `connect`, `endpoints.list`, `endpoints.attach`, `endpoints.detach`. Each has explicit Zod input + output schemas; mutations are oRPC procedure mutations not queries.
3. **Channel-by-kind filter:** `channels.list` accepts an optional `{ kind?: 'whatsapp' | 'telephony' | ... }` input. Closes `BL-S2-TELEPHONY-CHANNEL-FILTER`: `useTelephony` and `usePhoneNumbers` hooks switch to `channels.list({ kind: 'telephony' })`.
4. **Meta env-var schema:** `packages/env/src/index.ts` (or wherever `@kuralle/env` lives) adds `META_APP_ID` / `META_APP_SECRET` / `META_SYSTEM_USER_TOKEN` / `META_VERIFY_TOKEN` / `META_PHONE_NUMBER_ID` as Zod `string().min(1)`, required when `NODE_ENV !== 'test'`. `.env.local.example` updated.
5. **Connector wizard wired:** `channels.connect({ provider: 'meta-whatsapp-cloud', appId, appSecret, systemUserToken })` server handler imports `WhatsAppCloudClient` from `@ariaflowagents/messaging-meta`, calls Graph API `GET /{appId}/phone_numbers` (passes `systemUserToken`), returns `{ connectionId, availablePhoneNumbers: [{ phoneNumberId, displayPhoneNumber, qualityRating }] }`. `channels.endpoints.attach({ connectionId, phoneNumberId, agentId })` inserts `channel_endpoints` and calls `POST /{phoneNumberId}/subscribed_apps` with `publicWebhookUrl`. `channels.endpoints.detach({ endpointId })` calls `DELETE /{phoneNumberId}/subscribed_apps` and soft-deletes the row.
6. **OpenAPI:** `apps/server/openapi.json` regenerated; `bun -F server gen:openapi --check` green; new ops have full Zod row-shape outputs (the existing `BL-S1-OPENAPI-ITEM-SCHEMAS` discipline; `channelConnectionSchema` + `channelEndpointSchema` derived from Drizzle row types).
7. **Polymorphic CHECK:** `packages/db/migrations/0013_channel_endpoint_kind_match.sql` (numbered after current migration head; IC verifies head before naming) enforces `channel_endpoints.channelKind = (SELECT channelKind FROM channel_connections WHERE id = channel_endpoints.channelConnectionId)` via a `BEFORE INSERT OR UPDATE` trigger. Hand-authored `_meta.sql` since drizzle-kit can't emit triggers.
8. **Integration test** at `apps/server/src/__tests__/channels.connect.test.ts` (or path per existing convention): wires an in-process oRPC server, mocks `@ariaflowagents/messaging-meta`'s Graph API calls (`@kuralle/runtime/test-utils` exposes a `mockMetaClient` factory), runs `channels.connect → endpoints.list → endpoints.attach → endpoints.detach`, asserts row inserts/deletes + cache invalidation.
9. **Hook wiring:** `apps/web/src/hooks/api/channels.ts` exposes `useChannels({ kind?: ... })`, `useConnectMetaChannel()` (mutation), `useChannelEndpoints(connectionId)`, `useAttachEndpoint()`, `useDetachEndpoint()`. `useTelephony` + `usePhoneNumbers` rewritten to use `channels.list({ kind: 'telephony' })`.
10. `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F server test`, `bun -F web test`, OpenAPI drift gate all green.

**Files expected to be created or modified:**
- `packages/core/src/repositories/channel.ts` — expand
- `packages/core/src/repositories/channel.test.ts` — expand
- `packages/api/src/routers/channels.ts` — 5 procedures
- `packages/api/src/routers/channels.schemas.ts` (new or expanded) — `channelSchema`, `channelConnectionSchema`, `channelEndpointSchema`
- `packages/env/src/index.ts` (or canonical location) — 5 META_* vars
- `.env.local.example` — 5 META_* placeholders
- `packages/db/migrations/0013_channel_endpoint_kind_match.sql` (or correct next number) (new) — polymorphic CHECK trigger
- `apps/server/package.json` — add `@ariaflowagents/messaging-meta@1.0.0`, `@ariaflowagents/messaging@1.0.0`, `@ariaflowagents/core@1.0.0` (transitively pulled by messaging-meta but pin explicitly)
- `apps/server/openapi.json` — regenerated
- `packages/api-client/src/schema.d.ts` — regenerated
- `apps/server/src/__tests__/channels.connect.test.ts` (new) — integration
- `apps/web/src/hooks/api/channels.ts` (new) — hook wrappers
- `apps/web/src/hooks/api/telephony.ts` — rewrite to use `channels.list({ kind: 'telephony' })`
- `apps/web/src/hooks/api/phone-numbers.ts` — same

**Test fixtures:** `mockMetaClient` factory in `packages/runtime/src/test-utils.ts` (new) returns a stub `WhatsAppCloudClient` whose `listPhoneNumbers` / `subscribeApp` / `unsubscribeApp` are vitest `vi.fn()`s configurable per test.

**Demo artifact:** `sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt` — vitest reporter output showing the four-step trace (`connect → endpoints.list → attach → detach`) with cache-invalidation lines visible.

---

### `S3-02` — AriaFlow runtime adapter in `packages/runtime/adapter/`

**Description:** Build the Anti-Corruption Layer per `HEXAGONAL_ARCHITECTURE.md §1` that translates Kuralle's `AgentIR` (from `@kuralle/core/schemas/agent-ir`) into `@ariaflowagents/core`'s `AgentConfig` shape. Ship `packages/runtime/src/adapter/agent-config.ts` exporting `irToAgentConfig(ir: AgentIR): AgentConfig` and the inverse direction is NOT required this sprint (snapshots are projected, not reverse-engineered). Wire `HarnessHooks` per `scripts/sink-spike/FINDINGS.md` taxonomy: `onAgentStart`, `onAgentEnd`, `onStepStart`, `onStepEnd`, `onToolCall`, `onToolResult`, `onTokensUpdate` — each emits a discriminated-union `MessagingEvent` to a `MessageQueue` port instance. Stream sink runs at `eventMode='message'` (production default per FINDINGS volume table — drops text-deltas, drops custom, keeps lifecycle + tools + transitions). Text-deltas NOT persisted; the projector reads `fullText` from `done`/`turn-end` events instead. The adapter is fully platform-neutral: no CF imports, no Hono imports, only `@ariaflowagents/core`, `@kuralle/core`, `@kuralle/platform/interface` (for `MessageQueue`).

**Acceptance criteria** (numbered, in priority order):
1. `packages/runtime/src/adapter/agent-config.ts` exports `irToAgentConfig(ir: AgentIR): AgentConfig` — pure function. Maps every `AgentIR` field used by AriaFlow's `AgentConfig`: nodes, edges, tools (via tool registry lookup — IC threads a `(toolId) => ToolDefinition` resolver param so the adapter stays dep-free of repository/database concerns), guardrails (per AMENDMENT-003 schema), eval criteria, working-memory schema.
2. `packages/runtime/src/adapter/hooks.ts` exports `buildHarnessHooks(opts: { queue: MessageQueue, conversationId: string })` returning a `HarnessHooks` object. The seven hooks emit one `MessagingEvent` each per call (or none, when the hook is observational only — IC justifies in commit body which hooks are emit-vs-noop and aligns to FINDINGS).
3. `MessagingEvent` discriminated union (file: `packages/runtime/src/adapter/events.ts` + Zod schema): every variant carries `{ kind, conversationId, occurredAt, sequenceNumber, payload }`. Variants must cover at minimum: `agent.start`, `agent.end`, `step.start`, `step.end`, `tool.call`, `tool.result`, `tokens.updated`, `turn.end` (the last is what triggers `conversation_turns` inserts in S3-04; payload includes `messageId` + `fullText`).
4. **Sequence numbering:** `sequenceNumber` is monotonic per `conversationId`, sourced from a small in-memory counter the adapter owns, not from the DB. The projector trusts the adapter's ordering (DO concurrency model in S3-03 guarantees single-writer).
5. **`AriaFlow.AgentConfig` import is type-checked** — IC verifies the import path resolves against `node_modules/@ariaflowagents/core` (and adds the dep to `packages/runtime/package.json` at `@ariaflowagents/core@1.0.0` if not already pulled in by messaging-meta in S3-01). If the actual `AgentConfig` shape differs from what `FINDINGS.md` documents, IC reports the divergence and adapts; does NOT silently change FINDINGS-cited expectations.
6. **Unit test** at `packages/runtime/src/adapter/agent-config.test.ts` (a) loads `__fixtures__/calderon-dispatcher-ir.json` (already shipped in S2-02), (b) calls `irToAgentConfig` with a stubbed tool resolver, (c) asserts the resulting `AgentConfig`'s shape (top-level keys present, node/edge counts match IR, tool count matches IR).
7. **Hook-event-shape test** at `packages/runtime/src/adapter/hooks.test.ts`: builds hooks with a memory `MessageQueue`, fires each hook with a synthetic AriaFlow event, asserts the queue receives exactly the events listed in FINDINGS for that hook (e.g., `onAgentStart` → 1 `agent.start` event; `onToolCall` → 1 `tool.call` event). Total events for a 3-turn fixture (~9 hook calls/turn × 3 turns = ~27 hook calls) emit ~27 events, matching FINDINGS' "hooks per turn ~9".
8. **Hexagonal discipline:** ESLint `no-restricted-imports` rule from S0-06 verifies no `platform/cloudflare`, `platform/node`, `hono`, or `apps/server` imports in `packages/runtime/src/adapter/**`.
9. `bun run check-types`, `bun run lint`, `bun -F @kuralle/runtime test` green.

**Files expected to be created or modified:**
- `packages/runtime/src/adapter/agent-config.ts` (new)
- `packages/runtime/src/adapter/agent-config.test.ts` (new)
- `packages/runtime/src/adapter/hooks.ts` (new)
- `packages/runtime/src/adapter/hooks.test.ts` (new)
- `packages/runtime/src/adapter/events.ts` (new) — discriminated-union + Zod schema
- `packages/runtime/src/adapter/events.test.ts` (new) — schema parse/reject
- `packages/runtime/src/adapter/index.ts` (new) — public re-exports
- `packages/runtime/src/index.ts` — re-export `adapter/`
- `packages/runtime/package.json` — pin `@ariaflowagents/core@1.0.0` (if not already pulled transitively)

**Test fixtures:** `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json` (already exists from S2-02). `packages/runtime/src/adapter/__fixtures__/aria-flow-events-3-turn.json` (new) — synthetic AriaFlow events derived from `scripts/sink-spike/stream.jsonl` line ranges per FINDINGS taxonomy.

**Demo artifact:** `sprints/sprint-3/artifacts/S3-02-adapter-event-trace.txt` — vitest output showing the 27-event emission for the 3-turn fixture aligned with FINDINGS counts.

---

### `S3-03` — Cloudflare `MessagingDO` + `apps/server/wrangler.jsonc` + WhatsApp webhook handler

**Description:** Ship the Cloudflare adapter for `MessagingRuntimeHost` per `INTERFACE_DESIGNS_RuntimeHost.md §5` synthesis. Concrete shape: a `MessagingDO` Durable Object class (one DO instance per conversation, keyed by `threadKey = 'whatsapp:<wa_id>'`), hibernating between messages per §C of that doc. Use `@ariaflowagents/cf-agent`'s `AIChatAgent`-style base (`MessagingDO` extends it) so the agent loop, `state.blockConcurrencyWhile`, and hibernation contract are reused rather than re-implemented. The DO receives messages via `idFromName(threadKey)` lookup, runs the AriaFlow agent loop using the S3-02 adapter to translate the agent's `AgentIR`, accumulates `MessagingEvent`s into the per-shard Cloudflare Queue (16 shards keyed by `hash(conversationId) % 16` per `DATA_MODEL.md §14`), and persists `runtime_sessions.workingMemory` + `session_checkpoints` after each turn. The WhatsApp webhook handler at `apps/server/src/webhooks/meta.ts` (Hono route) verifies HMAC (`X-Hub-Signature-256` against `META_APP_SECRET`), resolves `threadKey` → `messaging_threads` lookup → `channel_endpoints` lookup → workspace + agent → DO `idFromName`, and forwards the inbound message envelope. `apps/server/wrangler.jsonc` is created with the right bindings.

**Acceptance criteria** (numbered, in priority order):
1. `apps/server/src/durable-objects/MessagingDO.ts` (new) — class extends `@ariaflowagents/cf-agent`'s base (or composes it; IC picks per the shipped shape — verify against installed `.d.ts`). Exposes `fetch(req)` for inbound messages and `alarm()` for the hibernation wake. Uses `state.blockConcurrencyWhile` per `INTERFACE_DESIGNS_RuntimeHost.md §C` to make the working-memory restore atomic on cold-start. Produces `MessagingEvent`s through the S3-02 adapter; writes them to the per-shard queue via the `MessageQueue` port.
2. `apps/server/wrangler.jsonc` (new) — declares the `MessagingDO` `[[durable_objects.bindings]]`, the 16 `[[queues.producers]]` named `turns-shard-0` .. `turns-shard-15` (the projector worker is the consumer in S3-04), the `META_APP_SECRET` + `META_VERIFY_TOKEN` env wiring, the `PUBLIC_BASE_URL` var, and a `wrangler dev` config that runs locally with miniflare (no real CF account). `compatibility_date` set to today (2026-05-08) per CF guidance.
3. `apps/server/src/webhooks/meta.ts` (new) — Hono route handlers: `GET /webhooks/meta` does the WhatsApp webhook verify (`hub.mode=subscribe`, `hub.verify_token=${META_VERIFY_TOKEN}`, return `hub.challenge`); `POST /webhooks/meta` verifies `X-Hub-Signature-256` HMAC, parses the Meta webhook envelope, extracts the inbound message + `wa_id`, looks up `messaging_threads` (insert if not exists), routes to DO via `idFromName('whatsapp:' + wa_id)`. Use `@ariaflowagents/messaging-meta`'s built-in HMAC verify if it exposes one.
4. **HMAC verify is correctness, not performance** — a tampered or wrong-secret request returns `401` and writes nothing. A unit test at `apps/server/src/__tests__/webhook-meta-hmac.test.ts` covers (a) valid signature → routed, (b) invalid signature → 401, (c) missing signature header → 401, (d) wrong verify token on GET → 403.
5. **DO routing is via `threadKey`** — each conversation has exactly one DO. Two messages from the same `wa_id` arrive at the same DO instance (verified by an integration test that fires two POSTs and asserts the DO instance ID is identical).
6. **Hibernation restores `workingMemory`** — when the DO wakes from hibernation (`alarm` or new request after idle), it `state.blockConcurrencyWhile` the restore from `runtime_sessions.workingMemory` (DB column). Test: synthetic two-turn flow with a 1-second hibernate-and-wake sandwich; assert the second turn's first event includes the working-memory snapshot from turn 1.
7. **Queue producer wiring** — the DO writes events to the right shard queue (`turns-shard-${hash(conversationId) % 16}`); a unit test asserts the shard math is deterministic for a given conversationId.
8. **Test substrate:** local `wrangler dev` (miniflare) hosts the DO and the 16 queues; tests use `unstable_dev` from `wrangler` to run a one-shot ephemeral worker. `bun -F server test:wrangler` is a new script alongside the existing `bun -F server test`.
9. **No real CF this sprint** — `BL-S0-01` (CF + Neon credentials) is the gate for real preview deploy. The skip is documented in commit body.
10. `bun run check-types`, `bun run lint`, `bun -F server test`, `bun -F server test:wrangler` (new), all green.

**Files expected to be created or modified:**
- `apps/server/src/durable-objects/MessagingDO.ts` (new)
- `apps/server/src/durable-objects/MessagingDO.test.ts` (new)
- `apps/server/wrangler.jsonc` (new)
- `apps/server/src/webhooks/meta.ts` (new) — Hono route handlers
- `apps/server/src/webhooks/meta.test.ts` (new) — HMAC + routing
- `apps/server/src/__tests__/webhook-meta-hmac.test.ts` (new) — focused HMAC suite
- `apps/server/package.json` — add `@ariaflowagents/cf-agent@1.0.0`, `wrangler` (verify already present per Alchemy setup)
- `packages/platform/src/cloudflare/runtime-host.ts` — wire the new DO binding name through if a registration is needed

**Test fixtures:** `apps/server/src/__tests__/__fixtures__/meta-webhook-inbound.json` (new) — a captured Meta inbound payload (sandbox shape from Meta docs); HMAC computed with a known test secret. `apps/server/src/__tests__/__fixtures__/meta-webhook-malformed.json` for the failure paths.

**Demo artifact:** `sprints/sprint-3/artifacts/S3-03-do-hibernation-trace.txt` — wrangler dev console output of the two-turn-with-hibernate test showing DO cold start → blockConcurrencyWhile → state restore → response.

---

### `S3-04` — Projector worker draining 16 sharded queues + memory + Node adapters

**Description:** Build the projector worker per `DATA_MODEL.md §14`. It drains all 16 sharded queues (CF Queues in production, memory in unit tests, BullMQ in CI integration). For each `MessagingEvent` consumed, the projector opens a Drizzle transaction, inserts/updates the right rows in deterministic order: `conversation_turns` (idempotent on `(channel_endpoint_id, message_id)` unique index — already enforced in `DATA_MODEL.md §9`), `conversation_tool_calls` (per `tool.call`/`tool.result` events), `conversation_extracted_fields` (per the agent IR's extraction schema results), `usage_events` (per `tokens.updated` + per `agent.end` for billing kinds; `payload` left NULL for billing kinds per AMENDMENT-005), `guardrail_events` (per guardrail trigger), `audit_log_events` (per any operator-attributed action). Mirrors the publish-projector blueprint in `packages/core/src/repositories/agent.ts:170-225`: open tx → insert turn → run side-effect inserts → commit → fire-and-forget cache invalidate. Idempotent on `messageId` so webhook replays don't duplicate.

**Acceptance criteria** (numbered, in priority order):
1. `packages/runtime/src/projector/conversation.ts` (new) exports `projectConversationEvent(tx, event: MessagingEvent, ctx: { workspaceId, agentId })` — synchronous projector, fires per consumed event. Returns `{ rowsInserted: number }`.
2. **Idempotency:** the projector relies on the `(channel_endpoint_id, message_id)` unique index for `conversation_turns`. On conflict, the insert is a no-op (the projector treats it as a replay; logs at info level; does NOT throw). For `conversation_tool_calls` / `conversation_extracted_fields` rows attached to a turn that already exists, the projector skips them (the prior projection run already wrote them).
3. `packages/runtime/src/projector/projector-worker.ts` (new) — the worker loop. Takes a `MessageQueue` port and a `db` handle; subscribes to all 16 shards in parallel; per consumed event, runs the projector inside a Drizzle tx; on success, acks; on error, sends to DLQ (`turns-shard-${n}-dlq` queue).
4. **Memory adapter test** at `packages/runtime/src/projector/projector-worker.test.ts`: publishes 100 synthetic `MessagingEvent`s into a memory `MessageQueue`, runs the projector worker, asserts (a) 100 `conversation_turns` rows materialised (or fewer if some events don't terminate turns; the count should be the number of `turn.end` events), (b) `conversation_tool_calls` count matches the `tool.call` event count, (c) replay of the same 100 events yields zero new rows.
5. **Node BullMQ adapter:** `packages/platform/src/node/message-queue.ts` exists today as a stub or memory shim; this story replaces it with a real BullMQ-backed `MessageQueue` implementation. Uses `ioredis-mock` for the unit-tests-in-node path (so CI has no live Redis dependency) and the IC verifies the BullMQ + ioredis-mock combination passes the same 100-event throughput + replay test as memory does.
6. **Per-conversation ordering preserved within a shard** — a unit test fires events with mixed `conversationId`s into the queue, asserts the projector applies events for each conversationId in `sequenceNumber` order (within a single shard, FIFO is sufficient because the DO is the single writer per conversation; cross-shard ordering is irrelevant because shards are conversation-disjoint by `hash(conversationId) % 16`).
7. **Backlog detection telemetry:** the projector worker emits a `usage_events` row of `kind = 'slo_violation'` (per AMENDMENT-005 + S2-05's `recordSloViolation` helper) when a single event's queue-to-projector latency exceeds 1000 ms. Threshold constant lives in `packages/runtime/src/instrumentation/slo.ts` alongside `SLO_PUBLISH_THRESHOLD_MS`.
8. **Test fixtures use `seedWorkspace` from `@kuralle/core/test-utils`** — no raw `client.query()` SQL fixture inserts (closes part of `BL-S2-RAW-SQL-FIXTURE-CLEANUP` for new test files; existing raw-SQL files in `projector/agent.test.ts` stay deferred per backlog item).
9. `bun run check-types`, `bun run lint`, `bun -F @kuralle/runtime test` green; the new projector + Node-adapter integration test passes inside `bun test` without external Redis.

**Files expected to be created or modified:**
- `packages/runtime/src/projector/conversation.ts` (new)
- `packages/runtime/src/projector/conversation.test.ts` (new)
- `packages/runtime/src/projector/projector-worker.ts` (new)
- `packages/runtime/src/projector/projector-worker.test.ts` (new)
- `packages/platform/src/node/message-queue.ts` — real BullMQ adapter (replaces stub)
- `packages/platform/src/memory/message-queue.ts` — verify shape compatible with new tests; expand if needed
- `packages/runtime/src/instrumentation/slo.ts` — add `SLO_PROJECTOR_LAG_THRESHOLD_MS` + `SLO_PROJECTOR_LAG_NAME`
- `packages/platform/package.json` — add `bullmq` + `ioredis-mock` (in `packages/platform/`, NOT root — memory rule)

**Test fixtures:** synthetic-events generator in `packages/runtime/src/projector/__fixtures__/synthetic-events.ts`. `seedWorkspace` from `@kuralle/core/test-utils`.

**Demo artifact:** `sprints/sprint-3/artifacts/S3-04-projector-throughput.txt` — vitest output showing 100-event projection + replay-yields-zero + Node-adapter-also-green.

---

### `S3-05` — Frontend conversation hooks + F1 + F2 wiring

**Description:** Expand `apps/web/src/hooks/api/conversations.ts` to ship three hooks: `useConversations` (paginated cursor list — already exists from S2-04 as a list-only query; verify cursor pagination is honored end-to-end; also closes part of `BL-S2-CURSOR-PAGINATION-OTHER-ROUTERS` for `conversations.list`), `useConversation(id)` (detail with turns + tool-calls + evals + extracted-fields), `useConversationLive(id)` (streaming via `@orpc/tanstack-query`'s `eventIterator` if the procedure supports it; else polling on `runtime_sessions.sequenceNumber` per `USER_JOURNEYS.md §6` polling fallback). The corresponding oRPC procedures (`conversations.list` exists; `conversations.get`, `conversations.live`) ship in this story too. F1 (conversation list screen) and F2 (conversation detail screen) replace mock data with the new hooks. F3 (supervisor) stays on mocks until S4 — the `eslint.config.mjs` ignore list keeps F3 entries.

**Acceptance criteria** (numbered, in priority order):
1. Three procedures on `conversationsRouter` at `packages/api/src/routers/conversations.ts`: `list` (existing — verify cursor pagination), `get` (new — accepts `{ conversationId }`, returns `{ conversation, turns, toolCalls, extractedFields, evals }` with explicit Zod schemas), `live` (new — server-sent stream of new turn events; uses `eventIterator` from oRPC server; on the client side, `useConversationLive` subscribes; falls back to polling `runtime_sessions.sequenceNumber` if the stream connection fails).
2. **Hook wrappers:** `useConversations(opts)`, `useConversation(id)`, `useConversationLive(id)` — all in `apps/web/src/hooks/api/conversations.ts`. The hook is the only call-site for the `@orpc/tanstack-query` client (per AMENDMENT-001 + the hooks-only frontend rule).
3. **F1 (conversations list screen) live-wired:** `apps/web/src/{appropriate F1 path}` drops the `@/mocks` import for conversations data and uses `useConversations`. Cursor-paginated list scrolls; new items appear without re-fetch. ESLint `forbidden-mock-import` rule no longer fires on F1.
4. **F2 (conversation detail screen) live-wired:** `apps/web/src/{appropriate F2 path}` drops `@/mocks` for conversation data and uses `useConversation` + `useConversationLive`. Working memory pane updates with extracted fields. ESLint rule no longer fires on F2.
5. **Streaming + polling fallback documented:** `apps/web/README.md` § "Conversation live wiring" describes the two paths, when each engages, and the `runtime_sessions.sequenceNumber` polling cadence (e.g., 1 s).
6. **OpenAPI:** `apps/server/openapi.json` regenerated; new `conversations.get` op has full Zod row-shape outputs; `conversations.live` is documented as an oRPC stream (op metadata indicates the iterator).
7. **Tests:** `apps/web/src/hooks/api/conversations.test.ts` (new or expanded) covers happy path of each hook against MSW or oRPC test client. `apps/server/src/__tests__/conversations.live.test.ts` (new) covers the stream procedure end-to-end (publish synthetic events to the in-process queue, assert client receives them in order).
8. `bun run check-types`, `bun run lint`, `bun -F server test`, `bun -F web test`, OpenAPI drift gate all green.

**Files expected to be created or modified:**
- `apps/web/src/hooks/api/conversations.ts` — expand (3 hooks)
- `apps/web/src/hooks/api/conversations.test.ts` (new or expanded)
- `apps/web/src/{F1 path}` — replace mocks
- `apps/web/src/{F2 path}` — replace mocks
- `packages/api/src/routers/conversations.ts` — add `get`, `live`
- `packages/api/src/routers/conversations.schemas.ts` — `conversationDetailSchema`, `turnSchema`, `toolCallSchema`, `extractedFieldSchema`, `evalVerdictSchema`
- `apps/server/openapi.json` — regenerated
- `packages/api-client/src/schema.d.ts` — regenerated
- `apps/server/src/__tests__/conversations.live.test.ts` (new)
- `apps/web/README.md` — add "Conversation live wiring" section
- `eslint.config.mjs` — remove F1 + F2 from `ignores` (or `forbidden-mock-import` overrides) list; F3 stays in until S4

**Test fixtures:** synthetic conversation seed via `seedWorkspace(db, { withConversations: 5, turnsPerConversation: [3, 7, 1, 12, 2] })` — extends `@kuralle/core/test-utils` if needed.

**Demo artifact:** `sprints/sprint-3/artifacts/S3-05-f1-f2-live.mp4` (or `.gif` if `.mp4` infeasible) — short screencap of F1 list rendering 5 seeded conversations and F2 detail rendering one with turns. If video tooling is unavailable in the headless environment, IC produces a vitest output trace + screenshot via `@playwright/test` instead and notes the substitution.

---

### `S3-06` — End-to-end SLO test: WhatsApp inbound → F2 visible in ≤ 4 s

**Description:** Wire the full pipeline (Meta webhook → `MessagingDO` → adapter → queue → projector → DB → frontend hook) end-to-end against `wrangler dev` + sandbox Meta. The test sends a real WhatsApp message to the configured sandbox number, measures wall-time from webhook receipt to F2 detail rendering the message, asserts ≤ 4 s. The test runs as `bun -F server test:slo` against a live `wrangler dev` instance and the sandbox Meta app. Captured video (if camera tooling available) or detailed log into `sprints/sprint-3/artifacts/whatsapp-e2e.{mp4,log}`.

**Acceptance criteria** (numbered, in priority order):
1. `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` (new) — orchestrates `wrangler dev` startup (or assumes pre-started), sends a synthetic Meta-shaped inbound webhook (HMAC-signed with the sandbox secret), polls `conversations.get` until the new turn appears, measures wall-time.
2. **SLO threshold:** ≤ 4000 ms p95 over 10 trials; threshold constant `SLO_WHATSAPP_E2E_THRESHOLD_MS = 4000` lives alongside the others in `packages/runtime/src/instrumentation/slo.ts`.
3. **Real-Meta variant** (gated by env): if `META_PHONE_NUMBER_ID` is populated and `KURALLE_SLO_REAL_META=1`, the test additionally sends a real message via Meta Cloud API to the sandbox number and measures the round-trip. Default test mode is synthetic (no real Meta dependency for CI).
4. **Logging artifact** captures: webhook-receipt timestamp, DO-spawn timestamp, first-event timestamp, projector-commit timestamp, F2-render timestamp. The 4 s budget is decomposed across these intervals so a future regression can pinpoint the slowing layer.
5. **Demo capture:** if a screen-cap tool is available, `whatsapp-e2e.mp4` shows the user's phone (mocked or real) sending a message and F1/F2 lighting up. If not, `whatsapp-e2e.log` is the full trace + a still screenshot from Playwright.
6. `bun -F server test:slo` is a new script. The default `bun -F server test` does NOT run it (SLO tests can be flaky; gate behind env or explicit script).
7. `bun run check-types`, `bun run lint`, baseline tests green; `bun -F server test:slo` green at least once.

**Files expected to be created or modified:**
- `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` (new)
- `apps/server/package.json` — add `test:slo` script
- `packages/runtime/src/instrumentation/slo.ts` — add `SLO_WHATSAPP_E2E_*`
- `sprints/sprint-3/artifacts/whatsapp-e2e.{mp4,log}` (new — produced by the test run)

**Test fixtures:** `apps/server/src/__tests__/__fixtures__/meta-webhook-slo-inbound.json` (re-uses S3-03's synthetic envelope; sandboxed against the test secret).

**Demo artifact:** the `whatsapp-e2e.{mp4,log}` itself is the demo.

---

## 2. Universal DoD checklist (per story)

Copied into every story brief verbatim.

- [ ] CI green on Bun 1.1+; macOS + Ubuntu (CI matrix as currently configured).
- [ ] Behavioral coverage: every public surface tested with at least one happy-path and one failure-path test.
- [ ] Per-story `pi/kimi-k2.6` gate written + all `Apply now` items resolved + `[S3-{nn}-fix]` commit landed before next IC fires.
- [ ] Sprint-level r1 + r2 reviews close all `blocker` and `major` items.
- [ ] Public TypeScript surfaces match the relevant RFC sections (or RFC amendment merged in same PR — none expected for S3 unless AriaFlow `AgentConfig` differs from `FINDINGS.md`).
- [ ] OpenAPI regenerated and committed; `bun -F server gen:openapi --check` green.
- [ ] No `--no-verify`, no `@ts-ignore`, no `try/except: pass`. Workarounds require an explicit user-approved waiver in the commit body.
- [ ] No root devDep additions (memory rule).
- [ ] All API access from `apps/web` goes through `apps/web/src/hooks/api/<resource>.ts` (hooks-only frontend rule); `forbidden-mock-import` ESLint rule unforced on the screens this story claims to live-wire.
- [ ] Hexagonal discipline: `core` / `api` / `db` / `runtime` import only from `platform/interface.ts`, never `platform/cloudflare/**` or `platform/node/**`.
- [ ] Demo artifact attached to commit body / sprint-3/artifacts/.
- [ ] Atomic per-story commit `[S3-{nn}] {title}`; no push.

---

## 3. Test plan

| Story | Layer | Test type | Fixtures |
|-------|-------|-----------|----------|
| S3-01 | core repo | unit | mock Drizzle tx; memory KvStore |
| S3-01 | api | integration | in-proc oRPC server + mockMetaClient |
| S3-01 | web | unit | hooks render + mutation triggers (RTL + MSW) |
| S3-02 | runtime adapter | unit | calderon-dispatcher-ir.json + memory MessageQueue |
| S3-02 | runtime hooks | unit | aria-flow-events-3-turn.json |
| S3-03 | apps/server DO | wrangler-dev integration | unstable_dev miniflare + meta-webhook-inbound.json |
| S3-03 | apps/server webhook | unit | meta-webhook-{inbound,malformed}.json + HMAC |
| S3-04 | runtime projector | integration | seedWorkspace + memory MessageQueue |
| S3-04 | platform/node | integration | BullMQ + ioredis-mock |
| S3-05 | api | integration | conversations.live stream test |
| S3-05 | web | unit | RTL + MSW; hooks happy path |
| S3-06 | apps/server SLO | end-to-end | wrangler dev + synthetic meta webhook (real-Meta gated by env) |

What we will NOT test in this sprint, and why each is safe:

- **Real Cloudflare preview deploy + real Cloudflare Queues** — `BL-S0-01` blocks on credentials. wrangler dev (miniflare) covers DO + queue semantics locally; the CF preview lift is an integration sprint after creds arrive.
- **Real Meta production deploy** — sandbox is the test target this sprint; production requires Business Verification per Meta. Documented in `apps/server/wrangler.jsonc` comments.
- **40-concurrent-call load test** — that's S4-05, not S3.
- **Voice runtime (`VoiceRuntimeHost`)** — S4. The runtime synthesis in §5 of `INTERFACE_DESIGNS_RuntimeHost.md` ships only the messaging half this sprint.
- **F3 supervisor live wiring** — S4. F3 stays on mocks; ESLint ignore stays for F3 paths only.

---

## 4. Demo plan

**Demo:** `sprints/sprint-3/artifacts/whatsapp-e2e.mp4` (or `.log` + screenshot fallback). One continuous trace: a synthetic-or-real WhatsApp message hits `/webhooks/meta`, HMAC verified, `messaging_threads` lookup succeeds, `MessagingDO.idFromName('whatsapp:<wa_id>')` spawns, AriaFlow agent loop runs, the projector consumes the queue, `conversation_turns` row materialises in Postgres, F1 list shows the new conversation row, F2 detail renders the turn with extracted fields populated. End-to-end ≤ 4 s p95. Persona: **Operations Lead** — trust moment "I can see what's happening on the platform, in real time."

---

## 5. Risks specific to this sprint

| Risk | Detection signal | Mitigation |
|------|------------------|------------|
| `@ariaflowagents/cf-agent`'s `AIChatAgent` base may not fit a per-conversation-DO model (it might assume one DO per session, not per thread) | S3-03 type-check fails or contract test fails | IC reads the installed `.d.ts` first; if shape mismatches, IC composes rather than extends, and notes in commit body. |
| Meta webhook HMAC verify uses a non-standard signature format | S3-03 HMAC unit test fails against the sandbox payload | Use `@ariaflowagents/messaging-meta`'s built-in verify if exposed; else port from Meta's docs verbatim. |
| `wrangler dev` + `unstable_dev` flaky on the test workstation | S3-03 / S3-06 tests intermittently fail | Run a 5x retry cycle on the SLO test only; `unstable_dev` boot wrapped in a pre-test fixture that waits for readiness on a port-listen probe. |
| 16-shard math collides for low-cardinality `conversationId`s in tests | S3-04 ordering test fails | Use `crypto.randomUUID()` for conversationIds in fixtures; FNV-1a or similar fast hash; verify uniform distribution in a property test. |
| BullMQ + ioredis-mock has a version-skew incompatibility | S3-04 Node-adapter test fails | IC verifies versions via `bun pm view bullmq peerDependencies` and `bun pm view ioredis-mock` before pinning; pins both to latest stable; documents combo. |
| AriaFlow text-deltas land in events at `eventMode='message'` despite FINDINGS saying they're dropped | S3-02 hook-event-shape test asserts more events than expected | The test will fail loudly; IC reconciles with FINDINGS or files an AMENDMENT; do NOT silently accept the divergence. |
| `conversations.live` oRPC stream support is incomplete in `@orpc/tanstack-query` | S3-05 streaming hook test fails | Polling fallback is the contract per AMENDMENT-001; if `eventIterator` is not viable, ship polling-only this sprint and document in `apps/web/README.md`. |

---

## 6. Open questions

(All resolved in §0.)

- ~~AriaFlow source?~~ — `@ariaflowagents/*@1.0.0` four packages.
- ~~Meta env-var schema?~~ — `META_*` five-tuple.
- ~~Cloudflare runtime substrate?~~ — `wrangler dev` (no real CF this sprint).
- **Carryforward** — none open at planning. Issues found during execution land in `gate-S3-{nn}.md` per-story or in r1/r2 sprint-level reviews.
