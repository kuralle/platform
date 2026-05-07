# Story Brief — `S2-01` Repository pattern in `@kuralle/core` + KvStore identity-map cache

> **Role.** You are a senior platform engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **TypeScript ESM, Drizzle ORM + Postgres 15, Zod, hexagonal architecture, and Fowler PoEAA repository / identity-map patterns**. You have shipped repository layers in production at the multi-million-row scale; you understand cache invalidation as a correctness concern, not a performance optimization. You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. You verify your assumptions against the installed library types (`node_modules/.bun/.../drizzle-orm/.../*.d.ts`, `.../@orpc/server/*.d.ts`) and live docs (`mcp__context7__query-docs`) before guessing — drizzle-orm `withTransaction` and `pg-proxy` shapes change between minor releases. You prefer the smallest correct repository surface over speculative extensibility. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun -F @kuralle/core test` exiting 0 against a real DB substrate.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule — user reverts silently). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every input/output schema. No premature abstractions; no speculative extensibility.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S2-01] @kuralle/core repositories + KvStore identity-map cache`. Do NOT push. One commit per story. Manager handles `[S2-01-fix]` if the gate finds anything to apply.

---

## 1. Goal

Scaffold a new workspace package `packages/core/` and ship the repository layer specified in WBS S2-01. Six repositories — `AgentRepository`, `AgentVersionRepository`, `KbDocumentRepository`, `ToolRepository`, `ChannelRepository`, `ConversationRepository` — each constructed via a `withWorkspace(db, workspaceId, kvStore)` factory. Repositories accept the `KvStore` port from `@kuralle/platform/interface` for an identity-map cache per `HEXAGONAL_ARCHITECTURE.md §5` (Fowler PoEAA): `findById` consults the cache; mutating methods invalidate the affected keys after `tx.commit()`. Add an ESLint rule forbidding raw `drizzle-orm` / `@kuralle/db/schema/**` imports from `packages/api/src/routers/**` — every DB access from routers must go through a repository.

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — confirms sprint 2 is active.
2. `sprints/sprint-2/PLAN.md` — full sprint plan; story `S2-01` section is the spec.
3. `sprints/WBS.md` § Sprint 2 → row `S2-01` (around lines 143).
4. `sprints/sprint-1/HANDOFF.md` — read-me-first traps. Especially:
   - **Append-only DB enforcement scope changed** — `DATA_MODEL.md §15` was amended 2026-05-07: trigger applies ONLY to `agent_versions`. Don't add UPDATE-blocking triggers to other tables.
   - **Migration directory has 12 files.** S2-01 does NOT add migrations.
   - **Vector customType `fromDriver` is null-safe but un-tested at the Drizzle-runtime layer.** `KbDocumentRepository` (this story) is where the round-trip test goes (BL-S1-VECTOR-ROUNDTRIP-TEST).
5. `HEXAGONAL_ARCHITECTURE.md §5` — Fowler PoEAA identity-map. **This is the spec for the cache pattern.**
6. `HEXAGONAL_ARCHITECTURE.md §6` — discipline rules. Especially rule 4 (memory adapter exists for every port) — your tests use the memory `KvStore`.
7. `DATA_MODEL.md §5:307-443` — agents two-row split + projection tables. You build repositories on top of the schema that S1-02 shipped.
8. `DATA_MODEL.md §15` (around lines 1204-1252) — append-only enforcement scope amendment. The Postgres trigger is the canonical enforcement; your `AgentVersionRepository.update()` adds an app-layer friendly error surface.
9. `packages/platform/src/interface.ts:1-12` — the `KvStore` port. Your repositories accept it as a constructor param.
10. `packages/platform/src/memory/kv-store.ts` — the in-memory implementation your tests use.
11. `packages/db/src/index.ts` — current `createDb()` uses `neon-http` (production path). For local-pg tests in `@kuralle/core`, you construct a Drizzle client directly using `drizzle-orm/node-postgres` + `pg` (memory rule: local code paths use the pg wire driver, NOT `@neondatabase/serverless`; that HTTP function cannot reach localhost).
12. `packages/db/src/schema/agents.ts` — `agents`, `agent_versions`, projection tables. Your `AgentRepository` and `AgentVersionRepository` query these.
13. `packages/db/src/schema/{knowledge,tools,channels,conversations}.ts` — schemas for the other four repositories.
14. `packages/db/src/schema/index.ts` — re-exports; the canonical import path for schema tables.
15. `packages/db/scripts/seed-calderon.ts` — precedent for how to construct a `pg.Client` + Drizzle locally; copy the pattern into your test setup.
16. `packages/platform/src/memory/contract.test.ts` — precedent for vitest setup against memory ports. Your repository tests follow the same shape.
17. `packages/config/tsconfig.base.json` — base tsconfig your new package extends.
18. `eslint.config.mjs` — current ESLint config; you add a `no-restricted-imports` rule.
19. `turbo.json` — task graph; verify `packages/*` glob includes the new `@kuralle/core`.
20. `package.json` (workspace root) — workspace catalog; **DO NOT add deps here**. New deps live in `packages/core/package.json` only.

