# Sprint-Level Spec + Code-Quality Gate — Sprint 3

> **Gate worker:** pi/kimi-k2.6
> **Inputs:** 5 story briefs (S3-02..06), 5 commits (06f2ec5..97d24b1), diff on disk.
> **Verdict:** red

---

## 1. Per-story spec adherence

### S3-02 — AriaFlow runtime adapter (commit 2970ee6)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | `irToAgentConfig` pure function with §5 citations | ✅ | `packages/runtime/src/adapter/agent-config.ts:83` — cites §5:350-365; async due to resolver hooks but no side effects. |
| 4.2 | `buildHarnessHooks` verbatim AriaFlow keys | ✅ | `hooks.ts:129` — keys match `HarnessHooks` .d.ts (`onAgentStart`, `onAgentEnd`, `onStepStart`, `onStepEnd`, `onToolCall`, `onToolResult`, `onTokensUpdate`, `onMessage`, `onEnd`). |
| 4.3 | `MessagingEvent` Zod-discriminated union, 8 variants, `.strict()` | ✅ | `events.ts:119` — 8 variants, every payload `.strict()`. |
| 4.4 | Sequence numbering monotonic per-conversationId | ✅ | `hooks.ts:54` — closure counter `let seq = 0; ++seq`. Test asserts 1..22 in `hooks.test.ts:287`. |
| 4.5 | `tool-result` extraction payload | ✅ | `hooks.ts:175` — checks `__flow_transition === true`; test covers both branches (`hooks.test.ts:146`, `158`). |
| 4.6 | Text from hook, not stream | ✅ | `hooks.ts:211` — `// FINDINGS: text-delta double-emission bug`; `turn.end` sourced from `onMessage`. |
| 4.7 | `onTokensUpdate` payload matches FINDINGS | ✅ | `events.ts:66` — schema includes all FINDINGS fields (`inputTokens`, `outputTokens`, `cacheReadTokens`, `contextUtilization`, etc.). |
| 4.8 | Hexagonal discipline (no platform imports) | ✅ | Grep confirms no `platform/cloudflare`, `platform/node`, `apps/server`, `hono` in `packages/runtime/src/adapter/`. |
| 4.9 | Tests green | ⚠️ | `bun -F @kuralle/runtime test` passes 54/55; 1 pre-existing failure in `projector/agent.test.ts` (fast-check property). Adapter tests all pass. |
| 4.10 | Demo artifact | ✅ | `sprints/sprint-3/artifacts/S3-02-adapter-event-trace.txt` exists. |
| 4.11 | AriaFlow shape verified in commit body | ✅ | Commit body lists mapped `AgentConfig` fields and wired `HarnessHooks` names verbatim. |

**Findings:**
- `hooks.ts:211` casts `ModelMessage` to `{ role: string; content: string \| unknown[]; id?: string }`. The `ai` SDK `ModelMessage` union does not guarantee an `id` field; runtime dedup fallback uses `Date.now()`, breaking dedup if `id` is absent. — **minor**
- `onEnd` (`hooks.ts:227`) may emit a second `agent.end` with `success: false` after `onAgentEnd` already emitted `success: true`. The projector treats failed `agent.end` as an `slo_violation`, so a successful run that later errors could write a spurious violation. — **minor**
- `packages/runtime/src/adapter/__fixtures__/aria-flow-events-3-turn.json` is never imported by any test. — **nit**

---

