# Spec + Code-Quality Gate — `S2-05` Sub-second publish SLO test

> **Role.** You are the **spec-and-code-quality gate worker (`pi/kimi-k2.6`)** — a senior peer-IC reviewer with deep expertise in **TypeScript ESM, latency measurement, percentile reporting, SLO-as-test discipline, and Postgres CHECK-constraint semantics**. The IC for this story was `pi/deepseek-v4-pro`. You are **NOT adversarial** — you are the peer-IC keeping the team honest. Your output drives the manager's fix-pass.
>
> **Mindset.** You verify the SLO threshold is honest (no silent relaxation). You verify the production code path has zero `await sleep(...)` and zero test-only branches. You verify the test exercises real wall-clock vs the p95 ≤ 1s assertion. You critically examine the IC's three flagged items: (1) scope expansion adding production SLO instrumentation, (2) test mutating schema via DROP/ADD CONSTRAINT, (3) `usage_events` shape that can't carry the `payload` AC#2 required.
>
> **Output.** A markdown report at `sprints/sprint-2/gate-S2-05.md`. **Do NOT commit.** **Do NOT modify any source.**

---

## 1. Inputs

1. The story brief: `sprints/sprint-2/brief-S2-05.md`.
2. The sprint plan: `sprints/sprint-2/PLAN.md` § `S2-05`.
3. The IC's transcript: `.handoff/result-S2-05.txt`.
4. The diff: `git show cfeb510`.
5. **`USER_JOURNEYS.md §2 SLO #2`** — the published sub-second target.
6. `DATA_MODEL.md §13` (`usage_events` table — `kind` CHECK, columns).
7. `packages/api/src/routers/agents.ts` — wall-clock measurement + threshold check + recordSloViolation call.
8. `packages/runtime/src/projector/agent.ts` — module-level `__injectedDelayMs` seam.
9. `packages/runtime/src/instrumentation/slo.ts` — new `recordSloViolation` helper.
10. `packages/runtime/src/index.ts` — re-exports.
11. `apps/server/src/__tests__/agents.publish.slo.test.ts` — two SLO tests.
12. The artifact: `sprints/sprint-2/artifacts/publish-slo.txt` (if captured).
13. The IC's scratchpad: `sprints/sprint-2/S2-05-scratchpad.md`.

---

## 2. Your job — two halves

### 2.1 Spec adherence

Walk every acceptance criterion in `brief-S2-05.md §4` (1-8). For each:
- **Met / partial / missed.** Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose the miss?

Specific verifications you MUST perform:

