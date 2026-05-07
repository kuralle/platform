# Project State

> **Single source of truth for "where are we right now."** Updated at the end of every sprint warm-down.

---

## Active sprint

**Sprint number:** `1`
**Sprint name:** Schema
**Status:** `not-started`
**Goal:** Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally.
**WBS section:** [`sprints/WBS.md` § Sprint 1](./WBS.md)

## Load-bearing reading for sprint 1

The session running sprint 1 must read these in this order before delegating any story:

1. `sprints/WBS.md` § Sprint 1 (S1-01 .. S1-06) — full read; this is the plan.
2. `sprints/SESSION_KICKOFF_PROMPT.md` — the loop you are running.
3. `sprints/sprint-0/HANDOFF.md` — read-me-first; one page; the carry-overs and traps.
4. `sprints/sprint-0/WARMDOWN.md` — depth on what's working / not / decisions / metrics. Especially §4 (known issues) and §8 (backlog updates).
5. `sprints/AMENDMENT-001.md` (frontend client) and `sprints/AMENDMENT-002.md` (apikey divergence) — both are still in flight; consult before touching the affected surfaces.
6. `DATA_MODEL.md §4–§13` (every aggregate root: knowledge, agents, workflows, tools, channels, conversations, runtime sidecars, secrets, webhooks, audit, billing, batches).
7. `DATA_MODEL.md §18` (the 18 codegen steps; Sprint 1 lands all of them).
8. `DATA_MODEL.md §15` (cross-cutting constraints: monthly partitioning for `audit_log_events`, soft-delete columns, channel-polymorphic CHECK triggers).
9. `packages/db/src/schema/auth.ts` + `packages/db/src/migrations/0000_legal_vanisher.sql` — the precedent for how the rest of the schema lands.
10. `packages/api/src/routers/index.ts` — current router shape (2 procedures); will grow to ~12 route groups during S1.
11. `apps/server/openapi.json` — the canonical contract from S0; the drift gate fires on any router change without regen.

## Last completed sprint

`0` — Foundations.

## Last completed at

`2026-05-07` (single-session sprint; condensed from the WBS-default 1-week cadence).

## Sprint history

| Sprint | Status | Completed at | Warmdown |
|--------|--------|--------------|----------|
| 0 | complete | 2026-05-07 | [`sprint-0/WARMDOWN.md`](./sprint-0/WARMDOWN.md) |
| 1 | not-started | — | — |

When a sprint completes, append a row here from `WARMDOWN.md`.

## Backlog deltas this project life

- **BL-S0-01:** provision Neon DB + close Workers+Neon-HTTP runtime gate. Source: `sprints/sprint-0/GATE-PARTIAL.md`. Trigger: when a Neon project is provisioned and `DATABASE_URL` switched to a Neon HTTP endpoint, OR when CF credentials become available for `alchemy dev`. Earliest landing: any sprint after credentials available.
- **BL-S0-02:** enum CHECK constraints supplement migration. Source: kimi gates S0-02 + S0-03 carry-forwards. Affected columns: `organization.{environment,region,complianceMode}`, `user.systemRole`. Earliest landing: S1 (alongside the rest of the schema).
- **BL-S0-03:** split `@kuralle/env` so `apps/web` doesn't traverse `cloudflare:workers` types. Source: r1 m3, r2 §3. Earliest landing: S1 or S2 architectural cleanup.
- **BL-S0-04:** replace 3 global ESLint relaxations (`no-explicit-any → warn`, `triple-slash-reference → off`, `no-empty-object-type → off`) with file-scoped overrides + clear the 6-file `ignores` list in `eslint.config.mjs`. Source: r1 M1, r2 §3. Earliest landing: S1 cleanup.
- **BL-S0-05:** `apikey.revoked_at` supplement migration if/when distinct-from-`enabled`/`expiresAt` is needed. Source: AMENDMENT-002. Trigger: a feature requires a dedicated revocation timestamp. Earliest landing: post-MVP.
- **BL-S0-06:** assign explicit completion sprint for `kb`, `tools`, `voices`, `webhooks`, `secrets`, `batches` router stubs (the WBS is implicit). Source: user question during S0 closeout. Earliest landing: S1 plan WBS amendment.

## Open RFC amendments

- `AMENDMENT-001.md` (accepted 2026-05-07, pre-Sprint-0) — Frontend client uses `@orpc/tanstack-query` instead of `openapi-fetch` + `openapi-react-query`. OpenAPI emission and drift CI unchanged. See `sprints/AMENDMENT-001.md` for rationale and the flip-back trigger.
- `AMENDMENT-002.md` (accepted 2026-05-07, during Sprint 0 closeout) — `apikey.organizationId` reduces to `referenceId` (semantic equivalence per better-auth docs); `apikey.revokedAt` is deferred (built-in `enabled` boolean + `expiresAt` cover the practical revocation use case). `@better-auth/api-key@1.5.5`'s `ApiKeyOptions.schema` is typed `InferOptionSchema<...>` and rejects `additionalFields`. See `sprints/AMENDMENT-002.md`.

---

## How to use this file

- A new session reads this file **first** to know which sprint is active and which sections of which docs are load-bearing right now.
- The session running a sprint **does not edit this file mid-sprint**. Updates land at warm-down.
- At warm-down, the session updates: active sprint pointer, load-bearing reading for the next sprint, last-completed fields, sprint history table, backlog deltas, and any open RFC amendments.
