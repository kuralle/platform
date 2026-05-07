# Story Brief — `S1-05` oRPC router stubs (11 groups) + first hook (`useAgents`) with MSW test

> **Role.** You are a senior full-stack TypeScript engineer with deep production experience in **oRPC, Drizzle row-type inference, OpenAPI emission, TanStack Query v5, and Mock Service Worker (MSW v2)**. You have shipped end-to-end-typed API surfaces where the server's Drizzle row type closes against the client's hook return type without manual narrowing. You respect the OpenAPI contract as the source of truth for cross-team coordination. You write hooks that components actually want to use — clear names, narrow return shapes, no unnecessary configurability.
>
> **Mindset.** You read the spec twice. Before guessing an oRPC API shape (procedure builder, Zod schema attachment, `RouterClient`, `createTanstackQueryUtils`), you verify against `node_modules/.bun/.../@orpc/**/*.d.ts` and the live docs (context7 `/orpc/orpc`). You verify Drizzle row types via `<table>.$inferSelect`. You know that AMENDMENT-001 makes `@orpc/tanstack-query` the contract for `apps/web` (not `openapi-typescript`), and that the hook wrapper in `apps/web/src/hooks/api/<resource>.ts` is the only allowed consumer of `$api` per the ESLint rule in `eslint.config.mjs:48-55`. You never silently bypass; never commit `--no-verify`; never claim "done" without proof — proof is `bun -F server gen:openapi --check` exit 0 (the OpenAPI contract didn't drift), `bun -F web test` exit 0 (the MSW hook test passes), and `bun run lint` exit 0 (no forbidden-import violations).
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (err: unknown)` with `err instanceof Error` narrowing. No root-`package.json` devDep pollution — MSW + happy-dom (or jsdom) install into `apps/web` only. No improvisation on the OpenAPI surface — explicit Zod input/output schemas per procedure (per WBS §131 risk note about OpenAPI surface widening). No premature abstractions; this story ships exactly 11 router groups × 1 `list` procedure each, plus 1 hook + 1 test. Repository code, real DB queries, mutation procedures, pagination semantics — all out of scope.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2 in full. The `apps/server/openapi.json` is regenerated, not hand-edited (manager rule from kickoff prompt). The `packages/api-client/src/schema.d.ts` does NOT exist as a separate emitted file — `packages/api-client/src/index.ts` re-exports `AppRouter` and `AppRouterClient` from `@kuralle/api/routers/index`, and `createApi()` returns the typed `ApiUtils`. So the WBS line "Generate fresh `packages/api-client/src/schema.d.ts`" is a ghost — verify on disk and document in your commit body that no separate `.d.ts` file exists; the type lives transitively via `AppRouter`. If anything contradicts what's on disk, **stop and ask** — don't guess.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S1-05] oRPC router stubs + useAgents hook + MSW test`. Do NOT push.

---

## 1. Goal

Land 11 oRPC router groups — `agents`, `conversations`, `channels`, `kb`, `tools`, `batches`, `webhooks`, `secrets`, `voices`, `compliance`, `receipts` — each exporting exactly one `list` query that returns `{ items: T[], cursor: string | null }` typed against the matching Drizzle `$inferSelect` row type. Regenerate `apps/server/openapi.json` (1 → 12 route groups). Replace the C1 agents-list mock import in `apps/web/src/routes/_app.agents.index.tsx` with a real-but-empty `useAgents()` hook in `apps/web/src/hooks/api/agents.ts`. Test the hook with MSW v2 intercepting the oRPC HTTP layer.

---

## 2. Required reading

1. `sprints/STATE.md`.
2. `sprints/sprint-1/PLAN.md` (story `S1-05` section).
3. `sprints/WBS.md` § Sprint 1 row `S1-05` (line 119).
4. `sprints/AMENDMENT-001.md` — frontend client uses `@orpc/tanstack-query`, NOT `openapi-typescript`. The hook wrapper is the contract.
5. `packages/api/src/routers/index.ts` — current router shape (2 procedures: `healthCheck`, `privateData`). You'll extend this from 2 procedures to 13 (2 + 11 group lists).
6. `packages/api/src/index.ts` — the `publicProcedure` / `protectedProcedure` builders.
7. `packages/api/src/context.ts` — request context shape.
8. `apps/server/scripts/gen-openapi.ts` — the generator. Note the `sortKeys` step + the `--check` flag.
9. `apps/server/openapi.json` — the current canonical contract (commit it after regen).
10. `packages/api-client/src/index.ts` — the wrapper used by `apps/web`.
11. `apps/web/src/providers/api-provider.tsx` — defines `$api` (the `createApi()` instance).
12. `apps/web/src/hooks/api/health.ts` — **the hook precedent** (pattern: `useQuery({ ...$api.<proc>.queryOptions(), ... })`).
13. `apps/web/src/hooks/api/health.test.tsx` — the existing test pattern (uses `vi.mock` on `@/providers/api-provider`, NOT MSW). You will write the new `agents.test.tsx` with **MSW v2** because the user explicitly chose HTTP-layer interception over the lighter `vi.mock` pattern. Read the existing pattern for setup boilerplate; install MSW yourself.
14. `apps/web/src/routes/_app.agents.index.tsx` — the C1 list page; line 27 imports `makeAgents` from `@/mocks`. You will replace this with `useAgents()`. Read the file fully to understand the data shape the page consumes; map it to `agents.$inferSelect`.
15. `apps/web/src/types/domain.ts` — domain types for the UI (current shape consumed by `_app.agents.index.tsx`).
16. `eslint.config.mjs` — see lines 32-73 for the `no-restricted-imports` rule. Hooks under `apps/web/src/hooks/api/**` are allow-listed for `$api` access; everything else is blocked.
17. The schema files: `packages/db/src/schema/{agents,conversations,channels,knowledge,tools,voices}.ts`. Use `$inferSelect` to type each procedure's return.
18. **`packages/db/src/schema/{secrets,webhooks,billing,compliance,batches,audit}.ts`** — these land in S1-04 (which fires AFTER S1-05 in the sequential per-story flow). **Stop and ask** if any of these schema files are missing when you start: S1-04 must land first.
19. context7 `/orpc/orpc` for the procedure builder + Zod attachment APIs.

---

## 3. Files to create or modify

**Create:**
- `packages/api/src/routers/agents.ts` — agents list procedure.
- `packages/api/src/routers/conversations.ts` — conversations list procedure.
- `packages/api/src/routers/channels.ts` — channels list procedure (typed against `channelEndpoints.$inferSelect` — endpoints are the addressable identity; if the natural list is connections, use `channelConnections.$inferSelect` and document).
- `packages/api/src/routers/kb.ts` — kb_documents list procedure.
- `packages/api/src/routers/tools.ts` — tools list procedure.
- `packages/api/src/routers/batches.ts` — batches list procedure.
- `packages/api/src/routers/webhooks.ts` — webhooks list procedure.
- `packages/api/src/routers/secrets.ts` — secrets list procedure (return type omits `ciphertext` for safety; use a derived row type that picks `id, workspaceId, name, scope, agentId, createdByUserId, createdAt, rotatedAt, lastUsedAt`).
- `packages/api/src/routers/voices.ts` — voices list procedure.
- `packages/api/src/routers/compliance.ts` — compliance_evaluations list procedure.
- `packages/api/src/routers/receipts.ts` — monthly_receipts list procedure.
- `apps/web/src/hooks/api/agents.ts` — `useAgents()` wrapper around `$api.agents.list.useQuery()`.
- `apps/web/src/hooks/api/agents.test.tsx` — MSW-based unit test.
- `apps/web/src/test/msw-server.ts` — shared MSW server setup (or co-locate inside the test file if it's the only consumer; pick the cleaner path and document).
- `sprints/sprint-1/artifacts/S1-05-openapi-diff.txt` — `git diff apps/server/openapi.json | head -80` showing the 11 new path entries.
- `sprints/sprint-1/artifacts/S1-05-c1-empty.txt` — output of `bun -F web test apps/web/src/hooks/api/agents.test.tsx -- --reporter=verbose` showing the hook test green.

**Modify:**
- `packages/api/src/routers/index.ts` — extend `appRouter` to mount all 11 new groups alongside `healthCheck` + `privateData`.
- `apps/server/openapi.json` — regenerated by `bun -F server gen:openapi`. Do NOT hand-edit.
- `apps/web/src/routes/_app.agents.index.tsx` — replace `import { makeAgents } from "@/mocks"` and the `useMemo(() => makeAgents(10), [])` line with `useAgents()`. The page must render its empty state when `data?.items` is `[]`. **Surgical edit** — touch only the import line and the data hook; do not refactor the rest of the file.
- `apps/web/package.json` — add `msw` (version: pin to latest stable 2.x; check via `bun pm view msw version` before pinning) and any peer (e.g., `@mswjs/interceptors`) it requires. Also add `happy-dom` if not already present (check first).

**Do not touch:**
- `apps/web/src/mocks/agents.ts` — leave the file in place; other screens still import it. This story removes ONE consumer (the C1 list); broader mock removal is BL-S1-XX (post-sprint backlog).
- Repo-root `package.json`.
- `packages/db/` schema or migrations.
- Other route files (`_app.conversations.*`, `_app.knowledge.*`, etc.) — they still consume mocks. S2 wires them up.
- `apps/web/src/hooks/api/health.ts` or `health.test.tsx`.
- `eslint.config.mjs` — the existing rule is sufficient.

---

## 4. Acceptance criteria

1. **All 11 router groups exist** under `packages/api/src/routers/<group>.ts`. Each exports one named export, typed exactly:
   ```ts
   import { z } from "zod";
   import { agents } from "@kuralle/db/schema";
   import { publicProcedure } from "../index";

   const listInput = z.object({
     workspaceId: z.string(),
     cursor: z.string().nullable().optional(),
     limit: z.number().int().min(1).max(100).default(20),
   });

   const listOutput = z.object({
     items: z.array(z.unknown()),  // typed via .$inferSelect at the handler layer
     cursor: z.string().nullable(),
   });

   export const agentsRouter = {
     list: publicProcedure
       .input(listInput)
       .output(listOutput)
       .handler((): { items: typeof agents.$inferSelect[]; cursor: string | null } => {
         return { items: [], cursor: null };
       }),
   };
   ```
   The exact handler shape is up to you — the criterion is that `RouterClient<typeof appRouter>` resolves `appRouter.agents.list`'s return as `{ items: <RowType>[], cursor: string | null }` end-to-end. Verify by reading the inferred type at the import site in `agents.ts` (the hook).

   **Per-router input shape.** All 11 take `{ workspaceId, cursor?, limit? }`. Use `protectedProcedure` (the protected variant) for everything except `voices` (which has stock-catalogue rows where `workspaceId IS NULL` per `DATA_MODEL.md §5:450`); for voices use `publicProcedure` and accept optional `workspaceId`. Document this in the commit body.

2. **`appRouter` extended** in `packages/api/src/routers/index.ts` — the existing `healthCheck` and `privateData` stay; the 11 new groups mount via:
   ```ts
   export const appRouter = {
     healthCheck: ...,
     privateData: ...,
     agents: agentsRouter,
     conversations: conversationsRouter,
     channels: channelsRouter,
     kb: kbRouter,
     tools: toolsRouter,
     batches: batchesRouter,
     webhooks: webhooksRouter,
     secrets: secretsRouter,
     voices: voicesRouter,
     compliance: complianceRouter,
     receipts: receiptsRouter,
   };
   ```

3. **`apps/server/openapi.json` regenerated** via `bun -F server gen:openapi`. Verify:
   - `bun -F server gen:openapi --check` exits 0 (drift gate green).
   - `git diff apps/server/openapi.json | wc -l` shows substantial growth — expect 200+ added lines.
   - The diff captures `paths` for `/agents/list`, `/conversations/list`, `/channels/list`, etc. (or whatever oRPC's RPC-mode default routing emits — verify the actual paths against the generator output; document).

4. **`useAgents()` hook** at `apps/web/src/hooks/api/agents.ts` exports:
   ```ts
   import { useQuery } from "@tanstack/react-query";
   import { $api } from "@/providers/api-provider";

   export function useAgents(input: { workspaceId: string; cursor?: string | null; limit?: number }) {
     return useQuery($api.agents.list.queryOptions({ input }));
   }
   ```
   The exact signature follows the `health.ts` precedent (using `$api.<proc>.queryOptions(...)` then `useQuery(opts)`). Verify the inferred return type narrows to `{ data: { items: <AgentRow>[]; cursor: string | null } | undefined; ... }`.

5. **MSW v2 test** at `apps/web/src/hooks/api/agents.test.tsx`:
   - Sets up an MSW `setupServer(...)` handler for the oRPC POST endpoint (the route the `RPCLink` calls — verify by reading `packages/api-client/src/index.ts:7-17`; `RPCLink` POSTs to `<baseUrl>/<procedure-path>` per the oRPC RPC-mode protocol — read context7 to confirm).
   - Test 1 (happy path): handler returns `{ items: [], cursor: null }`; assert `result.current.data?.items.length === 0`.
   - Test 2 (failure path): handler returns 500; assert `result.current.isError === true`.
   - Setup file `apps/web/src/test/msw-server.ts` exports `server` + `beforeAll/afterEach/afterAll` lifecycle hooks per MSW v2 docs.
   - The test runs under `happy-dom` or `jsdom` (whichever the existing Vitest config uses; check `apps/web/vitest.config.ts` if it exists, else `vite.config.ts`).
   - Test must NOT use `vi.mock("@/providers/api-provider", ...)` — the user explicitly chose MSW (HTTP-layer interception) over the in-process module mock for higher fidelity. This is the contract.

6. **C1 list page swap** in `apps/web/src/routes/_app.agents.index.tsx`:
   - Replace `import { makeAgents } from "@/mocks"` (line 27) with `import { useAgents } from "@/hooks/api/agents"`.
   - Replace `const data = useMemo(() => makeAgents(10), [])` (line 36) with `const { data: agentsList } = useAgents({ workspaceId: "demo-workspace" })` (or however the workspace id is sourced — grep for `workspaceId` in `apps/web/src/contexts/` or `providers/`; if there's no workspace context yet, hardcode `"demo-workspace"` and document).
   - The `data` variable's downstream consumers in the file expect a specific shape. Map `agentsList?.items` to that shape (or rename downstream uses — pick the cleanest path; document).
   - The empty-state branch must render when `agentsList?.items.length === 0`.

7. **Type-check + lint green.**
   - `bun run check-types --force` — 6/6.
   - `bun run lint` — 0 errors. Specifically the forbidden-import rules in `eslint.config.mjs:34-58` must NOT fire on the new hook (it's allow-listed at lines 62-69).
   - **No new lint warnings** beyond the pre-existing `packages/env/src/web.ts` warning.

8. **OpenAPI drift gate green.** `bun -F server gen:openapi --check` exits 0 after commit.

9. **Test green.** `bun -F web test` (or whatever the workspace test script is) exits 0. Both `health.test.tsx` (existing) and `agents.test.tsx` (new) pass.

10. **Platform tests still 53/53.** `bun -F @kuralle/platform test`.

11. **No router import leak into `core/`/`db/`/`runtime/`.** S1-05 only adds router files in `packages/api/src/routers/` — they import from `@kuralle/db/schema` (allowed). The hexagonal-import lint rule should still pass.

12. **Demo artifacts captured.**

---

## 5. Definition of Done

- [ ] All 12 ACs met.
- [ ] `bun run check-types --force` 6/6; `bun run lint` 0 errors / 1 pre-existing warning unchanged; `bun -F @kuralle/platform test` 53/53; `bun -F web test` green; `bun -F server gen:openapi --check` clean; `bun packages/db/scripts/smoke-S1-01.ts` and `smoke-S1-02.ts` and `smoke-S1-03.ts` and `smoke-S1-04.ts` (latter if it exists yet) all green.
- [ ] No `--no-verify`, no `@ts-ignore`, no `catch (e: any)`.
- [ ] Atomic commit `[S1-05] oRPC router stubs + useAgents hook + MSW test` with the §3 file list only.
- [ ] Commit body covers: per-router protected-vs-public choice (voices = public), secrets ciphertext-omission rationale, MSW setup vs. vi.mock choice (per user decision), schema.d.ts ghost (no separate file emitted), workspace-id source choice in the C1 page swap, OpenAPI path conventions, trade-offs.

---

## 6. What NOT to do

- Do NOT add real DB queries to the handlers. Each procedure's handler returns `{ items: [], cursor: null }`. Repository pattern + real queries land in S2.
- Do NOT add mutation procedures (`create`, `update`, `delete`, `publish`). S2.
- Do NOT add input refinements beyond `workspaceId / cursor / limit`. The kickoff prompt warns against widening the OpenAPI surface.
- Do NOT remove the file `apps/web/src/mocks/agents.ts`. Other screens still use it; this story replaces ONE consumer.
- Do NOT modify other route files in `apps/web/src/routes/`. Only `_app.agents.index.tsx`.
- Do NOT touch the eslint config. The existing forbidden-import rule already gates the hook-only access pattern.
- Do NOT add deps to repo-root `package.json` — MSW + happy-dom go inside `apps/web/package.json`.
- Do NOT use `vi.mock("@/providers/api-provider", ...)` in the new test. The user chose MSW (HTTP-layer); using `vi.mock` would silently violate that decision.

---

## 7. Demo artifacts

1. `sprints/sprint-1/artifacts/S1-05-openapi-diff.txt` — first 80 lines of `git diff apps/server/openapi.json` showing the new path entries.
2. `sprints/sprint-1/artifacts/S1-05-c1-empty.txt` — captured Vitest output for `agents.test.tsx` (both happy + failure paths green).

---

## 8. Reporting back

Atomic commit, body covering: 11 router groups added; per-router protected-vs-public split (voices = public); secrets ciphertext omission; MSW setup choice + boilerplate path; workspace-id source for C1 swap; OpenAPI path conventions observed; trade-offs (especially the `schema.d.ts` ghost, AnyPgColumn-style row inference, anything you hedged on).

No push. No PR.

---

## 9. If you get stuck

- If `RPCLink`'s POST URL pattern doesn't match what you expect: read `node_modules/.bun/.../@orpc/client/dist/fetch/*.d.ts` AND context7 `/orpc/orpc` for the RPC-mode wire protocol. Document what you found.
- If oRPC's `protectedProcedure` requires a session in the test (and MSW returns one as part of the handler): your MSW handler intercepts the POST before any session check fires; the handler can return whatever you want.
- If `@orpc/tanstack-query`'s `queryOptions(...)` shape differs from `health.ts`'s usage: trust `health.ts` — it's already shipping.
- If `bun -F server gen:openapi --check` fails after your changes due to a sort-order divergence: read `apps/server/scripts/gen-openapi.ts:18-30` to verify the generator's stability.
- If S1-04 hasn't landed when you start (no `secrets.ts`/`webhooks.ts`/etc. in `packages/db/src/schema/`): **STOP**. Manager fires stories sequentially; this is a violation of the loop. Report and exit.
- If the c1 page's downstream consumers of `data` expect a non-row-type shape (e.g., a denormalised UI shape): pick the cleanest mapping and document. Don't refactor the page.

Sincere work only. Never claim done without proof.
