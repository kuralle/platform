# Story Brief — `S3-04` Projector worker + 16 sharded queues + Node BullMQ adapter

> **Role.** You are a senior runtime engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) with deep expertise in **TypeScript ESM, Drizzle ORM + Postgres 15, Cloudflare Queues semantics (per-shard FIFO, ack/nack/visibility), BullMQ + ioredis-mock for Node-side test substrate, idempotency-by-unique-index, and event-sourced projection patterns**. You have shipped consumer workers where one missing `ack` causes a poison-message storm two months later; you understand transactional projection as a correctness concern, not a performance optimization. You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. **Before writing the projector, you read S3-02's `MessagingEvent` discriminated union (`packages/runtime/src/adapter/events.ts`) and S3-03's shard helper (`apps/server/src/durable-objects/shard.ts`)** — these are load-bearing contracts you consume. You verify Drizzle `withTransaction` semantics against `node_modules/.bun/drizzle-orm@*/dist/*.d.ts`. You verify BullMQ + ioredis-mock by `bun pm view bullmq peerDependencies` and `bun pm view ioredis-mock` before pinning. You prefer idempotency by unique-index on `(channel_endpoint_id, message_id)` over application-side dedupe. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun run check-types`, `bun run lint`, the new `@kuralle/runtime` tests, and a Node-adapter integration test exiting 0.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule — user reverts silently). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every schema. No premature abstractions; no speculative extensibility.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. **Do NOT touch files owned by S3-03 (MessagingDO, wrangler.jsonc, webhooks/meta) or S3-05 (conversations router/hooks/F1/F2).** If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-04] runtime/projector: 16-shard consumer + Node BullMQ adapter + idempotent conversation projection`. Do NOT push.

---

## 1. Goal

Build the projector worker per `DATA_MODEL.md §14`. It consumes `MessagingEvent`s from 16 sharded queues (CF Queues in production, memory in unit tests, BullMQ + ioredis-mock for Node-side CI integration). For each event, the projector opens a Drizzle transaction and writes/updates the right rows in a deterministic order:

- `conversation_turns` — idempotent on `(channel_endpoint_id, message_id)` unique index. Replays are no-ops.
- `conversation_tool_calls` — per `tool.call` / `tool.result` events.
- `conversation_extracted_fields` — per `tool.result` events with `__flow_transition === true` (FINDINGS pattern).
- `usage_events` — per `tokens.updated` (billing kinds; `payload` NULL) and per SLO violations (`slo_violation` kind; payload populated per AMENDMENT-005).
- `guardrail_events` — per guardrail trigger events (if present in stream).
- `audit_log_events` — per any operator-attributed action (S3 has no operator actions yet; placeholder hook).

The Node BullMQ adapter (`packages/platform/src/node/message-queue.ts`) replaces the current `not-implemented` stub. Tests use `ioredis-mock` so CI has no live Redis dependency.

Mirrors the publish-projector blueprint in `packages/core/src/repositories/agent.ts:170-225` (`publishVersion`): repository-owned tx → multi-row insert → cache invalidation. The conversation projector is a function (not a method on a repo) because it consumes events not requests.

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — confirms sprint 3 is active.
2. `sprints/sprint-3/PLAN.md` — full sprint plan; story `S3-04` section is the spec.
3. `sprints/WBS.md` § Sprint 3 → row `S3-04`.
4. `sprints/sprint-2/HANDOFF.md` — read-me-first traps:
   - "Append-only by app-layer + sink discipline" — the projector legitimately re-reads + updates eval verdicts on completed turns. Do NOT rely on UPDATE-blocking triggers for conversation_turns.
   - The publish-projector blueprint at `packages/core/src/repositories/agent.ts:170-225`.
5. **`DATA_MODEL.md §9`** — `conversations`, `conversation_turns` (with `messageId` dedup unique index), `conversation_tool_calls`, `conversation_extracted_fields`, `runtime_sessions`, `runtime_deployments`. The full conversation graph. **Load-bearing — every column-level decision must trace here.**
6. **`DATA_MODEL.md §13`** — `usage_events` post-AMENDMENT-005. `payload jsonb` column + `slo_violation` kind. Billing kinds leave `payload` NULL.
7. **`DATA_MODEL.md §14`** — sink architecture. 16 sharded queues; one consumer per shard; per-shard FIFO. The math `shardKey(conversationId) = hash % 16` is in `apps/server/src/durable-objects/shard.ts` (S3-03). YOUR projector imports this function.
8. `sprints/AMENDMENT-005.md` — `usage_events.payload jsonb` + `slo_violation` kind formalization.
9. **`packages/runtime/src/adapter/events.ts`** — S3-02's `MessagingEvent` discriminated union. Read every variant. The projector switches on `event.kind`. Do NOT modify; this is the contract.
10. `packages/runtime/src/adapter/hooks.ts` — informs which events are emitted for what kind of agent activity (so you understand what the projector receives).
11. `scripts/sink-spike/FINDINGS.md` — empirical event volumes (~7 events/turn at message mode + ~9 hooks/turn). Especially:
   - `tool-result` carries extraction inline via `__flow_transition === true`. The projector reads `payload.extraction = { targetNode, data }` if present and writes `conversation_extracted_fields` rows.
   - `onTokensUpdate` payload is the exact shape `usage_events` rows derive from.
   - `text-delta` double-emission bug — `conversation_turns.text` is sourced from `turn.end.payload.fullText`, NOT from accumulated text-deltas (S3-02 already enforced this on the producer side; verify on the consumer side too).
