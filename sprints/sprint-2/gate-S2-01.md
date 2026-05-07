# Gate Review — `S2-01` @kuralle/core repositories + KvStore identity-map cache

**Verdict:** yellow
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** d1aec2c

---

## 1. Spec adherence

### AC#1 — Workspace package wired
**Status:** met  
**Evidence:**
- `packages/core/package.json:1-24` exists with deps `drizzle-orm`, `@kuralle/db`, `@kuralle/platform`, `zod` and devDeps `@kuralle/config`, `vitest`, `pg`, `@types/pg`.
- `packages/core/tsconfig.json:1-8` extends `@kuralle/config/tsconfig.base.json`.
- `packages/core/vitest.config.ts:1-11` uses `environment: "node"`, `fileParallelism: false`.
- `packages/core/src/index.ts:1-31` re-exports public surface.
- `bun -F @kuralle/core check-types` exits 0; `bun -F @kuralle/core test` exits 0 (43/43).
- Root `package.json` unchanged except lockfile; no root devDep additions.
- `turbo.json` workspaces glob `packages/*` already includes `@kuralle/core`.

### AC#2 — Six repositories scoped via `withWorkspace`
**Status:** met  
**Evidence:**
- Six repository files created: `agent.ts`, `agent-version.ts`, `kb-document.ts`, `tool.ts`, `channel.ts`, `conversation.ts`.
- Factory at `packages/core/src/repositories/index.ts:10-24` returns bound instances.
- No public method signature in any repository takes `workspaceId` as a parameter (verified by grep).

### AC#3 — Workspace scope enforced
**Status:** partial  
**Evidence:**
- Every query attaches `eq(<table>.workspaceId, this.workspaceId)` or the FK chain (`agent_versions → agents.workspaceId`) — `agent.ts:56-60`, `agent-version.ts:55-68`.
- Tests demonstrate cross-workspace isolation: `agent.test.ts:115-120`, `agent-version.test.ts:55-70`.
- **Missing:** `WorkspaceScopeViolation` is defined (`errors.ts:8-15`) but **never thrown** in any repository. AC#3 explicitly requires defense-in-depth throw if a row from another workspace is returned.

### AC#4 — Identity-map cache (Fowler PoEAA)
**Status:** partial  
**Evidence:**
- `findById` uses `kv.getOrCompute` with `ttlSeconds: 60` in all repositories (`agent.ts:52-63`, `kb-document.ts:120-131`, etc.).
- Callback returns `toDomain(row)` — cache holds domain objects, not raw Drizzle rows (`agent.ts:38-50`).
- `update` and `softDelete` call `kv.delete(cacheKey(...))` after the DB write (`agent.ts:115`, `agent.ts:128`).
- **Missing:**
  1. `insert` in **every** repository omits `kv.delete` (`agent.ts:90-105`, `tool.ts:110-125`, `channel.ts:95-110`, `conversation.ts:105-120`, `kb-document.ts:133-148`, `agent-version.ts:100-115`). AC#4 bullet 3 explicitly requires `insert` to invoke deletion after the write.
  2. Cache-trace test does not assert the miss→hit transition with a DB-query spy or counter. `agent.test.ts:95-108` asserts functional correctness after invalidation but does not prove the second `findById` is a cache hit or that the third (post-update) is a cache miss.

### AC#5 — Append-only app-layer guard
**Status:** met  
**Evidence:**
- `AgentVersionRepository.update` throws `AppendOnlyViolation` (`agent-version.ts:125-128`).
- Test asserts the throw and unchanged row (`agent-version.test.ts:85-97`).

### AC#6 — Vector round-trip test
**Status:** met  
**Evidence:**
- `kb-document.test.ts:103-125` inserts a 1024-dim vector, round-trips via `insertChunk` and `findChunkById`, asserts structural equality with `toBeCloseTo(..., 5)` per element.
- `kb-document.test.ts:127-140` asserts `embedding: null` round-trips without crash.

### AC#7 — ESLint rule fires on direct drizzle-orm use from routers
**Status:** partial (rule is correct, baseline red)  
**Evidence:**
- `eslint.config.mjs:101-124` adds `no-restricted-imports` for `packages/api/src/routers/**` forbidding `drizzle-orm`, `drizzle-orm/*`, `@kuralle/db/schema`, `@kuralle/db/schema/*`.
- `bun run lint` currently reports **11 errors** (one per existing router) — all `@kuralle/db/schema/*` violations (`S2-01-lint-rule-fires.txt`).
- IC honestly disclosed this in commit body and labelled it "will be resolved in S2-03".
- **Major finding F5** (see §3): the per-story memory rule requires `bun run lint` green between stories. The chain-of-stories invariant is broken until S2-03 lands.
- **Minor finding F6** (see §3): the throw-away `drizzle-orm` import verification was not captured in the artifact; only schema violations are shown.

