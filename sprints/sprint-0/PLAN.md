# Sprint 0 — Plan

**Sprint name:** Foundations
**Sprint goal (one sentence):** Ship Postgres-backed auth, an OpenAPI 3 contract emitted by oRPC and committed as the canonical public spec, a thin `@orpc/tanstack-query` client package consumed by `apps/web` behind hook wrappers, and the eight platform ports + memory adapter — proving the hexagonal seam and the API contract before any domain code lands.
**Sprint window:** 2026-05-07 → 2026-05-14 (1w)
**Author (main session):** Claude Opus 4.7 (1M context) · 2026-05-07

---

## 0. Pre-flight notes (decisions taken before story execution)

- **Local Postgres tooling:** the user's system already runs Postgres.app 15.12 on `localhost:5432`. **WBS S0-01 wording calls for `docker-compose.dev.yml` at repo root; this sprint deviates** — we do **not** add docker-compose. Migrations run against the user's system Postgres directly. The local-dev recipe in `apps/server/README.md` documents this. This deviation is sprint-local (no DATA_MODEL/HEXAGONAL/INTERFACE doc edits required), captured in the WARMDOWN as a "decisions made" entry.
- **Neon target deferred:** the second prong of S0-01 DoD ("`drizzle-kit migrate` runs against a Neon branch and a local Postgres; both targets show identical schemas") is reduced to **local-only** for this sprint. The WBS-level Neon production target survives in S5; the local-only deviation is documented in the WARMDOWN with a follow-up story for Neon-side migration verification once the user has provisioned Neon. The codegen gate (DATA_MODEL.md §19 step 1) is still satisfied because the better-auth-on-Workers + Postgres + Neon-HTTP-driver combination is exercised against a real Postgres 15.12 — what the gate actually tests is the Workers runtime + better-auth + the `@neondatabase/serverless` driver, not which Postgres the driver points at.
- **Version pins (latest stable as of 2026-05-07):**
  - `@neondatabase/serverless@1.1.0` (new dep)
  - `drizzle-orm` catalog `^0.45.1` → `^0.45.2`
  - `drizzle-kit` catalog `^0.31.8` → `^0.31.10`
  - `better-auth` catalog **stays `1.5.5`** — DATA_MODEL.md §19 step 1 names this version explicitly. Bumping past an RFC-named pin requires an amendment; we have no reason to amend.
  - `@better-auth/cli@latest` resolves to 1.4.21 (not catalog-pinned; CLI is a build-time tool).
  - `@orpc/tanstack-query@1.14.2` (new dep, S0-05)
  - `@tanstack/react-query@5.100.9` (new dep, S0-05)
  - `@orpc/server`, `@orpc/openapi`, `@orpc/zod`, `@orpc/client` catalog `^1.13.14` → `^1.14.2` to match `@orpc/tanstack-query` (AMENDMENT-001 risk #3 mandates lockstep). Bumped in S0-05.
- **Package layout for `packages/platform`:** one `@kuralle/platform` package with subpath exports (`./interface`, `./memory`, `./cloudflare`, `./node`), per `HEXAGONAL_ARCHITECTURE.md §3`'s directory diagram. The "all four packages compile" line in S0-06 is read as "all four subpath exports type-check"; this matches the `SESSION_KICKOFF_PROMPT.md` project-layout note (`packages/{...,platform,...}` — single dir).
- **Project-specific gates added in this sprint** (these become CI obligations from S0 onward, enforced by gate + r1 + r2 going forward):
  1. OpenAPI drift gate (S0-04).
  2. Forbidden-import lint: no `@kuralle/api-client` outside `apps/web/src/hooks/api/**` (S0-05).
  3. Hexagonal-import lint: no `@kuralle/platform/cloudflare` or `@kuralle/platform/node` import in `core/`, `api/`, `db/`, `runtime/` (S0-06).

---

## 1. Stories

Six stories, executed sequentially in the order listed. Each story is a fresh `cursor` invocation that commits atomically before exiting (per `SESSION_KICKOFF_PROMPT.md` Phase A). Phase B (pi gate + r1 + r2) runs once after all six commits land.

### `S0-01` — Swap `packages/db` from D1/SQLite to Neon serverless Postgres

**Description:** Replace `drizzle-orm/d1` with `drizzle-orm/neon-http`. Switch dialect from `sqlite` to `postgresql`. Install `@neondatabase/serverless` and update the Drizzle config, the `apps/server/.env` schema, and `infra/alchemy.run.ts` (drop `D1Database`, bind `DATABASE_URL` as a secret). Bump catalog pins for `drizzle-orm` and `drizzle-kit` to current stable. **Sprint-local deviation:** no docker-compose; migrations run against the user's system Postgres at `localhost:5432`. Document the local-dev recipe in `apps/server/README.md`.

**Acceptance criteria** (numbered, in priority order):
1. `bun run check-types` is green workspace-wide.
2. `bun run db:generate` emits a Postgres migration (the placeholder one if no schema changes; just proves the dialect flip works).
3. With a `DATABASE_URL=postgres://localhost:5432/kuralle_dev` set and an empty `kuralle_dev` database created on the system Postgres, `bun run db:push` (or `drizzle-kit migrate`) succeeds against system Postgres without errors.
4. `infra/alchemy.run.ts` no longer references `D1Database`. `DATABASE_URL` is wired as a secret binding via `alchemy.secret.env.DATABASE_URL`.
5. `apps/server/.env.example` documents `DATABASE_URL` and removes any D1-specific binding.
6. `apps/server/README.md` documents the local-dev recipe (point at system Postgres on :5432, note that docker-compose is intentionally not used this sprint).
7. The `@libsql/client` and `libsql` catalog entries are removed (no other package uses them); `@kuralle/db` no longer depends on them.

**Files expected to be created or modified:**
- modify: `packages/db/package.json` (drop libsql deps, add `@neondatabase/serverless`, bump drizzle pins)
- modify: `packages/db/drizzle.config.ts` (dialect → `postgresql`, driver → `pg` for migrations against system Postgres; the runtime driver is `neon-http` per the schema imports)
- modify: `packages/db/src/index.ts` (use `drizzle-orm/neon-http` + `@neondatabase/serverless`, read `env.DATABASE_URL`)
- modify: `packages/infra/alchemy.run.ts` (drop `D1Database` import + binding, add `DATABASE_URL` secret binding)
- modify: `packages/env/env.d.ts` (no edits needed — types are inferred from `alchemy.run.ts`; verify type still flows)
- modify: `apps/server/.env.example` and any committed `.env` template
- modify: `package.json` workspace catalog (drop libsql, bump drizzle, add neon)
- modify: `apps/server/README.md` (local Postgres recipe)
- create: `sprints/sprint-0/artifacts/S0-01-migration-output.txt` — captured `db:generate` + `db:push` log

**Test fixtures the worker will add:** none (this is plumbing; behavioral coverage is in S0-03's sign-up E2E).

**Demo artifact:** `sprints/sprint-0/artifacts/S0-01-migration-output.txt` (asciinema-style log of `bun run db:generate` + `bun run db:push` against system Postgres, plus `psql -c '\dt'` showing the empty (or auth-only) tables).

---

### `S0-02` — Configure better-auth with `organization` + `apiKey` plugins

**Description:** Update `packages/auth/src/index.ts` to switch the drizzle adapter to `provider: 'pg'`, mount the `organization` and `apiKey` plugins, and configure `additionalFields` for the `+ext` columns specified in `DATA_MODEL.md §3`. Configure `access()` for the four-role ladder (owner / admin / member / viewer) per better-auth's organization-plugin API. Add a `databaseHooks.user.create.after` hook that creates a personal `organization` for the user with `isPersonal: true` and `createdByUserId = user.id`, and inserts the user as a `member` with `role='owner'`. Compose-ready for S0-03's regeneration.

**Acceptance criteria** (numbered, in priority order):
1. `packages/auth/src/index.ts` exports a configured better-auth instance with both plugins mounted.
2. `additionalFields` cover every `+ext` column from DATA_MODEL.md §3:
   - `user.systemRole` (`'user' | 'staff' | 'superadmin'`, default `'user'`), `user.lastSeenAt`
   - `organization.vertical`, `.environment`, `.region`, `.isPersonal`, `.createdByUserId`, `.complianceMode`, `.deletedAt`, `.updatedAt`
   - `member.invitedBy`, `member.lastActiveAt`
   - `apikey.organizationId`, `apikey.revokedAt`
3. The four-role ladder is configurable: `owner` > `admin` > `member` > `viewer`. Use better-auth's `access` API; document any role-permission map needed.
4. The `user.created` hook auto-creates `organization{ isPersonal: true, createdByUserId: user.id, name: '<email>\'s personal workspace', slug: <generated> }` and a `member{ role: 'owner' }` record.
5. `bun run check-types` is green.
6. Trusted origins, cookie config, secret, baseURL all preserved from current `packages/auth/src/index.ts`.

**Files expected to be created or modified:**
- modify: `packages/auth/src/index.ts` (full rewrite of the plugin block)
- create: `packages/auth/better-auth.config.ts` — a CLI-config file that re-exports the same `betterAuth(...)` instance from `src/index.ts` (so S0-03 can run `npx @better-auth/cli generate --config ./better-auth.config.ts`)
- modify: `packages/auth/package.json` if a peer dep is missing
- create: `sprints/sprint-0/artifacts/S0-02-auth-config.md` — short note showing the resolved `auth.api.organization.access()` for each of the four roles (proves the ladder compiles).

**Test fixtures the worker will add:** none yet (the regenerated schema in S0-03 makes runtime tests possible).

**Demo artifact:** `S0-02-auth-config.md` — markdown showing `additionalFields` shape and the four-role permission resolution for one operation (e.g., `auth.api.organization.access()` for an `owner` vs `viewer` invoking `member.invite`).

---

### `S0-03` — Regenerate auth schema + initial migration + sign-up E2E (CODEGEN GATE)

**Description:** Delete the hand-authored `packages/db/src/schema/auth.ts` and regenerate it from better-auth's CLI (`npx @better-auth/cli@latest generate --config ./better-auth.config.ts --output packages/db/src/schema/auth.ts`). Run `drizzle-kit generate` to produce the initial migration. Apply via `drizzle-kit migrate` against the local system Postgres. Verify the eight tables exist with the `+ext` columns. **This is the codegen gate per `DATA_MODEL.md §19 step 1`** — if better-auth + Workers + the Neon HTTP driver combination fails sign-up, this story stops and surfaces the blocker.

**Acceptance criteria** (numbered, in priority order):
1. `packages/db/src/schema/auth.ts` is replaced by CLI-generated output. The file header carries the `@better-auth/cli` generation marker.
2. The eight better-auth tables exist in the local Postgres after migrate: `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey`.
3. Each `+ext` column listed in S0-02 acceptance criterion 2 exists on its table with the correct Postgres type.
4. The initial migration file is committed under `packages/db/src/migrations/`.
5. **Sign-up E2E:** with `wrangler dev` of `apps/server` running and `apps/web` running locally (existing A1 sign-in flow), creating a user via the sign-up endpoint succeeds end-to-end. Verify in `psql`:
   - one new `user` row,
   - one new `organization` row with `isPersonal=true`, `createdByUserId=<user.id>`,
   - one new `member` row linking the user as `role='owner'`,
   - the resulting `session.activeOrganizationId` is set to the personal organization's id.
6. The S0-03 artifact captures: (a) `psql -c '\dt'` showing all eight tables, (b) a screen recording (or asciinema) of the sign-up flow, (c) a `psql` query dump of the four rows above.
7. If the sign-up E2E fails on Workers + Neon-HTTP + better-auth, **stop and flag**. Codegen is paused per DATA_MODEL.md §19 step 1; do not proceed to S0-04+.

**Files expected to be created or modified:**
- delete: `packages/db/src/schema/auth.ts` (replaced by CLI output)
- create: `packages/db/src/schema/auth.ts` (CLI-generated)
- create: `packages/db/src/migrations/0000_<auto-named>.sql`
- create: `packages/db/src/migrations/meta/_journal.json` and the snapshot
- create: `sprints/sprint-0/artifacts/S0-03-tables.txt` (psql `\dt` output)
- create: `sprints/sprint-0/artifacts/S0-03-signup.{cast,mp4}` (recording)
- create: `sprints/sprint-0/artifacts/S0-03-rows.txt` (psql row dump after sign-up)

**Test fixtures the worker will add:**
- a one-shot e2e script in `scripts/sprint-0/signup-smoke.ts` that performs the sign-up via the live API and asserts the four expected rows. The script's output goes into `S0-03-rows.txt`.

**Demo artifact:** `S0-03-signup.{cast,mp4}` — a 30-second screencast of the sign-up flow.

---

### `S0-04` — Lock OpenAPI emission + drift CI

**Description:** Confirm `apps/server` already serves the OpenAPI spec via `@orpc/openapi/fetch` + `OpenAPIReferencePlugin`. Identify the served URL (currently mounted under `/api-reference`; the plugin defaults need to be inspected). Add a `bun -F server gen:openapi` script that boots `wrangler dev`, fetches the spec, writes it to `apps/server/openapi.json`, and exits. Add a CI step that re-runs the script and `git diff --exit-code apps/server/openapi.json` — fail on drift. Document the rule in `apps/server/README.md`. Verify the gate fires on a deliberate router edit.

**Acceptance criteria** (numbered, in priority order):
1. `apps/server/openapi.json` is committed and matches what the running server emits at the spec URL.
2. `bun -F server gen:openapi` script exists, is idempotent, and exits non-zero only on real failure (server not reachable, spec not parseable). On success it writes `apps/server/openapi.json` deterministically (sorted keys or stable ordering).
3. CI step re-runs the script and `git diff --exit-code apps/server/openapi.json`; the script also accepts a `--check` flag that does the same locally for fast pre-commit feedback.
4. The artifact `sprints/sprint-0/artifacts/S0-04-drift-ci.txt` captures: (a) one CI run that passes, (b) one CI run on a throwaway branch where a router was edited (e.g., adding `helloWorld: publicProcedure.handler(() => 'hi')`) without regenerating the spec — the run **fails** with a clear `git diff --exit-code` error.
5. `apps/server/README.md` documents the rule: every PR that adds or changes a router commits the regenerated spec.
6. `bun run check-types` is green workspace-wide.

**Files expected to be created or modified:**
- modify: `apps/server/package.json` — add `gen:openapi` script
- create: `apps/server/scripts/gen-openapi.ts` — the script (boots wrangler dev or uses a programmatic spec extractor; if a programmatic API exists on `OpenAPIHandler`, prefer it over a live HTTP fetch)
- create: `apps/server/openapi.json` — the committed spec
- create: `.github/workflows/openapi-drift.yml` (or equivalent — extend `turbo.json` if there is no existing CI workflow file in this repo; check first; if no GH Actions infra exists yet, create the file)
- modify: `apps/server/README.md`
- modify: `turbo.json` if needed to wire the script into `turbo build` / `turbo check-types` outputs
- create: `sprints/sprint-0/artifacts/S0-04-drift-ci.txt`

**Test fixtures the worker will add:** the deliberate-drift demonstration is in the artifact; not a permanent test file.

**Demo artifact:** `S0-04-drift-ci.txt` (CI logs for both runs).

---

### `S0-05` — Scaffold `packages/api-client` + hook wrappers + forbidden-import lint

**Description:** Per `AMENDMENT-001`, scaffold a thin `@kuralle/api-client` package that wraps `@orpc/tanstack-query`. Export the typed `client` (built from `RouterClient<typeof appRouter>`) and the `$api` utils factory. In `apps/web`, add `<ApiProvider>` initializing the TanStack Query client + base URL + `credentials: 'include'`. Add `apps/web/src/hooks/api/health.ts` exporting `useHealthCheck()` wrapping `$api.healthCheck.queryOptions()`, and replace one mock-driven status indicator on B1 home with the live hook. Add an ESLint `no-restricted-imports` rule forbidding `@kuralle/api-client` imports outside `apps/web/src/hooks/api/**`. **Bump `@orpc/server`, `@orpc/openapi`, `@orpc/zod`, `@orpc/client` catalog pins to `^1.14.2`** (lockstep with `@orpc/tanstack-query@1.14.2`).

**Acceptance criteria** (numbered, in priority order):
1. New package `packages/api-client` with `package.json` (name `@kuralle/api-client`), `tsconfig.json`, and `src/index.ts`. Exports: `createClient(opts)`, `$api` factory, and the inferred `AppRouterClient` type re-exported from `@kuralle/api`.
2. End-to-end type flow: B1's `useHealthCheck()` returns a typed `string` (the literal `'OK'` or its widened type per the router). Verified by deliberately breaking a Zod refinement on `healthCheck` (or another router output) and observing the hook fail type-check; revert the deliberate break and capture the recording.
3. `<ApiProvider>` mounted at the apps/web root. Base URL points at the same origin as the server (configurable via `VITE_SERVER_URL`).
4. B1 home shows the live `useHealthCheck()` hook ticking (auto-refetch every 30s or on-mount; not gated behind login since it's a public procedure).
5. ESLint rule (`no-restricted-imports`) forbids `@kuralle/api-client` imports outside `apps/web/src/hooks/api/**`. Verified by adding a deliberate violation in `apps/web/src/components/some-test-file.tsx` and seeing CI fail; revert.
6. Hook-wrapper pattern documented in `apps/web/README.md` with one good example (a hook in `hooks/api/health.ts`) and one rejected example (a component importing the client directly — flagged by ESLint).
7. `bun run check-types` green workspace-wide. Catalog `@orpc/*` family bumped to `^1.14.2` in lockstep.

**Files expected to be created or modified:**
- create: `packages/api-client/package.json`, `tsconfig.json`, `src/index.ts`, `README.md`
- modify: `package.json` (add api-client to workspaces if needed; bump catalog `@orpc/*` to `^1.14.2`; add `@orpc/tanstack-query: ^1.14.2`, `@tanstack/react-query: ^5.100.9` to catalog)
- modify: `apps/web/package.json` (add `@kuralle/api-client`, `@tanstack/react-query`)
- create: `apps/web/src/hooks/api/health.ts`
- create: `apps/web/src/providers/api-provider.tsx` (or wherever apps/web's provider tree lives)
- modify: `apps/web/src/main.tsx` or `App.tsx` to mount `<ApiProvider>`
- modify: one component on B1 home (find via grep for the existing mock health indicator)
- create: `.eslintrc.{cjs,json}` or extend the existing one with the `no-restricted-imports` rule (find existing eslint config first; if none, create at root and document)
- modify: `apps/web/README.md`
- create: `sprints/sprint-0/artifacts/S0-05-type-flow.{png,cast}` (recording of the deliberate Zod break + revert)
- create: `sprints/sprint-0/artifacts/S0-05-lint-violation.txt` (CI log of the deliberate forbidden-import violation + revert)

**Test fixtures the worker will add:**
- a unit test for `useHealthCheck` in `apps/web/src/hooks/api/health.test.tsx` — happy path against a mocked oRPC client; one failure-path test (server returns 500 → hook surfaces error). Use `@testing-library/react` + the existing test infra.

**Demo artifact:** `S0-05-type-flow.cast` + `S0-05-lint-violation.txt`.

---

### `S0-06` — Eight platform ports + memory adapter + hexagonal-import lint

**Description:** Create one `@kuralle/platform` package containing all eight ports verbatim from `HEXAGONAL_ARCHITECTURE.md §2` and the `RuntimePlatform` synthesis from `INTERFACE_DESIGNS_RuntimeHost.md §5`. Subpath exports: `./interface`, `./memory`, `./cloudflare`, `./node`. Build a Map-backed memory adapter for every port. Stub the cloudflare and node adapters (`createCloudflareBindings()` / `createNodeBindings()` returning all eight ports; implementations may throw `not-implemented` in S0; types must be honest). Add an ESLint `no-restricted-imports` rule forbidding `@kuralle/platform/cloudflare` or `@kuralle/platform/node` imports inside `packages/{core,api,db,runtime}/**`. CI runs `bun run check-types` against all four subpaths.

**Acceptance criteria** (numbered, in priority order):
1. `packages/platform/src/interface.ts` defines all eight ports verbatim from HEXAGONAL §2: `KvStore`, `BlobStore`, `MessageQueue`, `RuntimePlatform` (with `voice: VoiceRuntimeHost`, `messaging: MessagingRuntimeHost`, `diagnostics: RuntimePlatformDiagnostics`), `SessionStore` (re-export from `@ariaflowagents/core` if installable; else a typed `unknown`-shaped placeholder with a TODO that S0-06 cannot resolve until aria-flow is installed in S2), `AuthAdapter`, `ActorHost`, `LlmGateway`. Plus the `RuntimeFailure` discriminated union from `INTERFACE_DESIGNS_RuntimeHost.md §5`.
2. `packages/platform/src/memory/` Map-backed implementations of all eight ports. The memory `RuntimeHost.messaging` follows `INTERFACE_DESIGNS_RuntimeHost.md §A.2(d)` (~28 LOC).
3. `packages/platform/src/cloudflare/index.ts` exports `createCloudflareBindings(): RuntimePlatform & { kvStore, blobStore, messageQueue, sessionStore, authAdapter, actorHost, llmGateway }` (or equivalent shape) — each method may `throw new Error('not-implemented')` in S0; types must be honest (the return shape is the same as memory; the throws are runtime, not types).
4. `packages/platform/src/node/index.ts` exports `createNodeBindings()` similarly stubbed.
5. Subpath exports configured in `packages/platform/package.json`:
   - `"./interface": "./src/interface.ts"`
   - `"./memory": "./src/memory/index.ts"`
   - `"./cloudflare": "./src/cloudflare/index.ts"`
   - `"./node": "./src/node/index.ts"`
6. **One-shot port-contract test in `packages/platform/src/memory/contract.test.ts`** exercising every port through its public contract against the memory adapter. Each port has at least one happy-path and one failure-path assertion. Tests pass.
7. `bun run check-types` green workspace-wide. The `check-types` task in `turbo.json` covers the new package.
8. ESLint rule forbids `@kuralle/platform/cloudflare` and `@kuralle/platform/node` imports in `packages/{core,api,db,runtime}/**`. Note: `packages/{core,runtime}` don't exist yet at sprint-0 close; the rule is configured to apply when they do. Verified by a deliberate violation in `packages/api/src/index.ts` (where `core/` would otherwise live in spirit) — CI fails; revert. Captured in `sprints/sprint-0/artifacts/S0-06-lint-violation.txt`.

**Files expected to be created or modified:**
- create: `packages/platform/package.json`, `tsconfig.json`, `README.md`
- create: `packages/platform/src/interface.ts`
- create: `packages/platform/src/memory/{kv-store,blob-store,message-queue,runtime-host,session-store,auth-adapter,actor-host,llm-gateway,index}.ts`
- create: `packages/platform/src/memory/contract.test.ts`
- create: `packages/platform/src/cloudflare/{kv-store,blob-store,message-queue,runtime-host,session-store,auth-adapter,actor-host,llm-gateway,index}.ts` (stubs)
- create: `packages/platform/src/node/{kv-store,blob-store,message-queue,runtime-host,session-store,auth-adapter,actor-host,llm-gateway,index}.ts` (stubs)
- modify: `package.json` (workspaces — `packages/platform` already covered by `packages/*` glob, but verify)
- modify: `.eslintrc.{cjs,json}` (extend the rule from S0-05; a separate restricted-zone for hexagonal imports)
- modify: `turbo.json` if `check-types` does not already discover the new package
- create: `sprints/sprint-0/artifacts/S0-06-lint-violation.txt`
- create: `sprints/sprint-0/artifacts/S0-06-contract-test.txt` (test runner output)

**Test fixtures the worker will add:** the one-shot contract test in `packages/platform/src/memory/contract.test.ts`.

**Demo artifact:** `S0-06-contract-test.txt` + `S0-06-lint-violation.txt`.

---

## 2. Universal DoD checklist (per story)

Copy this checklist into every story brief. The story is not closed until every box is ticked.

- [ ] Story commits atomically with `[S0-{nn}] {short title}`.
- [ ] `bun run check-types` green workspace-wide after the commit.
- [ ] Behavioral coverage: every public surface added in the story has at least one happy-path and one failure-path test, **except** plumbing-only stories (S0-01) where behavioral coverage lives downstream (S0-03).
- [ ] No `--no-verify`, no `@ts-ignore`, no `try/catch: pass`, no silent skip of a hook.
- [ ] Public TypeScript surfaces match the source RFCs (DATA_MODEL.md, HEXAGONAL_ARCHITECTURE.md, INTERFACE_DESIGNS_RuntimeHost.md). Diffs require an explicit RFC amendment in the same sprint.
- [ ] Demo artifact present at `sprints/sprint-0/artifacts/{story}.{ext}`.
- [ ] Package README updated for any user-visible change.
- [ ] PR-equivalent (the commit body) summarizes the diff and the trade-offs accepted.

---

## 3. Test plan

| Story | Layer | Test type | Fixtures |
|-------|-------|-----------|----------|
| S0-01 | plumbing | manual: `db:generate` + `db:push` against system Postgres | system Postgres on :5432, empty `kuralle_dev` db |
| S0-02 | unit (deferred to S0-03) | type-check that better-auth config compiles with all `+ext` fields | n/a in S0-02 alone |
| S0-03 | E2E | sign-up against `wrangler dev` + system Postgres; `psql` row dump | system Postgres + better-auth-generated schema |
| S0-04 | CI | drift gate test (passing run + deliberate-edit failing run) | a throwaway router edit |
| S0-05 | unit | `useHealthCheck` happy + failure path; ESLint forbidden-import gate | mocked oRPC client; throwaway component import |
| S0-06 | unit | port-contract test against the memory adapter (every port, happy + failure) | Map-backed state |
| S0-06 | CI | hexagonal-import lint on a deliberate violation | throwaway import in `packages/api` |

What we will NOT test in this sprint, and why each is safe:
- **Cloudflare and Node adapter implementations beyond stubs.** They throw `not-implemented`. Domain code never reaches them in S0; memory adapter is the test seam (HEXAGONAL §6 rule 3). Real CF/Node implementations land sprint-by-sprint as ports are exercised.
- **Neon-side migrations.** Sprint-local deviation (see §0). Captured as a follow-up in WARMDOWN.
- **AriaFlow `SessionStore` wiring.** Aria-flow isn't installed yet (lands S2-S3). The port re-exports a stub or a typed alias; runtime tests of `SessionStore` defer until aria-flow is on the dependency graph.
- **RLS, compliance evaluator, audit-log archive.** Deferred to S5 per `DATA_MODEL.md §3` and the WBS roadmap.
- **`useConversationLive` streaming.** No conversation channel in S0; defers to S3.

---

## 4. Demo plan

A single 90-second screen recording captured at sprint warm-down stitching together:

1. `psql -c '\dt'` showing the eight better-auth tables (S0-03).
2. The sign-up flow (apps/web → better-auth on wrangler dev → system Postgres) producing a user + personal organization + member row (S0-03).
3. B1 home showing the live `useHealthCheck()` hook ticking (S0-05).
4. `apps/server/openapi.json` open in a side pane (S0-04).
5. `bun run check-types` green for all packages incl. `@kuralle/platform` (S0-06).
6. A deliberate ESLint violation triggering CI failure (S0-05 + S0-06 gates).

Persona: **Workspace Admin** — trust moment "the foundation is real, not vaporware." Captured at `sprints/sprint-0/artifacts/sprint-0-demo.{mp4,cast}`.

---

## 5. Risks specific to this sprint

| Risk | Detection signal | Mitigation |
|------|------------------|------------|
| Better-auth 1.5.5 + Workers + `@neondatabase/serverless` 1.1.0 combination subtly broken (cookies, `crossSubDomainCookies`, `node_compat`) | S0-03 sign-up E2E fails | Hono + better-auth-on-Cloudflare recipe exists; if it fails we **stop and flag**. Codegen is paused per DATA_MODEL.md §19 step 1. |
| OpenAPI `gen:openapi` script is fragile if it has to boot `wrangler dev` from inside a script | S0-04 script flakes | Prefer the programmatic `OpenAPIHandler` API to extract the spec; only fall back to live HTTP fetch if no programmatic seam exists. |
| ESLint forbidden-import rule pattern misses package-aliased imports | Deliberate-violation test in S0-05 / S0-06 doesn't catch all forms | r1 review checks the rule pattern by hand; gate verifies via deliberate violations in multiple file locations. |
| `@orpc/*` family bumps (1.13 → 1.14) introduce a breaking change in the OpenAPI spec output | `apps/server/openapi.json` diff in S0-05 commit | Bump in lockstep with `@orpc/tanstack-query`; review diff; revert + amend if breaking. |
| Sprint-local deviation (no docker-compose, no Neon target) leaks into later sprints' assumptions | Audit during r1 / r2 | WARMDOWN flags this explicitly and adds a follow-up backlog item; HANDOFF tells S1 the local-dev recipe is system-Postgres. |
| `packages/platform` subpath exports vs separate-packages: linter / TS resolution differs from intent | Type-check fails or imports resolve unexpectedly | `r1` checks subpath resolution with `tsc --traceResolution` if anything looks off; failing that, split into separate packages in a follow-up (cheap). |

---

## 6. Open questions

- None at sprint-plan time. Pre-flight Q (Neon access) was answered by the user (system Postgres only, no docker). All other questions are deferred to in-story discovery via cursor; if cursor finds an ambiguity it stops and surfaces — not guesses.

---

## 7. Execution order (Phase A)

Sequential, one cursor invocation per story:

1. S0-01 (Postgres plumbing — no behavioral surface)
2. S0-02 (better-auth config — wired but un-codegenerated)
3. S0-03 (codegen + sign-up E2E — **the gate**; if this fails, stop)
4. S0-04 (OpenAPI drift CI)
5. S0-05 (api-client + hooks + forbidden-import lint)
6. S0-06 (platform ports + memory adapter + hexagonal-import lint)

Phase B (gate + r1 + r2 + manager fix pass) runs once after all six commits land.
