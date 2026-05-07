# Spec + Code-Quality Gate — `S1-05` oRPC router stubs + useAgents hook + MSW test

> **Gate worker:** pi/kimi-k2.6.  
> **IC worker:** pi/deepseek-v4-pro (model: pi-glm / zai / glm-5.1).  
> **Commit reviewed:** `497de27`.  
> **Inputs:** brief-S1-05.md, PLAN.md §S1-05, result-S1-05.txt, diff on disk, schema files, eslint.config.mjs, oRPC RPC wire-format source, prior gates S1-01..S1-04.  
> **Verdict:** 🟢 green

---

## 1. Spec adherence

### 1.1 Brief ACs 1–12

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | 11 router groups exist; each exports one `list` procedure with explicit Zod input/output; typed against Drizzle `$inferSelect`; `voices` uses `publicProcedure` + optional `workspaceId`; rest use `protectedProcedure` | ✅ | `packages/api/src/routers/{agents,conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.ts` all present. `voices.ts:12` uses `publicProcedure`; `voices.ts:8` has `workspaceId: z.string().nullable().optional()`; the other 10 use `protectedProcedure` with required `workspaceId`. |
| 2 | `appRouter` extended with 11 new groups alongside existing `healthCheck` + `privateData` | ✅ | `packages/api/src/routers/index.ts:24-35` mounts all 11 routers. Existing procedures untouched. |
| 3 | `apps/server/openapi.json` regenerated; drift gate passes | ✅ | `git diff 497de27^..497de27 -- apps/server/openapi.json | wc -l` = 887 lines added. `bun -F server gen:openapi --check` exits 0. 13 operationIds present (2 existing + 11 new). |
| 4 | `useAgents()` hook wraps `$api.agents.list.queryOptions({ input })` | ✅ | `apps/web/src/hooks/api/agents.ts:7-11` matches the `health.ts` precedent exactly. |
| 5 | MSW v2 test — 2 tests (happy + failure), shared server, no `vi.mock` | ✅ | `apps/web/src/hooks/api/agents.test.tsx` has 2 tests. `apps/web/src/test/msw-server.ts` exports shared server. No `vi.mock` on the provider. `onUnhandledRequest: "error"` set. |
| 6 | C1 list page swap — replace mock import with `useAgents()` | ✅ | `apps/web/src/routes/_app.agents.index.tsx` diff is surgical: line 27 import swapped, line 36-37 hook + mapping added. No other JSX or prop changes. |
| 7 | Type-check + lint green | ✅ | `bun run check-types --force` 6/6 green. `bun run lint` 0 errors, 1 pre-existing warning (`packages/env/src/web.ts`). |
| 8 | OpenAPI drift gate green | ✅ | `bun -F server gen:openapi --check` exits 0 (re-run confirmed). |
| 9 | Test green — `health.test.tsx` still passes + new tests pass | ✅ | `bun -F web test` 38/38 (was 36/36 pre-commit; +2 from `agents.test.tsx`). 6 test files pass. |
| 10 | Platform tests still 53/53 | ✅ | `bun -F @kuralle/platform test` 53/53 green. |
| 11 | No router import leak into `core/`/`db/`/`runtime/` | ✅ | New router files live only in `packages/api/src/routers/`. Imports are `@kuralle/db/schema/*` (allowed). Hexagonal lint rule still passes. |
| 12 | Demo artifacts captured | ✅ | `sprints/sprint-1/artifacts/S1-05-openapi-diff.txt` exists (80 lines). `sprints/sprint-1/artifacts/S1-05-c1-empty.txt` exists (verbose test output showing 2/2 pass). |