### AC#8 — All public surfaces have happy + failure tests
**Status:** partial  
**Evidence:**
- 43/43 tests pass across 6 files. Happy path covered for every public method.
- **Thin failure-path coverage:** `insert` lacks invalid-FK / missing-row tests in all repositories (e.g., `agent.test.ts:60-64`, `tool.test.ts:60-63`). `update` lacks a missing-row test (all repos). `softDelete` lacks a not-found test (all repos that have it). The only strong failure-path tests are `findById` (null on missing) and `AgentVersionRepository.update` (`AppendOnlyViolation`).

### AC#9 — Hexagonal discipline holds
**Status:** met  
**Evidence:**
- Zero imports from `@kuralle/platform/cloudflare`, `@kuralle/platform/node`, or `@kuralle/platform/memory` in `packages/core/src/**` excluding `*.test.ts`.
- `@kuralle/platform/memory` imports appear only in test files (`agent.test.ts:3`, etc.).

### AC#10 — No shortcuts
**Status:** met  
**Evidence:**
- No `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, or `--no-verify` found in `packages/core/src/**`.
- No root `package.json` devDep additions.

### AC#11 — Atomic commit with required body
**Status:** met  
**Evidence:**
- Commit `d1aec2c` subject: `[S2-01] @kuralle/core repositories + KvStore identity-map cache`.
- Body documents: DB substrate (local pg), per-test TRUNCATE reset, `softDelete` rationale, `@kuralle/db` export map change, lint-red disclosure.
- Demo artifacts captured: `sprints/sprint-2/artifacts/S2-01-repo-cache-trace.txt`, `S2-01-lint-rule-fires.txt`.

### Additional verifications
- **Soft-delete coverage matches schema:** `agents`, `kb_documents`, `tools`, `channel_connections` have `softDelete`; `agent_versions` (append-only) and `conversations` (no `deletedAt` column) do not. Correct per `DATA_MODEL.md §15`.
- **`@kuralle/db/package.json` change:** minimal export-map addition `./schema → ./src/schema/index.ts`. No schema source files edited.
- **File list sanity:** Every file in `brief-S2-01.md §3` `Create` list exists; `Modify` list (`eslint.config.mjs`, root `package.json`) matches. Nothing outside the list was touched.

---

## 2. Code quality

### Naming
All repository classes are `<Resource>Repository` (PascalCase). Method names match the brief (`findById`, `findManyByWorkspace`, `insert`, `update`, `softDelete`). No `findOne`, `list`, or `Repository.find` aliases. Consistent.

### Type tightness
- Every public method has an explicit return type (`Promise<Agent | null>`, `Promise<Agent[]>`, etc.).
- `unknown` is used for `metadata` and `snapshot`; no `any` in production source.
- Returned arrays are mutable (`Agent[]`); `readonly` would be safer but is not used.

### Error types
- `AppendOnlyViolation` and `WorkspaceScopeViolation` extend `Error` with explicit `name` properties (`errors.ts:2-15`).
- `Object.setPrototypeOf` is omitted; safe because `tsconfig.base.json` targets `ESNext`.

### Idiomatic patterns
- Named exports only; no default exports.
- `import type` used for `NodePgDatabase`, `KvStore`, and schema type imports where appropriate.
- Named imports from `drizzle-orm` (`eq`, `and`, `desc`, `isNull`).
- Import grouping is consistent (drizzle, schema, platform, local).

### Smells
- **Structural duplication** across the six repositories is expected and not egregious (each is ~130-180 lines of repetitive CRUD + cache wiring). No internal helper was extracted; acceptable at this count.
- `findManyByWorkspace` accepts `cursor?: string` in all repositories but ignores it (`agent.ts:64`, `tool.ts:75`, etc.). The parameter is dead surface area until S2-03/04 needs pagination.
- `AgentVersionRepository.findById` innerJoins `agents` without `isNull(agents.deletedAt)` (`agent-version.ts:59`), so versions for soft-deleted agents may still be returned.
- `KbDocumentRepository.findChunkById` innerJoins `kbDocuments` without `isNull(kbDocuments.deletedAt)` (`kb-document.ts:167`), so chunks for soft-deleted documents may still be returned.
- `AgentVersionRepository.insert` explicitly passes `publishedAt: input.publishedAt ?? null`, which overrides the Drizzle column default `now()` with `NULL` when the caller omits the field. This means auto-save rows get `publishedAt = null` at the DB level rather than the default timestamp. Likely unintended.

### Comments
Minimal and justified. The docstring on `AgentVersionRepository.update` (`agent-version.ts:124`) explains the append-only policy; appropriate because the `throw` is surprising.

### Test quality
- Test names accurately describe the assertion.
- No `expect(true).toBe(true)` or placeholder tests.
- Failure-path test for `AgentVersionRepository.update` asserts the specific error class (`rejects.toThrow(AppendOnlyViolation)`).
- The "cache invalidation" test in `agent-version.test.ts:99-112` is misnamed: it asserts a cache hit but does not actually test invalidation (agent_versions cannot be updated).

---

## 3. Findings

| ID | Severity | File:line | Description | Apply now? |
|----|----------|-----------|-------------|------------|
| F1 | major | `packages/core/src/repositories/agent.ts:90-105` (representative; all 6 repos) | `insert` omits `kv.delete(cacheKey(...))` after the DB write. AC#4 explicitly requires it for uniformity of the invalidation contract. | yes |
| F2 | major | `packages/core/src/errors.ts:8-15` | `WorkspaceScopeViolation` is exported but **never thrown**. AC#3 defense-in-depth throw is missing in every repository. | yes |
| F3 | minor | `packages/core/src/repositories/agent.test.ts:95-108` | Cache-trace test asserts functional correctness after update but does not use a DB-query spy/counter to prove `miss → hit → invalidation` transitions. | yes |
| F4 | minor | `packages/core/src/repositories/agent.test.ts:60-64` (representative; all 6 repos) | Failure-path tests missing for `insert` (invalid FK / no row returned), `update` (missing id), and `softDelete` (already deleted / not found). | yes |
| F5 | major | `eslint.config.mjs:101-124` | Lint baseline is red (11 errors on existing routers). Per chain-of-stories invariant, `bun run lint` must be green between stories. **Recommend:** add an `ignores` array to the S2-01 ESLint block scoping the rule out of the 11 existing router files until S2-03 rewrites them; or the manager explicitly accepts the red baseline. Do **not** use `eslint-disable-next-line`. | yes |
| F6 | minor | `sprints/sprint-2/artifacts/S2-01-lint-rule-fires.txt` | Artifact only demonstrates `@kuralle/db/schema/*` violations; the brief AC#7 requires empirical verification that a `drizzle-orm` import also fires. The rule pattern is present but untested. | no (track) |
| F7 | nit | `packages/core/src/repositories/agent.ts:64` | `findManyByWorkspace` accepts `cursor?: string` but ignores it in all six repositories. Dead parameter. | no |
| F8 | minor | `packages/core/src/repositories/agent-version.ts:59` | `findById` innerJoins `agents` without `isNull(agents.deletedAt)`, so versions for soft-deleted agents may still be returned. | yes |
| F9 | minor | `packages/core/src/repositories/kb-document.ts:167` | `findChunkById` innerJoins `kbDocuments` without `isNull(kbDocuments.deletedAt)`, so chunks for soft-deleted documents may still be returned. | yes |
| F10 | minor | `packages/core/src/repositories/agent-version.ts:108` | `insert` passes `publishedAt: input.publishedAt ?? null`, which overrides the Drizzle `defaultNow()` with `NULL` when omitted. Auto-save rows likely intended to have `publishedAt = null`, but this should be explicit (e.g., omit the key) rather than accidental. | yes |

---

## 4. Recommendation to the manager

`[S2-01-fix]` should apply **F1**, **F2**, **F3**, **F4**, **F8**, **F9**, and **F10**.
- **F1:** Add `await this.kv.delete(cacheKey(...))` at the end of every `insert` method (harmless no-op when the key is absent, required by AC#4).
- **F2:** Add a defense-in-depth `WorkspaceScopeViolation` throw in each `findById` when a returned row’s `workspaceId` (or FK-resolved workspace) does not match `this.workspaceId`.
- **F3:** Instrument the cache trace test with a query counter or `db.select` spy so it explicitly asserts `miss → hit → invalidation`.
- **F4:** Add failure-path tests for `insert` (e.g., missing required FK), `update` (missing id → "no row returned"), and `softDelete` (id not found) across the repositories.
- **F8 / F9:** Add `isNull(agents.deletedAt)` and `isNull(kbDocuments.deletedAt)` to the respective FK joins so soft-deleted parents do not leak children.
- **F10:** Change `publishedAt: input.publishedAt ?? null` to only pass the key when provided (e.g., `...(input.publishedAt !== undefined && { publishedAt: input.publishedAt })`) so the DB default is respected when omitted.

**F5** (lint-red baseline) should be resolved in `[S2-01-fix]` by adding an `ignores: ["packages/api/src/routers/**/*.ts"]` to the S2-01 ESLint block **or** by explicitly documenting manager acceptance of the red baseline until S2-03 lands. Do not recommend inline suppressions.

**F6** and **F7** are tracked/minor and can be deferred to S2-03/04.
