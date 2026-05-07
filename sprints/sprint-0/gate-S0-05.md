# Spec + Code-Quality Gate — `S0-05` api-client + hooks + forbidden-import lint

> Gate worker: pi / kimi-k2.6. IC worker: pi / deepseek-v4-pro.  
> Manager pre-fix applied: `apps/web` tsconfig (`@cloudflare/workers-types` in `types`) + `apps/web/package.json` devDep (`@cloudflare/workers-types`: `catalog:`).  
> Verdict: **green**.

---

## 1. Spec adherence

| AC | Criterion | Evidence | Status |
|---|---|---|---|
| #1 | `packages/api-client` compiles | `packages/api-client/package.json` name is `@kuralle/api-client`; deps are `@kuralle/api: workspace:*`, `@orpc/client: catalog:`, `@orpc/tanstack-query: catalog:`, `@tanstack/react-query: catalog:`; exports `createClient()`, `createApi()`, and re-exports `AppRouter`, `AppRouterClient`; `tsc -b` green under turbo | ✅ |
| #2 | End-to-end type flow | `sprints/sprint-0/artifacts/S0-05-type-flow-output.txt` shows deliberate router return-type break (`"OK"` → `"OK_V2"`) caught by `tsc` and propagated through the hook; `bun -F server gen:openapi --check` exits 0 | ✅ |
| #3 | `<ApiProvider>` mounted | `apps/web/src/main.tsx` wraps `<RouterProvider>` with `<ApiProvider>`; query client uses `staleTime: 60_000` and `refetchOnWindowFocus: true`; base URL is `import.meta.env.VITE_SERVER_URL + '/rpc'`; `credentials: 'include'` passed in `RPCLink` fetch wrapper | ✅ |
| #4 | B1 home shows live `useHealthCheck()` pill | `apps/web/src/routes/_app.home.tsx` consumes `useHealthCheck()` and renders `<StatusPill>` mapping `isLoading → "neutral"`, `isError → "danger"`, success → `"live"` (the brief listed `"muted"`/`"error"` but those are not valid `StatusPillTone` values; the implementation uses the correct component API) | ✅ |
| #5 | ESLint `no-restricted-imports` | `eslint.config.mjs` forbids `@kuralle/api-client` in `apps/web/src/**/*.{ts,tsx}`; override blocks for `apps/web/src/hooks/api/**` and `apps/web/src/providers/api-provider.tsx` correctly turn the rule off; `S0-05-lint-violation.txt` shows deliberate violation → error, revert → clean | ✅ |
| #6 | Hook-wrapper pattern documented | `apps/web/README.md` § "Frontend API access pattern" contains one good example (`hooks/api/health.ts`) and one rejected example (direct client import in a component) | ✅ |
| #7 | `bun run check-types` green workspace-wide | Ran against working tree (manager fix included): **5 successful, 0 failed**; all packages with `check-types` scripts pass | ✅ |
| #8 | `bun -F web test` passes | 36 passed (34 existing + 2 new `health.test.tsx`) in 1.91s | ✅ |
| #9 | `bun -F server gen:openapi --check` passes | Exits 0, no drift from committed `apps/server/openapi.json` despite `@orpc` bump | ✅ |
| #10 | No `--no-verify`, `@ts-ignore`, silent catch | Grep of `f69722f` diff for `--no-verify`, `@ts-ignore`, `@ts-expect-error`, and empty `catch {}` returned zero matches | ✅ |

---

## 2. Manager pre-fix audit

- **Was the `cloudflare:workers` leak truly pre-existing?**  
  **Yes.** `packages/env/src/server.ts` has imported from `cloudflare:workers` since commit `9731271` (initial commit). `apps/web` already depended on `@kuralle/api`, `@kuralle/auth`, and `@kuralle/env` before S0-05. The type error was latent: `apps/web`'s `check-types` (`vite build && tsc --noEmit`) did not previously force-resolve the full type graph through `@kuralle/env/server`. Adding `@kuralle/api-client` and re-exporting `AppRouterClient` made `tsc` traverse `Context` → `createAuth` → `@kuralle/env/server`, surfacing the missing ambient module declaration.

- **Is the manager fix surgical/safe?**  
  **Yes.** Adding `@cloudflare/workers-types` to `apps/web/tsconfig.json`'s `types` array is purely additive and type-only. It has zero Vite runtime impact. It is the standard, minimal fix for a web app that transitively depends on Workers bindings via type re-exports.

- **Is it the right fix or a band-aid?**  
  **It is the right immediate fix, but the root cause is architectural.** `@kuralle/env` conflates server-side Workers bindings with a package that ends up in the web app's type-import path. The cleaner long-term fix is to ensure `apps/web` never needs to resolve `@kuralle/env/server` (e.g., by splitting the env package or exposing a slim client-side type facade). That refactor is out of scope for S0-05.

---

## 3. Code quality

