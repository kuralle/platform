# Spec + Code-Quality Gate — `S1-02` Agents two-row split + projections

> **Gate worker:** pi/kimi-k2.6.  
> **IC worker:** pi/deepseek-v4-pro.  
> **Commit reviewed:** `f18e8ff`.  
> **Inputs:** brief-S1-02.md, PLAN.md §S1-02, result-S1-02.txt, DATA_MODEL.md §5/§6/§15/§18, diff on disk.  
> **Verdict:** 🟡 yellow

---

## 1. Spec adherence

### 1.1 Brief ACs 1–15

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Schema verbatim per `DATA_MODEL.md §5` and `§6` | ⚠️ partial | Eight tables, columns, types, FKs, defaults all correct. **Three indexes missing `desc`** (see AC 6 & 7). |
| 2 | `agents.activeVersionId` is nullable `text` with FK | ✅ | `agents.ts:18-20` — `.references(() => agentVersions.id)` on nullable column; migration emits normal FK. |
| 3 | `agent_versions.versionKind` CHECK + default | ✅ | `agents.ts:40` — `default("manual_save")` + `0005_s1_02_meta.sql:4-5` CHECK constraint. |
| 4 | `parentVersionId` self-FK ON DELETE SET NULL | ✅ | `agents.ts:43-46` + migration FK with `ON DELETE set null`. |
| 5 | UNIQUE `(agentId, versionNumber)` | ✅ | `agents.ts:61` — `uniqueIndex("agent_versions_agent_version_uidx")`. |
| 6 | `agent_versions` indexes | ⚠️ partial | `agents.ts:64-72` — indexes exist but **missing `.desc()` on `publishedAt`** in both `(agentId, publishedAt)` and `(agentId, versionKind, publishedAt)` per §5:377-379 / brief AC 6. `bundleHash` index ✅. |
| 7 | `agents` indexes | ⚠️ partial | `agents.ts:26-28` — `agents_workspace_status_idx` ✅, `agents_workspace_updated_idx` present but **missing `.desc()` on `updatedAt`** per §5:325 / brief AC 7. Partial index ✅ (see gate B). |
| 8 | Append-only trigger `BEFORE UPDATE` | ✅ | `0005_s1_02_meta.sql:47-57` — exact DDL from brief; trigger fires only `BEFORE UPDATE`. Smoke verifies raise. |
| 9 | Projection tables column shapes + composite PKs + CHECKs | ✅ | All four projection tables present. PKs added in `0005_s1_02_meta.sql:22-28`. CHECKs on `source`, `direction`, `onTrigger`, `kind` all present. |
| 10 | Workflow projection tables + CHECKs | ✅ | `workflowNodesProjection` PK `(agentVersionId, nodeId)` + `kind` CHECK; `workflowEdgesProjection` PK `id` + `conditionType` CHECK. |
| 11 | Migration applies cleanly (replay 0000→0005) | ✅ | Smoke green (14/14) and from-scratch replay verified by IC; journal chain 0000→0005 consistent. |
| 12 | Smoke runner (trigger + insert chain + cleanup) | ⚠️ partial | `smoke-S1-02.ts` — 14 assertions, all distinct. Covers trigger, nullable FK chain, all projection inserts, cascade cleanup. **Does not assert dedup unique `(agentId, versionNumber)` or any CHECK constraint firing** — coverage gap vs. gate rubric. |
| 13 | Type-check + lint green | ✅ | `check-types --force` green; lint 0 errors / 1 pre-existing warning (unchanged from S1-01-fix). |
| 14 | OpenAPI drift gate green | ✅ | No router changes; `gen:openapi --check` clean. |
| 15 | Demo artifacts | ✅ | `S1-02-trigger.txt` and `S1-02-tables.txt` present; trigger artifact shows exact error text. |