### 1.2 Project-specific spec gates (standing rules A–J)

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| **A** | Hook-wrapper enforcement — only `hooks/api/**` imports `$api` | ✅ | `grep -rn "@kuralle/api-client\|providers/api-provider" apps/web/src/` shows only `hooks/api/agents.ts`, `hooks/api/health.ts`, and `hooks/api/health.test.tsx` (the latter uses `vi.mock`, not a runtime import). No forbidden imports outside the allow-list. |
| **B** | OpenAPI surface integrity — explicit Zod schemas; no `unknown` or unbounded `additionalProperties` | ⚠️ partial | All procedures have explicit `z.object(...)` input and output schemas. **However**, the output `items` array uses `z.array(z.unknown())` (per the exact pattern in brief AC 1), which emits `anyOf: [{}, {type: "null"}]` in `openapi.json` — effectively `unknown | null` for each item. There is no `additionalProperties: true`. This is a known stub limitation: Drizzle `$inferSelect` is a TS type, not a Zod schema, so the OpenAPI surface cannot self-describe row fields without manual mapping. Acceptable for S1 stubs, but the OpenAPI contract is widened. |
| **C** | MSW v2 wire format — returns `{ json: { items: [], cursor: null } }` | ✅ | `agents.test.tsx:30-32` returns `HttpResponse.json({ json: { items: [], cursor: null } })`. Verified against oRPC source (`@orpc/client/dist/shared/client.DrB9nq_G.mjs:296-298`): `decode` reads `response.body()`, then `serializer.deserialize(body)` expects `{ json, meta? }`. The handler shape matches exactly. |
| **D** | C1 page swap is surgical | ✅ | Diff for `_app.agents.index.tsx` is exactly: (i) import line replaced (`makeAgents` → `useAgents`), (ii) `useMemo(() => makeAgents(10), [])` replaced with `{ data: agentsList } = useAgents(...)` + `useMemo(() => (agentsList?.items ?? []) as unknown as Agent[], ...)`. No JSX rewrites, no prop renames, no file restructure. |
| **E** | `schema.d.ts` ghost documented | ✅ | `packages/api-client/src/` contains only `index.ts`; no `schema.d.ts` exists. Commit body explicitly documents: "No separate .d.ts file emitted. AppRouterClient flows transitively via @kuralle/api/routers/index → @kuralle/api-client re-export." |
| **F** | `secrets` ciphertext omission | ✅ | `packages/api/src/routers/secrets.ts:9-17` defines `SecretSafeRow = Pick<typeof secrets.$inferSelect, "id" | "workspaceId" | "name" | "scope" | "agentId" | "createdByUserId" | "createdAt" | "rotatedAt" | "lastUsedAt">`. `ciphertext` and `kmsKeyId` are omitted. Handler return type uses `SecretSafeRow[]`. |
| **G** | No `catch (e: any)` / lint 0 errors / no new warnings | ✅ | `grep -rn "catch.*any"` across new files returns nothing. Lint 0 errors. Pre-existing `packages/env/src/web.ts` warning unchanged. |
| **H** | Voices = `publicProcedure`; rest = `protectedProcedure` | ✅ | `voices.ts:12` uses `publicProcedure`. All other 10 routers use `protectedProcedure`. |
| **I** | Type end-to-end closure | ✅ | `agents.ts` handler return type is `{ items: (typeof agents.$inferSelect)[]; cursor: string | null }`. This flows through `AppRouter` → `AppRouterClient` → `createTanstackQueryUtils` → `$api.agents.list.queryOptions()`. The hook's inferred return type narrows correctly at the call site (verified via `bun run check-types`). |
| **J** | No mock removal — `apps/web/src/mocks/agents.ts` still exists | ✅ | File present (`ls -la` confirms 3516 bytes). Other routes (`_app.agents.$agentId.models.tsx`, `_app.agents.$agentId.behavior.tsx`, etc.) still import `makeAgents`. |