12. **`packages/runtime/src/projector/agent.ts`** — the existing synchronous projector for agent publish. The line range `170-225` (or whatever `publishVersion` ends at) is the structural blueprint to mirror.
13. `packages/core/src/repositories/conversation.ts` — read-only today + `findOrCreateMessagingThread` from S3-03. Verify; do NOT modify (the projector composes with this repository's domain methods).
14. **`apps/server/src/durable-objects/shard.ts`** (from S3-03) — the shard helper. Import its `shardKeyForConversation` function. The projector subscribes to the same 16 shard names.
15. `packages/runtime/src/instrumentation/slo.ts` — existing `recordSloViolation` + `SLO_PUBLISH_*` constants. You ADD `SLO_PROJECTOR_LAG_THRESHOLD_MS = 1000` and `SLO_PROJECTOR_LAG_NAME = 'projector.lag.p95'`. Do NOT modify the existing `SLO_PUBLISH_*` constants.
16. **`packages/platform/src/interface.ts`** — the `MessageQueue` port. The projector consumes via `consume()`. Contract: handler returns `Promise<void>`; on success the framework calls `ack()`; on throw the framework calls `nack({ requeue: true })`. **YOUR projector function returns void on success and throws on permanent failure.** Per-message `attempt` is on `ConsumeMessage<T>`.
17. `packages/platform/src/memory/message-queue.ts` — current memory adapter. Verify it can host 16 topics + multiple consumers in parallel (it's been used in S2). The projector unit test uses this.
18. `packages/platform/src/node/message-queue.ts` — current `not-implemented` stub. YOUR replacement uses `bullmq` + `ioredis-mock` for CI.
19. `packages/core/src/test-utils.ts` — `seedWorkspace`, `createTestDb`, `releaseTestDb`. Use these.
20. `packages/db/src/schema/conversations.ts` and adjacent — verify the actual column names + types you'll be inserting into. Run `cat packages/db/src/schema/conversations.ts` first.
21. **`bun pm view bullmq version`** and **`bun pm view ioredis-mock version`** — pin both to latest stable in `packages/platform/package.json` (NOT root). Verify combo works (`bullmq` peer-deps `ioredis@5.x`; `ioredis-mock` advertises `ioredis-mock` exports the `ioredis` interface).

---

## 3. Files to create or modify

(If a file you need is missing from this list, stop and flag — don't silently add to scope.)

### Projector (`packages/runtime/src/projector/`)
- `packages/runtime/src/projector/conversation.ts` (new) — `projectConversationEvent(tx, event, ctx)`:
  - `tx`: Drizzle transaction handle (tx-typed via the `RuntimeTx` alias mirroring `AgentTx` in `agent.ts`).
  - `event: MessagingEvent` (from `@kuralle/runtime/adapter/events`).
  - `ctx: { workspaceId, agentId, channelEndpointId }` — the projector needs these to scope inserts; they're derived once at the consumer entry-point and threaded through.
  - Returns `{ rowsInserted: number }` for telemetry.
  - Switch-on-kind: `agent.start` / `agent.end` (no row writes; runtime_sessions touch only); `step.start` / `step.end` (no rows in v1); `tool.call` / `tool.result` (write `conversation_tool_calls`); `tool.result` with `__flow_transition === true` (write `conversation_extracted_fields`); `tokens.updated` (write `usage_events` of kind `llm_input_tokens` + `llm_output_tokens`); `turn.end` (write `conversation_turns` row idempotent on `(channelEndpointId, messageId)` unique index — `ON CONFLICT DO NOTHING` in the Drizzle `.onConflictDoNothing()` clause).
- `packages/runtime/src/projector/conversation.test.ts` (new) — exercise every event kind:
  - `turn.end` happy path → `conversation_turns` row inserted.
  - `turn.end` replay → no second row (idempotency).
  - `tool.call` → `conversation_tool_calls` row.
  - `tool.result` with `__flow_transition` → `conversation_extracted_fields` rows.
  - `tokens.updated` → `usage_events` rows for input + output tokens.
  - `tx` rollback when one of the inserts violates a constraint (e.g., FK to a non-existent agent).
- `packages/runtime/src/projector/projector-worker.ts` (new) — the worker loop:
  - `runProjectorWorker({ queue, db, kvStore, shardKeys })` returns `ConsumerHandle`.
  - For each shard in `shardKeys`, calls `queue.consume(shard, async (msg) => { ... })`.
  - Per consumed message:
    - Parse `msg.payload` against `messagingEventSchema` (Zod). On parse fail → `msg.nack({ requeue: false, reason: 'unparseable' })` and emit `slo_violation` row with `kind = 'projector_parse_fail'`.
    - Resolve `ctx` (workspaceId, agentId, channelEndpointId) from the conversation lookup (or carry in event metadata — IC picks; document choice).
    - Open Drizzle tx; call `projectConversationEvent(tx, event, ctx)`; commit.
    - Measure wall-time from message-publish to commit; if >`SLO_PROJECTOR_LAG_THRESHOLD_MS`, write a `usage_events` row of kind `slo_violation` with `payload = { slo: 'projector.lag.p95', observedMs, thresholdMs }`.
    - On success: `msg.ack()`. On exception: `msg.nack({ requeue: msg.attempt < 3 })` (retry up to 3 times; then DLQ).
  - Returns a stop-handle that closes all 16 consumers cleanly.
- `packages/runtime/src/projector/projector-worker.test.ts` (new) — integration:
  - Memory adapter happy path: publish 100 synthetic events (mix of kinds), run the worker, assert 100 ack-ed and the right number of rows materialised.
  - Replay test: re-publish 100 events with same `messageId`s → 0 new rows.
  - Per-conversation ordering test: publish 10 events for conversationId A interleaved with 10 for conversationId B; assert each conversation sees its own events in `sequenceNumber` order.
  - SLO violation test: inject a synthetic 1500ms delay between publish and consume; assert one `slo_violation` row materialises.
- `packages/runtime/src/projector/__fixtures__/synthetic-events.ts` (new) — generator:
  - `generateConversationEvents({ conversationId, turnCount, kindMix })` returns an array of `MessagingEvent`s mimicking a real 3-turn agent run from FINDINGS.

### Node adapter (`packages/platform/src/node/`)
- `packages/platform/src/node/message-queue.ts` — replace stub with real BullMQ-backed `MessageQueue`:
  - Constructor accepts `{ redis: { host, port } | RedisInstance }`.
  - `publish` → `Queue.add(topic, payload, { jobId: opts.idempotencyKey })`.
  - `publishBatch` → `Queue.addBulk(...)`.
  - `consume` → starts a `Worker(topic, ...)`, calls handler with a `ConsumeMessage` shim that maps BullMQ's `job.opts.attempts` → `attempt`, exposes `ack()` (BullMQ acks on handler return) and `nack({ requeue, reason })` (BullMQ retries on throw if `attempts < max`; we map `requeue=false` to `job.discard()` + throw).
  - Returns a `ConsumerHandle` whose `stop()` closes the Worker and Queue cleanly.
- `packages/platform/src/node/message-queue.test.ts` (new) — vitest with `ioredis-mock`:
  - `vi.mock('ioredis', () => ({ default: ioredisMock }))` (or however ioredis-mock injects).
  - Same 100-event publish + replay assertions as the memory test.
  - Per-conversation FIFO ordering test (BullMQ default per-queue FIFO).
  - Idempotency via `jobId` test.

### Instrumentation
- `packages/runtime/src/instrumentation/slo.ts` — add:
  - `export const SLO_PROJECTOR_LAG_THRESHOLD_MS = 1000;`
  - `export const SLO_PROJECTOR_LAG_NAME = "projector.lag.p95" as const;`
  - Re-export from `packages/runtime/src/index.ts`.
- `packages/runtime/src/instrumentation/slo.test.ts` (if it exists; expand) — add a test asserting `recordSloViolation` accepts the new threshold name + writes the right row.

### Deps
- `packages/platform/package.json` — add `bullmq` + `ioredis-mock` (versions verified via `bun pm view <pkg> version` 2026-05-08 — pin to latest stable). NOT root.
- Root `package.json` — DO NOT touch (memory rule).

### Re-exports
- `packages/runtime/src/index.ts` — re-export `projectConversationEvent`, `runProjectorWorker`, `SLO_PROJECTOR_LAG_*`. **Do NOT re-export anything from S3-03 (MessagingDO, webhooks)** — those live in `apps/server` and are wired there.

### What you do NOT touch
- `packages/runtime/src/adapter/**` — S3-02 territory; do not modify.
- `apps/server/src/durable-objects/**`, `apps/server/src/webhooks/**`, `apps/server/wrangler.jsonc` — S3-03 territory.
- `packages/api/src/routers/conversations.ts`, `apps/web/src/hooks/api/conversations.ts`, F1/F2 routes — S3-05 territory.
- `apps/server/openapi.json` — projector is internal; no router changes.
- `packages/api-client/**` — same reason.

---

## 4. Acceptance criteria (numbered, in priority order)

1. `projectConversationEvent(tx, event, ctx)` is a pure function (modulo `tx` side effects); types align with the actual `MessagingEvent` discriminated union from S3-02.
2. **Idempotency:** `turn.end` events with the same `(channelEndpointId, messageId)` produce zero second rows. Verified by replay test.
3. **`runProjectorWorker`** subscribes to all 16 shards, ack-s on success, nack-with-requeue up to 3 attempts, then dead-letters. Stop-handle closes cleanly.
4. **SLO instrumentation:** `SLO_PROJECTOR_LAG_THRESHOLD_MS = 1000`, `SLO_PROJECTOR_LAG_NAME = 'projector.lag.p95'`. A 1500ms-lag synthetic test produces one `slo_violation` `usage_events` row with the right `payload` shape per AMENDMENT-005.
5. **Node BullMQ adapter** at `packages/platform/src/node/message-queue.ts` is fully implemented (no `not-implemented` throws). Tests pass against `ioredis-mock` — no live Redis required.
6. **Memory + Node adapter tests both pass** with the same 100-event synthetic load + replay-yields-zero-new-rows assertion.
7. **Per-conversation ordering preserved within a shard** — interleaved-events test asserts each conversation sees its events in `sequenceNumber` order.
8. **Hexagonal discipline:** `packages/runtime/src/projector/**` imports only from `@kuralle/db`, `@kuralle/core`, `@kuralle/platform/interface`, `drizzle-orm`, `zod`, and the local adapter (`./adapter` for events). No `@ariaflowagents/cf-agent`. No `apps/server/**`. ESLint forbidden-import rule verifies.
9. **Tests green:** `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test`, `bun -F server test`, `bun -F web test`, `bun -F server gen:openapi --check` all exit 0.
10. **Deps pinned:** `bullmq` + `ioredis-mock` at latest stable (verified via `bun pm view`). Both in `packages/platform/package.json`. Root unchanged.
11. **Demo artifact:** `sprints/sprint-3/artifacts/S3-04-projector-throughput.txt` — vitest verbose output showing the 100-event projection + replay-yields-zero + Node-adapter-also-green.
12. **No new migrations.** All target tables already exist (DATA_MODEL §9 + §13 in earlier sprints + AMENDMENT-005 column added in S2-05). If you discover a missing column, surface as a flag.

---

## 5. What NOT to do

- Do **not** ship the `MessagingDO` or any Cloudflare-Worker code. S3-03 (already shipped).
- Do **not** ship the conversations oRPC procedures or frontend hooks. S3-05.
- Do **not** import from `apps/server`, `packages/platform/cloudflare`, `hono`. The projector is platform-neutral.
- Do **not** persist text-deltas or accumulate text from text-delta events. Use `turn.end.payload.fullText` per FINDINGS.
- Do **not** add deps to root `package.json` (memory rule).
- Do **not** modify `MessagingEvent` schema (S3-02). If you need a missing field, surface as a flag — may require an AMENDMENT.
- Do **not** raw-`client.query()`-INSERT fixtures. Use `seedWorkspace`.
- Do **not** push to remote.

---

## 6. Test plan (you author)

- **Unit (`conversation.test.ts`):** event-kind switch coverage; idempotency on turn.end; FK rollback path.
- **Integration memory (`projector-worker.test.ts`):** 100-event publish, replay, per-conversation ordering, SLO violation.
- **Integration Node (`message-queue.test.ts`):** ioredis-mock-backed BullMQ; same 100-event happy path + replay.
- **Instrumentation (`slo.test.ts`):** new threshold constants applied via `recordSloViolation`.

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
git commit -m "[S3-04] runtime/projector: 16-shard consumer + Node BullMQ adapter + idempotent conversation projection"
```

Commit body must include:
- The exact `bullmq` + `ioredis-mock` versions pinned (verified via `bun pm view`).
- How you derived `ctx.workspaceId/agentId/channelEndpointId` per consumed event (event metadata vs DB lookup).
- The retry-attempts upper bound and DLQ handling pattern.
- One bullet per acceptance criterion confirming met / partial / missed.
- Any anti-scope items you nearly drifted into and stopped.

If any acceptance criterion is unmet at the end, **do not commit a partial story**. Stop, name what's blocking, and ask. Manager will salvage if needed.