### 1.2 Project-specific spec gates (standing rules from gate-S1-01)

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| A | CHECK constraints on all 9 enum-text columns | ✅ | `0005_s1_02_meta.sql:1-19` — all 9 constraints present and tuples match §5/§6 exactly: `agents.status`, `agent_versions.versionKind`, `agent_versions.bundleStatus`, `agent_tool_attachments.source`, `agent_guardrails.direction`, `agent_guardrails.onTrigger`, `agent_eval_criteria.kind`, `workflow_nodes_projection.kind`, `workflow_edges_projection.conditionType`. |
| B | Partial index `agents(workspaceId, deletedAt) WHERE deletedAt IS NULL` | ✅ | `0005_s1_02_meta.sql:31-33` — index present in DB (`agents_workspace_deleted_idx`). |
| C | Append-only trigger fires only `BEFORE UPDATE` | ✅ | `0005_s1_02_meta.sql:52-57` — `BEFORE UPDATE` only; INSERT and DELETE unrestricted. Verified by smoke. |
| D | Mutual-FK chicken-and-egg order works | ✅ | Migration creates `agents` first (nullable `active_version_id`), then `agent_versions`, then adds FK via `ALTER TABLE`. From-scratch replay passes. |
| E | `relations()` precedent — every new table | ⚠️ partial | Only `agentsRelations` and `agentVersionsRelations` declared. Missing: `activeVersion`/`authorUser` on `agents`, `parentVersion`/`publishedByUser` on `agentVersions`, and all six projection/child tables. IC disclosed this as a trade-off in commit body, but it diverges from the auth.ts/voices.ts precedent. |
| F | No `catch (e: any)` / lint still 0 errors | ✅ | `smoke-S1-02.ts` uses `catch (e)` with `e instanceof Error`. Lint: 0 errors, 1 pre-existing warning unchanged. |
| G | Snapshot file shape (drizzle-kit auto-emit) | ✅ | `0004_snapshot.json` ~2784 lines, standard drizzle-kit structure (`tables`, `_meta`, `enums`, `schemas`, etc.). No hand-edit artifacts. |
| H | Hand-authored `0005_s1_02_meta.sql` grounded + valid Postgres 15 | ✅ | All statements map directly to brief ACs / DATA_MODEL.md. Trigger syntax valid; executes correctly on Postgres 15.12. |