1. **First test: p95 ≤ 1s over 100 sequential publishes (AC#1):**
   - Setup: in-process oRPC server (reused from S2-03's test), local-pg substrate, fixture organization + agent.
   - Loop 100 times, capture `t0 = performance.now()`, call `agents.publish`, capture `t1 = performance.now()`, record `t1 - t0`.
   - Compute min, p50, p95, p99, max.
   - Assert `p95 <= 1000` ms.
   - Print histogram.
   - The IC reports p95 = 2.9 ms — sanity check: is the test actually doing real work, not a no-op?

2. **Second test: failure-mode instrumentation (AC#2):**
   - Inject 1100ms latency via the test-only seam.
   - `agents.publish` takes > 1s.
   - **Critical:** AC#2 requires asserting a `usage_events` row exists with `kind='slo_violation'` and `payload={ slo: 'agent.publish.p95', observed_ms, threshold_ms: 1000 }`.
   - **The IC reports `usage_events` has no `payload` column.** The IC's workaround stuffs `observedMs` into the `quantity` column and the SLO name into the `kind` context. **This is a contract divergence from AC#2.** Verify how the test asserts the row — does it check `quantity` instead of `payload`? Mark as `major` finding.
   - **Critical:** verify the test does NOT silently mutate the schema mid-test. The IC's commit body says "Test temporarily drops/re-adds the constraint" — read the test setup/teardown carefully. **DROP/ADD CONSTRAINT inside a test is a hack** that violates the brief's no-shortcut standard. The right path is either (a) a real migration that adds 'slo_violation' to the CHECK, or (b) pre-existing migration support, or (c) a different table for SLO events. Mark this as `blocker` if the test is the only path, `major` if it's a known-deferred migration with a clear cleanup path documented.

3. **Production path unaffected (AC#4):** `git diff packages/runtime/src/projector/agent.ts` should show ONLY a parameter / module-level seam that defaults to no-op. Verify:
   - Default-call path has no `await sleep(...)` or any timing-altering code.
   - The `__injectedDelayMs` is a module-level mutable variable accessed via `__setProjectorDelay`/`__resetProjectorDelay` — those are exported but the production code never imports them. Verify by grep across `packages/api/src/`, `apps/server/src/` (excluding tests).
   - Note: module-level mutable state is a code smell when test-only injection seams could be parameter-based instead. Worth flagging as `minor` if the IC chose module-level over parameter-injection.

4. **Demo artifact captured (AC#3):** verify `sprints/sprint-2/artifacts/publish-slo.txt` exists and contains the histogram (min / p50 / p95 / p99 / max) + the SLO assertion result.

5. **No threshold relaxation (AC#5):** the test must assert `p95 <= 1000`. Verify the assertion line. **Do NOT accept** any `xit`/`it.skip`/`it.todo` on the SLO test.

6. **Lint + typecheck + test green (AC#6):** verify all four pass.

7. **No shortcuts (AC#7):** grep diff for `--no-verify`, `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, `as unknown as`. Each is a finding.

8. **Atomic commit (AC#8):** subject + body match brief's commit-policy. Latency histogram in body.

### 2.2 Code quality

- **Naming.** `recordSloViolation`, `__setProjectorDelay`, `__resetProjectorDelay`. Match the brief's intent (test-only seam clearly marked).
- **Type tightness.** Helper has explicit param + return types. No `any`.
- **Idiomatic patterns.** Named exports only. `import type` for types.
- **Smells.** Module-level mutable state in `projector/agent.ts` (the `__injectedDelayMs` variable). Magic numbers (the 1000ms threshold should be a named constant — `SLO_PUBLISH_THRESHOLD_MS`).
- **Test quality.** Test names describe the contract. Test setup/teardown is symmetric (DROP CONSTRAINT in beforeEach, ADD CONSTRAINT in afterEach — both happen consistently).

### 2.3 Three IC-flagged items the gate must rule on

1. **Scope expansion** — IC added SLO instrumentation in `agents.publish` + `recordSloViolation` helper, beyond what the brief explicitly authorized (the brief said "do NOT add the SLO instrumentation to the projector itself; that's a real production responsibility"). The IC took the manager-approval-assumed path. Decision: ratify or rip out. The instrumentation is small and load-bearing for AC#2, so likely ratify; but verify there's nothing else creeping in.

2. **`usage_events` CHECK constraint** — the test mutates schema mid-test. This is a hack. Recommended fix-pass: ship a focused migration adding `'slo_violation'` to the CHECK enum tuple. The test's setup/teardown can then be removed entirely. **This should be a `major` finding** — schema mutation in test code is a real bug (race-condition risk if other tests run in parallel) and a maintenance liability.

3. **No `payload` column on `usage_events`** — AC#2 explicitly required `payload={ slo, observed_ms, threshold_ms: 1000 }`. The IC's workaround stuffs partial info into existing columns. **This is a contract divergence** — `usage_events` schema doesn't support the AC's full payload. Two paths:
   - (a) Ship a migration adding a `payload jsonb` column to `usage_events`.
   - (b) Accept the partial-storage workaround as a `BL-S2-USAGE-EVENTS-PAYLOAD` backlog item.
   Mark as `major` finding; recommend the migration land in this sprint's fix-pass.

---

## 3. Output format

Same shape as gate-S2-01.md..gate-S2-04.md.

```markdown
# Gate Review — `S2-05` Sub-second publish SLO test

**Verdict:** {green | yellow | red}
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** cfeb510

## 1. Spec adherence (walk AC#1-#8)
## 2. Code quality
## 3. Findings
| ID | Severity | File:line | Description | Apply now? |
## 4. Recommendation to the manager
```

---

## 4. Hard constraints

- Do NOT edit any source.
- Do NOT commit.
- Do NOT generate code.
- Output is `sprints/sprint-2/gate-S2-05.md`.
- Cite file:line for every finding.
- The test-mutates-schema concern is the most important finding — read the test setup/teardown carefully and rule on whether DROP/ADD CONSTRAINT is acceptable in the production codebase's test suite.
- If the IC silently relaxed the 1s threshold (e.g., `p95 <= 5000`), mark as **blocker**.
