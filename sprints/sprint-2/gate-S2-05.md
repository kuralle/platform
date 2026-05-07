# Gate Review — `S2-05` Sub-second publish SLO test

**Verdict:** yellow
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** cfeb510

---

## 1. Spec adherence (walk AC#1–#8)

### AC#1 — p95 ≤ 1 s over 100 sequential publishes
**Status:** met  
**Evidence:**
- `apps/server/src/__tests__/agents.publish.slo.test.ts:173-228` — 100 sequential iterations.
- Each iteration captures `t0 = performance.now()` before `call(appRouter.agents.publish, ...)` and `t1 = performance.now()` after resolution.
- IR is varied per iteration (`guardrailGraph.nodes` IDs and `scorerAttachments` keys uniquified with `_${i}` suffix) to avoid PK collisions on `agent_guardrails.id` and `agent_eval_criteria.id` across publishes — necessary and correct.
- `percentile()` at line 143 uses nearest-rank method (`Math.ceil(p * n) - 1`).
- `expect(p95).toBeLessThanOrEqual(1000)` at line 226.
- `console.log(histogram(latencies))` at line 222 prints `n=100 min=1.2ms p50=1.5ms p95=2.9ms p99=3.7ms max=9.9ms`.
- Sanity check: the test exercises the real publish handler (insert `agent_versions` → run `projectAgent` → swap `agents.activeVersionId` in a Drizzle transaction). The 2.9 ms p95 on local Postgres + in-process oRPC is plausible for a small IR; the test is doing real work, not a no-op.
- Defensive extra assertion `expect(p99).toBeLessThanOrEqual(5000)` at line 227 is not required by the brief but does not relax the p95 threshold.

### AC#2 — Failure-mode instrumentation
**Status:** partial  
**Evidence:**
- `apps/server/src/__tests__/agents.publish.slo.test.ts:231-256` — `__setProjectorDelay(1100)` injects 1100 ms into the projector.
- Publish call completes; test uses `vi.waitFor` (timeout 3000 ms, interval 100 ms) to poll for the `usage_events` row.
- Query filters on `kind='slo_violation'` and `agentVersionId=result.versionId`.
- Asserts `rows.length === 1` and `rows[0]!.quantity! >= 1100`.
- **Missing:** AC#2 contract requires `payload={ slo: 'agent.publish.p95', observed_ms, threshold_ms: 1000 }`. The `usage_events` table has no `payload` jsonb column (`packages/db/src/schema/billing.ts`). `recordSloViolation` stores `observedMs` in `quantity` and `kind='slo_violation'`; `slo` name and `threshold_ms` are discarded. The test therefore asserts `quantity` instead of `payload`. This is a contract divergence from the brief.
- The IC honestly disclosed this in the commit body and in the `recordSloViolation` docstring.

### AC#3 — Demo artifact captured
**Status:** met  
**Evidence:**
- `sprints/sprint-2/artifacts/publish-slo.txt` exists and contains the histogram (`n=100 min=1.2ms p50=1.5ms p95=2.9ms p99=3.7ms max=9.9ms`) and both test pass marks (✓).

### AC#4 — Production path unaffected
**Status:** met  
**Evidence:**
- `packages/runtime/src/projector/agent.ts:27-43` — `__injectedDelayMs` defaults to `0`. `injectableDelay()` returns `Promise.resolve()` immediately when `__injectedDelayMs === 0`.
- No `await sleep(...)` or timing-altering code exists on the default path.
- Grep across `packages/api/src/` and `apps/server/src/` (excluding `__tests__`) confirms zero production imports of `__setProjectorDelay` or `__resetProjectorDelay`.
- `packages/runtime/src/projector/agent.ts` diff shows only the seam addition; no behavior change in the default-call path.

### AC#5 — No threshold relaxation
**Status:** met  
**Evidence:**
- `apps/server/src/__tests__/agents.publish.slo.test.ts:226` — `expect(p95).toBeLessThanOrEqual(1000)`.
- No `xit`, `it.skip`, or `it.todo` found in the test file.

### AC#6 — Lint + typecheck + test green
**Status:** met  
**Evidence:**
- IC reports `check-types`, `lint`, and `bun -F server test` all green (16 tests, 0 failures).
- Artifact shows `Exited with code 0`.
- No reason to doubt the IC's report; no lint/type shortcuts were found in the diff.

