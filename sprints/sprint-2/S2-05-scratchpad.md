# S2-05 Scratchpad

## Plan

1. **Projector clock seam** — Add `ProjectorClock` with `delay(ms)` to `projectAgent`. Default: no-op. Test injects real `setTimeout`-based delay.
2. **SLO instrumentation helper** — New file `packages/runtime/src/instrumentation/slo.ts` with `recordSloViolation()` that inserts into `usage_events`. Exported from `packages/runtime/src/index.ts`. Keeps `@kuralle/db/schema` import out of `packages/api/src/routers/`.
3. **Publish handler instrumentation** — `agents.publish` measures wall-clock via `performance.now()`. If > 1000ms, calls `recordSloViolation()`. 
4. **SLO test** — Two tests:
   - Test 1: 100 sequential publishes, assert p95 ≤ 1000ms
   - Test 2: Inject 1100ms delay via clock seam, assert usage_events row written
5. **Demo artifact** — Capture test output to `sprints/sprint-2/artifacts/publish-slo.txt`

## Decisions

- **Scope expansion**: Adding SLO instrumentation + `recordSloViolation` helper. Flagged in commit body.
- **Payload column**: `usage_events` has no `payload` jsonb column. Storing `observedMs` in `quantity`, `sloName` partially in `kind` context. Full storage needs a migration (out of scope).
- **Clock seam**: Optional `clock?` parameter on `projectAgent` with `delay(ms)` method. Production never passes it → immediate resolve.
- **Percentile method**: `sorted[Math.ceil(p * n) - 1]` (standard "nearest-rank" method).

## Files to touch

| File | Action |
|------|--------|
| `packages/runtime/src/projector/agent.ts` | Add `ProjectorClock` interface + `clock?` param |
| `packages/runtime/src/instrumentation/slo.ts` | New: `recordSloViolation` helper |
| `packages/runtime/src/index.ts` | Re-export `ProjectorClock`, `recordSloViolation` |
| `packages/api/src/routers/agents.ts` | Add wall-clock measurement + slo insertion in publish |
| `apps/server/src/__tests__/agents.publish.slo.test.ts` | New: two SLO tests |
| `sprints/sprint-2/artifacts/publish-slo.txt` | New: demo artifact |

## Unverified

- Whether the SLO actually holds against local Postgres (test will tell)
- Whether the eslint rule on `@kuralle/db/schema` fires on the instrumentation module (it shouldn't — `packages/runtime` is not in the restricted files glob)