### S3-03 — MessagingDO + webhook (commit 41b806f)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | MessagingDO extends `@ariaflowagents/cf-agent` base; `blockConcurrencyWhile` on cold-start | ⚠️ | `MessagingDO.ts:11` extends `AriaFlowAgent`. `ensureRestored()` (`MessagingDO.ts:54`) wraps `stateRef.blockConcurrencyWhile`, but restores from `state.storage` only — **not from DB**. DB restore is deferred to `processInbound` via `deps.loadWorkingMemory`, which is outside `blockConcurrencyWhile`. This violates the hibernation contract that DB is source-of-truth. |
| 4.2 | `wrangler.jsonc` declares DO + 16 queues + Meta vars + dev port | ✅ | `apps/server/wrangler.jsonc` — binding `MESSAGING_DO`, 16 `queues.producers`, `vars`, `dev.port: 8787`. |
| 4.3 | Webhook GET + POST routes per spec | ✅ | `apps/server/src/webhooks/meta.ts:34` — GET handshake; `POST` HMAC verify + normalize + DO dispatch. |
| 4.4 | HMAC verify correctness (401/403 paths) | ✅ | `meta.test.ts` covers invalid signature, missing header, wrong verify token. |
| 4.5 | DO routing by `threadKey` | ✅ | `meta.test.ts:93` — two POSTs with same `wa_id` capture identical `idFromName` calls. |
| 4.6 | Hibernation restores `workingMemory` | ⚠️ | `MessagingDO.test.ts:22` tests storage restore with a fake `DurableObjectState`; it does **not** test DB restore inside `blockConcurrencyWhile`. The actual DO restores DB memory only in `processInbound`, after `fetch` has already accepted the request. |
| 4.7 | Shard math deterministic and importable | ✅ | `apps/server/src/durable-objects/shard.ts` — FNV-1a; `shard.test.ts` asserts determinism + distribution. |
| 4.8 | `findOrCreateMessagingThread` idempotent | ✅ | `packages/core/src/repositories/conversation.test.ts:230` — two calls yield same `conversationId`. |
| 4.9 | Hexagonal discipline | ✅ | No `apps/web/` imports; lint passes. |
| 4.10 | `@ariaflowagents/cf-agent@1.0.0` pinned | ✅ | `apps/server/package.json` — pinned. Root unchanged. |
| 4.11 | Tests green | ⚠️ | `bun -F server test` passes (8/8 files). Workspace `check-types` hang is documented carry-forward. |
| 4.12 | Demo artifact | ✅ | `sprints/sprint-3/artifacts/S3-03-do-hibernation-trace.txt` exists. |

**Critical finding:**
- **MessagingDO does not run the AriaFlow agent loop.** `processInbound` (`MessagingDO.ts:67`) manually constructs a fake `MessageQueue` that captures events into a local array, then calls `hooks.onAgentStart`, `hooks.onMessage`, and `hooks.onAgentEnd` directly with hard-coded payloads. It never calls `irToAgentConfig`, never runs the AriaFlow runtime, and never produces real agent output. The `fullText` emitted is literally `` `Received: ${envelope.text}` ``. This is a **major spec miss** — the DO is a shell. — **blocker**

---

### S3-04 — projector + BullMQ adapter (commit 976f3e7)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | `projectConversationEvent` pure function, switches on `MessagingEvent` | ✅ | `packages/runtime/src/projector/conversation.ts:27` — switch on `event.kind`; tx-bound writes only. |
| 4.2 | Idempotency on `(conversationId, messageId)` | ✅ | `conversation.ts:35` — `onConflictDoNothing()` on `conversation_turns` insert. `conversation.test.ts:44` asserts replay yields 1 row. |
| 4.3 | `runProjectorWorker` subscribes to 16 shards, ack/nack, clean stop | ✅ | `projector-worker.ts:40` — consumes all shard keys; ack on success; nack with requeue while `attempt < 3`; `stop()` closes handles. |
| 4.4 | SLO lag instrumentation | ✅ | `projector-worker.ts:55` — writes `slo_violation` row when `observedMs > 1000`. `slo.test.ts` verifies constant usage. |
| 4.5 | Node BullMQ adapter fully implemented | ✅ | `packages/platform/src/node/message-queue.ts` — no `not-implemented` throws. |
| 4.6 | Memory + Node adapter tests pass | ⚠️ | Memory tests pass. Node adapter test (`message-queue.test.ts`) mocks `bullmq` entirely with a custom in-memory stub; it does **not** use `ioredis-mock`. The pinned `ioredis-mock` dep is dead weight. — **minor** |
| 4.7 | Per-conversation ordering preserved | ⚠️ | `projector-worker.test.ts:52` publishes interleaved events but asserts ordinals after `.sort((a,b) => a-b)`, which masks ordering bugs. The test does **not** verify that events are processed in `sequenceNumber` order. — **minor** |
| 4.8 | Hexagonal discipline | ✅ | No `apps/server`, `cf-agent`, or `hono` imports in `packages/runtime/src/projector/`. |
| 4.9 | Tests green | ⚠️ | `bun -F @kuralle/runtime test` passes except pre-existing `agent.test.ts` failure. |
| 4.10 | Deps pinned | ✅ | `packages/platform/package.json` — `bullmq@5.76.6`, `ioredis-mock@8.13.1`. Root unchanged. |
| 4.11 | Demo artifact | ✅ | `sprints/sprint-3/artifacts/S3-04-projector-throughput.txt` exists. |
| 4.12 | No new migrations (superseded by option-A) | ✅ | Migration `0014` added; schema matches. |

