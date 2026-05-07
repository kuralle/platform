# Gate Brief — `S0-01` Postgres swap

> **You are the spec + code-quality gate worker (`pi/kimi-k2.6`). You are NOT the IC. You are NOT adversarial. You are the same team as the IC — the second pair of eyes that catches things before the manager's r1.** The IC was `cursor` running on `composer-2-fast`. The IC has already committed atomically and exited. Your output is a markdown report — no code changes, no commits.

---

## 1. Context

- **Story:** `S0-01` — swap `packages/db` from D1/SQLite to Neon serverless Postgres.
- **IC commit:** `fd4721c` — `[S0-01] swap @kuralle/db to Neon serverless Postgres`
- **IC worker:** `cursor` / `composer-2-fast`.
- **You are:** `pi` / `kimi-k2.6`.

**Inputs to your gate (read all of them):**
1. The story brief: `sprints/sprint-0/brief-S0-01.md`. The contract.
2. The IC's transcript: `.handoff/result-S0-01.txt`.
3. The diff on disk:
   - `git show fd4721c` for the full diff.
   - `git show fd4721c --stat` for the file list.
   - Read every file the IC created or modified — at minimum: `packages/db/{package.json,drizzle.config.ts,src/index.ts}`, `packages/infra/alchemy.run.ts`, `apps/server/.env.example`, `apps/server/README.md`, `package.json` (root), `bun.lock`, `apps/web/**` files the IC touched, `sprints/sprint-0/artifacts/S0-01-migration-output.txt`.
4. The sprint plan for context: `sprints/sprint-0/PLAN.md` §0 (pre-flight notes — esp. the docker-compose deviation).
5. The relevant spec docs (only the sections that touch this story):
   - `DATA_MODEL.md §19` — codegen gate (S0-03 owns the actual gate; this story sets up the seam).
   - `HEXAGONAL_ARCHITECTURE.md §6 rule 6` — "ports never leak adapter types" (no D1/libsql shape should remain in `packages/db`).
6. The kickoff prompt's **rules** that apply to S0-01 specifically:
   - **§13 rule 9:** Pin latest stable when adding deps. The IC was instructed to pin `@neondatabase/serverless@^1.1.0`, `drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`. **Verify these match what's actually in `package.json` + `bun.lock`.**
   - **§13 rule 10:** Manager owns commits — IC commits atomic implementation. IC made one commit. ✅ structurally; verify.
   - **No shortcuts on blockers:** zero `--no-verify`, `@ts-ignore`, `try/catch: pass`. Verify with grep.

---

## 2. Your job — two halves

### 2.1 Spec adherence (did the IC meet the brief?)

Walk **every** acceptance criterion in `sprints/sprint-0/brief-S0-01.md §4` (criteria 1–10). For each:
- **Met / partial / missed.** Cite the file:line in the diff.
- If partial: what's missing?
- If missed: is the IC's commit-body hedge honest, or did they paper over it?

**Specific things to verify rigorously:**
- AC #1 — `bun run check-types` green workspace-wide. **Check whether the IC's "extra fixes" in `apps/web/**` were genuinely pre-existing bugs**. If so, the scope expansion is justified by DoD coverage. If they were caused by the dialect flip (e.g., a downstream consumer of `db.DB` binding broke), that's different — it's still S0-01's problem but should be disclosed. The brief said "Do not refactor adjacent code that this story does not require"; the IC argued the fixes were required to satisfy DoD. **Audit this argument.** Manager will accept it if pre-existing; flag it as a finding either way.
- AC #5 — `infra/alchemy.run.ts` no longer references `D1Database`. `DATABASE_URL` is bound as `alchemy.secret.env.DATABASE_URL!`. Read the file and confirm.
- AC #7 — `@libsql/client` and `libsql` removed from the workspace catalog and from `packages/db/package.json`. **Also grep for stray references in any other workspace package** (the IC also dropped them from `apps/web/package.json` per the commit body — verify no other consumer remains).
- AC #9 — Artifact `sprints/sprint-0/artifacts/S0-01-migration-output.txt` captures the three required sections (`db:generate`, `db:push`, `psql \dt`). Read it; flag if any section is missing or looks fake.
- AC #10 — Grep for "D1", "libsql", "Turso", "@libsql" across `packages/db/`, `packages/infra/`, `apps/server/`, `README.md`. Anything that survives is a partial miss.

