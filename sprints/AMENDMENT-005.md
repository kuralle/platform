# Amendment 005 — `usage_events` extends with optional `payload jsonb` + `slo_violation` kind

**Status:** Accepted
**Date:** 2026-05-08
**Affects:** `DATA_MODEL.md §13` (`usage_events` table); `packages/db/src/schema/billing.ts`; `packages/db/src/migrations/0012_s2_05_usage_events_slo.sql`; `packages/runtime/src/instrumentation/slo.ts`; `apps/server/src/__tests__/agents.publish.slo.test.ts`.
**Author:** Sprint 2 manager; surfaced by S2-05 `pi/kimi-k2.6` gate (findings F1 + F2); ratified by manager 2026-05-08 to close both findings cleanly in a single migration rather than carrying them to backlog.

---

## What changed

`DATA_MODEL.md §13`'s `usage_events` table originally specified numeric-only metering:

```ts
usage_events {
  id, workspaceId, agentId?, agentVersionId?, conversationId?,
  kind:    enum('llm_input_tokens'|...|'queue_messages'),
  quantity: real,
  unitCostUsd?: real,
  totalCostUsd?: real,
  occurredAt: timestamp
}
```

Two extensions land in this amendment, both forward-compatible with existing billing rows:

1. **New nullable column** `payload jsonb` — carries structured context for non-billing event kinds. Existing billing rows leave it `NULL`; SLO and future operational events populate it.
2. **`kind` CHECK enum tuple grows by one value:** `'slo_violation'` joins the allow-list. The existing 11 billing kinds are unchanged.

The `slo_violation` event shape:

```ts
{
  kind:     'slo_violation',
  quantity: <observedMs>,             // mirrored for index-friendly aggregation
  payload:  {
    slo:         'agent.publish.p95', // or future SLO names
    observedMs:  <number>,
    thresholdMs: 1000,                // or future thresholds
  }
}
```

## Why

1. **AC#2 of `sprints/sprint-2/brief-S2-05.md`** explicitly required asserting a `usage_events` row with `kind='slo_violation'` and `payload={ slo, observed_ms, threshold_ms: 1000 }`. The S2-05 IC's first attempt stuffed `observedMs` into `quantity` and discarded `slo` + `thresholdMs` — a contract divergence flagged as `major` by the kimi gate (F2).
2. **Test mutates schema** — the S2-05 IC's test dropped/re-added the `usage_events_kind_check` CHECK constraint per `beforeEach` to allow `slo_violation` inserts. That hack was flagged as `major` by the kimi gate (F1): race-prone if tests parallelize, hardcodes the exact CHECK expression, and creates a maintenance liability. The CHECK extension closes the loop.
3. **Single contained migration.** Both fixes share the same table; one migration (0012) is cleaner than two and keeps the schema-vs-code change atomic.
4. **Forward-compatible.** Nullable `payload` doesn't disturb billing aggregation queries (`SELECT SUM(quantity) WHERE kind='minutes'` still works). The CHECK extension never rejects a previously-valid row.

## What did NOT change

- The 11 original billing `kind` values.
- `quantity`, `unitCostUsd`, `totalCostUsd` semantics — billing pipeline unchanged.
- Indexes (`workspace_occurred_idx`, `workspace_kind_occurred_idx`, `conversation_idx`).
- Foreign-key references on `agent_id`, `agent_version_id`, `conversation_id`.
- The monthly-receipt cron from `DATA_MODEL.md §13` (lands in S5-04) — it can ignore `slo_violation` rows by filtering `WHERE kind != 'slo_violation'` or by checking `WHERE payload IS NULL` for billing rows.

## Concrete edits applied with this amendment

1. **`packages/db/src/schema/billing.ts`** — `usageEvents` table gains `payload: jsonb("payload")` (nullable). Header comment cites AMENDMENT-005.
2. **`packages/db/src/migrations/0012_s2_05_usage_events_slo.sql`** (new) — applies both changes with `IF NOT EXISTS` / `IF EXISTS` guards for idempotence against partially-applied state.
3. **`packages/db/src/migrations/meta/_journal.json`** — registers migration 0012.
4. **`packages/runtime/src/instrumentation/slo.ts`** — `recordSloViolation` writes the full `{ slo, observedMs, thresholdMs }` payload. Helper exports `SLO_PUBLISH_NAME` and `SLO_PUBLISH_THRESHOLD_MS` constants.
5. **`apps/server/src/__tests__/agents.publish.slo.test.ts`** — drops the schema-mutation hack (`DROP/ADD CONSTRAINT`); failure-mode test asserts the full payload from the AC#2 contract; `vi.spyOn` replaces the prior module-level injection seam.
6. **`packages/api/src/routers/agents.ts`** — uses `SLO_PUBLISH_THRESHOLD_MS` instead of the magic `1000`.

## Resolution path forward

`payload` is the open-ended seam for future operational events (e.g., projector backlog warnings, runtime DO heartbeat gaps, container OOM). Each new event kind appends to the CHECK enum tuple via a small migration of the same shape as 0012. The monthly-receipt aggregator (S5-04) and the compliance evaluator (S5-03) should both filter on `kind` to scope their reads.

## Footnote on the storage decision

A separate `slo_events` table (cleaner separation between billing and operational telemetry) was considered. Rejected for v1 because: (a) `usage_events` already has the FK fan-out we need (`workspace`, `agent`, `agent_version`, `conversation`), (b) volume is low (slo_violations are exceptions, not steady-state), (c) a single `usage_events` cursor per workspace is simpler for the F4 "incident view" UX. Splitting tables can land post-MVP if SLO event volume justifies it.