**Critical finding:**
- `projectConversationEvent` (`conversation.ts:55`) resolves `tool.call`/`tool.result` to `latestTurn` via `select().orderBy(desc(ordinal)).limit(1)`. In real event order, `tool.call` arrives **before** `turn.end` for the current turn (the turn is not yet in the DB). The lookup therefore returns the **previous** turn, associating tool calls with the wrong turn. — **blocker**
- `tool.call`/`tool.result` idempotency key is `tool_${conversationId}_${toolCallId}`. If the same tool is called in two different turns with the same `toolCallId` (possible across turns in AriaFlow), the second call will UPDATE the first row instead of inserting a new one. — **major**

---

### S3-05 — conversations procedures + hooks (commit 1155207)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | `conversations.list` cursor pagination | ✅ | `packages/core/src/repositories/conversation.ts:108` — base64 JSON cursor on `(startedAt DESC, id DESC)`. Server test covers page 1 + page 2. |
| 4.2 | `conversations.get` full bundle | ✅ | `conversation.ts:151` — 5 small queries; returns `{ conversation, turns, toolCalls, extractedFields, evals }`. |
| 4.3 | `conversations.live` polling fallback | ✅ | `packages/api/src/routers/conversations.ts:63` — returns `{ kind: 'polling', sinceSequence, nextSequence, items }`. `eventIterator` is unavailable in installed `@orpc/server`; polling-only is documented. |
| 4.4 | Three hooks in `apps/web/src/hooks/api/conversations.ts` | ✅ | `useConversations`, `useConversation`, `useConversationLive` all present. |
| 4.5 | F1 + F2 live-wired | ✅ | F1 (`_app.conversations.index.tsx`) already used `useConversations` pre-sprint (no mock imports). F2 (`_app.conversations.$id.index.tsx`) now uses `useConversation` + `useConversationLive`. `eslint.config.mjs` no longer ignores F1/F2. |
| 4.6 | Streaming/polling fallback documented | ✅ | `apps/web/README.md` — "Conversation live wiring" section describes 1 Hz polling fallback. |
| 4.7 | OpenAPI drift gate green | ✅ | `bun -F server gen:openapi --check` exits 0. |
| 4.8 | Hooks-only discipline | ✅ | Lint passes; no `@kuralle/api-client` imports outside hooks/api. |
| 4.9 | Tests green | ✅ | `bun -F @kuralle/core test`, `bun -F server test`, `bun -F web test` all pass. |
| 4.10 | Demo artifact | ✅ | `sprints/sprint-3/artifacts/S3-05-f1-f2-live.txt` exists. |

**Findings:**
- `useConversationLive` (`apps/web/src/hooks/api/conversations.ts:40`) builds `turns` array on every render without `useMemo`, causing reference instability and unnecessary downstream re-renders. — **minor**
- `conversationLiveEventSchema` (`conversations.schemas.ts:96`) exists for `eventIterator` streaming but is unused because streaming is not available. Harmless dead schema. — **nit**

---