---

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/api/src/routers/agents.ts` | ✅ created |
| `packages/api/src/routers/conversations.ts` | ✅ created |
| `packages/api/src/routers/channels.ts` | ✅ created |
| `packages/api/src/routers/kb.ts` | ✅ created |
| `packages/api/src/routers/tools.ts` | ✅ created |
| `packages/api/src/routers/batches.ts` | ✅ created |
| `packages/api/src/routers/webhooks.ts` | ✅ created |
| `packages/api/src/routers/secrets.ts` | ✅ created |
| `packages/api/src/routers/voices.ts` | ✅ created |
| `packages/api/src/routers/compliance.ts` | ✅ created |
| `packages/api/src/routers/receipts.ts` | ✅ created |
| `apps/web/src/hooks/api/agents.ts` | ✅ created |
| `apps/web/src/hooks/api/agents.test.tsx` | ✅ created |
| `apps/web/src/test/msw-server.ts` | ✅ created |
| `packages/api/src/routers/index.ts` | ✅ modified (11 imports + 11 router keys added) |
| `apps/server/openapi.json` | ✅ modified (regenerated, +862 lines) |
| `apps/web/src/routes/_app.agents.index.tsx` | ✅ modified (surgical swap) |
| `apps/web/package.json` | ✅ modified (`msw` 2.14.3 added to devDeps) |
| `sprints/sprint-1/artifacts/S1-05-openapi-diff.txt` | ✅ created (80 lines) |
| `sprints/sprint-1/artifacts/S1-05-c1-empty.txt` | ✅ created (12 lines) |
| `bun.lock` | ✅ modified (msw 2.14.3 + transitive deps) |

Out-of-scope edits: **none**. All 21 changed files are within the brief §3 list.

---

## 3. Wiring + demo artifact verification

- **Router mounting:** `packages/api/src/routers/index.ts:24-35` correctly mounts all 11 routers under camelCase group keys (`agents`, `conversations`, `channels`, `kb`, `tools`, `batches`, `webhooks`, `secrets`, `voices`, `compliance`, `receipts`). `healthCheck` and `privateData` untouched. ✅
- **Api-client re-export:** `packages/api-client/src/index.ts` already re-exports `AppRouter` and `AppRouterClient` from `@kuralle/api/routers/index`. No changes needed. ✅
- **ESLint allow-list:** `apps/web/src/hooks/api/agents.ts` lives in `apps/web/src/hooks/api/**`, which is explicitly allow-listed in `eslint.config.mjs:62-64`. `bun run lint` confirms no forbidden-import errors. ✅
- **Demo artifact `S1-05-openapi-diff.txt`:** Exists and shows the first 80 lines of `git diff apps/server/openapi.json`, capturing `/agents/list`, `/batches/list`, `/channels/list`, etc. ✅
- **Demo artifact `S1-05-c1-empty.txt`:** Exists and shows Vitest verbose output for `agents.test.tsx` — both tests pass in 1.08s. ✅

---

## 4. Code quality

- **`packages/api/src/routers/*.ts` (11 files)** — Near-identical boilerplate across all routers, varying only in import path, table reference, and `publicProcedure` vs `protectedProcedure`. **Nit** — acceptable for stubs that S2 will replace with real repository queries, but a small factory helper (`createListRouter(table, procedure)`) could have cut ~180 lines of duplication. Not blocking.
- **`packages/api/src/routers/channels.ts:2`** — Imports `channelEndpoints` from `@kuralle/db/schema/channels`. The brief notes "endpoints are the addressable identity; if the natural list is connections, use `channelConnections.$inferSelect` and document." The IC chose endpoints (reasonable) but **did not document the choice in the commit body**. **Nit**.
- **`packages/api/src/routers/secrets.ts:9-17`** — `SecretSafeRow` uses `Pick<...>` to omit `ciphertext` and `kmsKeyId`. Clean, explicit, and safe. **Clean**.
- **`apps/web/src/routes/_app.agents.index.tsx:36-37`** — The `as unknown as Agent[]` cast is a temporary stub bridge between DB row type and domain `Agent` type. Documented in the commit body ("S2 adds proper mapping"). Justified for a stub story. **Clean**.
- **`apps/web/src/hooks/api/agents.test.tsx`** — Uses `server.use()` per-test with `server.resetHandlers()` in `afterEach`. Matches MSW v2 best practice. `onUnhandledRequest: "error"` catches stray fetches. Failure path asserts `isError` (not just `error` defined). **Clean**.
- **`apps/web/src/test/msw-server.ts`** — Minimal shared server export. No unnecessary setup. **Clean**.
- **`apps/web/package.json`** — `msw` pinned to `2.14.3` (latest stable 2.x at commit time). No root `package.json` pollution. `happy-dom` not added because the project already uses `jsdom` (`vite.config.ts` → `environment: "jsdom"`). Correct choice. **Clean**.
- **`bun.lock`** — Some transitive churn (e.g., `wrap-ansi` version bumps, `msw` moving from `shadcn` transitive to direct). Typical bun normalization after adding a new dependency. No unexpected packages. **Clean**.
- **No dead imports, no debug prints, no `.only`/`.skip`.** **Clean**.

---

## 5. Honest summary

Eleven oRPC router stubs landed with correct procedure shapes, explicit Zod input/output schemas, and proper `protectedProcedure`/`publicProcedure` split (voices = public). The `appRouter` grew from 2 to 13 operations and the OpenAPI drift gate is clean. The `useAgents()` hook follows the `health.ts` precedent and correctly wraps `$api.agents.list.queryOptions()`. The MSW v2 test intercepts the oRPC RPC wire format (`{ json: ... }` envelope) and asserts both happy path (empty items + null cursor) and failure path (`isError`). The C1 agents list page swap is surgical — only the import line and the data hook were changed, with a documented `as unknown as Agent[]` cast as a temporary bridge. Type-check (6/6), lint (0 errors), web tests (38/38), platform tests (53/53), and all S1-01..S1-04 smokes are green.

The only notable limitation is the OpenAPI `items` schema: because the output uses `z.array(z.unknown())` (the exact pattern shown in brief AC 1), the emitted `openapi.json` describes each item as `anyOf: [{}, {type: "null"}]` — effectively `unknown`. There is no `additionalProperties: true`, but the item shape is not self-describing. This is an unavoidable tension between Drizzle's TS-only row types and oRPC's Zod-driven OpenAPI emitter. The TypeScript end-to-end closure is fully correct; the OpenAPI surface will need manual Zod schemas (or a generator) when real queries land in S2. The commit body does not flag this as a known limitation, but the brief itself documents the `z.unknown()` pattern.

---

## 6. Recommended action

**Ready for r1.** All brief ACs are met, all standing rules pass, all gates are green. The OpenAPI `unknown` items are a documented stub limitation, not a spec miss. No IC re-fire needed.

---

## 7. Apply-now items

*None required for green verdict. Below are optional polish items the manager may choose to include in a fix-pass or defer to S2.*

1. **`packages/api/src/routers/channels.ts`** — Add a one-line code comment or commit-body note explaining why `channelEndpoints` (not `channelConnections`) is the natural list entity for the channels router. The brief invited documentation of this choice.
2. **`packages/api/src/routers/*.ts` (11 files)** — When S2 lands real repository queries, replace `z.array(z.unknown())` with explicit Zod object schemas derived from the Drizzle columns (or a codegen step). This will close the OpenAPI surface so that `openapi.json` describes actual item fields instead of `unknown`.