- `packages/api-client/src/index.ts` is **22 LOC**, a thin re-export layer with no business logic. ✅
- ESLint flat config uses `typescript-eslint@^8.59.2` and `eslint@^9.39.4`, matching the brief's pinning requirement. ✅
- `ApiProvider` query-client defaults are sensible (`staleTime: 60_000`, `refetchOnWindowFocus: true`). ✅
- `useHealthCheck.test.tsx` covers happy path (`data === "OK"`, `isSuccess`) and failure path (`isError`, `error` defined). Both run real `useQuery` logic via `@testing-library/react`; no `expect(true)` stubs. ✅
- Catalog bumps: all `@orpc/*` packages at `^1.14.2`, `@tanstack/react-query` at `^5.100.9`. ✅
- `bun.lock` diff (641 lines) is fully accounted for by: new eslint toolchain, `@orpc` 1.14.0 → 1.14.2, `@tanstack/react-query` 5.90.12 → 5.100.9, and new workspace package `@kuralle/api-client`. No unexpected packages. ✅
- `apps/server/openapi.json` was **not modified** in the commit — the spec is stable across the `@orpc` patch bump. ✅
- Pre-existing ignore list (6 source files) verified to predate S0-05 via `git log`:
  1. `apps/web/src/components/configure/agent-editor-shell.tsx` (`36ad303`)
  2. `apps/web/src/routes/_app.agents.$agentId.models.tsx` (`8618a0f`)
  3. `apps/web/src/routes/_app.agents.$agentId.workflow.tsx` (`9c84d1c`)
  4. `apps/web/src/routes/_app.batches.new.tsx` (`36ad303`)
  5. `packages/ui/src/components/data-table.tsx` (`287a2c7`)
  6. `packages/env/env.d.ts` (`9731271`)
- **Commit-body accuracy note:** The IC describes these 6 files as "kept as warnings, not errors" for `no-unused-vars`. In reality the flat-config `ignores` array skips them **entirely** from ESLint. The intent (don't fix pre-existing lint in this story) is valid, but the description understates the breadth of the exemption.
- **Relaxed lint rules evaluation:**
  - `@typescript-eslint/no-explicit-any` → `warn`: pragmatic for an initial lint rollout (one pre-existing `any` in `packages/env/src/web.ts` would otherwise fail the build). Should be tightened to `error` with file overrides in a cleanup story.
  - `@typescript-eslint/triple-slash-reference` → `off`: justifiable because `packages/env/src/server.ts` uses `/// <reference path="../env.d.ts" />`. A file-scoped override would be cleaner.
  - `@typescript-eslint/no-empty-object-type` → `off`: minor stylistic concession; unlikely to hide real bugs. Acceptable for now.
  - **Verdict:** these are **pragmatic band-aids** for a first-time lint config. They should be replaced with scoped overrides in S0-06 or a dedicated cleanup story.

---

## 4. Apply-now items for manager fix-pass commit

- Commit the manager's uncommitted changes:
  - `apps/web/tsconfig.json` — add `@cloudflare/workers-types` to `types`
  - `apps/web/package.json` — add `@cloudflare/workers-types` to `devDependencies` (`catalog:`)
- (Recommended) Add a one-line comment in `apps/web/tsconfig.json` above the `types` array:  
  `// Required because @kuralle/api-client transitively resolves @kuralle/env/server → cloudflare:workers`

---

## 5. Carry-forwards

- Replace the three global lint relaxations (`no-explicit-any`, `triple-slash-reference`, `no-empty-object-type`) with file-scoped overrides so the rest of the workspace stays strict.
- Fix lint violations in the 6 pre-existing ignored files and remove them from `eslint.config.mjs`'s `ignores` array.
- Architectural: decouple `apps/web` from `@kuralle/env/server`'s `cloudflare:workers` import path (e.g., split env package or add a client-safe type re-export) so the web app doesn't need Workers types.
- Establish an `.env.example` convention if the team wants documented env vars; currently only `.env` exists and it already contains `VITE_SERVER_URL=http://localhost:3000`.

---

## 6. Honest summary

The IC delivered a clean, atomic commit that satisfies all 10 acceptance criteria. The `@kuralle/api-client` package is appropriately thin, the hook-wrapper pattern is enforced by ESLint and documented in the README, and the TanStack Query provider is mounted correctly with sensible defaults. The manager's pre-fix for the `cloudflare:workers` type leak is verified working: `bun run check-types` is green workspace-wide, `bun -F web test` passes 36 tests, and the OpenAPI drift gate is clean.

The only minor discrepancies are: (1) the commit body slightly mischaracterizes the 6 pre-existing files as lint "warnings" when they are actually fully ignored, and (2) three global lint rule relaxations were introduced instead of file-scoped overrides. Neither issue blocks shipment.

---

## 7. Recommended action

**Ready for r1.**

Apply the manager's tsconfig/package.json fix as a fast-follow commit (or fold it into the manager's own fix-pass), then merge. No IC rework required.