### AC#7 — No shortcuts
**Status:** met  
**Evidence:**
- Grep across all changed files found zero `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, `as unknown as`, or `--no-verify`.
- `catch (e: unknown)` at `packages/api/src/routers/agents.ts:170` is correct TypeScript best practice, not a shortcut.
- `(procedure as ProcedureLike)` in the test helper uses a locally-defined type, not `as any`.

### AC#8 — Atomic commit
**Status:** met  
**Evidence:**
- Subject: `[S2-05] sub-second publish SLO test`.
- Body includes latency histogram (`min=1.2ms … max=9.9ms`).
- Body documents injection mechanism (module-level `__injectedDelayMs`).
- Body discloses scope expansion (SLO instrumentation added to publish handler). Honest and complete.
- Body references demo artifact path.

---

## 2. Code quality

### Naming
- `recordSloViolation`, `__setProjectorDelay`, `__resetProjectorDelay` are descriptive. The `__` prefix convention clearly signals test-only seam.
- `injectableDelay` is a clear helper name.

### Type tightness
- `recordSloViolation` has explicit parameter and return types (`AnyPgDb`, explicit params object, `Promise<void>`). No `any` anywhere.
- Test helper `call<T>` defines a local `ProcedureLike` type rather than casting to `any`.

### Idiomatic patterns
- Named exports only; no default exports.
- `import type` used for `PoolClient`, `TestDb`, `Context`, `AgentIR`.
- `catch (e: unknown)` with targeted `as Error & { cause?: ... }` cast in the router is the correct modern TypeScript pattern.

### Smells
- **Module-level mutable state** in `packages/runtime/src/projector/agent.ts:29` (`let __injectedDelayMs = 0`). The IC's scratchpad originally planned a `clock?` parameter; module-level state was chosen to avoid threading an extra arg through the publish handler's `project` callback. Production is unaffected, but parameter injection is cleaner and avoids cross-test leakage if a crash prevents `__resetProjectorDelay()` from running.
- **Magic number** `1000` appears at `packages/api/src/routers/agents.ts:176` and implicitly in `packages/runtime/src/instrumentation/slo.ts` docstring. Should be a named constant (e.g., `SLO_PUBLISH_THRESHOLD_MS`) so the threshold is defined once and referenced everywhere.
- **Silent error swallowing** at `apps/server/src/__tests__/agents.publish.slo.test.ts:122-127` — `afterAll` re-adds the CHECK constraint with `.catch(() => { /* ignore */ })`. This masks not only "constraint already exists" but any other SQL error. Since `beforeEach` unconditionally drops the constraint, the restore is idempotent in normal runs, but the catch-all is overly broad.
- **Test IR size** is smaller than the S2-02 representative fixture (0 tools, 0 KB docs, 2 guardrails, 1 eval criterion, 2 wf nodes vs. 5 tools, 3 KB, 4 guardrails, 6 eval, 8 nodes). The SLO still passes by a massive margin, so this does not invalidate the test, but a more loaded IR would be a stronger signal.

---

## 3. Findings

| ID | Severity | File:line | Description | Apply now? |
|----|----------|-----------|-------------|------------|
| F1 | major | `apps/server/src/__tests__/agents.publish.slo.test.ts:106-115` (beforeEach), `122-127` (afterAll) | Test mutates schema by dropping and re-adding the `usage_events_kind_check` CHECK constraint. This is a race-condition risk if any other test runs in parallel that expects the constraint, and it hardcodes the exact CHECK expression (maintenance liability if the schema changes). The brief explicitly called for a migration, test-only pre-existing support, or a different table — not a mid-test ALTER. | yes |
| F2 | major | `packages/runtime/src/instrumentation/slo.ts:25-31` and `apps/server/src/__tests__/agents.publish.slo.test.ts:240-245` | AC#2 contract requires `payload={ slo: 'agent.publish.p95', observed_ms, threshold_ms: 1000 }`. `usage_events` has no `payload` jsonb column (`DATA_MODEL.md §13`, `packages/db/src/schema/billing.ts`). `recordSloViolation` stores `observedMs` in `quantity` and discards `slo` name and `threshold_ms`. The test asserts `quantity >= 1100` instead of `payload`. Full contract compliance requires a migration adding `payload jsonb` to `usage_events`. | yes |
| F3 | minor | `packages/runtime/src/projector/agent.ts:27-43` | Module-level mutable state (`__injectedDelayMs`) for test injection. Parameter-based injection (e.g., optional `delayMs` on `projectAgent`) is cleaner and prevents cross-test state leakage. | yes |
| F4 | minor | `packages/api/src/routers/agents.ts:176` | Magic number `1000` for the SLO threshold. Should be a named constant exported from `@kuralle/runtime` (or `@kuralle/core`) and reused by both the router and `recordSloViolation`. | yes |

---

## 4. Recommendation to the manager

`[S2-05-fix]` should apply **F1**, **F2**, **F3**, and **F4**.

- **F1 (schema mutation in test):** Ship a focused migration adding `'slo_violation'` to the `usage_events.kind` CHECK constraint (or replace the CHECK with app-level validation). Once the migration lands, remove the `DROP CONSTRAINT` / `ADD CONSTRAINT` setup/teardown from `agents.publish.slo.test.ts` entirely. This is the highest-priority fix — schema mutation in tests is a real bug.
- **F2 (payload contract divergence):** Ship a migration adding `payload jsonb` to `usage_events`. Update `recordSloViolation` to write the full payload object (`{ slo: 'agent.publish.p95', observed_ms, threshold_ms: 1000 }`) into that column. Update the failure-mode test to assert `payload.slo === 'agent.publish.p95'` and `payload.threshold_ms === 1000` instead of (or in addition to) the `quantity` check. This restores AC#2 contract compliance.
- **F3 (module-level mutable state):** Refactor `projectAgent` to accept an optional `delayMs?: number` parameter (default `0`). Update the publish handler's `project` callback to thread the parameter if needed. Remove `__setProjectorDelay` / `__resetProjectorDelay` / `__injectedDelayMs`. If threading through the callback closure is awkward, an alternative is to accept an optional `clock: { now(): number; sleep(ms: number): Promise<void> }` with a default no-op implementation.
- **F4 (magic number):** Extract `SLO_PUBLISH_THRESHOLD_MS = 1000` into `packages/runtime/src/instrumentation/slo.ts` (or `@kuralle/core` constants) and reference it from both `agents.publish` and `recordSloViolation`.

**Scope expansion ratification:** The IC added SLO instrumentation (`recordSloViolation` + router wall-clock measurement) that was not explicitly pre-authored in S2-03. The brief was self-contradictory on this point: AC#2 required the instrumentation to live in the publish procedure, while §3 "Do not touch" listed `packages/api/src/routers/**`. The IC correctly flagged the expansion in the commit body and chose the minimal load-bearing implementation. **Ratify** — the instrumentation is small, correct, and necessary for AC#2.

No blockers. Two major findings are both migration-dependent; the feature is verifiable and honest in its disclosed limitations.
