# Story Brief — `S1-01` Knowledge + tools + voices + enum-CHECK supplement

> **You are the IC engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with no prior context.** This brief is self-contained. Read it end-to-end before writing any code. If anything in this brief is ambiguous or contradicts what you find on disk, **stop and ask** rather than guess.
>
> **Atomic-commit policy:** when you finish, stage every file you create / modify and commit atomically with `[S1-01] knowledge + tools + voices + enum CHECKs`. Do NOT push. Do NOT make multiple commits per story. Manager handles fix-pass and closeout commits later.

---

## 1. Goal

Land Drizzle schema for `kb_documents`, `kb_chunks` (with `pgvector` `vector(1024)` ivfflat index), `voices` (with stock catalogue seed), `tools`, `tool_catalog_providers`, plus a supplement migration adding `CHECK` constraints for the four enum-text columns from S0 (`organization.{environment,region,complianceMode}`, `user.systemRole`). All migrations apply cleanly via `bun -F @kuralle/db db:migrate` against the local Postgres at `postgres://kuralle:kuralle@localhost:5432/kuralle_dev` (pgvector 0.8.0 is **already installed** on this DB; do not assume it is not).

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — current sprint pointer (sprint 1, schema).
2. `sprints/sprint-1/PLAN.md` — full sprint plan; story `S1-01` section is the spec.
3. `sprints/WBS.md` § Sprint 1 → row `S1-01` (line 115).
4. `sprints/sprint-0/HANDOFF.md` — read-me-first traps (especially "Turbo cache can hide TS errors" and "Enum `+ext` columns are `text` without `CHECK` constraints").
5. `sprints/AMENDMENT-002.md` — `apikey.referenceId` (no `organizationId`); affects how you reason about other tables that previously had FKs to `organization`. Does not change S1-01 directly but governs your mental model.
6. `DATA_MODEL.md §4` (lines 251-303) — `kb_documents`, `kb_chunks`. **This is the verbatim spec.** No improvisation.
7. `DATA_MODEL.md §5 voices` (lines 445-461) — `voices` table.
8. `DATA_MODEL.md §7` (lines 500-556) — `tools`, `tool_catalog_providers`.
9. `DATA_MODEL.md §15` (cross-cutting constraints: soft-delete columns).
10. `DATA_MODEL.md §18` (codegen sequence step 14: `kb_documents + kb_chunks + pgvector`; step 15: `tools + tool_catalog_providers`).
11. `packages/db/src/schema/auth.ts` — **the precedent** for how Drizzle `pgTable` is used in this repo. Match the style.
12. `packages/db/src/migrations/0000_legal_vanisher.sql` — the precedent for migration shape.
13. `packages/db/src/index.ts` — how the `drizzle()` instance is wired (Neon-HTTP for prod). For local migrate, you'll use `drizzle-kit migrate` against `pg` per `packages/db/drizzle.config.ts`.
14. `packages/db/drizzle.config.ts` — the migrate config. Confirm it points at `postgres://kuralle:kuralle@localhost:5432/kuralle_dev` (or a `DATABASE_URL` env var). If it's missing or wrong, that's a finding — flag.
15. `packages/db/package.json` — existing scripts.
16. `apps/web/src/lib/mocks/voices.ts` — **read-only** reference for the seed. Grep `apps/web/src/lib/mocks/` for any voices mock; if multiple, the canonical one is whatever is imported by C3 Models & Voice tab.

---

## 3. Files you will create or modify

Be explicit. The reviewer will check you didn't touch anything else.