### S3-06 — E2E SLO test (commit 97d24b1)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | 10 synthetic trials end-to-end | ✅ | `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts:78` — loops 1..10. |
| 4.2 | SLO threshold 4000 ms defined | ✅ | `packages/runtime/src/instrumentation/slo.ts:21` — `SLO_WHATSAPP_E2E_THRESHOLD_MS = 4000`. |
| 4.3 | p95 ≤ 4000 ms | ✅ | Artifact shows p95 = 239 ms. |
| 4.4 | Per-segment trace in artifact | ⚠️ | Artifact includes segments, but `projector_first_to_tx_commit` is not actual tx-commit time — it's `conversations.get` success time (known carry-forward from commit body). Total latency is correct. |
| 4.5 | Real-Meta variant gated | ✅ | `it.skipIf(!process.env.KURALLE_SLO_REAL_META)` — skipped in CI. |
| 4.6 | `test:slo` script isolated | ✅ | `apps/server/package.json` — `"test:slo": "vitest run --config vitest.slo.config.ts"`. Default `test` does not run SLO tests. |
| 4.7 | Tests green | ✅ | `bun -F server test:slo` passes. Default chain (`lint`, `core`, `runtime`, `server`, `web`, `gen:openapi`) all pass. |
| 4.8 | Demo artifact | ✅ | `sprints/sprint-3/artifacts/whatsapp-e2e.log` exists. |

**Findings:**
- The SLO test stubs the DO entirely (`MESSAGING_DO` is a mock that publishes directly to the queue). It does **not** exercise the actual `MessagingDO` or `buildHarnessHooks` adapter. Because the real DO is a shell (see S3-03), the stub masks the bug. — **major (cross-story)**
- Test fixtures use `db.insert` for `agents`, `channelConnections`, `channelEndpoints` after `seedWorkspace`. Not raw `client.query()`, but not fully `seedWorkspace`-only either. — **nit**

---

## 2. Cross-story consistency

| Contract pair | Status | Notes |
|---------------|--------|-------|
| **MessagingEvent shape S3-02 emits ↔ S3-04 projector consumes** | ⚠️ | Schema matches, but S3-02 only emits `turn.end` for `assistant` role (`hooks.ts:216`). The projector schema allows `speaker: "caller"`, yet no caller-turn events are ever produced. `conversation_turns` will never contain user/inbound rows. — **major drift** |
| **MessagingDO shard math ↔ projector worker subscribe** | ✅ | Both use `shardKeyForConversation` → `turns-shard-${hash % 16}`. Worker subscribes to `turns-shard-0..15`. |
| **Conversation hooks ↔ procedure shapes** | ✅ | `useConversationLive` expects `{ kind: "polling", items, nextSequence }` — exactly what `conversations.live` returns. |
| **SLO test exercises full pipeline** | ⚠️ | Tests webhook → **stub DO** → queue → projector → DB → `conversations.get`. Does **not** test real DO or adapter. Total latency is correct, but the slowest real segment (agent inference) is absent. |
| **Schema-vs-migration for partial unique index** | ✅ | Migration `0014` creates `(conversation_id, message_id) WHERE message_id IS NOT NULL`. Drizzle schema `packages/db/src/schema/conversations.ts` mirrors it with `.where(sql\`message_id IS NOT NULL\`)`. |
| **Hexagonal-import leaks** | ✅ | No `apps/server` imports in `packages/runtime/**`. No `@ariaflowagents/cf-agent` in `packages/runtime/**`. |

---

## 3. Project-specific gates

| Gate | Status | Evidence |
|------|--------|----------|
| OpenAPI drift | ✅ | `bun -F server gen:openapi --check` exits 0. |
| Forbidden-import lint | ✅ | `bun run lint` passes (0 errors, 1 pre-existing warning in `packages/env/src/web.ts`). |
| Hooks-only frontend | ✅ | F1/F2 not in `forbidden-mock-import` ignores; F3 remains ignored. No `@kuralle/api-client` outside hooks/api. |
| No root devDep additions | ✅ | Root `package.json` unchanged. `@types/pg` added to `packages/auth` and `packages/db` devDeps only. |
| AriaFlow API verbatim | ✅ | `AgentConfig`, `HarnessHooks` names traced to installed `.d.ts`. `AriaFlowAgent` class name traced to `cf-agent` `.d.ts`. `verifySignature` / `normalizeWebhook` traced to `messaging-meta/server` `.d.ts`. |
| AriaFlow event drift vs FINDINGS | ✅ | 8-variant union, no `text-delta`/`custom`. 3-turn fixture emits 22 events (~7.3/turn), aligns with FINDINGS ~7 events/turn at message mode. |
| Schema-vs-migration consistency | ✅ | `0014_s3_04_conversation_turns_message_id_uidx.sql` ↔ `schema/conversations.ts` partial index. |
| Hexagonal-import leaks | ✅ | No leaks detected. |