---

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/db/src/schema/agents.ts` | ✅ created |
| `packages/db/src/migrations/0004_*.sql` | ✅ created (`0004_round_calypso.sql`) |
| `packages/db/src/migrations/0005_s1_02_meta.sql` | ✅ created |
| `packages/db/scripts/smoke-S1-02.ts` | ✅ created |
| `sprints/sprint-1/artifacts/S1-02-trigger.txt` | ✅ created |
| `sprints/sprint-1/artifacts/S1-02-tables.txt` | ✅ created |
| `packages/db/src/schema/index.ts` | ✅ modified (1 new re-export) |
| `packages/db/src/migrations/meta/_journal.json` | ✅ modified |
| `packages/db/src/migrations/meta/0004_snapshot.json` | ✅ created |

Out-of-scope edits: **none** — exactly 9 files, all within `packages/db/` and `sprints/sprint-1/`. Root `package.json` and lockfile untouched.

---

## 3. Wiring + demo artifact

- **Schema index re-exports:** ✅ `packages/db/src/schema/index.ts` exports `agents` alongside `auth`, `knowledge`, `tools`, `voices`.
- **Migration meta journal updated:** ✅ `_journal.json` has entries 0000–0005 with consistent `version: "7"`.
- **`S1-02-trigger.txt`:** ✅ Present. Shows `ERROR: agent_versions is append-only; UPDATE is not permitted` with function context.
- **`S1-02-tables.txt`:** ✅ Present. Shows `\dt public.agent*`, `\dt public.workflow_*_projection`, and `\d+ agent_versions` (including trigger line and CHECK constraints).

---

## 4. Code quality

- `packages/db/src/schema/agents.ts:27-28` — `agents_workspace_updated_idx` missing `.desc()` on `updatedAt` — **major** (spec miss per AC 7).
- `packages/db/src/schema/agents.ts:65-72` — `agent_versions_agent_published_idx` and `agent_versions_agent_kind_published_idx` missing `.desc()` on `publishedAt` — **major** (spec miss per AC 6).
- `packages/db/src/schema/agents.ts:209-216` — `relations()` incomplete. `agentsRelations` lacks `activeVersion` and `authorUser`; `agentVersionsRelations` lacks `parentVersion` and `publishedByUser`. No relations for projection tables. — **minor** (pattern drift; honestly disclosed in commit body).
- `packages/db/scripts/smoke-S1-02.ts` — does not assert `agent_versions_agent_version_uidx` uniqueness or any CHECK constraint firing. — **minor** (coverage gap; brief AC 12 satisfied, but gate rubric asks for dedup unique coverage).
- `packages/db/src/migrations/0004_round_calypso.sql` — drizzle-kit emits redundant non-unique indexes (`agent_tool_attachments_pk`, `agent_kb_attachments_pk`, `workflow_nodes_projection_pk`) that duplicate the composite PKs added in `0005_s1_02_meta.sql`. Harmless but wastes two index slots per table. — **nit** (known drizzle-kit limitation; IC documented it).
- **No `any` casts, no dead imports, no dead branches.** TS exports camelCase, SQL columns snake_case throughout. `AnyPgColumn` annotation pattern `(): AnyPgColumn => ...` used correctly on circular FKs.
- **Comments:** None in source files. Commit body is thorough. ✅

---

## 5. Honest summary

Eight tables landed with correct column names, types, FK targets, ON DELETE policies, defaults, and CHECK constraints. The chicken-and-egg nullable `activeVersionId` pattern works cleanly. The append-only trigger is exact-per-spec and proven by smoke. The hand-authored `0005_s1_02_meta.sql` carries all 9 enum CHECKs, 3 composite PKs, the partial index, and valid trigger DDL — no improvisation. Type-check, lint, platform tests, and OpenAPI drift are all green.

The IC over-claimed "verbatim" in the commit body: three indexes are missing the `desc` qualifier required by `DATA_MODEL.md §5:323/377/379` and brief ACs 6–7. This affects cursor-pagination performance on `agents` and `agent_versions` lists. Additionally, `relations()` coverage is thin (2 of 8 tables) compared to the auth.ts/voices.ts precedent, though the IC honestly flagged this as an S2 deferral. No blockers for downstream stories, but the `desc` misses should be fixed before S1-03 to avoid a migration delta later.

---

## 6. Recommended action

**Needs manager fix-pass.** The `desc` misses are surgical (three `.on()` calls in `agents.ts` plus a `drizzle-kit generate` or hand-authored index migration). No IC re-fire needed.

---

## 7. Apply-now items

1. **`packages/db/src/schema/agents.ts:27-28`** — Add `.desc()` to the `updatedAt` index:
   ```ts
   index("agents_workspace_updated_idx").on(table.workspaceId, table.updatedAt.desc()),
   ```
   Then run `bun -F @kuralle/db db:generate` to emit the index change, or hand-author the `DROP INDEX / CREATE INDEX` in a follow-up migration if drizzle-kit regeneration is too noisy.

2. **`packages/db/src/schema/agents.ts:65-72`** — Add `.desc()` to the `publishedAt` indexes:
   ```ts
   index("agent_versions_agent_published_idx").on(
     table.agentId,
     table.publishedAt.desc(),
   ),
   index("agent_versions_agent_kind_published_idx").on(
     table.agentId,
     table.versionKind,
     table.publishedAt.desc(),
   ),
   ```
   Same regeneration note as item 1.

3. **`packages/db/src/schema/agents.ts:209-216`** — Expand `relations()` to cover the remaining FKs (surgical; does not affect DB DDL):
   ```ts
   export const agentsRelations = relations(agents, ({ one, many }) => ({
     versions: many(agentVersions),
     activeVersion: one(agentVersions, {
       fields: [agents.activeVersionId],
       references: [agentVersions.id],
     }),
     authorUser: one(user, {
       fields: [agents.authorUserId],
       references: [user.id],
     }),
   }));

   export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
     agent: one(agents, {
       fields: [agentVersions.agentId],
       references: [agents.id],
     }),
     parentVersion: one(agentVersions, {
       fields: [agentVersions.parentVersionId],
       references: [agentVersions.id],
     }),
     publishedByUser: one(user, {
       fields: [agentVersions.publishedByUserId],
       references: [user.id],
     }),
   }));
   ```
   (Optional: also add `agentToolAttachmentsRelations`, `agentKbAttachmentsRelations`, `agentGuardrailsRelations`, `agentEvalCriteriaRelations`, `workflowNodesProjectionRelations`, `workflowEdgesProjectionRelations` if you want full precedent parity, but the commit body already deferred these to S2.)

4. **`packages/db/scripts/smoke-S1-02.ts`** — Add an assertion that the `(agentId, versionNumber)` unique constraint fires. After the v2 insert, attempt a v3 with the same `versionNumber` as v1 and catch the unique-violation error:
   ```ts
   let uniqueFired = false;
   try {
     await client.query(
       `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot)
        VALUES ('test-s1-02-av3', 'test-s1-02-agent', 1, 'manual_save', '{}'::jsonb)`
     );
   } catch (e) {
     uniqueFired = true;
   }
   check("UNIQUE (agentId, versionNumber) blocks dup", uniqueFired);
   ```