**Create:**
- `packages/db/src/schema/knowledge.ts` — `kbDocuments`, `kbChunks` Drizzle tables + types.
- `packages/db/src/schema/tools.ts` — `tools`, `toolCatalogProviders` Drizzle tables + types.
- `packages/db/src/schema/voices.ts` — `voices` Drizzle table + types.
- `packages/db/src/migrations/0001_*.sql` — drizzle-kit emit for the new tables (let `drizzle-kit generate` name it).
- `packages/db/src/migrations/0002_enum_checks.sql` — hand-authored CHECK constraints (see §4 acceptance #6 below). If `drizzle-kit generate` can include the CHECKs in 0001 cleanly, that's also acceptable; document the path you took in the commit body.
- `packages/db/scripts/smoke-S1-01.ts` — smoke runner: `db:migrate` then `\dt` + insert-bad-enum-fails. Must run inside `@kuralle/db` workspace (do NOT add deps to repo-root `package.json` — see §6 anti-scope).
- `sprints/sprint-1/artifacts/S1-01-tables.txt` — captured `\dt` + `\d+ kb_chunks` output.
- `sprints/sprint-1/artifacts/S1-01-enum-check-fails.txt` — captured psql session showing `INSERT INTO organization (... environment ...) VALUES ('bogus' ...)` raises with the CHECK constraint name.

**Modify:**
- `packages/db/src/schema/index.ts` — add the three re-exports (`export * from "./knowledge"`, `export * from "./tools"`, `export * from "./voices"`).
- `packages/db/src/migrations/meta/_journal.json` — auto-updated by drizzle-kit; commit the updated journal.
- `packages/db/src/migrations/meta/_*_snapshot.json` — auto-updated by drizzle-kit.
- `packages/db/package.json` — add a `db:smoke:s1-01` script if useful (optional; the smoke-S1-01.ts can be invoked directly via `bun packages/db/scripts/smoke-S1-01.ts`).

**Do not touch:**
- `packages/db/src/schema/auth.ts` — S0 ground truth; do not edit.
- `packages/db/src/migrations/0000_legal_vanisher.sql` — never edit a landed migration.
- The repo-root `package.json` — adding deps there is a memory-rule violation that the user reverts silently. All deps for this story already exist in `@kuralle/db` (`drizzle-orm`, `drizzle-kit`, `pg`).
- Any file outside `packages/db/`, `sprints/sprint-1/`, except the optional `packages/db/package.json` script entry.
- The RFCs (`rfc/*.md`), wiki (`wiki/*.md`), or research (`research/*.md`).

---

## 4. Acceptance criteria (numbered, in priority order)

These are the gates the reviewer will check. Pass all of them.

1. **Schema verbatim per `DATA_MODEL.md §4 §5-voices §7`.** Column names, types, FKs, indexes, defaults match. Use `text` for ID columns (matching auth.ts precedent), `timestamp` for timestamps, `jsonb` for jsonb, `integer` for integer, `boolean` for boolean. Enums declared via Drizzle `pgEnum(...)` OR as `text` with a `check` constraint — match auth.ts precedent (auth.ts uses `text` columns; the enum semantics are enforced via app-layer types). Pick `text` + CHECK for parity.
2. **`kb_chunks.embedding`** is `vector(1024)`. Use Drizzle's `customType` to declare the pgvector type:
   ```ts
   import { customType } from "drizzle-orm/pg-core";
   const vector = customType<{ data: number[] | null; driverData: string }>({
     dataType(config: { dimensions: number }) { return `vector(${config.dimensions})`; },
   });
   // ...embedding: vector("embedding", { dimensions: 1024 }),
   ```
   The migration MUST emit `CREATE EXTENSION IF NOT EXISTS vector;` BEFORE `CREATE TABLE kb_chunks`. drizzle-kit does NOT emit `CREATE EXTENSION` automatically — hand-author it as the first statement of `0001_*.sql`.
3. **ivfflat index** on `kb_chunks.embedding` with `vector_cosine_ops` and `lists=100`. drizzle-kit cannot emit this index type — hand-author at the bottom of `0001_*.sql`:
   ```sql
   CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
     ON kb_chunks
     USING ivfflat (embedding vector_cosine_ops)
     WITH (lists = 100);
   ```
4. **All FKs from `DATA_MODEL.md §4 §5-voices §7`** present. Workspace FK target is `organization(id)` ON DELETE CASCADE (per §4). `kb_chunks.documentId` ON DELETE CASCADE. Soft-delete column (`deletedAt`) on `kb_documents`, `tools` (§15 + §4 + §7 explicit). `voices` has NO `deletedAt` per §5 (verify; do not add).
5. **`tool_catalog_providers.credentialsSecretId`** is declared as `text` only — **no `references()`**. The `secrets` table lands in S1-04; the FK constraint is added later via ALTER TABLE in S1-04's migration. Document this as a deliberate forward-reference deferral in the commit body.
6. **Enum CHECK supplement (BL-S0-02).** `0002_enum_checks.sql` (or appended to 0001) adds these CHECK constraints. **Exact enum values verified by manager from `DATA_MODEL.md §3` lines 179, 202, 203, 208** — DO NOT improvise:
   - `ALTER TABLE organization ADD CONSTRAINT organization_environment_check CHECK (environment IN ('production','staging','sandbox'));` (default `'production'`)
   - `ALTER TABLE organization ADD CONSTRAINT organization_region_check CHECK (region IN ('us-east-1','us-west-2','eu-west-1'));` (default `'us-east-1'`)
   - `ALTER TABLE organization ADD CONSTRAINT organization_compliance_mode_check CHECK (compliance_mode IN ('none','hipaa','ferpa','tcpa'));` (default `'none'`)
   - `ALTER TABLE "user" ADD CONSTRAINT user_system_role_check CHECK (system_role IN ('user','staff','superadmin'));` (default `'user'`)
   **Column names are snake_case** in the actual landed migration (`compliance_mode`, `system_role`) — verified by manager from `packages/db/src/migrations/0000_legal_vanisher.sql:71-102`. The bad-INSERT smoke uses `environment='bogus'` to trigger `organization_environment_check`.
7. **`pgvector` extension.** Confirm via psql `SELECT extname FROM pg_extension WHERE extname='vector';` returns `vector` BEFORE running `db:migrate`. The extension is **already installed** at the database level by the manager; the migration's `CREATE EXTENSION IF NOT EXISTS vector;` is a no-op for the `kuralle` role (NOTICE, not ERROR). If the extension is missing, stop and flag.
8. **Voices stock seed.** Hand-author at the bottom of `0001_*.sql` (or a separate `0001b_voices_seed.sql` if drizzle-kit reorders). `workspaceId IS NULL` for stock catalogue (per §5: `NULL = stock catalog`). The canonical mock is `apps/web/src/mocks/agents.ts:12-18` `VOICE_LIBRARY` — 5 voices: `v_aurora` (en-US), `v_rio` (es-MX), `v_hawthorn` (en-GB), `v_lyra` (en-US), `v_castor` (en-AU). Seed all five; assign reasonable providers per voice (e.g., `aurora`/`lyra` → `elevenlabs`, `rio` → `cartesia`, `hawthorn` → `openai`, `castor` → `deepgram` — pick one provider each from the §5 enum). `externalId` may be the same as the local `id` for stock entries. Use the **mock IDs verbatim** (`v_aurora`, `v_rio`, etc.) as the `voices.id` values so existing UI references resolve. Snake-case the column names per §4 acceptance #6 note (Drizzle emits `external_id`, `workspace_id`, `preview_url`, `is_cloned`, `created_at`).
9. **Migrations apply cleanly.** `bun -F @kuralle/db db:migrate` runs end-to-end without errors. `bun -F @kuralle/db db:generate` (if rerun) is idempotent — does not regenerate or modify existing files.
10. **Smoke runner.** `bun packages/db/scripts/smoke-S1-01.ts` (or via package script) runs `db:migrate`, then via `pg.Client` against `kuralle_dev`:
    - `SELECT count(*) FROM voices WHERE "workspaceId" IS NULL` returns ≥4.
    - `SELECT 1 FROM pg_indexes WHERE indexname = 'kb_chunks_embedding_idx'` returns 1 row.
    - `INSERT INTO organization (id, name, slug, environment, region, "complianceMode") VALUES ('test-bad', 'x', 'x', 'bogus', 'us-east', 'basic')` raises an error containing `organization_environment_check` (the CHECK fires).
    - The runner cleans up after itself (`DELETE FROM voices WHERE id LIKE 'test-%'`, etc.) and exits with code 0 on green, 1 on red.
11. **Type-check + lint green.** `bun run check-types --force` (force-flag busts the turbo cache per S0 trap), `bun run lint` (0 errors; 0 new warnings beyond the 1 pre-existing in `packages/env/src/web.ts`).
12. **OpenAPI drift gate green.** No router changes in this story; `bun -F server gen:openapi --check` should still pass with no diff.
13. **Demo artifacts captured.** `sprints/sprint-1/artifacts/S1-01-tables.txt` (psql `\dt public.*` + `\d+ kb_chunks`) and `sprints/sprint-1/artifacts/S1-01-enum-check-fails.txt` (psql session running the bad-INSERT, capturing the CHECK error).

---

## 5. Definition of Done (universal)

Every box must be ticked before you commit:

- [ ] All 13 acceptance criteria above met.
- [ ] Migration is reproducible: `psql -d kuralle_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO kuralle;" && bun -F @kuralle/db db:migrate` runs from-scratch with zero errors. (You can verify this on a throwaway DB if you don't want to wipe `kuralle_dev`; create `kuralle_test` with the same role and run there.)
- [ ] `bun run check-types --force` green (6/6 successful, --force to bust turbo cache per S0 trap).
- [ ] `bun run lint` green (0 errors).
- [ ] `bun -F @kuralle/platform test` still 53/53.
- [ ] `bun -F server gen:openapi --check` still passes (no router changes expected).
- [ ] Smoke runner exits 0.
- [ ] No `--no-verify`, no `@ts-ignore`, no `// eslint-disable-*`, no `try { ... } catch {}` swallowing errors.
- [ ] Demo artifacts in `sprints/sprint-1/artifacts/`.
- [ ] Atomic commit `[S1-01] knowledge + tools + voices + enum CHECKs` includes every file you created or modified, and only those.
- [ ] Commit body: 2-paragraph summary — what shipped + the trade-offs you accepted (especially the FK deferral on `tool_catalog_providers.credentialsSecretId` and the CHECK-vs-pgEnum decision).

---

## 6. What NOT to do

This is anti-scope. The reviewer will reject the diff if you do any of these:

- Do not add deps to the **repo-root** `package.json`. All scripts go inside `@kuralle/db` which already has `drizzle-orm`, `drizzle-kit`, `pg`. (Memory rule: user reverts root devDeps silently.)
- Do not edit `packages/db/src/schema/auth.ts` or any landed migration `0000_*`.
- Do not touch any file outside `packages/db/` or `sprints/sprint-1/`. (The optional package-script add in `packages/db/package.json` is the only allowed cross-cut.)
- Do not introduce a new package or workspace.
- Do not add Vitest tests in this story. The smoke runner is the test. (Vitest unit tests for repositories ship in S2 per the WBS.)
- Do not improvise enum values. Read `DATA_MODEL.md §3` and §5/§7 for the exact tuples.
- Do not add RLS policies. RLS lands in S5 per `DATA_MODEL.md §3`.
- Do not pre-create the projection tables (`agent_*_attachments`, `workflow_*_projection`). Those are S1-02 scope.
- Do not pre-create `secrets`. That's S1-04 scope; this story's `tool_catalog_providers.credentialsSecretId` is `text`-only with no FK.
- Do not regenerate `apps/server/openapi.json` — no router changes in this story.
- Do not modify `apps/web/` files — schema-only sprint story.
- Do not add a `pgvector` install instruction to README. The user has it installed; document via the migration's `CREATE EXTENSION IF NOT EXISTS` only.

---

## 7. Demo artifact

You must produce both:

1. `sprints/sprint-1/artifacts/S1-01-tables.txt` — output of `psql -d kuralle_dev -U kuralle -c "\dt public.*"` AND `psql -d kuralle_dev -U kuralle -c "\d+ kb_chunks"` AND `psql -d kuralle_dev -U kuralle -c "SELECT extname, extversion FROM pg_extension WHERE extname='vector';"`. Concatenate into one file.
2. `sprints/sprint-1/artifacts/S1-01-enum-check-fails.txt` — captured psql session running `INSERT INTO organization (id, name, slug, environment, region, "complianceMode") VALUES ('test-bad', 'x', 'x', 'bogus', 'us-east', 'basic');` and the resulting CHECK violation error.

Reference both files in your commit body.

---

## 8. How to report back

Commit atomically with subject `[S1-01] knowledge + tools + voices + enum CHECKs` and a body covering:
- Tables added (5: kb_documents, kb_chunks, voices, tools, tool_catalog_providers).
- pgvector handling (CREATE EXTENSION + ivfflat index in migration).
- Voices seed count + provider distribution.
- Enum CHECK supplement: which migration file (0001 vs 0002), exact constraint names.
- FK deferral on `tool_catalog_providers.credentialsSecretId` (forward reference to S1-04).
- Smoke runner result.
- Trade-offs you accepted (one paragraph).

Do NOT push. Do NOT open a PR. Manager reviews via per-story gate next.

---

## 9. If you get stuck

- If a file path or symbol referenced in this brief does not exist on disk: stop. Report what you found and what you expected via your final commit-message body — DO NOT commit a half-done story.
- If `pgvector` is missing on `kuralle_dev`: stop. The manager should have provisioned it; flag.
- If `DATA_MODEL.md §3` enum tuples differ from the placeholders in §4 acceptance #6: use the DATA_MODEL values, document the divergence in your commit body.
- If drizzle-kit `generate` produces a migration that conflicts with what you'd hand-author: prefer drizzle-kit's output for `CREATE TABLE`; hand-author only the `CREATE EXTENSION`, ivfflat `CREATE INDEX`, voices `INSERT`, and enum CHECKs.
- If you discover that S0's `apikey` table is `referenceId` not `organizationId` (per AMENDMENT-002), do not touch it — your scope is the new tables only.

You are the IC. Sincere work is the only kind we ship. If you didn't run a check, say so. If you couldn't verify an outcome, say so. **Never claim "done" without proof** — if migrations didn't apply on a from-scratch DB, do not commit.
