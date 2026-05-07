# Spec + Code-Quality Gate — `S1-01` Knowledge + tools + voices + enum CHECKs

> **Gate worker:** pi/kimi-k2.6.
> **IC worker:** pi/deepseek-v4-pro.
> **Commit reviewed:** 7d62fa1.
> **Inputs:** brief-S1-01.md, result-S1-01.txt, diff on disk, DATA_MODEL.md §3 §4 §5 §7 §15 §18.
> **Verdict:** 🟡 yellow

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Schema verbatim per `DATA_MODEL.md §4/§5-voices/§7` | ⚠️ partial | `knowledge.ts:74-82` — missing partial index `(workspaceId, deletedAt) where deletedAt is null` (§4 line 279). All 8 new enum-text columns lack CHECK constraints (brief AC 1: "Pick text + CHECK for parity"; BL-S0-02 spirit). See §4 for list. |
| 2 | `kb_chunks.embedding vector(1024)` + customType | ✅ | `knowledge.ts:12-15, 48` — `customType` declared and used with `dimensions: 1024`. Migration emits `vector(1024)`. |
| 3 | ivfflat index with `vector_cosine_ops` + `lists=100` | ✅ | `0001_crazy_purifiers.sql:107-110` — exact text matches spec. |
| 4 | All FKs from `DATA_MODEL.md §4 §5-voices §7` present | ✅ | Migration contains all FKs: `kb_chunks.document_id → kb_documents.id` ON DELETE CASCADE, `kb_documents.workspace_id → organization.id` ON DELETE CASCADE, `tools.workspace_id → organization.id` ON DELETE CASCADE, `tools.catalog_provider_id → tool_catalog_providers.id`, `voices.workspace_id → organization.id` ON DELETE CASCADE. |
| 5 | `tool_catalog_providers.credentialsSecretId` is `text` only (no FK) | ✅ | `tools.ts:25` — `text("credentials_secret_id")` with no `.references()`. Commit body discloses deferral to S1-04. |
| 6 | Enum CHECK supplement (BL-S0-02) — 4 constraints, names & tuples correct | ✅ | `0002_enum_checks.sql:1-10` — all 4 constraints named exactly: `organization_environment_check`, `organization_region_check`, `organization_compliance_mode_check`, `user_system_role_check`. Tuple values match `DATA_MODEL.md §3` lines 179/202/203/208 and `0000_legal_vanisher.sql:71-102`. Artifact `S1-01-enum-check-fails.txt` confirms all fire. |
| 7 | `pgvector` extension created before `vector(1024)` column | ✅ | `0001_crazy_purifiers.sql:1` — `CREATE EXTENSION IF NOT EXISTS vector;` is the first statement. |
| 8 | Voices stock seed — 5 entries, mock IDs verbatim, `workspace_id IS NULL` | ✅ | `0001_crazy_purifiers.sql:113-119` — IDs `v_aurora`, `v_rio`, `v_hawthorn`, `v_lyra`, `v_castor` match `apps/web/src/mocks/agents.ts:12-18` `VOICE_LIBRARY` verbatim. Providers from §5 enum (`elevenlabs`, `cartesia`, `openai`, `deepgram`). `workspace_id` is `NULL` for all 5. |
| 9 | Migrations apply cleanly; `db:generate` idempotent | ✅ | IC claims verified; artifact `S1-01-tables.txt` shows tables exist. Commit body says re-run of `db:generate` emitted "nothing to migrate". |
| 10 | Smoke runner — asserts enum CHECKs, ivfflat, voices, cleanup | ⚠️ partial | `smoke-S1-01.ts` asserts `organization_environment_check` and `user_system_role_check`, plus ivfflat index and voices count. Does **not** assert `organization_region_check` or `organization_compliance_mode_check` in code (artifact shows manual test). Cleanup only deletes `organization` test rows; no `user` cleanup needed because insert rolls back. |
| 11 | Type-check + lint green | ✅ | IC reports `check-types --force` 6/6, lint 0 errors. 2 pre-existing `any` warnings in smoke runner disclosed in commit body. |
| 12 | OpenAPI drift gate green | ✅ | No router changes; `gen:openapi --check` clean per commit body. |
| 13 | Demo artifacts captured | ✅ | `S1-01-tables.txt` present with `\dt`, `\d+ kb_chunks`, `pg_extension`, and voices seed output. `S1-01-enum-check-fails.txt` present with CHECK violation messages containing constraint names. |

### Missing CHECK constraints on new enum-text columns (detailed)

The brief AC 1 says "Pick text + CHECK for parity." The IC added CHECKs for S0 tables (`organization`, `user`) but not for any new S1-01 tables. These are missing:

