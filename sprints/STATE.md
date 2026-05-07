# Project State

> **Single source of truth for "where are we right now."** Updated at the end of every sprint warm-down.

---

## Active sprint

**Sprint number:** `0`
**Sprint name:** Foundations
**Status:** `not-started`
**Goal:** Ship Postgres-backed auth, an OpenAPI 3 contract emitted by oRPC and committed as the canonical public spec, a thin `@orpc/tanstack-query` client package consumed by `apps/web` behind hook wrappers, and the eight platform ports + memory adapter — proving the hexagonal seam and the API contract before any domain code lands.
**WBS section:** [`sprints/WBS.md` § Sprint 0](./WBS.md)

## Load-bearing reading for sprint 0

The session running sprint 0 must read these in this order before delegating any story:

1. `sprints/WBS.md` — full read; this is the plan.
2. `sprints/SESSION_KICKOFF_PROMPT.md` — the loop you are running.
3. `DATA_MODEL.md §3` (auth & tenancy via better-auth) and `§19` (post-signoff blockers — better-auth-on-Workers is the codegen gate).
4. `HEXAGONAL_ARCHITECTURE.md §2` (the eight ports) and `§6` (discipline rules).
5. `INTERFACE_DESIGNS_RuntimeHost.md §5` (the synthesis chosen for `RuntimeHost`).
6. `README.md` (current shipped state of `apps/web` — 34 tests, deterministic mocks, no real integrations).
7. `apps/server/src/index.ts` (existing Hono + oRPC + `OpenAPIHandler` mount — S0-04 builds on this).
8. `packages/db/drizzle.config.ts` + `packages/db/src/schema/auth.ts` + `packages/auth/src/index.ts` (the D1/SQLite scaffold being replaced in S0-01..03).
9. `infra/alchemy.run.ts` (the deployment wiring being updated in S0-01).
10. The Hono + better-auth-on-Cloudflare recipe at <https://hono.dev/examples/better-auth-on-cloudflare> (the spec for S0-02).

## Last completed sprint

`(none — project not started)`

## Last completed at

`(none)`

## Sprint history

| Sprint | Status | Completed at | Warmdown |
|--------|--------|--------------|----------|
| 0 | not-started | — | — |

When a sprint completes, append a row here from `WARMDOWN.md`.

## Backlog deltas this project life

`(none)`

## Open RFC amendments

- `AMENDMENT-001.md` (accepted 2026-05-07) — Frontend client uses `@orpc/tanstack-query` instead of `openapi-fetch` + `openapi-react-query`. OpenAPI emission and drift CI unchanged. See `sprints/AMENDMENT-001.md` for rationale and the flip-back trigger.

---

## How to use this file

- A new session reads this file **first** to know which sprint is active and which sections of which docs are load-bearing right now.
- The session running a sprint **does not edit this file mid-sprint**. Updates land at warm-down.
- At warm-down, the session updates: active sprint pointer, load-bearing reading for the next sprint, last-completed fields, sprint history table, backlog deltas, and any open RFC amendments.