**The IC's disclosed deviation:** they added `pg` as a `devDependency` in `packages/db` (and to the catalog) because drizzle-kit's introspection prefers `@neondatabase/serverless` (websocket pool) when only it is installed, which can't reach localhost. **Audit this claim** — read `packages/db/package.json` and the drizzle.config.ts to confirm the wiring matches the disclosed rationale. Verdict on this deviation:
- Justified + scoped properly → ✅ minor finding "honest deviation, manager pass-through"
- Unjustified or unscoped → ⚠️ flag for manager to decide

### 2.2 Code quality

For every new or modified source file in the diff, check (per the gate template §2.2):

- **Type tightness.** No `any`. `unknown` only at boundaries with comments. Verify `createDb()`'s signature is honest about its return type.
- **Naming.** No generic `helper`/`util`/`data`. Domain-specific names where they fit.
- **Idiomatic patterns.** Match the existing repo style: ESM, `import type`, no default exports for libs, `catalog:` deps where appropriate.
- **Smells.** Dead branches, copy-paste, magic numbers, leftover debug logs (`console.log`).
- **Comments.** Default no comments; flag any WHAT-comments (the code says it). Allow WHY-comments only when justified.
- **Tests.** S0-01 is plumbing; behavioral coverage is downstream (S0-03). Acceptable to have no new tests in this story. **But verify** the IC didn't add fake placeholder tests.
- **Project-specific:**
  - The `pg` dep should be `devDependency` only (per IC disclosure). If it leaked into `dependencies`, that's a finding.
  - `drizzle.config.ts` should use `dbCredentials.url`. Verify.
  - `apps/server/.env.example` should NOT contain real secrets.
  - `apps/web/` edits should be minimal and surgical, not refactors of unrelated code.
- **Hexagonal discipline:** S0-01 doesn't yet introduce the `packages/platform` package (lands in S0-06). Domain code (`packages/db`) shouldn't import from `cloudflare:workers` directly through any path that leaks adapter shape into ports. Verify `packages/db/src/index.ts` reads `env.DATABASE_URL` cleanly without leaking CF-specific types into the public surface.

---

## 3. Output

Write `sprints/sprint-0/gate-S0-01.md` with these sections:

```md
# Spec + Code-Quality Gate — `S0-01` Postgres swap

> **Gate worker:** pi / kimi-k2.6.
> **IC worker:** cursor / composer-2-fast.
> **Verdict:** {green | yellow | red}

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC1 | check-types green | ✅ | turbo cache hash |
| AC2 | local pg exists | ✅ / ⚠️ / ❌ | … |
| ... | ... | ... | ... |

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| packages/db/package.json | ✅ |
| ... | ... |

Out-of-scope edits the IC made (justified or not):
- apps/web/**/*.tsx — 14 files. Disclosed as pre-existing TS errors. **Audit conclusion:** {confirmed pre-existing / not pre-existing / mixed}.

## 3. Wiring + demo artifact

- alchemy.run.ts: ✅ / ⚠️ / ❌ — DATABASE_URL secret binding wired.
- packages/db/src/index.ts: neon-http drizzle wiring ✅ / ⚠️ / ❌.
- Artifact S0-01-migration-output.txt: exists / missing / fake.

## 4. Code quality

For each new/modified source file, one bullet per finding (or "clean").

- packages/db/drizzle.config.ts:N — finding — severity: nit | minor | major
- ...

## 5. The pg-devDep deviation

Justified? Scoped properly? Manager-pass-through-OK or push back?

## 6. Honest summary

One paragraph. What we shipped. What's clean. What reads sloppy. What's at risk.

## 7. Recommended action

- **Ready for r1.** Spec met, quality acceptable. Manager can run critical eval.
- **Needs IC fix pass before r1.** List the specific fixes; manager re-delegates with a focused fix brief.
- **Ambiguous spec — manager owns.** Brief was unclear on point X.
```

Verdict at the top:
- **green** — ready for r1.
- **yellow** — minor fixes warranted; manager decides.
- **red** — major spec misses or quality issues; IC needs another pass.

---

## 4. What NOT to do

- Do not rewrite the IC's code. Markdown report only.
- Do not be adversarial. The same team. r2 (codex) is the adversarial pass — that's not you.
- Do not litigate style preferences. Only flag rules / RFC §s / quality-rubric violations.
- Do not duplicate brief language. Reference acceptance criteria by number.
- **Do not commit.** Manager owns commits.
- Do not approve a story that has fake artifacts or a misleading commit body. Better to fail honestly than pass quietly.

---

## 5. Tone

Calm, grounded, on-team. Plain language. Honest about what shipped. The manager reads your report alongside the diff; your report should make their r1 review faster, not redundant.

You are the second pair of eyes the IC didn't have. The team is better when the gate works.