---

## 4. Code quality

For each new/modified source file, one bullet per finding (or "clean"):

### S3-02

- `packages/runtime/src/adapter/agent-config.ts` — clean (pure function, `import type` used, no `any`).
- `packages/runtime/src/adapter/hooks.ts:211` — `onMessage` casts `ModelMessage` to `{ id?: string; role: string; content: ... }`; `ai` SDK `ModelMessage` does not guarantee `id`. Dedup fallback uses `Date.now()`, making dedup non-deterministic. — **minor**
- `packages/runtime/src/adapter/hooks.ts:227` — `onEnd` can emit a second `agent.end` after `onAgentEnd` already emitted one, producing duplicate/conflicting events. — **minor**
- `packages/runtime/src/adapter/events.ts` — clean (discriminated union, `.strict()` on every variant).
- `packages/runtime/src/adapter/__fixtures__/aria-flow-events-3-turn.json` — dead file; never imported. — **nit**

### S3-03

- `apps/server/src/durable-objects/MessagingDO.ts` — **DO is a shell**: overrides `fetch` entirely, never runs AriaFlow agent loop, never calls `irToAgentConfig`, emits synthetic hard-coded events. — **blocker**
- `apps/server/src/durable-objects/MessagingDO.ts:54` — `blockConcurrencyWhile` restores from `state.storage` only; DB (`runtime_sessions.workingMemory`) is source-of-truth but restored later in `processInbound`, outside the concurrency gate. — **major**
- `apps/server/src/durable-objects/shard.ts` — clean (deterministic, small, no deps).
- `apps/server/src/webhooks/meta.ts` — clean (Hono sub-app, `unknown` narrowing, no `any`).
- `apps/server/src/webhooks/meta.test.ts` — does not assert `messaging_threads` row is created/updated on POST happy path. — **minor**
- `apps/server/wrangler.jsonc` — clean (declares all required bindings).

### S3-04

- `packages/runtime/src/projector/conversation.ts:55` — `tool.call`/`tool.result` looks up `latestTurn` via `desc(ordinal) limit 1`. In real event order, `tool.call` arrives before `turn.end` for that turn, so it will attach to the **previous** turn. — **blocker**
- `packages/runtime/src/projector/conversation.ts:72` — tool-call idempotency key `tool_${conversationId}_${toolCallId}` is not unique across turns; same tool called twice with same `toolCallId` collides. — **major**
- `packages/runtime/src/projector/conversation.ts` — imports `drizzle-orm/neon-http` and `drizzle-orm/node-postgres` for `RuntimeTx`. Driver-specific leak into platform-neutral projector. — **minor**
- `packages/runtime/src/projector/projector-worker.ts` — clean (ack/nack logic correct, stop-handle closes cleanly).
- `packages/runtime/src/projector/projector-worker.test.ts` — per-conversation ordering assertion sorts ordinals, masking out-of-order processing. — **minor**
- `packages/platform/src/node/message-queue.ts` — implements `MessageQueue` port correctly, but `consume()` nack/throw interaction with BullMQ `discard()` is subtle and untested with real BullMQ. — **minor**
- `packages/platform/src/node/message-queue.test.ts` — mocks `bullmq` entirely; `ioredis-mock` is pinned but never exercised. — **minor**

### S3-05

- `packages/core/src/repositories/conversation.ts` — clean (cursor encoding/decoding explicit, 5-query detail strategy documented in commit).
- `packages/api/src/routers/conversations.ts` — clean (procedures wired to repo, Zod `.strict()` on inputs/outputs).
- `packages/api/src/routers/conversations.schemas.ts` — clean (all schemas `.strict()`).
- `apps/web/src/hooks/api/conversations.ts:40` — `useConversationLive` builds `turns` without `useMemo`; new array reference on every render. — **minor**
- `apps/web/src/routes/_app.conversations.$id.index.tsx` — clean (F2 wired to real hooks, no mocks).

