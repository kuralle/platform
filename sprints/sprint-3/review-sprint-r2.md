# Sprint 3 Review (r2, adversarial)

**Verdict: Strengthen r1**

I agree with r1's remaining major (`MessagingDO.processInbound` does not trigger `AriaFlowAgent.onChatMessage`), and found additional issues that should be addressed before closing Sprint 3.

## Findings

1. `apps/server/src/durable-objects/MessagingDO.ts:111` / `apps/server/src/durable-objects/MessagingDO.ts:126` / `apps/server/src/durable-objects/MessagingDO.ts:141` — **major** — [axis: race/data-integrity] — `runtime-seq` is only restored in `ensureRestored()`, but inbound requests never call `ensureRestored()`; `/internal/inbound` goes straight to `processInbound()`. After DO cold start, `sequenceNumber` can reset to `0`, reusing sequence `1` and replaying ordinals/idempotency keys. — **Recommended fix:** call `await this.ensureRestored()` at the start of `processInbound()`, and keep sequence increment + persist in the same `blockConcurrencyWhile` critical section.

2. `packages/core/src/repositories/conversation.ts:412` / `packages/core/src/repositories/conversation.ts:488` / `packages/db/src/schema/conversations.ts:108` / `packages/db/src/migrations/0007_moaning_arachne.sql:120` — **major** — [axis: idempotency/race] — `findOrCreateMessagingThread()` is a select-then-insert flow with no DB uniqueness constraint on `messaging_threads(workspace_id, thread_key)` in current schema/migration. Concurrent webhook retries can create duplicate thread rows and duplicate conversations for the same WhatsApp user. — **Recommended fix:** add a unique constraint on `(workspace_id, thread_key)`, then rewrite to atomic upsert (`INSERT ... ON CONFLICT ... DO UPDATE/NOTHING`) and re-select in the same transaction.

3. `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts:4` / `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts:240` — **major** — [axis: honesty/coverage] — the test comment claims scope includes `webhook handler`, but the test bypasses webhook + DO and emits `emitCallerTurn()` directly. This is a valid projector-slice SLO, but not WhatsApp inbound-to-F2 E2E. — **Recommended fix:** either (a) rename/reframe the test + artifact as projector ingestion SLO, or (b) add a true webhook→DO→projector test and keep this as a separate pipeline micro-SLO.

4. `apps/server/src/durable-objects/MessagingDO.ts:126` / `apps/server/src/durable-objects/MessagingDO.ts:153` / `apps/server/src/__tests__/slo-do-real-loop.test.ts:19` — **major** — [axis: hidden-coupling/runtime] — confirming r1: inbound path persists caller turn and saves a user message but never invokes the runtime turn loop (`onChatMessage`), so assistant turns are not generated. F2 will show caller text only. — **Recommended fix:** invoke `super.onChatMessage(...)` (or equivalent supported entrypoint) after `saveMessages` in inbound flow, with deterministic integration tests proving assistant turn emission.

5. `packages/runtime/src/adapter/hooks.ts:190` — **minor** — [axis: type-safety] — `onToolResult` builds payload via `as unknown as MessagingEvent["payload"]`, weakening discriminated-union safety exactly in a critical path. — **Recommended fix:** construct a concrete `Extract<MessagingEvent, { kind: "tool.result" }>["payload"]` object and append `extraction` via typed optional field, no double-cast.

## Honest ship verdict

Sprint 3 should **not** be closed yet as fully shippable. The deferred `onChatMessage` gap remains a major functional hole, and the `findOrCreateMessagingThread` race/idempotency issue plus `sequenceNumber` restore bug are additional correctness risks that warrant a `[S3-fix-2]` before close.
