# Handoff — Sprint 1 → Sprint 2

> **One page. Read this before doing anything else.** Depth lives in [`WARMDOWN.md`](./WARMDOWN.md); this is the read-me-first.

---

## State of the world (one paragraph)

Sprint 1 (Schema) is complete. **All 18 codegen steps from `DATA_MODEL.md §18` shipped as 13 Drizzle schema files + 12 migrations applied to local Postgres**, the OpenAPI surface grew from 2 → 13 operations across 11 oRPC router groups, the C1 agents-list page reads from a real `useAgents()` hook, and the Calderon HVAC seed creates 42 deterministic-ID rows idempotently. Three production-relevant gaps caught by codex r2 are addressed: forward audit-log partitions through 2027-06, append-only DB-enforcement scope amended in `DATA_MODEL.md §15`, vector `fromDriver` null-safety. Three carry-forwards remain in the backlog (UI hook wiring for the rest of the screens, OpenAPI item schemas, partition-rollover automation) — none of them block Sprint 2.

---

## Sprint 2 goal (verbatim from WBS)

> **Owner-Operator can edit and publish an agent through C2/C3/C8, which writes a real `agent_versions.snapshot`, runs the synchronous projection worker, swaps `agents.activeVersionId`, and shows "Saved → Publishing → Live" in the sticky bar — sub-second from click to live (USER_JOURNEYS §2 SLO #2).**

The full sprint section is at `sprints/WBS.md` § Sprint 2 (stories S2-01 through S2-05).

---

## Read these first (in this order, before delegating any story)

1. `sprints/STATE.md` — confirms the active sprint and the load-bearing reading list.
2. `sprints/WBS.md` § Sprint 2 (S2-01 .. S2-05).
3. `sprints/sprint-1/WARMDOWN.md` — depth on what shipped + carry-forwards (especially §4 known issues, §8 backlog updates, §9 retrospective).
4. `sprints/AMENDMENT-001.md` (frontend client) and `sprints/AMENDMENT-002.md` (apikey) — both still in flight; consult before touching the affected surfaces.
5. `DATA_MODEL.md §5` — agent two-row split + projection tables (already landed; S2 builds the projection worker on top). **§5:347-365 is the locked snapshot shape** — `AgentIR` Zod schema in S2-02 must match it verbatim. **§15 has a 2026-05-07 amendment narrowing the append-only DB-enforcement scope** — read it before designing any UPDATE-blocking trigger.
6. `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer in `runtime/adapter/` (S2-02 projector ships under this layer; S2-01 repositories accept the `KvStore` port from `@kuralle/platform/interface`).
7. `USER_JOURNEYS.md §4` (Journey 2 — building/editing an agent) and `§13` (C2/C3/C8 wiring spec).
8. `packages/db/src/schema/agents.ts` — verify the projection table shapes (`agentToolAttachments`, `agentKbAttachments`, `agentGuardrails`, `agentEvalCriteria`, `workflowNodesProjection`, `workflowEdgesProjection`) — that's what the S2-02 projector worker writes into.
9. `apps/server/openapi.json` — current canonical contract from S1-05 (13 operations). S2-03 will grow it with `agents.publish/autoSave/list/get/history` (5 procedures).

---

## Traps to know about

- **Append-only DB enforcement scope changed.** `DATA_MODEL.md §15` was amended on 2026-05-07: the `BEFORE UPDATE` trigger applies ONLY to `agent_versions`. Other "append-only" tables (`conversation_turns`, `webhook_deliveries`, etc.) have legitimate UPDATE paths and rely on app-layer + sink discipline. **Don't add UPDATE-blocking triggers to those tables in S2** — break the legitimate paths.
- **OpenAPI item schemas are `unknown`.** All 11 list operations in `apps/server/openapi.json` emit `items: anyOf [{}, null]` because S1-05 stubs use `z.array(z.unknown())`. **S2-03's "regenerate `apps/server/openapi.json` with full Zod-derived schemas" must close this** — it's tracked as `BL-S1-OPENAPI-ITEM-SCHEMAS`.
- **UI screens still mock-driven (except C1).** B1, F1, /knowledge, /telephony, /phone-numbers all still import from `@/mocks`. The seed data is in the DB but not visible until those hooks are wired. **`BL-S1-WIRE-REMAINING-HOOKS` should be folded into S2-04** (which already lists `useAgents/useAgent/useAgentPublish/useAgentAutoSave/useAgentHistory` — extend scope).
- **`audit_log_events` partition runway ends 2027-06.** Currently 14 monthly partitions (May 2026 → June 2027). After that, `INSERT` will hard-fail with "no partition found." `BL-S1-AUDIT-ROLLOVER` tracks adding monthly cron / quarterly cadence — not S2 work, but ops needs to know.
- **Migration directory is now 12 files** with the `_meta.sql` two-files-per-story pattern (S1-02/S1-03 both have a drizzle-kit-emitted file + a hand-authored `_meta.sql`). S2 should consolidate the hand-authored statements into the same drizzle-kit file when possible (see WARMDOWN §11 try-next). The chain is reproducible from-scratch; just unwieldy.
- **Vector customType `fromDriver` is null-safe but un-tested at the Drizzle-runtime layer.** `BL-S1-VECTOR-ROUNDTRIP-TEST` tracks. S2's `KbDocumentRepository` (S2-01) will exercise the round-trip; add a focused test there.
- **The `agents.activeVersionId ↔ agent_versions` chicken-and-egg** is solved by `activeVersionId` being nullable + a late `UPDATE`. The Calderon HVAC seed uses this pattern (insert agents first with NULL, insert agent_versions, UPDATE agents). **S2-03's `agents.publish` procedure must respect this in the same transaction** — insert version, then UPDATE pointer.
- **`pi-glm` is a viable IC.** S1-05 (router stubs + MSW + hook) shipped 🟢 GREEN on first pass with no Apply-now items. S1-06 (seed) shipped yellow with 3 small items. Consider `pi-glm` as default for tooling/composition stories in S2; keep `pi-deepseek-v4-pro` for schema/DDL stories.

---

## Open issues that block sprint 2

| Issue | Severity | Status |
|-------|----------|--------|
| (none) | — | S2 is unblocked. The schema is in place; the projection worker, repositories, and editor wiring are all incremental on top of S1. |

The Codegen Gate-Partial (`sprints/sprint-0/GATE-PARTIAL.md`) does NOT block S2. S2 builds repository code + a projection worker that runs against local Postgres; Workers + Neon-HTTP transport remains tested only when CF/Neon credentials are provisioned.

---

## Start by running

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle && \
  cat sprints/STATE.md && \
  bun install --frozen-lockfile 2>&1 | tail -3 ; \
  bun run check-types --force && \
  bun run lint && \
  bun -F @kuralle/platform test && \
  bun -F web test && \
  bun -F server gen:openapi --check && \
  for s in S1-01 S1-02 S1-03 S1-04; do bun packages/db/scripts/smoke-$s.ts > /dev/null && echo "✓ smoke-$s green" || echo "✗ smoke-$s FAILED"; done && \
  bun packages/db/scripts/seed-idempotency-check.ts && \
  echo "✅ S1 baseline confirmed; S2 ready"
```

Expect: 6/6 check-types, 0 lint errors, 53/53 platform, 38/38 web, 4 smokes green, idempotency PASS.

---

## When you're done

End the session after the warm-down. The next session pastes `sprints/SESSION_KICKOFF_PROMPT.md` and picks up from `sprints/STATE.md`.