When in doubt about Drizzle's `withTransaction` / `inferSelect` / `customType` shapes, use `mcp__context7__query-docs` against the resolved id for `drizzle-orm` and read the installed `.d.ts` under `node_modules/.bun/...`. Memory rule: verify before guessing.

---

## 3. Files you will create or modify

Be explicit. The reviewer will check you didn't touch anything else.

**Create:**
- `packages/core/package.json` — workspace package; declares `drizzle-orm`, `@kuralle/db`, `@kuralle/platform`, `zod` as deps; `@kuralle/config`, `vitest`, `pg`, `@types/pg` as devDeps. Use `catalog:` for shared versions; pick latest stable for any new dep via `bun pm view <pkg> version`.
- `packages/core/tsconfig.json` — extends `@kuralle/config/tsconfig.base.json`.
- `packages/core/vitest.config.ts` — minimal config; node environment.
- `packages/core/src/index.ts` — public re-exports: `withWorkspace`, repository classes, `AppendOnlyViolation`, `WorkspaceScopeViolation`.
- `packages/core/src/repositories/index.ts` — `withWorkspace(db, workspaceId, kvStore)` factory.
- `packages/core/src/repositories/agent.ts` — `AgentRepository` class.
- `packages/core/src/repositories/agent-version.ts` — `AgentVersionRepository` class (with append-only app-layer guard).
- `packages/core/src/repositories/kb-document.ts` — `KbDocumentRepository` class. **Exercises the pgvector `embedding` round-trip (BL-S1-VECTOR-ROUNDTRIP-TEST).**
- `packages/core/src/repositories/tool.ts` — `ToolRepository` class.
- `packages/core/src/repositories/channel.ts` — `ChannelRepository` class.
- `packages/core/src/repositories/conversation.ts` — `ConversationRepository` class.
- `packages/core/src/repositories/agent.test.ts` — happy + failure path against memory `KvStore` + local-pg.
- `packages/core/src/repositories/agent-version.test.ts` — append-only guard test.
- `packages/core/src/repositories/kb-document.test.ts` — vector round-trip test (populated + null embedding).
- `packages/core/src/repositories/tool.test.ts`
- `packages/core/src/repositories/channel.test.ts`
- `packages/core/src/repositories/conversation.test.ts`
- `packages/core/src/errors.ts` — `AppendOnlyViolation`, `WorkspaceScopeViolation` (both `extends Error` with explicit `name` property; no `any`).
- `packages/core/src/test-utils.ts` (or similar — IC chooses naming) — shared vitest setup helper that constructs a `pg.Client` + Drizzle for tests. Per-test schema-reset pattern (drop + create + migrate). Document in commit body why this lives in the package vs. a shared `@kuralle/test-utils` workspace (KISS: keep it inside `packages/core` for now).
- `packages/core/README.md` — short public-surface doc; one paragraph per repository.

