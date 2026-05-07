# Story Brief — `S0-03` Regenerate auth schema + initial migration + sign-up E2E (CODEGEN GATE)

> **You are the IC engineer (`pi` worker, deepseek-v4-pro — fresh process; clean context window) with no prior context.** This brief is self-contained. Read it end-to-end before writing any code.
>
> **Atomic-commit policy:** when you finish, stage every file you create / modify and commit atomically with `[S0-03] regen auth schema, initial migration, sign-up E2E`. Do NOT push.
>
> **THIS IS THE CODEGEN GATE.** Per `DATA_MODEL.md §19 step 1`, all downstream codegen + sprints depend on the better-auth-on-Workers + Postgres + Neon-HTTP combo working end-to-end via this story's sign-up E2E. **If sign-up fails, stop and surface a `Gate-Fail` report — do NOT band-aid.**

---

## 1. Goal

Delete the hand-authored `packages/db/src/schema/auth.ts` (still SQLite-flavoured), regenerate it from better-auth's CLI using the config that S0-02 produced, run `drizzle-kit generate` to emit the initial Postgres migration, apply it via `drizzle-kit migrate` against the local system Postgres on `localhost:5432/kuralle_dev`, and prove that the full sign-up flow works end-to-end through the existing A1 sign-in screen against `wrangler dev` of `apps/server`. Verify the four expected rows (user, personal organization, member-as-owner, session.activeOrganizationId set) via `psql`.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md`
2. `sprints/sprint-0/PLAN.md` — pre-flight notes + `S0-03` section
3. `sprints/WBS.md` § Sprint 0, story `S0-03`
4. `DATA_MODEL.md §3` (auth shapes)
5. `DATA_MODEL.md §19` step 1 — **the gate**
6. `packages/auth/src/index.ts` — current state (after S0-02: organization + apiKey plugins + additionalFields + the user-created hook)
7. `packages/auth/better-auth.config.ts` — the CLI config file from S0-02
8. `packages/auth/src/cli.ts` — the CLI variant from S0-02
9. `packages/db/src/schema/auth.ts` — current state, SQLite-flavoured. **You will delete and regenerate this.**
10. `packages/db/drizzle.config.ts` — Postgres + url-driven (after S0-01)
11. `packages/db/src/index.ts` — neon-http drizzle client (after S0-01)
12. `apps/server/.env` — has `DATABASE_URL=postgres://kuralle:kuralle@localhost:5432/kuralle_dev`
13. `apps/server/src/index.ts` — better-auth handler mounted at `/api/auth/*`
14. `apps/web/src/routes/auth.sign-in.tsx` — the existing A1 sign-in route (the entry point for the E2E)
15. better-auth + Hono + Workers + Postgres docs:
    - <https://hono.dev/examples/better-auth-on-cloudflare>
    - <https://www.better-auth.com/docs/installation>
    - <https://www.better-auth.com/docs/concepts/cli>

---

## 3. Files you will create or modify