| Table | Column | Expected enum tuple per DATA_MODEL.md |
|-------|--------|---------------------------------------|
| `kb_documents` | `source` | `('file','url','text')` §4 |
| `kb_documents` | `status` | `('ready','indexing','needs_refresh','failed')` §4 |
| `tools` | `kind` | `('webhook','mcp','client','system')` §7 |
| `tools` | `status` | `('active','deprecated','error','deleted')` §7 |
| `tool_catalog_providers` | `kind` | `('composio','arcade','pipedream','mcp-custom','mcp-self-hosted')` §7 |
| `tool_catalog_providers` | `auth_mode` | `('oauth','api-key','none')` §7 |
| `tool_catalog_providers` | `status` | `('connected','degraded','error','disabled')` §7 |
| `voices` | `provider` | `('elevenlabs','cartesia','openai','google','deepgram')` §5 |

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/db/src/schema/knowledge.ts` | ✅ created |
| `packages/db/src/schema/tools.ts` | ✅ created |
| `packages/db/src/schema/voices.ts` | ✅ created |
| `packages/db/src/migrations/0001_*.sql` | ✅ created (`0001_crazy_purifiers.sql`) |
| `packages/db/src/migrations/0002_enum_checks.sql` | ✅ created |
| `packages/db/scripts/smoke-S1-01.ts` | ✅ created |
| `sprints/sprint-1/artifacts/S1-01-tables.txt` | ✅ created |
| `sprints/sprint-1/artifacts/S1-01-enum-check-fails.txt` | ✅ created |
| `packages/db/src/schema/index.ts` | ✅ modified (3 new re-exports) |
| `packages/db/src/migrations/meta/_journal.json` | ✅ modified |
| `packages/db/src/migrations/meta/_*_snapshot.json` | ✅ created (`0001_snapshot.json`) |
| `packages/db/package.json` | ✅ unchanged (optional script not added) |

Out-of-scope edits: **none** — no files outside `packages/db/` or `sprints/sprint-1/` were touched. Root `package.json` and `bun.lock` are clean.

## 3. Wiring + demo artifact

- **Schema index re-exports:** ✅ `packages/db/src/schema/index.ts` exports `knowledge`, `tools`, `voices` in addition to `auth`.
- **Migration meta journal updated:** ✅ `_journal.json` has entries for `0000`, `0001`, `0002` with correct tags.
- **`S1-01-tables.txt`:** ✅ Present. Contains `\dt public.*` showing 13 tables, `\d+ kb_chunks` confirming `kb_chunks_embedding_idx` ivfflat with `lists='100'`, `pg_extension` showing `vector 0.8.0`, and voices seed rows.
- **`S1-01-enum-check-fails.txt`:** ✅ Present. Captures `organization_environment_check` and `organization_compliance_mode_check` violations with exact constraint names in the error detail.

## 4. Code quality

- `packages/db/src/schema/knowledge.ts:74-82` — missing partial index `kb_documents_workspace_deleted_idx` on `(workspace_id, deleted_at) WHERE deleted_at IS NULL` — **major** (spec miss).
- `packages/db/src/schema/{knowledge,tools,voices}.ts` — 8 new enum-text columns lack CHECK constraints — **major** (spec miss per AC 1 and BL-S0-02 spirit).
- `packages/db/src/schema/voices.ts` — missing `relations()` export. `auth.ts`, `knowledge.ts`, and `tools.ts` all declare `relations()` for every table; `voices.ts` has none — **minor** (idiomatic pattern drift).
- `packages/db/scripts/smoke-S1-01.ts:41,58` — `catch (e: any)` — **minor** (lint warning; IC honestly disclosed). Should be `catch (e: unknown)` with `e instanceof Error` narrowing.
- `packages/db/scripts/smoke-S1-01.ts` — only asserts 2 of 4 enum CHECK constraints automatically (`environment`, `system_role`). `region` and `compliance_mode` checks are not exercised by the runner — **minor** (coverage gap; artifact shows manual proof).
- `packages/db/src/schema/knowledge.ts:14` — `(config as { dimensions: number }).dimensions` type assertion inside `customType.dataType` — **nit** (works, but `toDriver`/`fromDriver` serialization methods are also absent, creating a latent bug when actual vector inserts happen).
- `packages/db/src/schema/knowledge.ts` — `customType` for vector omits `toDriver` and `fromDriver`. At runtime, Drizzle will pass a `number[]` directly to the driver; pgvector may or may not accept it depending on the driver/bind path. This is a latent risk for S2 repository code — **minor**.
- **No dead branches, no copy-paste smells.** `knowledge.ts`, `tools.ts`, `voices.ts` each have distinct shapes. `lists=100` is documented in DATA_MODEL §4 line 298 — grounded, not magic.
- **Comments:** Near-zero. One comment block in the commit body, none in source. ✅

## 5. Honest summary

Five tables (`kb_documents`, `kb_chunks`, `voices`, `tools`, `tool_catalog_providers`) landed with correct column names, types, FKs, and most indexes. The `pgvector` extension ordering, ivfflat index, voices seed (5 stock entries with mock-verbatim IDs), and S0 enum CHECK supplement are all solid and verified. However, the IC skipped CHECK constraints on all **new** enum-text columns (8 total) despite brief AC 1 explicitly directing "text + CHECK for parity," and missed the partial index on `kb_documents(workspace_id, deleted_at) WHERE deleted_at IS NULL` required by `DATA_MODEL.md §4`. The `voices.ts` schema file also omits a `relations()` export, breaking the auth.ts precedent. None of these misses block downstream stories, but they are spec deviations that will silently allow bad enum values into the new tables and miss an index needed for soft-delete query performance.

## 6. Recommended action

**Needs manager fix-pass.** The misses are additive (constraints + partial index) and can be applied surgically before S1-02 starts. No IC re-fire needed.

## 7. Apply-now items (for the manager fix-pass)

1. **`packages/db/src/schema/knowledge.ts:78-82`** — Add partial index after the existing indexes:
   ```ts
   index("kb_documents_workspace_deleted_idx").on(table.workspaceId, table.deletedAt).where(sql`${table.deletedAt} is null`),
   ```
   (requires importing `sql` from `drizzle-orm` if not already present; if Drizzle index `.where()` is unavailable in this version, hand-author the index in a new migration instead.)

2. **Add CHECK constraints on all 8 new enum-text columns.** The fastest path is a hand-authored migration `packages/db/src/migrations/0003_enum_checks_new_tables.sql` (or regenerate via `drizzle-kit generate` after adding `.check()` to the schema). Hand-authored path:
   ```sql
   ALTER TABLE kb_documents ADD CONSTRAINT kb_documents_source_check CHECK (source IN ('file','url','text'));
   ALTER TABLE kb_documents ADD CONSTRAINT kb_documents_status_check CHECK (status IN ('ready','indexing','needs_refresh','failed'));
   ALTER TABLE tools ADD CONSTRAINT tools_kind_check CHECK (kind IN ('webhook','mcp','client','system'));
   ALTER TABLE tools ADD CONSTRAINT tools_status_check CHECK (status IN ('active','deprecated','error','deleted'));
   ALTER TABLE tool_catalog_providers ADD CONSTRAINT tool_catalog_providers_kind_check CHECK (kind IN ('composio','arcade','pipedream','mcp-custom','mcp-self-hosted'));
   ALTER TABLE tool_catalog_providers ADD CONSTRAINT tool_catalog_providers_auth_mode_check CHECK (auth_mode IN ('oauth','api-key','none'));
   ALTER TABLE tool_catalog_providers ADD CONSTRAINT tool_catalog_providers_status_check CHECK (status IN ('connected','degraded','error','disabled'));
   ALTER TABLE voices ADD CONSTRAINT voices_provider_check CHECK (provider IN ('elevenlabs','cartesia','openai','google','deepgram'));
   ```
   Update `_journal.json` and snapshot if you regenerate; otherwise append the migration and run `db:migrate`.

3. **`packages/db/src/schema/voices.ts`** — Add `relations()` export matching the auth.ts precedent. Since `voices` references `organization` via `workspaceId`:
   ```ts
   import { relations } from "drizzle-orm";
   // ... after pgTable definition ...
   export const voicesRelations = relations(voices, ({ one }) => ({
     workspace: one(organization, {
       fields: [voices.workspaceId],
       references: [organization.id],
     }),
   }));
   ```

4. **`packages/db/scripts/smoke-S1-01.ts:41,58`** — Replace `catch (e: any)` with `catch (e: unknown)` and narrow:
   ```ts
   } catch (e: unknown) {
     const msg = e instanceof Error ? e.message : "";
     // ... rest unchanged
   }
   ```

5. **`packages/db/scripts/smoke-S1-01.ts`** — Expand the smoke runner to assert `organization_region_check` and `organization_compliance_mode_check` fire. Add two more try/insert blocks (or a single multi-column bad insert that catches each constraint individually) so all 4 S0 enum CHECKs are covered by automated code, not just manual artifact.

6. **`packages/db/src/schema/knowledge.ts:12-15`** — Add `toDriver` and `fromDriver` to the vector `customType` so Drizzle serializes `number[]` ↔ pgvector text format correctly when S2 repositories start inserting embeddings:
   ```ts
   const vector = customType<{ data: number[] | null; driverData: string }>({
     dataType(config) {
       return `vector(${(config as { dimensions: number }).dimensions})`;
     },
     toDriver(value) {
       return value === null ? null : `[${value.join(",")}]`;
     },
     fromDriver(value) {
       if (value === null) return null;
       return value.slice(1, -1).split(",").map(Number);
     },
   });
   ```
   (This is optional if you prefer to handle serialization in the repository layer, but doing it in the customType keeps the schema self-describing.)