**Modify:**
- `eslint.config.mjs` — add `no-restricted-imports` rule for `packages/api/src/routers/**` forbidding `drizzle-orm` and `@kuralle/db/schema/**`. Keep all existing rules; **only** add. Verify `packages/api/src/routers/agents.ts` would fire the rule (then leave it un-fired — agents.ts is rewritten in S2-03 to use the repository).
- `package.json` (root) — **DO NOT** add deps. Only addition allowed: a catalog entry for `pg` if it isn't already in catalog (memory: `pg: ^8.14.1` is already in catalog per `user_local_postgres.md`; verify before assuming).

**Do not touch:**
- `packages/api/src/routers/**` — those are S2-03's job.
- `packages/db/src/**` — schema is S1's; you consume it, don't edit it.
- `packages/platform/src/**` — port is fixed; you consume it.
- `apps/web/**`, `apps/server/**` — those are S2-03 / S2-04's job.
- Any landed migration file in `packages/db/src/migrations/`.

---

## 4. Acceptance criteria (numbered, in priority order)

These are the gates the reviewer will check. Pass all of them.

1. **Workspace package wired.** `packages/core/package.json` exists; `bun install` resolves it; `turbo` picks it up (build/test/lint tasks defined or inherited via `turbo.json`). No root devDep additions. `bun -F @kuralle/core check-types` and `bun -F @kuralle/core test` pass.

2. **Six repositories, each scoped via `withWorkspace`.** Each repository class has explicit, narrow public methods: at minimum `findById(id)`, `findManyByWorkspace(opts: { cursor?: string; limit?: number })`, `insert(row)`, `update(id, patch)`. `softDelete(id)` exists where the table has a `deletedAt` column (`agents`, `kbDocuments`, `tools`, others per `DATA_MODEL.md §15`). No method takes `workspaceId` as a parameter — the factory closure provides it. **Rationale:** explicit workspace scoping at construction time prevents cross-workspace bugs at the call site.