**Delete + recreate:**
- `packages/db/src/schema/auth.ts` — delete the existing file, then regenerate it via:
  ```bash
  bunx @better-auth/cli@latest generate \
    --config ./packages/auth/better-auth.config.ts \
    --output ./packages/db/src/schema/auth.ts \
    -y
  ```
  (Use `bunx` since the workspace's `bun` is on PATH; alternatively `npx @better-auth/cli@latest generate ...` — pick one and document.) The CLI emits a header marker; preserve it.

**Create:**
- `packages/db/src/migrations/0000_*.sql` — the initial migration emitted by `bun -F @kuralle/db db:generate`. Filename suffix is auto-named by drizzle-kit; do not rename.
- `packages/db/src/migrations/meta/_journal.json` and `packages/db/src/migrations/meta/0000_snapshot.json` — drizzle-kit metadata.
- `scripts/sprint-0/signup-smoke.ts` — a one-shot Node/Bun script that performs sign-up via the live API and asserts the four expected rows (see §4 criterion 5). Self-contained; uses `postgres` or `pg` for the verification queries.
- `sprints/sprint-0/artifacts/S0-03-tables.txt` — `psql kuralle_dev -c '\dt'` output showing the eight better-auth tables.
- `sprints/sprint-0/artifacts/S0-03-rows.txt` — `psql` row dump after sign-up: the matching `user`, `organization`, `member`, `session` rows.
- `sprints/sprint-0/artifacts/S0-03-signup.cast` (or `.mp4`) — a 30-second screencast (or asciinema cast) of the sign-up flow against `wrangler dev` + `apps/web`.

**Modify:**
- `packages/db/src/schema/index.ts` — only if the regenerated `auth.ts` exports differ; preserve the `export * from "./auth"` pattern.
- `packages/db/package.json` — add a `db:migrate` script if missing (`drizzle-kit migrate`); do not add other scripts.
- (Optional) `apps/server/scripts/` — leave unchanged; the smoke script lives at `scripts/sprint-0/signup-smoke.ts`.

**Do not touch:**
- `packages/auth/src/index.ts` or `cli.ts` — those are S0-02's territory.
- `apps/server/src/index.ts` (handler mounting unchanged).
- `apps/web/src/routes/auth.sign-in.tsx` — the E2E uses the existing UI as-is.
- `infra/alchemy.run.ts` — already wired in S0-01.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`packages/db/src/schema/auth.ts` is regenerated** by the better-auth CLI. The file header carries the CLI's generation marker. The eight tables are present in the schema: `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey`.
2. **All `+ext` columns from S0-02 are present** on the appropriate tables (per `DATA_MODEL.md §3`). If any is missing, that's a config bug in S0-02 — **stop and report**, do not patch around it by hand-editing the regenerated file.
3. **The initial migration `0000_*.sql`** is emitted by `bun -F @kuralle/db db:generate`. The migration creates all eight tables in Postgres. Read the SQL once before applying.
4. **`bun -F @kuralle/db db:migrate` (or equivalent) succeeds** against `kuralle_dev`. After it runs, `psql kuralle_dev -c '\dt'` shows the eight tables. Captured in `S0-03-tables.txt`.
5. **Sign-up E2E proves the gate.** With `bun -F server dev` (wrangler dev) running and `apps/web` running locally, signing up a fresh user via the A1 sign-in screen succeeds and produces:
   - one new `user` row with the submitted email + name
   - one new `organization` row with `isPersonal=true`, `createdByUserId=<user.id>`, `name` matching the S0-02 hook (e.g., `"<email>'s personal workspace"`)
   - one new `member` row linking `userId=<user.id>`, `organizationId=<org.id>`, `role='owner'`
   - the resulting `session.activeOrganizationId` is set to the personal org id
   The `scripts/sprint-0/signup-smoke.ts` script automates the verification and writes its output to `S0-03-rows.txt`. The script also accepts a `--seed-email <email>` flag for deterministic re-runs.
6. **Demo artifact** `S0-03-signup.{cast,mp4}` shows the sign-up flow. 30s max.
7. **`bun run check-types` green workspace-wide** after the regenerated schema lands and any export drift is reconciled.
8. **No hand edits to the regenerated `auth.ts`.** If the CLI output is wrong, the fix is in `packages/auth/src/cli.ts` (S0-02 amendment in this same story's commit, with the rationale documented). Document any S0-02-amendment in the commit body.
9. **GATE: if sign-up fails** — better-auth on Workers, the Neon-HTTP driver, the cookie path, anything — **stop and write `sprints/sprint-0/GATE-FAIL.md`** describing what was tried, the actual error, what wrangler-dev's logs said, and what the user must decide (swap auth lib? wait for better-auth's Workers adapter? switch to a different driver?). Do not commit a half-working state. Per DATA_MODEL.md §19 step 1, all downstream sprints are paused until the gate clears.

---

## 5. Definition of Done (universal)

- [ ] Atomic commit `[S0-03] regen auth schema, initial migration, sign-up E2E`.
- [ ] `bun run check-types` green workspace-wide.
- [ ] `bun install` clean.
- [ ] All eight tables present in `kuralle_dev` after migrate.
- [ ] Sign-up E2E produces the four expected rows; verified by the smoke script and captured in artifacts.
- [ ] No `@ts-ignore`, no `--no-verify`, no silent catch.
- [ ] Demo artifact present at `sprints/sprint-0/artifacts/S0-03-signup.{cast,mp4}`.
- [ ] `S0-03-tables.txt` and `S0-03-rows.txt` present.

---

## 6. What NOT to do

- Do not edit the regenerated `packages/db/src/schema/auth.ts` by hand. Re-run the CLI after fixing the config in S0-02-territory if needed.
- Do not bypass the sign-up E2E. "Compiles cleanly" is not the same as "sign-up works."
- Do not add `--no-verify` to git commands or add `try/catch: pass` in the smoke script.
- Do not introduce new dependencies. The smoke script can use `postgres` or `pg` (already installed). If it needs `node-fetch`, prefer `fetch` (Node 22+ has it native).
- Do not invent rows. The smoke script reads what's actually in the DB.
- Do not skip the demo recording.

---

## 7. Demo artifact

`sprints/sprint-0/artifacts/S0-03-signup.{cast,mp4}` — 30s max showing the sign-up. Plus the two text artifacts (`tables.txt`, `rows.txt`).

---

## 8. How to report back

Commit body:
- DoD checklist (every box ticked).
- The list of files changed.
- The exact CLI invocation used to regenerate the schema.
- The smoke script invocation and its output excerpt.
- The wrangler-dev log excerpt around the sign-up.
- One paragraph "what I considered but didn't do, and why" (e.g., didn't add a `db:migrate:reset` script; left as a manual `psql DROP DATABASE kuralle_dev; createdb kuralle_dev` for now).

If the gate fails, the commit is **not made**. Instead write `sprints/sprint-0/GATE-FAIL.md` and stop.

---

## 9. If you get stuck

- If `bunx @better-auth/cli@latest generate` errors out because it can't resolve `dotenv` in CWD context, run from `packages/auth/` directory or pass `--config` with an absolute path. Document the resolution.
- If the regenerated `auth.ts` lacks one of the `+ext` columns, the bug is in S0-02's `additionalFields`. Surface it; **do not** add the column by hand.
- If `drizzle-kit migrate` fails on a column type the regenerated schema uses (e.g., `pgEnum` vs `text`), inspect the SQL, decide whether the regenerated schema is wrong (then fix S0-02's `additionalFields.type`) or whether the migration is fine and `psql` is misconfigured. Document.
- If the sign-up fails because the cookie path doesn't match (`localhost:3000` vs `localhost:3001`), **try the documented Hono recipe's cookie config first** (`sameSite: 'lax'` for same-localhost, drop `secure: true` since localhost is http). If that doesn't work, surface in `GATE-FAIL.md`.
- If the sign-up succeeds but the `member` row isn't created, the bug is in S0-02's `databaseHooks` — surface and fix in S0-02 territory; **do not** create the row from the smoke script.
- If wrangler-dev doesn't bind `DATABASE_URL`, check that S0-01's alchemy.run.ts properly wires it; coordinate with S0-01 territory if needed (rare; S0-01 should have left this in a good state).

You are the IC. Sincere work is the only kind we ship. **The gate either passes honestly or it fails honestly. There is no third option.**
