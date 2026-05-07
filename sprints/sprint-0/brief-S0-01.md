# Story Brief — `S0-01` Swap `packages/db` from D1/SQLite to Neon serverless Postgres

> **You are the IC engineer (`cursor` worker — fresh process for this story; clean context window) with no prior context.** This brief is self-contained. Read it end-to-end before writing any code. If anything in this brief is ambiguous or contradicts what you find on disk, **stop and ask** rather than guess.
>
> **Atomic-commit policy:** when you finish, stage every file you create / modify and commit atomically with `[S0-01] swap @kuralle/db to Neon serverless Postgres`. Do NOT push. Do NOT make multiple commits. Manager handles fix-pass and closeout commits later.

---

## 1. Goal

Replace `drizzle-orm/d1` + SQLite + the libsql/D1 stack with `drizzle-orm/neon-http` + the `@neondatabase/serverless` driver, switch the dialect to `postgresql`, wire `DATABASE_URL` end-to-end (Drizzle config + alchemy bindings + `.env`), and prove migrations run cleanly against the user's local system Postgres on `localhost:5432`. No domain-schema changes — this story is plumbing. Behavioral coverage is downstream (S0-03 sign-up E2E).

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — current sprint pointer.
2. `sprints/sprint-0/PLAN.md` — full sprint plan; `S0-01` section + §0 (pre-flight notes).
3. `sprints/WBS.md` § Sprint 0, story `S0-01`.
4. `DATA_MODEL.md §3` (auth/tenancy via better-auth; for context — you do **not** edit auth schema in this story; that's S0-02 + S0-03).
5. `DATA_MODEL.md §19` (post-signoff blockers; the better-auth-on-Workers gate is S0-03, not this story).
6. `HEXAGONAL_ARCHITECTURE.md §6` rule 6 — "ports never leak adapter types" (you will not be touching ports here, but you should keep the rule in mind: D1-specific or libsql-specific shapes must not survive in `packages/db/`).
7. `packages/db/src/index.ts`, `packages/db/drizzle.config.ts`, `packages/db/package.json`, `packages/db/src/schema/auth.ts`, `packages/db/src/schema/index.ts` — current state.
8. `packages/infra/alchemy.run.ts` — current binding wiring you will modify.
9. `packages/env/env.d.ts`, `packages/env/src/server.ts` — types are inferred from alchemy.run.ts; verify the type still flows after you remove `DB`.
10. `apps/server/.env` — current contents are `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`. You will add `DATABASE_URL`.
11. `package.json` (repo root) — workspace catalog. You will: drop `@libsql/client` + `libsql`, bump `drizzle-orm` to `^0.45.2`, bump `drizzle-kit` to `^0.31.10`, add `@neondatabase/serverless: ^1.1.0` to the catalog (and to `packages/db/package.json` deps).
12. `apps/server/package.json` — confirm it doesn't depend on libsql; if it does, that's S0-01 cleanup.
13. `README.md` — quick start section (you will adjust if it currently mentions Turso/D1).

---

## 3. Files you will create or modify

Be explicit. The reviewer will check that you didn't touch anything else.

**Create:**
- `apps/server/.env.example` — committed template. Include `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN`. **Do NOT commit real secrets.** Use `postgres://kuralle:kuralle@localhost:5432/kuralle_dev` as the example value.
- `sprints/sprint-0/artifacts/S0-01-migration-output.txt` — captured log of `bun -F @kuralle/db db:generate` + `bun -F @kuralle/db db:push` against the local system Postgres, plus a `psql kuralle_dev -c '\dt'` capture. The exact format is plain text.

**Modify:**
- `package.json` (workspace root) — catalog edits described in §2 item 11. Pin `@neondatabase/serverless: ^1.1.0`. Drop `@libsql/client` and `libsql` from the catalog (verify no other workspace package consumes them via `catalog:` first; grep `bun.lock` and every `package.json` for `@libsql/client` and `libsql`. If anything else depends on them, **stop and ask** — drop scope is just `packages/db`).
- `packages/db/package.json` — drop `@libsql/client`, drop `libsql`, drop `dotenv` if unused after the config rewrite, add `@neondatabase/serverless: catalog:` to deps, keep `drizzle-orm` and `drizzle-kit` on `catalog:`.
- `packages/db/drizzle.config.ts` — switch `dialect` to `'postgresql'`. **Migrations driver:** for the local-system-Postgres migration target, configure drizzle-kit to use the `pg`-style URL via `dbCredentials: { url: process.env.DATABASE_URL! }`. Drop the `d1-http` driver field.
- `packages/db/src/index.ts` — replace `import { drizzle } from "drizzle-orm/d1"` with `import { drizzle } from "drizzle-orm/neon-http"` and `import { neon } from "@neondatabase/serverless"`. `createDb()` reads `env.DATABASE_URL`, constructs the neon http client, wraps with drizzle.
- `packages/infra/alchemy.run.ts` — remove the `D1Database` import + `db` resource + the `DB: db` binding. Add `DATABASE_URL: alchemy.secret.env.DATABASE_URL!` to the server bindings block. Keep everything else identical.
- `packages/env/env.d.ts` — verify after the alchemy.run.ts change that the `Env` type now exposes `DATABASE_URL` (string) and no longer exposes `DB` (D1 binding). No manual edit should be required because types are inferred; if a manual edit IS required, document why.
- `packages/db/tsconfig.json` — only if needed for type resolution against `@neondatabase/serverless`. Don't touch otherwise.
- `apps/server/.env` — append a `DATABASE_URL=postgres://kuralle:kuralle@localhost:5432/kuralle_dev` line. **Do NOT alter the existing three lines (BETTER_AUTH_SECRET, BETTER_AUTH_URL, CORS_ORIGIN).**
- `apps/server/README.md` — add a "Local development — Postgres" section documenting (a) the one-time setup, (b) the env var, (c) why we don't use docker-compose this sprint. Use the recipe in §6 below verbatim.
- `README.md` (repo root) — update the "Stack" line: drop the "Drizzle + Turso" note, replace with "Drizzle + Postgres (Neon serverless driver)". Don't touch other parts of the README.

**Do not touch:**
- `packages/auth/src/index.ts` — that's S0-02.
- `packages/db/src/schema/auth.ts` — that's S0-03 (regenerated from CLI).
- `apps/server/src/index.ts` — no edit needed for this story.
- Any sprint planning doc except for adding the artifact under `sprints/sprint-0/artifacts/`.

---

## 4. Acceptance criteria (numbered, in priority order)

The reviewer will check these gates. Pass all of them.

1. **`bun run check-types` is green workspace-wide** after your changes.
2. **The local Postgres database exists** (you will create it as part of the story — see §6 setup) and contains no schema yet OR the existing `auth.ts` SQLite schema can no longer be migrated against it (because dialect changed). Either is acceptable: this story isn't responsible for the auth schema; that's S0-03.
3. **`bun -F @kuralle/db db:generate` succeeds** and emits a Postgres-flavored migration file (or an empty migration if drizzle-kit detects no schema diff after the dialect flip — note: the existing `auth.ts` is still SQLite-typed at this point, so `db:generate` may produce a migration that looks weird; that's OK because S0-03 will delete `auth.ts` and regenerate it from better-auth's CLI. The point of this acceptance criterion is to confirm the dialect flip works — drizzle-kit doesn't error out on a config-only basis.)
4. **`bun -F @kuralle/db db:push` (or `drizzle-kit migrate`) runs without errors** against `kuralle_dev`. If the schema is empty after this story, `db:push` is a no-op and that's expected.
5. **`infra/alchemy.run.ts` no longer imports `D1Database`.** `DATABASE_URL` is bound as `alchemy.secret.env.DATABASE_URL!`.
6. **`apps/server/.env.example` exists and is committed** with the four variables (no real secrets).
7. **`@libsql/client` and `libsql` are removed from the workspace catalog and from `packages/db/package.json`.** Run `bun install` after the package.json edits and commit the resulting `bun.lock`.
8. **`apps/server/README.md` documents the local-Postgres recipe** matching §6.
9. **The artifact `sprints/sprint-0/artifacts/S0-01-migration-output.txt`** captures: (a) `bun -F @kuralle/db db:generate` output, (b) `bun -F @kuralle/db db:push` output, (c) `psql kuralle_dev -c '\dt'` output (likely empty `\dt` until S0-03 — that's fine, capture it anyway).
10. **No D1 / libsql / Turso references remain in `packages/db/`, `packages/infra/`, `apps/server/`, or the repo `README.md`** (other than in CHANGELOG-style notes; you don't need to add such notes).

---

## 5. Definition of Done (universal)

Every box must be ticked before you report back:

- [ ] Story commits atomically with `[S0-01] swap @kuralle/db to Neon serverless Postgres`.
- [ ] `bun run check-types` green workspace-wide after the commit.
- [ ] `bun install` clean (no peer warnings introduced; if pre-existing, leave them).
- [ ] `bun -F @kuralle/db db:generate` and `bun -F @kuralle/db db:push` both ran successfully against `kuralle_dev` on `localhost:5432`. Output captured into the artifact.
- [ ] No `@ts-ignore`, no `--no-verify`, no silent catch.
- [ ] Public TypeScript surface — `createDb()` — keeps the same signature: `() => DrizzleDB<schema>`. The internal driver changes; the export shape does not. **If you would change the signature, stop and ask.**
- [ ] Demo artifact present at `sprints/sprint-0/artifacts/S0-01-migration-output.txt`.

---

## 6. How to set up the local Postgres (one-time, document in `apps/server/README.md`)

The user runs Postgres.app 15.12 on `localhost:5432` (verified by manager pre-flight). Use this recipe verbatim in `apps/server/README.md`:

```bash
# One-time: create the development database and a role.
psql postgres <<'SQL'
CREATE ROLE kuralle WITH LOGIN PASSWORD 'kuralle';
CREATE DATABASE kuralle_dev OWNER kuralle;
GRANT ALL PRIVILEGES ON DATABASE kuralle_dev TO kuralle;
SQL

# In apps/server/.env (add this line; keep the existing ones):
# DATABASE_URL=postgres://kuralle:kuralle@localhost:5432/kuralle_dev

# Generate + push the schema:
bun -F @kuralle/db db:generate
bun -F @kuralle/db db:push
```

Note for the README: docker-compose is intentionally not used this sprint. The user runs system Postgres; the recipe above mirrors what production looks like (the same `DATABASE_URL` shape works against Neon, with a different host/port/credentials). The Neon-side migration target lands in a follow-up story.

---

## 7. What NOT to do

- Do not refactor adjacent code that this story does not require. (E.g., do not rewrite `packages/auth/src/index.ts` — that's S0-02.)
- Do not delete or regenerate `packages/db/src/schema/auth.ts`. That's S0-03.
- Do not introduce new dependencies beyond `@neondatabase/serverless`. If you think you need another, **stop and ask**.
- Do not commit real secrets to `.env.example`.
- Do not add a `docker-compose.dev.yml`. The PLAN.md §0 deviation explicitly drops it.
- Do not touch the OpenAPI emission, the api-client, the platform package, or the lint config — those are S0-04 / S0-05 / S0-06.
- Do not silently bump any version other than the three documented in §3 (`drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`).
- Do not add or change tests in this story; behavioral coverage is downstream (S0-03 sign-up E2E).

---

## 8. Demo artifact

Place it at `sprints/sprint-0/artifacts/S0-01-migration-output.txt`. Plain text. Three sections, separated by `---`:

```
=== bun -F @kuralle/db db:generate ===
<paste output>

=== bun -F @kuralle/db db:push ===
<paste output>

=== psql kuralle_dev -c '\dt' ===
<paste output>
```

---

## 9. How to report back

When you finish, your commit body should include:

- The story brief link.
- The DoD checklist with every box ticked.
- The list of files changed.
- The artifact path.
- One paragraph of "what I considered but didn't do, and why" — the trade-offs you accepted (e.g., "considered keeping `dotenv` for local-dev fallback; dropped because alchemy + cloudflare:workers handles env loading").

The manager will then move on to S0-02 in a fresh cursor process. Phase B reviews (gate + r1 + r2) run once after all six stories are committed.

---

## 10. If you get stuck

- If `psql` is not on PATH or `localhost:5432` rejects connections, **stop and ask** — manager pre-flight confirmed it was up; if it isn't now, that's the user's responsibility.
- If `bun pm view @neondatabase/serverless version` returns a version above `1.1.0`, **stop and ask** — the manager pinned `^1.1.0` based on a 2026-05-07 lookup; if a newer minor exists you may bump but document it.
- If a workspace package outside `packages/db` consumes `@libsql/client` or `libsql` via the catalog, **stop and ask** — scope is db-only.
- If `db:generate` errors out because the existing `auth.ts` is still SQLite-typed and drizzle-kit can't reconcile, **note this and capture the output**; this is expected and S0-03 fixes it. The acceptance criterion is "command succeeds" — drizzle-kit may emit warnings or even refuse to generate without errors. If the only failure is "no schema changes detected" (because the file is structurally invalid for postgres), **that's still acceptable** for this story — capture the output and proceed. If it's a hard error that prevents `db:push` from running, capture it and report back; manager will decide whether to merge S0-01 + S0-03 into one story.

You are the IC. Sincere work is the only kind we ship. If you didn't run a test, say so. If you couldn't verify an outcome, say so.
