# Story Brief — `S1-02` Agents two-row split + projections

> **You are the IC engineer (`pi/deepseek-v4-pro`, fresh process, clean context).** Self-contained brief. If anything contradicts what's on disk, **stop and ask** — don't guess.
>
> **Atomic-commit policy:** stage all changed files and commit `[S1-02] agents two-row split + projections`. Do NOT push.

---

## 1. Goal

Drizzle schema for the agent aggregate per `DATA_MODEL.md §5` — `agents` (thin), `agent_versions` (fat snapshot jsonb), `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection` — plus a Postgres trigger making `agent_versions` append-only. All migrate cleanly against `kuralle_dev`.

---

## 2. Required reading

1. `sprints/STATE.md`.
2. `sprints/sprint-1/PLAN.md` (story `S1-02` section).
3. `sprints/WBS.md` § Sprint 1 row `S1-02` (line 116).
4. **`DATA_MODEL.md §5`** lines 307-443 — verbatim spec.
5. `DATA_MODEL.md §6` lines 463-496 — workflow projection tables (`workflow_nodes_projection`, `workflow_edges_projection`) live with the agent aggregate.
6. `DATA_MODEL.md §15` — soft-delete columns (`agents.deletedAt`).
7. `DATA_MODEL.md §18` — codegen sequence step 3 (two-row agent split with `versionKind` + `parentVersionId`).
8. `packages/db/src/schema/auth.ts` — Drizzle precedent.
9. `packages/db/src/schema/knowledge.ts`, `tools.ts`, `voices.ts` (FROM S1-01 — read what just shipped to match its style).
10. `packages/db/src/migrations/0000_legal_vanisher.sql` and the S1-01 migration file (whatever drizzle-kit named it) for migration shape and trigger DDL precedent (S1-01 had no trigger; you're the first).

---

## 3. Files to create or modify

**Create:**
- `packages/db/src/schema/agents.ts` — eight tables: `agents`, `agentVersions`, `agentToolAttachments`, `agentKbAttachments`, `agentGuardrails`, `agentEvalCriteria`, `workflowNodesProjection`, `workflowEdgesProjection`. (TS field names camelCase; Drizzle emits snake_case columns.)
- `packages/db/src/migrations/000X_*.sql` — drizzle-kit emit + hand-authored append-only trigger.
- `packages/db/scripts/smoke-S1-02.ts` — smoke runner for the trigger and basic insert chain.
- `sprints/sprint-1/artifacts/S1-02-trigger.txt` — psql session showing trigger raising on UPDATE.
- `sprints/sprint-1/artifacts/S1-02-tables.txt` — `\dt public.agent*` + `\dt public.workflow_*_projection` + `\d+ agent_versions`.

**Modify:**
- `packages/db/src/schema/index.ts` — `export * from "./agents"`.
- `packages/db/src/migrations/meta/_journal.json` + the snapshot file — auto-updated by drizzle-kit.

**Do not touch:**
- Any S1-01 file (knowledge.ts, tools.ts, voices.ts, the S1-01 migration). They're committed.
- `packages/db/src/schema/auth.ts` or any landed `0000_*` migration.
- Repo-root `package.json` (memory rule).
- Anything outside `packages/db/` and `sprints/sprint-1/`.

---

## 4. Acceptance criteria

1. **Schema verbatim per `DATA_MODEL.md §5` and `§6`.** Eight tables, exact column names, types, FK targets, ON DELETE policies, defaults, indexes.
2. **`agents.activeVersionId` is `text` (nullable, no `notNull`).** It references `agent_versions(id)` but a fresh `agents` row exists before any `agent_versions` row, so the column must be nullable. Drizzle's `.references()` on a nullable column emits a normal FK; that's fine. (Do NOT use `deferrable` syntax — drizzle-kit doesn't emit it cleanly.)
3. **`agent_versions.versionKind` constraints:** values `('auto_save','manual_save','publish')` (per §5:338); default `'manual_save'`. Use a `text` column with a CHECK constraint (matching the S1-01 enum-CHECK pattern).
4. **`agent_versions.parentVersionId`** self-FK to `agent_versions(id)` ON DELETE SET NULL (§5:339 says "git-style forward compat"; SET NULL keeps history if a parent is removed).
5. **`agent_versions` UNIQUE `(agentId, versionNumber)`** per §5:375.
6. **`agent_versions` indexes:** `(agentId, publishedAt desc)`, `(agentId, versionKind, publishedAt desc)`, `(bundleHash)` per §5:377-379.
7. **`agents` indexes:** `(workspaceId, deletedAt) WHERE deletedAt IS NULL`, `(workspaceId, status)`, `(workspaceId, updatedAt desc)` per §5:323-325. The first is a partial index — drizzle-kit can emit `pgIndex(...).where(sql\`...\`)`; verify or hand-author.
8. **Append-only trigger** on `agent_versions`. Hand-author in the migration file:
   ```sql
   CREATE OR REPLACE FUNCTION agent_versions_append_only() RETURNS TRIGGER AS $$
   BEGIN
     RAISE EXCEPTION 'agent_versions is append-only; UPDATE is not permitted (table=%, id=%)', TG_TABLE_NAME, OLD.id
       USING ERRCODE = 'feature_not_supported';
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER agent_versions_no_update
     BEFORE UPDATE ON agent_versions
     FOR EACH ROW
     EXECUTE FUNCTION agent_versions_append_only();
   ```
   Trigger fires `BEFORE UPDATE` only — INSERT and DELETE remain allowed (DELETE for nightly auto-save prune; CASCADE delete via parent `agents`).
9. **Projection tables** exist with the §5:393-437 column shapes:
   - `agent_tool_attachments` PK `(agentVersionId, toolId, source)`, source CHECK in `('native','workflow','subagent','integration','mcp')`.
   - `agent_kb_attachments` PK `(agentVersionId, documentId)`.
   - `agent_guardrails` `direction` CHECK in `('input','output','both')`, `onTrigger` CHECK in `('block','redact','flag','escalate')`.
   - `agent_eval_criteria` `kind` CHECK in `('success','data','safety')`, `weight` `real DEFAULT 1`, UNIQUE `(agentVersionId, name)`.
10. **Workflow projection tables** per §6:471-491: `workflow_nodes_projection` PK `(agentVersionId, nodeId)`, `kind` CHECK in `('subagent','extraction','dispatch','transfer-agent','transfer-number','end')`. `workflow_edges_projection` PK `id`, `conditionType` CHECK in `('llm','expression','none')`.
11. **Migration applies cleanly:** `bun -F @kuralle/db db:migrate` from S1-01-state to S1-02-state. Reproducibility: drop schema + replay 0000→S1-01→S1-02 also works.
12. **Smoke runner** (`bun packages/db/scripts/smoke-S1-02.ts`):
    - INSERT one `organization` (or use an existing one), INSERT one `agents` row (with NULL `activeVersionId`), INSERT one `agent_versions` row, then UPDATE `agents.activeVersionId` to point at the new version (this should succeed).
    - INSERT another `agent_versions` row, then `UPDATE agent_versions SET change_summary='oops' WHERE id=...` — must raise the trigger error containing `agent_versions is append-only`.
    - INSERT into each projection table with the new `agent_versions.id`. Each succeeds.
    - Cleanup at end (`DELETE FROM agents WHERE id LIKE 'test-%'` cascades).
    - Exits 0 on green, 1 on red.
13. **Type-check + lint green.** `bun run check-types --force` (turbo cache bust per S0 trap), `bun run lint` (0 errors).
14. **OpenAPI drift gate:** still green; no router changes.
15. **Demo artifacts** in `sprints/sprint-1/artifacts/`.

---

## 5. Definition of Done

- [ ] All 15 ACs met.
- [ ] From-scratch reproducibility verified (drop schema; replay all migrations 0000→latest; smoke S1-02 green).
- [ ] `bun run check-types --force` green; `bun run lint` 0 errors; `bun -F @kuralle/platform test` 53/53; `bun -F server gen:openapi --check` clean.
- [ ] No shortcuts: no `--no-verify`, `@ts-ignore`, swallowed errors.
- [ ] Atomic commit `[S1-02] agents two-row split + projections` includes only the files listed in §3.
- [ ] Commit body covers: nullable `activeVersionId` rationale, append-only trigger rationale, partial index emit path (drizzle-kit vs hand-authored), trade-offs accepted.

---

## 6. What NOT to do

- Do NOT add `core/repositories/` files. Repository pattern lands in S2 per WBS row S2-01.
- Do NOT add a Zod `AgentIR` schema. That lands in S2 per WBS row S2-02.
- Do NOT pre-create `core/` or `runtime/` packages. Out of scope.
- Do NOT add unit tests outside the smoke runner. (Vitest unit coverage of the trigger ships in S2 with the projection worker.)
- Do NOT touch S1-01 files (knowledge/tools/voices). They're committed.
- Do NOT add `tools.id` references that don't already exist — `agent_tool_attachments.toolId` references `tools(id)` which lives in `packages/db/src/schema/tools.ts` (S1-01). Verify the import resolves.
- Do NOT add app-level guard logic (the WBS DoD says "Append-only behavior for `agent_versions` enforced by trigger OR repo-layer guard" — pick the trigger; the repo-layer guard ships in S2).
- Do NOT add RLS policies. RLS is S5.
- Do NOT regenerate `apps/server/openapi.json` (no router changes).
- Do NOT modify `apps/web/`.

---

## 7. Demo artifacts

1. `sprints/sprint-1/artifacts/S1-02-trigger.txt` — captured psql session showing:
   ```
   INSERT INTO agent_versions (...) VALUES (...);    -- success
   UPDATE agent_versions SET change_summary='x' WHERE id='...';    -- ERROR
   ```
2. `sprints/sprint-1/artifacts/S1-02-tables.txt` — `\dt public.agent*` + `\dt public.workflow_*_projection` + `\d+ agent_versions` (showing trigger).

Reference both in the commit body.

---

## 8. Reporting back

Atomic commit, body covering: tables added, trigger semantics, partial-index emit path, FK direction (agents↔agent_versions chicken-and-egg solved with nullable + late UPDATE), trade-offs.

No push. No PR. Manager handles review.

---

## 9. If you get stuck

- If drizzle-kit refuses to emit the partial index: hand-author it after the `CREATE TABLE`, before the trigger.
- If `tools(id)` FK fails (S1-01 didn't land): stop. Do not improvise.
- If the trigger function syntax doesn't apply (Postgres 15.12 quirk): consult `pg_proc` and adjust; document the path in the commit body.
- If the from-scratch replay fails for any reason: stop. Do not commit a half-done migration chain.

Sincere work only. If you didn't run from-scratch replay, say so. Never claim done without proof.