### S3-06

- `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` — stubs DO entirely, masking the S3-03 shell issue. Per-segment trace uses `successAtMs` as proxy for `txCommitAtMs`. — **major (drift)**
- `apps/server/vitest.slo.config.ts` — clean (isolated config, 60 s timeout, `fileParallelism: false`).

---

## 5. Honest summary

**What shipped well:**
- S3-02 adapter is solid: pure `irToAgentConfig`, strict Zod event union, monotonic sequencing, and honest FINDINGS citations. The commit body is exemplary.
- S3-05 frontend wiring is clean: cursor pagination closes the S2 backlog, F2 is fully live-wired, polling fallback is documented, and OpenAPI stays in sync.
- S3-06 SLO test passes with p95 ≈ 240 ms (well under 4 s budget), the artifact is captured, and the real-Meta gate is correctly skipped in CI.

**What's at risk:**
- **S3-03 MessagingDO is a shell.** It extends `AriaFlowAgent` but overrides `fetch` to manually fake three hook calls instead of running the agent loop. No `irToAgentConfig`, no tool resolution, no model inference, no real assistant text. The WhatsApp inbound → agent → event pipeline is fundamentally broken.
- **S3-04 projector attaches tool calls to the wrong turn.** Because `tool.call` arrives before `turn.end` in real event order, the `latestTurn` lookup returns the previous turn.
- **Cross-story: user (caller) turns are never emitted.** The adapter only emits `turn.end` for assistant messages, so `conversation_turns` will only contain agent rows — inbound user messages are silently dropped.
- The S3-06 SLO test stubs the DO, so none of the above is caught by the end-to-end harness.

---

## 6. Recommended action

**Needs deeper rework before r1 makes sense (red).**

Specific fixes for manager `[S3-fix]`:

1. **S3-03 MessagingDO — implement the actual agent loop.**
   - In `processInbound`, call `irToAgentConfig(ir, { resolveModel, resolveTool, ... })` with workspace-scoped resolvers.
   - Build `HarnessConfig` with the adapter's `buildHarnessHooks` (already imports it) and pass it to the AriaFlow runtime.
   - Run the runtime (likely via `AriaFlowAgent`'s `onChatMessage` or equivalent base-class method) so hooks fire organically.
   - Ensure `blockConcurrencyWhile` restores `workingMemory` from the DB row first, then populates `state.storage` as hot cache.

2. **S3-04 projector — fix tool-call turn association.**
   - Thread the current `turnId` through events (e.g., add `turnId` to `tool.call`/`tool.result` payload) so the projector can associate tool calls with the correct turn without relying on `latestTurn`.
   - Alternatively, buffer tool calls in the projector until the matching `turn.end` arrives, then write them together.

3. **S3-02 adapter — emit caller turns.**
   - Add an `onMessage` branch (or a new hook) that emits `turn.end` with `speaker: "caller"` for user/inbound messages, so the projector writes both sides of the conversation.

4. **S3-04 projector — fix tool-call idempotency key.**
   - Include `sequenceNumber` or `turnId` in the tool-call row ID to prevent cross-turn collision.

5. **S3-02 adapter — dedup guard.**
   - Remove the `Date.now()` fallback in `onMessage` messageId generation; require a stable ID from the runtime or envelope.

6. **S3-03 test — assert DB state.**
   - Extend `meta.test.ts` to assert that `messaging_threads.lastConversationId` is populated after POST.

7. **S3-04 test — real ordering assertion.**
   - Remove `.sort()` from the projector-worker ordering test; assert events are processed in published order.

8. **Cleanup.**
   - Delete unused `aria-flow-events-3-turn.json` or wire it into `hooks.test.ts`.
   - Remove dead `ioredis-mock` dep from `packages/platform` if BullMQ mocking remains the CI strategy, or write a real `ioredis-mock` integration test.