3. **Workspace scope is enforced.** Every query attaches `eq(<table>.workspaceId, this.workspaceId)` (or the equivalent FK chain for projection tables that don't have `workspaceId` directly — those go via `agent_versions → agents.workspaceId`). A test demonstrates that a repository constructed with workspace `A` returns 0 rows for an agent owned by workspace `B`. If a query returns a row owned by another workspace, the repository throws `WorkspaceScopeViolation` (defense in depth).

4. **Identity-map cache (Fowler PoEAA, per `HEXAGONAL_ARCHITECTURE.md §5`).**
   - `findById(id)` is `kv.getOrCompute('repo:<resource>:<workspaceId>:<id>', () => <db query then toDomain>, { ttlSeconds: 60 })`.
   - The cache holds the **domain object** (the `toDomain(row)` output), not the raw Drizzle row.
   - `insert`, `update`, `softDelete` invoke `kv.delete('repo:<resource>:<workspaceId>:<id>')` **after** the underlying DB write completes (i.e., after `await db.insert/update/...`). If the DB write throws, no cache mutation happens.
   - **Test required:** `findById → cache miss (DB hit) → cache hit (no DB hit, asserted via DB query counter or spy) → update → next findById = cache miss again`. Per `feedback_per_story_kimi_review.md`, the gate will check for this trace.

5. **Append-only app-layer guard.** `AgentVersionRepository.update(id, patch)` always throws `AppendOnlyViolation`, regardless of `patch` content. The DB trigger from S1-02 is the canonical enforcement; this guard is the friendly error surface so callers don't have to read Postgres error codes. Test: assert the error is thrown and the row is unchanged.

6. **Vector round-trip test (closes BL-S1-VECTOR-ROUNDTRIP-TEST).** `KbDocumentRepository.test.ts` (or a sibling `kb-chunk` test if you add the chunk repository) asserts: insert a `kb_chunk` row with a populated 1024-dim vector → `findById` round-trips the array → assert structural equality. Then insert a row with `embedding = null` → `findById` returns `embedding: null` (no `fromDriver` crash). Per `sprint-1/WARMDOWN.md` KI-1-06.

7. **ESLint rule fires on direct `drizzle-orm` use from routers.** Add `no-restricted-imports` (or equivalent) to `eslint.config.mjs` matching `packages/api/src/routers/**` files. Forbidden specifiers: `drizzle-orm`, `drizzle-orm/*`, `@kuralle/db/schema`, `@kuralle/db/schema/*`. Verify in a throw-away change: write `import { eq } from 'drizzle-orm'` in `packages/api/src/routers/agents.ts`, run `bun run lint`, confirm rule fires, **revert the change**. Capture the lint failure into `sprints/sprint-2/artifacts/S2-01-lint-rule-fires.txt`.

8. **All public surfaces have happy + failure tests.** Repository tests are written against the **memory `KvStore` adapter** + local Postgres at `postgres://kuralle:kuralle@localhost:5432/kuralle_dev` (memory rule). Tests use a per-test schema reset (drop + create + run drizzle-kit migrations) OR a transaction-rollback-around-each-test pattern — IC picks one, documents in commit body. **Do NOT use docker.** **Do NOT use neon-http for local tests.**

9. **Hexagonal discipline holds.** `packages/core/src/**` imports from `@kuralle/db`, `@kuralle/platform/interface`, `drizzle-orm`, `zod` only. NO imports from `@kuralle/platform/cloudflare`, `@kuralle/platform/node`, `@kuralle/platform/memory` (memory adapter is for tests, imported in test files only). The S0-06 ESLint hexagonal rule should already cover this; if it doesn't, that's a finding — flag it.

10. **No `--no-verify`, `@ts-ignore`, `catch (e: any)`, root devDep additions, default exports, or speculative methods (e.g., `findManyByDateRange` if no caller requires it).**

11. **Atomic commit `[S2-01] @kuralle/core repositories + KvStore identity-map cache`.** Body includes:
    - The DB substrate choice (pglite vs. local-pg) + per-test reset strategy + rationale.
    - Whether `softDelete` was added per repository or only where `deletedAt` exists.
    - Whether you added a catalog entry for any new dep, and whether you used `bun pm view <pkg> version` to pin.
    - Demo artifact path: `sprints/sprint-2/artifacts/S2-01-repo-cache-trace.txt`.

---

## 5. Demo artifact

`sprints/sprint-2/artifacts/S2-01-repo-cache-trace.txt` — output of `bun -F @kuralle/core test --reporter verbose`, showing:
- Each of the 6 repositories has at least 2 passing tests (happy + failure).
- The `AgentRepository.findById` cache trace: miss → hit → invalidation.
- The `KbDocumentRepository` vector round-trip (populated + null).
- The `AgentVersionRepository.update` `AppendOnlyViolation` test.

`sprints/sprint-2/artifacts/S2-01-lint-rule-fires.txt` — captured `bun run lint` output from the throw-away violation, showing the rule fires.

---

## 6. Anti-scope (what NOT to do)

- **Do not** wire repositories into `packages/api/src/routers/**`. That's S2-03's job.
- **Do not** add the projector worker. That's S2-02's job; it lives in `@kuralle/runtime`, not `@kuralle/core`.
- **Do not** add a `@kuralle/test-utils` workspace package; keep test helpers inside `packages/core/src/test-utils.ts`.
- **Do not** use docker for the test DB (memory rule). User runs Postgres.app on `localhost:5432`.
- **Do not** add deps to the workspace-root `package.json`. Per memory rule, the user reverts these silently.
- **Do not** speculate on multi-region cache eviction, distributed cache coherency, or async projection — the cache is a single-process identity-map; multi-region is BL-06.
- **Do not** invent repository methods that have no caller. `findManyByDateRange`, `count`, `existsById`, `findOrCreate` — none of these are required by S2-03 or S2-04. KISS.
- **Do not** edit `apps/server/openapi.json`, any router file, any migration file, or any `apps/web/**` file.

---

## 7. Verification before you commit

Run each of these and paste the relevant tail into the commit body:

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle
bun install --frozen-lockfile 2>&1 | tail -3
bun run check-types 2>&1 | tail -5
bun run lint 2>&1 | tail -5
bun -F @kuralle/core test 2>&1 | tail -20
```

All four must be green. If `bun -F @kuralle/core test` requires the local DB to be running, document the prerequisite in `packages/core/README.md`.

If you cannot make the SLOs / criteria above hold, **stop and flag** rather than skip a test. The kickoff prompt's project-specific blocker rule applies.
