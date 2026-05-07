# Story Brief — `S0-05` Scaffold `@kuralle/api-client` + hook wrappers + forbidden-import lint

> **You are the IC engineer (`pi` worker, deepseek-v4-pro — fresh process; clean context window) with no prior context.** This brief is self-contained.
>
> **Atomic-commit policy:** when you finish, commit atomically with `[S0-05] @kuralle/api-client + tanstack-query hooks + forbidden-import lint`. Do NOT push.

---

## 1. Goal

Per `sprints/AMENDMENT-001.md`: scaffold a thin `@kuralle/api-client` package wrapping `@orpc/tanstack-query`. Export a typed `client` (built from `RouterClient<typeof appRouter>`) and the `$api` utils factory. In `apps/web`, mount `<ApiProvider>` initializing TanStack Query + base URL + `credentials: 'include'`. Add `apps/web/src/hooks/api/health.ts` exporting `useHealthCheck()` wrapping `$api.healthCheck.queryOptions()`. **Add a small live system-health indicator to B1 home** (the existing route doesn't have one to replace; you add a new one). Add an ESLint `no-restricted-imports` rule forbidding `@kuralle/api-client` imports outside `apps/web/src/hooks/api/**`. **Bump the `@orpc/*` family in catalog from `^1.13.14` to `^1.14.2` in lockstep with the new `@orpc/tanstack-query@1.14.2`** — and **regenerate `apps/server/openapi.json`** (S0-04 lands the gate; this story's commit must keep the gate green).

---

## 2. Required reading (in this order)

