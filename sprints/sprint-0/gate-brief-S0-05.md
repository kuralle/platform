# Gate Brief — `S0-05` `@kuralle/api-client` + tanstack-query hooks + forbidden-import lint

> **You are pi/kimi-k2.6, the spec + code-quality gate.** IC was `pi`/`deepseek-v4-pro`, committed at `f69722f`. Manager has applied a tsconfig fix to apps/web (added `@cloudflare/workers-types` to types) since the IC commit; verify the working tree is now `check-types` green workspace-wide.

---

## 1. Context

- **Story:** `S0-05` — api-client + hook wrappers + forbidden-import lint.
- **IC commit:** `f69722f` — `[S0-05] @kuralle/api-client + tanstack-query hooks + forbidden-import lint`.
- **Manager pre-fix:** added `@cloudflare/workers-types` to `apps/web/tsconfig.json` types array AND to `apps/web/package.json` devDeps (catalog:). Reason: `@kuralle/api-client` re-exports `AppRouterClient` from `@kuralle/api/routers/index`, which transitively traverses `Context` → `createAuth` → `@kuralle/env/server` → `cloudflare:workers`. The error was pre-existing (latent, hidden by turbo cache); S0-05 surfaced it because adding api-client busted the cache. Manager fix is surgical and additive only (no Vite runtime impact). The fix is uncommitted at gate time; verify it works.
- **Brief:** `sprints/sprint-0/brief-S0-05.md`.
- **Diff:** `git show f69722f` + read every modified file.
- **AMENDMENT-001:** `sprints/AMENDMENT-001.md` (frontend uses `@orpc/tanstack-query`, not `openapi-fetch`).

## 2. Spec gates to verify

Walk every AC in `brief-S0-05.md §4` (criteria 1–10). For each, evidence + status.

**Specific things to verify rigorously:**

1. **AC #1 — `packages/api-client` package compiles.** Read `packages/api-client/{package.json, tsconfig.json, src/index.ts}`. Verify:
   - `@kuralle/api-client` name.
   - Deps: `@kuralle/api: workspace:*`, `@orpc/client: catalog:`, `@orpc/tanstack-query: catalog:`, `@tanstack/react-query: catalog:`. ✅ if so.
   - Exports: `createClient()`, `createApi()`, type re-exports `AppRouter`, `AppRouterClient`.
   - `tsc -b` clean.

2. **AC #2 — End-to-end type flow.** Pi captured `S0-05-type-flow-output.txt`. Read it. Verify the deliberate Zod break was truly caught by tsc. Confirm pi reverted the deliberate edit (the spec endpoints in `apps/server/openapi.json` haven't drifted; verify `bun -F server gen:openapi --check` exits 0).

3. **AC #3 — `<ApiProvider>` mounted.** Read `apps/web/src/providers/api-provider.tsx` and `apps/web/src/main.tsx`. Verify:
   - QueryClientProvider wraps RouterProvider.
   - Module-level `$api` singleton or context-provided value.
   - Base URL from env (`VITE_SERVER_URL`).
   - `credentials: 'include'`.

4. **AC #4 — B1 home shows live `useHealthCheck()`.** Read the diff in `apps/web/src/routes/_app.home.tsx`. Verify a `StatusPill` consumes `useHealthCheck()` with `tone="live"|"error"|"muted"` mapping.

5. **AC #5 — ESLint `no-restricted-imports`.** Read `eslint.config.mjs`. Verify the rule scopes `@kuralle/api-client` outside `apps/web/src/hooks/api/**` (and `providers/api-provider.tsx`, per pi's overrides). Read `S0-05-lint-violation.txt` artifact: clear "deliberate violation triggers error; revert clears it" arc.

6. **AC #6 — Hook-wrapper pattern documented.** Read `apps/web/README.md`. One good example, one rejected example. Cite the section.

7. **AC #7 — `bun run check-types` green workspace-wide** (post-manager-fix). Verify by running `bun run check-types` against the working tree (not against the bare commit). All 5 tasks should be successful.

8. **AC #8 — `bun -F web test`** passes (pre-existing 34 + 2 new health.test.tsx tests = 36). Verify by running `bun -F web test`.

9. **AC #9 — `bun -F server gen:openapi --check`** still passes. The `@orpc/*` family bump should produce the same spec for the existing two procedures.

10. **AC #10 — No `--no-verify`, no `@ts-ignore`, no silent catch.** Grep the diff.

## 3. Code-quality + project-rule checks

- `packages/api-client/src/index.ts` is thin (~25 LOC); no business logic. ✅ if so.
- ESLint flat config: typescript-eslint `^8.x`, eslint `^9.x` pinned.
- `<ApiProvider>` initialization: query client defaults sensible (1min stale, refetchOnWindowFocus).
- `useHealthCheck.test.tsx`: happy + failure path. Verify both assertions exist and run real query logic (not just `expect(true)`).
- Catalog bump correctness: all `@orpc/*` family packages at `^1.14.2`.
- New deps: `@orpc/tanstack-query@1.14.2`, `@tanstack/react-query@5.100.9` in catalog.
- bun.lock change: only the @orpc bumps + new tanstack deps.
- The forbidden-import rule's `files` pattern correctly excludes `apps/web/src/hooks/api/**` AND `apps/web/src/providers/api-provider.tsx`.
- The OpenAPI spec did regenerate — verify by reading `apps/server/openapi.json` was updated (or not) in the commit. If it didn't change despite the @orpc bump, that's good (means the spec output is stable across that minor).
- Pi's commit body lists 6 files with pre-existing `no-unused-vars` ignored (kept as warnings, not errors). **Audit:** are these pre-existing? List them and confirm they predate S0-05.
- The relaxed lint rules (`no-explicit-any → warn`, `triple-slash-reference → off`, `no-empty-object-type → off`): are these justifiable concessions? Or band-aid relaxations?

## 4. Output

Write `sprints/sprint-0/gate-S0-05.md` with these sections:

```md
# Spec + Code-Quality Gate — `S0-05` api-client + hooks + forbidden-import lint

> Gate worker: pi / kimi-k2.6. IC worker: pi / deepseek-v4-pro.
> Manager pre-fix applied: apps/web tsconfig + workers-types devDep.
> Verdict: green | yellow | red.

## 1. Spec adherence
(table)

## 2. Manager pre-fix audit
- Was the cloudflare:workers leak truly pre-existing?
- Is the manager fix surgical/safe? Is it the right fix or a band-aid?

## 3. Code quality
(bullets)

## 4. Apply-now items for manager fix-pass commit
- ...

## 5. Carry-forwards
- ...

## 6. Honest summary

## 7. Recommended action
- Ready for r1 / Needs IC fix / Ambiguous spec
```

## 5. Tone

Calm, on-team. Use context7 for `@orpc/tanstack-query` API uncertainties (`/orpc/orpc`).
