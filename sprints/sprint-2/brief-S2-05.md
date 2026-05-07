# Story Brief — `S2-05` Sub-second publish SLO test

> **Role.** You are a senior reliability engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **TypeScript ESM, latency measurement, percentile reporting, and SLO-as-test discipline**. You have shipped p95-gated CI checks in production where a yellow SLO is a real signal, not a flake. You write tests other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. You distinguish wall-clock from CPU time; you measure with `performance.now()` not `Date.now()`; you take the median of medians for stable p95 estimates over small samples. You never silently relax a threshold. If the SLO fails, you stop and flag — never skip the test, never `xit`/`skip`, never adjust the threshold.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `any`. No `default export`. `import type` for type-only imports. No premature abstractions. The SLO test is the test; nothing else.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S2-05] sub-second publish SLO test`. Do NOT push.

---

## 1. Goal

A vitest integration test that asserts the WBS S2-02 / `USER_JOURNEYS.md §2` SLO #2: 100 sequential publishes of a representative `AgentIR` against local Postgres complete with **p95 ≤ 1 s** wall-clock from oRPC request submission to `agents.activeVersionId` swap visible.

A second test exercises the failure-mode instrumentation: when a publish takes longer than 1 s (forced via a test-only injection seam in the projector), a `usage_events` row with `kind='slo_violation'` is written. Production code path has NO sleep / NO injection.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md` — confirms sprint 2.
2. `sprints/sprint-2/PLAN.md` — full sprint plan; story `S2-05` section is the spec.
3. `sprints/sprint-2/brief-S2-01.md`, `brief-S2-02.md`, `brief-S2-03.md`, `brief-S2-04.md` — predecessors. Their commits MUST be on disk before you start.
4. `sprints/WBS.md` § Sprint 2 → row `S2-05` (around line 147).
5. **`USER_JOURNEYS.md §2 SLO #2`** — the published SLO (sub-second click-to-live for publish). Your test enforces this.
6. `DATA_MODEL.md §13` (around `usage_events`) — the event shape your failure-mode test inserts. Use the existing `kind` column with value `'slo_violation'`; payload includes `slo`, `observed_ms`, `threshold_ms`.
7. `apps/server/src/__tests__/agents.publish.test.ts` (from S2-03) — precedent; the in-process oRPC server setup is what your SLO test reuses.
8. `packages/runtime/src/projector/agent.ts` (from S2-02) — the projector. You may need to add a test-only injection seam (a parameter or a `__TEST_ONLY__` symbol export); the production path must remain unaffected.
9. `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json` (from S2-02) — the representative IR for the test.
10. `packages/db/src/schema/billing.ts` — `usage_events` table.
11. `packages/core/src/repositories/index.ts` (from S2-01) — the `withWorkspace` factory.
12. `apps/server/openapi.json` (post-S2-03) — confirm `agents.publish` is there.

---

## 3. Files you will create or modify

**Create:**
- `apps/server/src/__tests__/agents.publish.slo.test.ts` (or per existing convention) — two tests:
  - `'agents.publish meets p95 ≤ 1s SLO over 100 sequential publishes'`
  - `'projector slow-path writes usage_events with kind=slo_violation'`

**Modify:**
- `packages/runtime/src/projector/agent.ts` — only if a test-only injection seam is genuinely needed (and only if there isn't a cleaner alternative). Default approach: dependency-injected `clock` parameter with default `Date.now`; production never overrides. Document the seam in a header comment.
- `packages/runtime/src/index.ts` — re-export the seam if needed.

**Do not touch:**
- `apps/web/**` — out of scope.
- `packages/api/src/routers/**` — your test calls the procedures; doesn't modify them.
- Any migration file.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`agents.publish.slo.test.ts` first test: p95 ≤ 1 s over 100 sequential publishes.**
   - Setup: in-process oRPC server (reuse S2-03's `__tests__/agents.publish.test.ts` setup); local-pg substrate; a fixture organization + agent.
   - Loop 100 times, each iteration:
     - Capture `t0 = performance.now()`.
     - Call `agents.publish({ workspaceId, agentId, ir: calderonDispatcherIR })`.
     - Capture `t1 = performance.now()`.
     - Record `t1 - t0` in milliseconds.
   - Compute min, p50, p95, p99, max.
   - Assert `p95 <= 1000` ms.
   - Print histogram via `console.log` so the demo artifact captures it.
2. **`agents.publish.slo.test.ts` second test: failure-mode instrumentation.**
   - Inject a 1100 ms sleep into the projector via the test-only seam (or via a wrapping mock — IC chooses; `clock.sleep` injection is preferred).
   - Call `agents.publish` once; the call takes > 1 s.
   - Assert a `usage_events` row exists with `kind='slo_violation'` and payload `{ slo: 'agent.publish.p95', observed_ms: <≥1100>, threshold_ms: 1000 }`.
   - **Do NOT add the SLO instrumentation to the projector itself in this story** — that's a real production responsibility. For S2-05's purposes, the instrumentation lives in the publish procedure (S2-03's `agents.publish` handler) and triggers when the wall-clock measurement exceeds the threshold. If the procedure does not currently emit this event, **flag** — do not silently add it. The story may need to grow to include the instrumentation, with manager approval.
3. **Demo artifact `sprints/sprint-2/artifacts/publish-slo.txt`.** Captures `bun -F server test agents.publish.slo --reporter verbose 2>&1 | tail -30`. Histogram visible (min / p50 / p95 / p99 / max).
4. **Production path unaffected.** No `await sleep(...)` in the production projector. `git diff packages/runtime/src/projector/agent.ts` shows only the seam (a parameter with a safe default), no behavior change in the default-call path.
5. **No threshold relaxation.** If the SLO fails on the local-pg substrate, the test fails. Don't `xit`. Don't bump to 1500 ms. Stop and flag.
6. **`bun run check-types`, `bun run lint`, `bun -F server test` green.**
7. **No `--no-verify`, `@ts-ignore`, `any`, root devDep additions, default exports.**
8. **Atomic commit `[S2-05] sub-second publish SLO test`.** Body includes:
   - The latency histogram from the green run (min / p50 / p95 / p99 / max).
   - The injection mechanism (clock dependency / module mock).
   - Whether you grew the story scope to add the production-side `usage_events` slo_violation emission (and if so, what manager approval was given — likely "ask first").
   - Demo artifact path: `sprints/sprint-2/artifacts/publish-slo.txt`.

---

## 5. Anti-scope

- **Do not** add SLO instrumentation to other procedures. S2-05 is `agents.publish` only.
- **Do not** silently relax the 1 s threshold.
- **Do not** add a Prometheus / OpenTelemetry exporter. The instrumentation is `usage_events.kind='slo_violation'` only — a single DB row per violation. Prometheus is for S5.
- **Do not** modify `apps/web/**`.
- **Do not** add deps to the workspace-root `package.json`.

---

## 6. Verification before you commit

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle
bun install --frozen-lockfile 2>&1 | tail -3
bun run check-types 2>&1 | tail -5
bun run lint 2>&1 | tail -5
bun -F server test 2>&1 | tail -30
```

All four must be green. If the SLO fails, stop and flag.
