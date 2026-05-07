# Project State

> **Single source of truth for "where are we right now."** Updated at the end of every sprint warm-down.

---

## Active sprint

**Sprint number:** `2`
**Sprint name:** Editor IR pipeline
**Status:** `not-started`
**Goal:** Owner-Operator can edit and publish an agent through C2/C3/C8, which writes a real `agent_versions.snapshot`, runs the synchronous projection worker, swaps `agents.activeVersionId`, and shows "Saved → Publishing → Live" in the sticky bar — sub-second from click to live (USER_JOURNEYS §2 SLO #2).
**WBS section:** [`sprints/WBS.md` § Sprint 2](./WBS.md)

## Load-bearing reading for sprint 2

The session running sprint 2 must read these in this order before delegating any story:

1. `sprints/WBS.md` § Sprint 2 (S2-01 .. S2-05) — full read; this is the plan.
2. `sprints/SESSION_KICKOFF_PROMPT.md` — the loop you are running.
3. `sprints/sprint-1/HANDOFF.md` — read-me-first; one page; the carry-overs and traps.
4. `sprints/sprint-1/WARMDOWN.md` — depth on what's working / not / decisions / metrics. Especially §4 (known issues), §5 (decisions made — incl. append-only DB scope amendment), §8 (backlog updates), §9 (retrospective + try-next).
5. `sprints/AMENDMENT-001.md` (frontend client) and `sprints/AMENDMENT-002.md` (apikey divergence) — both still in flight.
6. **`DATA_MODEL.md §5` (lines 307-443)** — agent two-row split + projection table shapes. **§5:347-365 is the locked AgentIR snapshot shape** — S2-02's Zod schema must match verbatim.
7. **`DATA_MODEL.md §15`** — note the 2026-05-07 amendment (around lines 1204-1252) narrowing append-only DB-level enforcement to `agent_versions` only; the other 9 tables on the list rely on app-layer + sink discipline.
8. `DATA_MODEL.md §6` (workflow projection tables) — `workflow_nodes_projection`, `workflow_edges_projection` — projector worker writes these on publish.
9. `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer; `runtime/adapter/` is where the projector worker lives. `§5` Fowler PoEAA identity-map — repositories accept `KvStore` port for cache.
10. `USER_JOURNEYS.md §4` (Journey 2 — building/editing an agent) and `§13` (C2/C3/C8 wiring spec).
11. `INTERFACE_DESIGNS_RuntimeHost.md` — the projector worker interface contract (which functions, which return shapes).
12. `packages/db/src/schema/agents.ts` — the projection tables shipped in S1-02; `packages/db/src/schema/index.ts` for the re-exports.
13. `packages/api/src/routers/agents.ts` — the S1-05 `list` stub; S2-03 expands with `publish`, `autoSave`, `get`, `history`.
14. `apps/server/openapi.json` — current canonical contract (13 ops); S2-03 grows it; drift CI gates it.
15. `apps/web/src/hooks/api/agents.ts` — the S1-05 `useAgents()` hook; S2-04 extends with `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory`.

## Last completed sprint

`1` — Schema.

## Last completed at

`2026-05-07` (single-session sprint; condensed from the WBS-default 1-week cadence).

## Sprint history

| Sprint | Status | Completed at | Warmdown |
|--------|--------|--------------|----------|
| 0 | complete | 2026-05-07 | [`sprint-0/WARMDOWN.md`](./sprint-0/WARMDOWN.md) |
| 1 | complete | 2026-05-07 | [`sprint-1/WARMDOWN.md`](./sprint-1/WARMDOWN.md) |
| 2 | not-started | — | — |

When a sprint completes, append a row here from `WARMDOWN.md`.

## Backlog deltas this project life

- **BL-S0-01:** provision Neon DB + close Workers+Neon-HTTP runtime gate. Source: `sprints/sprint-0/GATE-PARTIAL.md`. Earliest landing: any sprint after credentials available.
- **BL-S0-02:** ~~enum CHECK constraints supplement migration.~~ **Closed** in S1-01-fix (`cc87911`).
- **BL-S0-03:** split `@kuralle/env` so `apps/web` doesn't traverse `cloudflare:workers` types. Source: S0 r1 m3 / r2 §3. Earliest landing: S2 architectural cleanup.
- **BL-S0-04:** replace 3 global ESLint relaxations with file-scoped overrides + clear the 6-file `ignores` list in `eslint.config.mjs`. Earliest landing: S2 cleanup.
- **BL-S0-05:** `apikey.revoked_at` supplement migration if/when distinct-from-`enabled`/`expiresAt` is needed. Earliest landing: post-MVP.
- **BL-S0-06:** ~~assign explicit completion sprint for stub routers.~~ **Closed** in S1-05 (all 11 router groups landed).
- **BL-S1-WIRE-REMAINING-HOOKS:** wire `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers` hooks; replace mock imports in B1/F1/`/knowledge`/`/telephony`/`/phone-numbers` screens. Source: `sprint-1/WARMDOWN.md §4 KI-1-01`. Earliest landing: S2-04 (extend scope from agents-only to all 5 hooks).
- **BL-S1-OPENAPI-ITEM-SCHEMAS:** replace `items: z.array(z.unknown())` in all 11 list routers with explicit Zod schemas mirroring Drizzle row types. Source: codex r2 Apply-now 3, `sprint-1/WARMDOWN.md §4 KI-1-02`. Earliest landing: S2-03 ("regenerate `apps/server/openapi.json` with full Zod-derived schemas" already in scope — extend to other 10 routers).
- **BL-S1-AUDIT-ROLLOVER:** add monthly cron OR quarterly migration cadence to keep `audit_log_events` partitions ahead of the project clock. Currently 14 months runway through 2027-06. Source: codex r2 Apply-now 1, `sprint-1/WARMDOWN.md §4 KI-1-03`. Earliest landing: any sprint with ops-tooling work.
- **BL-S1-VECTOR-ROUNDTRIP-TEST:** add Drizzle-runtime test exercising vector `toDriver`/`fromDriver` round-trip with populated + null embeddings. Source: codex r2 Apply-now 4, `sprint-1/WARMDOWN.md §4 KI-1-06`. Earliest landing: S2-01 (`KbDocumentRepository` will exercise the column).

## Open RFC amendments

- `AMENDMENT-001.md` (accepted 2026-05-07, pre-Sprint-0) — Frontend client uses `@orpc/tanstack-query` instead of `openapi-fetch` + `openapi-react-query`. OpenAPI emission and drift CI unchanged.
- `AMENDMENT-002.md` (accepted 2026-05-07, during Sprint 0 closeout) — `apikey.organizationId` reduces to `referenceId`; `apikey.revokedAt` deferred.
- **`DATA_MODEL.md §15` append-only enforcement scope** (committed 2026-05-07 in `[S1-fix]` `f87e71b`) — DB-level UPDATE-blocking applies ONLY to `agent_versions`. Other "append-only" tables rely on app-layer + sink discipline. Inline amendment in `DATA_MODEL.md`; no separate AMENDMENT file.

---

## How to use this file

- A new session reads this file **first** to know which sprint is active and which sections of which docs are load-bearing right now.
- The session running a sprint **does not edit this file mid-sprint**. Updates land at warm-down.
- At warm-down, the session updates: active sprint pointer, load-bearing reading for the next sprint, last-completed fields, sprint history table, backlog deltas, and any open RFC amendments.