1. `sprints/STATE.md`
2. `sprints/sprint-0/PLAN.md` — pre-flight notes + `S0-05` section
3. `sprints/WBS.md` § Sprint 0, story `S0-05`
4. `sprints/AMENDMENT-001.md` — the full rationale for `@orpc/tanstack-query` over `openapi-fetch`
5. oRPC TanStack Query integration: <https://orpc.dev/docs/integrations/tanstack-query>
6. oRPC client docs: <https://orpc.dev/docs/client/server-side>
7. `packages/api/src/routers/index.ts` — exports `AppRouter` and `AppRouterClient` types
8. `apps/server/src/index.ts` — RPC handler is mounted at `/rpc` (note: `apiHandler.handle(..., { prefix: "/api-reference" })` is OpenAPI; **the oRPC client uses `/rpc` as the base, not `/api-reference`**)
9. `apps/web/src/main.tsx` (or `App.tsx`) — find the existing provider tree and where to mount `<ApiProvider>`
10. `apps/web/src/routes/_app.home.tsx` — the B1 home route. **Note: the route does not currently have a system-health pill (StatusPill is used for table cells only). You will ADD a small "API: live | down" indicator using `useHealthCheck()`.**
11. `package.json` (repo root) — workspace catalog
12. `apps/web/package.json` — current deps; verify if `@tanstack/react-query` is already present (it shouldn't be)
13. `apps/server/openapi.json` — the committed spec (lands in S0-04)

---

## 3. Files you will create or modify

**Create:**
- `packages/api-client/package.json` — name `@kuralle/api-client`. Deps: `@orpc/client: catalog:`, `@orpc/tanstack-query: catalog:`, `@kuralle/api: workspace:*`, `@tanstack/react-query: catalog:`. Type `module`. Exports: `.` → `./src/index.ts`.
- `packages/api-client/tsconfig.json` — extends `@kuralle/config/tsconfig.base.json`, mirror `packages/api/tsconfig.json`.
- `packages/api-client/src/index.ts` — exports:
  - `createClient(opts: { baseUrl: string }): AppRouterClient` — uses `@orpc/client/fetch` (or whichever oRPC fetch link factory is current at 1.14.2) with `credentials: 'include'`.
  - `createApi(client: AppRouterClient)` — returns the `$api` utils (using `createTanstackQueryUtils` from `@orpc/tanstack-query` per the docs).
  - `export type { AppRouter, AppRouterClient } from '@kuralle/api/routers/index';`
  - The package is **just a thin re-export layer**; no business logic.
- `packages/api-client/README.md` — short readme: what the package does, the AMENDMENT-001 reference, the rule that components don't import this directly.
- `apps/web/src/providers/api-provider.tsx` — exports `<ApiProvider>` mounting `QueryClientProvider`, creating the `client` via `createClient({ baseUrl: import.meta.env.VITE_SERVER_URL + '/rpc' })`, providing the `client` + `$api` utils via React context (or a simple module-level singleton — your call; document the choice).
- `apps/web/src/hooks/api/health.ts` — exports `useHealthCheck()` that wraps `$api.healthCheck.queryOptions()` and returns the `useQuery` result. Refetch every 30 s; not gated by auth (it's a `publicProcedure`).
- `apps/web/src/hooks/api/health.test.tsx` — happy-path + failure-path test using `@testing-library/react` and a mocked oRPC client.
- `sprints/sprint-0/artifacts/S0-05-type-flow.{cast,png}` — recording of the deliberate Zod break + revert (see acceptance criterion 2). 30 s max.
- `sprints/sprint-0/artifacts/S0-05-lint-violation.txt` — captured `bun run lint` (or `eslint .`) output showing the deliberate forbidden-import violation triggering an error; followed by clean output after revert. Plain text.

**Modify:**
- `package.json` (repo root) — workspace catalog edits:
  - Bump `@orpc/server` from `^1.13.14` → `^1.14.2`
  - Bump `@orpc/openapi` from `^1.13.14` → `^1.14.2`
  - Bump `@orpc/zod` from `^1.13.14` → `^1.14.2`
  - Bump `@orpc/client` from `^1.13.14` → `^1.14.2`
  - Add `@orpc/tanstack-query: ^1.14.2`
  - Add `@tanstack/react-query: ^5.100.9`
  - Workspaces glob `packages/*` already covers `packages/api-client/`.
- `apps/web/package.json` — add `@kuralle/api-client: workspace:*`, `@tanstack/react-query: catalog:` deps.
- `apps/web/src/main.tsx` (or wherever the provider tree is rooted) — mount `<ApiProvider>` outermost or just inside React's strict mode. Surgical edit.
- `apps/web/src/routes/_app.home.tsx` — add a small system-health indicator near the top of the route (a 1-line pill using the existing `StatusPill` component or equivalent), driven by `useHealthCheck()`. When the hook returns `'OK'` show `tone="live"`, on error show `tone="error"`, while loading show `tone="muted"`. Surgical edit; do not refactor anything else.
- `apps/web/.env.example` (or `apps/web/.env.local.example` if that's the convention used) — document `VITE_SERVER_URL=http://localhost:3000` if not already there.
- `apps/web/README.md` — add a "Frontend API access pattern" section documenting the hook-wrapper rule with one good example (a hook in `hooks/api/health.ts`) and one rejected example (a component importing the client directly — flagged by ESLint).
- `eslint.config.{js,mjs,ts}` — see "ESLint config" below.
- `apps/server/openapi.json` — re-run `bun -F server gen:openapi` after the `@orpc/*` family bump and commit any diff. The commit must keep the S0-04 drift gate green.

**ESLint config:**
- This sprint introduces lint for the first time (no existing eslint config — confirmed by the manager's pre-flight grep for `.eslintrc*` / `eslint.config*` returning empty).
- Create `eslint.config.mjs` at repo root using the modern flat-config format. Pin `eslint@^9.x` (latest stable; check `bun pm view eslint version` and pin) plus `typescript-eslint@^8.x` and `@typescript-eslint/parser`.
- Add a `no-restricted-imports` rule scoped to `apps/web/src/**/*` that forbids importing `@kuralle/api-client` from anything **other than** `apps/web/src/hooks/api/**`. The override (allow inside `hooks/api/`) is expressed via flat-config's `files: ['apps/web/src/hooks/api/**/*.{ts,tsx}']` block that omits the rule.
- Add a workspace-level `lint` script in `package.json`: `"lint": "eslint ."`. Wire into `turbo.json` `lint` task if needed.
- The S0-06 story will extend this config with the hexagonal-import rule. Keep the file structure reusable.

**Do not touch:**
- `packages/api/src/routers/index.ts` — the routers stay as they are. The whole point is to consume them.
- `packages/auth/**` (S0-02 / S0-03 territory).
- `packages/db/**` (S0-01 / S0-03 territory).
- `apps/server/src/index.ts` — no change needed for this story (RPC handler is already mounted at `/rpc`).
- The 16+ TS-error fixes from S0-01's commit in `apps/web/src/routes/**` — those are settled.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`packages/api-client` package compiles** under `bun -F @kuralle/api-client check-types` (extending the workspace `check-types` task is fine; just ensure the package is included).
2. **End-to-end type flow:** B1's `useHealthCheck()` returns the typed hook result. **Verification:** in a separate workflow (do NOT commit this part), temporarily break a Zod refinement on a router output (e.g., add `.refine((s) => s.length > 100)` somewhere in `appRouter.healthCheck`'s implied output type — or, if `healthCheck` is a string return, modify it to return a Zod-validated object and break a refinement); observe the hook fail type-check; revert. Capture the type-check error output in `sprints/sprint-0/artifacts/S0-05-type-flow.cast` (asciinema) or screenshot. The deliberate break is **not** committed.
3. **`<ApiProvider>` is mounted** in `apps/web` at the root of the provider tree. The query client uses sensible defaults (1 min stale time for queries; `refetchOnWindowFocus: true`).
4. **B1 home shows the live `useHealthCheck()` pill.** Manually verifiable: `bun -F server dev` + `bun -F web dev:bare`, navigate to `/home`, see the pill ticking.
5. **ESLint `no-restricted-imports` rule** forbids `@kuralle/api-client` imports outside `apps/web/src/hooks/api/**`. Verified by:
   - Adding `import { createClient } from '@kuralle/api-client'` in `apps/web/src/components/__lint-test__.tsx` (a temp file)
   - Running `bun run lint` and observing the error
   - Removing the temp file
   - Re-running and observing zero errors
   - Captured in `sprints/sprint-0/artifacts/S0-05-lint-violation.txt`.
6. **Hook-wrapper pattern documented** in `apps/web/README.md` with one good and one rejected example.
7. **`@orpc/*` family bumped to `^1.14.2`** in catalog. `bun install` clean. `apps/server/openapi.json` regenerated and committed (the S0-04 `--check` mode passes).
8. **`bun run check-types` green workspace-wide.**
9. **`bun -F web test`** passes (existing 34 tests + the new `health.test.tsx` happy + failure path). Failure modes: server returns 500 → hook surfaces `error`; client constructed with no base URL → throws at construction or at first call (your choice; document).
10. **No `--no-verify`, no `@ts-ignore`, no silent catch.**

---

## 5. Definition of Done (universal)

- [ ] Atomic commit `[S0-05] @kuralle/api-client + tanstack-query hooks + forbidden-import lint`.
- [ ] `bun run check-types` green workspace-wide.
- [ ] `bun run lint` green (after the deliberate violation is reverted).
- [ ] `bun -F web test` green (35+ tests now).
- [ ] `bun -F server gen:openapi --check` exits 0 (S0-04 drift gate).
- [ ] Artifact present: `S0-05-type-flow.{cast,png}` and `S0-05-lint-violation.txt`.

---

## 6. What NOT to do

- Do not import the oRPC client from anywhere in `apps/web/src/**` other than `apps/web/src/providers/api-provider.tsx` and `apps/web/src/hooks/api/**`.
- Do not modify `packages/api/src/routers/**`. The router shape stays.
- Do not introduce a `schema.d.ts` file (per AMENDMENT-001, no `openapi-typescript`).
- Do not change anything under `packages/auth`, `packages/db`, `packages/platform`, `infra/`.
- Do not bump `@orpc/*` past `^1.14.2` without an amendment.
- Do not skip the deliberate-violation captures.
- Do not add tests for components that don't exist; only test the hook surface.

---

## 7. Demo artifact

`sprints/sprint-0/artifacts/S0-05-type-flow.{cast,png}` (deliberate-Zod-break flow) + `S0-05-lint-violation.txt` (deliberate forbidden-import flow).

---

## 8. How to report back

Commit body:
- DoD checklist.
- Files changed.
- The exact `@orpc/tanstack-query` API used (`createTanstackQueryUtils` or whichever).
- The ESLint config approach (flat config, `files` overrides, etc.).
- Any package-version drifts.
- One paragraph "considered but didn't do" — e.g., "considered using TanStack Query's `Hydrate` for SSR; deferred since apps/web is SPA-only today."

---

## 9. If you get stuck

- If `@orpc/tanstack-query@1.14.2`'s API differs from the docs (the docs may track latest), read `node_modules/@orpc/tanstack-query/dist/...` directly. **Do not guess.**
- If the `<ApiProvider>` mount conflicts with TanStack Router (the existing router is TanStack Router file-based), follow TanStack's documented integration pattern: query client in `routerContext`, provider outermost. If unclear, the simpler pattern (`<QueryClientProvider><RouterProvider /></QueryClientProvider>`) is fine for S0; SSR concerns defer to later.
- If the ESLint flat config is alien (the repo has no prior ESLint usage), follow <https://eslint.org/docs/latest/use/configure/configuration-files> for the format. Pin exact versions of `eslint`, `typescript-eslint`, `@typescript-eslint/parser` and document them in the commit body.
- If `bun -F server gen:openapi` (post-S0-04) writes a different `openapi.json` after the `@orpc/*` bump, **inspect the diff**. If it's purely metadata (`x-orpc-version`, etc.), commit it. If it changes `paths`/`schemas` shape, that's an unintended widening — surface in the commit body and tag it for r1 review.
- If a new peer-dep warning appears (e.g., `@tanstack/react-query` requires a different React version), document the warning; do not silently downgrade React.

You are the IC. Sincere work is the only kind we ship.
