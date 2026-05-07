# Spec + Code-Quality Gate — `S1-01` Knowledge + tools + voices + enum CHECKs

> **You are the spec-and-code-quality gate worker (`pi/kimi-k2.6`).** The IC was `pi/deepseek-v4-pro`. You are deliberately a different model so you can fact-check the team's work before the manager reviews it. **You are NOT adversarial — you are the peer-IC keeping us honest.** Your output is a markdown report at `sprints/sprint-1/gate-S1-01.md`. Do NOT commit. Do NOT modify any source.

---

## 1. Context

**Story:** `S1-01` — Knowledge + tools + voices + enum-CHECK supplement.

**Inputs to your gate:**
1. The story brief: `sprints/sprint-1/brief-S1-01.md`. The contract.
2. The sprint plan: `sprints/sprint-1/PLAN.md` § `S1-01`.
3. The IC's transcript: `.handoff/result-S1-01.txt`.
4. The diff on disk — start with `git show 7d62fa1` and read every file the IC created or modified.
5. The reference docs the brief cites: `DATA_MODEL.md §3` (lines 179, 202-208 for enum tuples), `§4` (lines 251-303 for kb), `§5 voices` (lines 445-461), `§7` (lines 500-556 for tools), `§15` (cross-cutting), `§18` step 14-15.
6. The migration files on disk: `packages/db/src/migrations/0001_crazy_purifiers.sql`, `0002_enum_checks.sql`.
7. The artifact files: `sprints/sprint-1/artifacts/S1-01-tables.txt`, `S1-01-enum-check-fails.txt`.
8. **The committed Postgres state** if you want to verify behaviorally:
   - Connection: `postgres://kuralle:kuralle@localhost:5432/kuralle_dev`
   - `psql -d kuralle_dev -U kuralle -c "\dt public.*"` shows the new tables.
   - `psql -d kuralle_dev -U kuralle -c "\d+ kb_chunks"` shows the ivfflat index.
   - `bun packages/db/scripts/smoke-S1-01.ts` re-runs the smoke (the IC's runner).

Read all of this. Inspect the diff line by line. Cross-check against `DATA_MODEL.md §4 §5-voices §7` to catch any divergence.

---

## 2. Your job — two halves

### 2.1 Spec adherence

Walk every acceptance criterion in `brief-S1-01.md §4` (criteria 1-13). For each:
- **Met / partial / missed.** Cite file:line.
- If partial: what's missing?
- If missed: did the IC's commit body honestly disclose the miss?

Verify the file list: every `Create` file exists; every `Modify` file actually changed; nothing outside the lists was touched.

Specific verifications you MUST perform (these are project-specific gates from the kickoff prompt):

1. **`DATA_MODEL.md §4` verbatim check** — `kb_documents` and `kb_chunks` columns, indexes, FKs match line-by-line. Specifically:
   - `kb_documents` indexes per §4 line 279: `(workspaceId, deletedAt) where deletedAt is null` is a **partial index**. Did the IC emit it? If not, mark as a partial miss.
   - `kb_documents.source` is `enum('file','url','text')` per §4. Is there a CHECK constraint? (BL-S0-02 spirit applied to NEW enum-text columns.)
   - `kb_documents.status` is `enum('ready','indexing','needs_refresh','failed')`. Same CHECK question.

2. **`DATA_MODEL.md §7` verbatim check** — `tools` and `tool_catalog_providers` columns, indexes, FKs:
   - `tools.kind` is `enum('webhook','mcp','client','system')`. CHECK?
   - `tools.status` is `enum('active','deprecated','error','deleted')`. CHECK?
   - `tool_catalog_providers.kind` is `enum('composio','arcade','pipedream','mcp-custom','mcp-self-hosted')`. CHECK?
   - `tool_catalog_providers.authMode` is `enum('oauth','api-key','none')`. CHECK?
   - `tool_catalog_providers.status` is `enum('connected','degraded','error','disabled')`. CHECK?
   - `tool_catalog_providers.credentialsSecretId` should be `text` only (no FK) per brief AC 5 — verify it doesn't reference `secrets`.

3. **`DATA_MODEL.md §5-voices` verbatim check** — `voices.provider` is `enum('elevenlabs','cartesia','openai','google','deepgram')`. CHECK?

4. **pgvector wiring**:
   - `CREATE EXTENSION IF NOT EXISTS vector;` is the FIRST statement of the migration that introduces `vector(1024)` — confirm.
   - `kb_chunks_embedding_idx` exists with `USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)` — confirm exact text in migration.

5. **Voices seed**: 5 stock entries (`v_aurora`, `v_rio`, `v_hawthorn`, `v_lyra`, `v_castor`), all `workspace_id IS NULL`, providers from the §5 enum. Match the `apps/web/src/mocks/agents.ts:12-18` `VOICE_LIBRARY` ids verbatim.

6. **Enum CHECK supplement (BL-S0-02)**: four constraints in `0002_enum_checks.sql` — verify constraint names match `organization_environment_check`, `organization_region_check`, `organization_compliance_mode_check`, `user_system_role_check`. Tuple values match `DATA_MODEL.md §3` lines 179/202/203/208. Smoke runner proves each fires (artifact `S1-01-enum-check-fails.txt`).

7. **Hexagonal-import lint**: this story doesn't touch `core/`/`api/`/`db/`/`runtime/` cross-cuts, but the new schema files in `packages/db/src/schema/` MUST NOT import from `platform/cloudflare/` or `platform/node/`. Confirm.

8. **No root-dep pollution**: `package.json` at the repo root should be unchanged. Confirm via `git show 7d62fa1 -- package.json bun.lock`.

9. **No `--no-verify`, `@ts-ignore`, swallowed errors**: grep the diff for these.

10. **Reproducibility**: the IC claims from-scratch migrate worked. You may re-run `psql -d kuralle_dev -U kuralle -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO kuralle;" && bun -F @kuralle/db db:migrate` if you want to verify (note: this wipes the seed; expect the smoke to need a re-run).

### 2.2 Code quality

For every file the IC created or modified:

- **Naming.** Drizzle table names should be `snake_case` strings; TS exports should be camelCase. Verify.
- **Type tightness.** `customType<{ data: number[] | null; driverData: string }>` — does the parameter shape parse correctly under TS 5.x? Lint is currently emitting 2 new `any` warnings in `packages/db/scripts/smoke-S1-01.ts:41` and `:58` — flag this. Could the catch blocks use `unknown` + a narrowed `instanceof Error` check instead?
- **Idiomatic patterns.** `relations()` declarations match the auth.ts precedent. Imports are alphabetized or grouped consistently.
- **Smells.** Dead branches; copy-paste between `knowledge.ts`/`tools.ts`/`voices.ts`; magic numbers (e.g., `lists=100` for ivfflat — DATA_MODEL §4 line 298 documents the `100` value, so this is grounded, not magic).
- **Comments.** Should be near-zero. Flag any that explain WHAT instead of WHY.
- **Test quality.** The smoke runner — does it actually assert each enum CHECK fires (not just that *an* error was raised)? Does it clean up its test rows?

---

## 3. Output

Write **`sprints/sprint-1/gate-S1-01.md`** with these sections:

```md
# Spec + Code-Quality Gate — `S1-01` Knowledge + tools + voices + enum CHECKs

> **Gate worker:** pi/kimi-k2.6.
> **IC worker:** pi/deepseek-v4-pro.
> **Commit reviewed:** 7d62fa1.
> **Inputs:** brief-S1-01.md, result-S1-01.txt, diff on disk, DATA_MODEL.md §3 §4 §5 §7 §15 §18.
> **Verdict:** {green / yellow / red}

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Schema verbatim per §4/§5-voices/§7 | ✅/⚠️/❌ | files:lines |
| 2 | kb_chunks.embedding vector(1024) + customType | ✅/⚠️/❌ | knowledge.ts:N |
| 3 | ivfflat index with vector_cosine_ops + lists=100 | ✅/⚠️/❌ | 0001_*.sql:N |
| ... | (one row per AC 1-13) | | |

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/db/src/schema/knowledge.ts` | ✅ created |
| ... | |

Out-of-scope edits: {list or "none"}.

## 3. Wiring + demo artifact

- Schema index re-exports: ✅/⚠️ + notes.
- Migration meta journal updated: ✅/⚠️.
- `S1-01-tables.txt`: present, contents match brief? ✅/❌.
- `S1-01-enum-check-fails.txt`: present, captures CHECK name in error? ✅/❌.

## 4. Code quality

- `packages/db/src/schema/knowledge.ts:N` — finding — severity.
- `packages/db/scripts/smoke-S1-01.ts:41,58` — `catch (e: any)` — severity (nit/minor/major).
- ... (one bullet per file or "clean")

## 5. Honest summary

One paragraph: what shipped, what didn't, what reads sloppy, what's at risk.

## 6. Recommended action

Pick one:
- **Ready for manager fix-pass.** Spec met, quality acceptable. Manager applies any minor "Apply now" items and commits `[S1-01-fix]`.
- **Needs IC re-fire.** Major spec miss; IC must re-run.
- **Ambiguous — manager owns.** Brief was unclear on point X.

## 7. Apply-now items (for the manager fix-pass)

Numbered list. Each item: file path + line + concrete fix description. The manager will apply each one before firing S1-02.
```

---

## 4. What NOT to do

- Do not rewrite the IC's code — markdown report only.
- Do not commit anything.
- Do not be adversarial — you're peer-IC, not r2. Codex will do the adversarial pass at sprint level.
- Do not litigate style preferences. Flag only project-rule, RFC-§, or §2.2 rubric violations.
- Do not invent new ACs the brief didn't carry. (Spec-spirit checks ARE in scope — e.g., enum CHECKs on new enum-text columns extends the BL-S0-02 spirit; cite that as "spirit of brief AC 6" not as a brand-new AC.)
- Do not duplicate the brief — reference ACs by number.
- Do not skip a suspicious file — read line by line.

---

## 5. Tone

Calm, grounded, on-team. Plain language. Make the manager's r1 faster, not redundant. Use the `Apply-now items` section to convert findings into surgical fixes the manager can apply before firing the next IC.
