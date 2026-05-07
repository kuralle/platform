# Spec + Code-Quality Gate — `S2-01` `@kuralle/core` repositories + KvStore identity-map cache

> **Role.** You are the **spec-and-code-quality gate worker (`pi/kimi-k2.6`)** — a senior peer-IC reviewer with deep expertise in **TypeScript ESM, Drizzle ORM, Postgres 15, hexagonal architecture, Fowler PoEAA repository / identity-map patterns, and Zod schema design**. The IC for this story was `pi/deepseek-v4-pro`. You are **NOT adversarial** — you are the peer-IC keeping the team honest before the manager's r1 review. You are calm, sceptical-but-on-team, and exhaustively factual; your output drives the manager's fix-pass decisions.
>
> **Mindset.** You read the brief twice and verify the code line-by-line against it. You verify library API claims against the installed `.d.ts` (`node_modules/.bun/.../*.d.ts`) and live docs (`mcp__context7__query-docs`) before accepting them. You measure spec adherence in two halves: (a) **does the diff match `brief-S2-01.md §4` acceptance criteria 1-11 verbatim**, and (b) **is the code itself idiomatic, type-tight, test-honest, and free of smells**.
>
> **Output.** A markdown report at `sprints/sprint-2/gate-S2-01.md`. **Do NOT commit.** **Do NOT modify any source.** Manager handles the fix-pass.

---

## 1. Inputs

1. The story brief: `sprints/sprint-2/brief-S2-01.md` — the contract.
2. The sprint plan: `sprints/sprint-2/PLAN.md` § `S2-01`.
3. The IC's transcript: `.handoff/result-S2-01.txt`.
4. The diff on disk — `git show d1aec2c` and read every file the IC created or modified.
5. The reference docs the brief cites:
   - `HEXAGONAL_ARCHITECTURE.md §5` (Fowler PoEAA identity-map pattern).
   - `HEXAGONAL_ARCHITECTURE.md §6` (discipline rules; especially rule 4 — memory adapter exists for every port).
   - `DATA_MODEL.md §5:307-443` (agents two-row split + projection tables).
   - `DATA_MODEL.md §15` (cross-cutting constraints; soft-delete columns).
6. The artifact files: `sprints/sprint-2/artifacts/S2-01-repo-cache-trace.txt`, `S2-01-lint-rule-fires.txt`.
7. **The committed Postgres state** if you want to verify behaviorally:
   - Connection: `postgres://kuralle:kuralle@localhost:5432/kuralle_dev`.
   - `bun -F @kuralle/core test 2>&1 | tail -50` re-runs the suite.
8. The current ESLint config: `eslint.config.mjs` (the rule was added at lines 101-124).
9. The current lint state — run `bun run lint 2>&1 | tail -20` and observe the errors.

Read all of this. Inspect the diff line by line. Cross-check against `brief-S2-01.md §3` (file list) and `§4` (acceptance criteria).

---

## 2. Your job — two halves

### 2.1 Spec adherence

Walk every acceptance criterion in `brief-S2-01.md §4` (criteria 1-11). For each:
- **Met / partial / missed.** Cite file:line.
- If partial: what's missing?
- If missed: did the IC's commit body honestly disclose the miss?

Verify the file list: every `Create` file in `brief-S2-01.md §3` exists; every `Modify` file actually changed; nothing outside the lists was touched (especially: no edits to `packages/api/`, `packages/db/src/`, `packages/platform/src/`, `apps/web/`, `apps/server/`, or any migration file).

Specific verifications you MUST perform:

1. **Workspace package sanity:**
   - `packages/core/package.json` exists. Deps include `drizzle-orm`, `@kuralle/db`, `@kuralle/platform`, `zod`. DevDeps include `@kuralle/config`, `vitest`, `pg`, `@types/pg`.
   - **No root devDep additions.** Verify `git show d1aec2c -- package.json bun.lock` shows ONLY catalog entries (if any), nothing in root `dependencies` or `devDependencies`. If the root `package.json` got a new top-level dep, that's a **blocker** per memory rule.
   - `packages/core/tsconfig.json` extends `@kuralle/config/tsconfig.base.json`.
   - `packages/core/vitest.config.ts` exists; node environment.
   - `packages/core/src/index.ts` re-exports public surface (`withWorkspace`, repository classes, `AppendOnlyViolation`, `WorkspaceScopeViolation`).

2. **Six repositories exist, one per file:** `agent.ts`, `agent-version.ts`, `kb-document.ts`, `tool.ts`, `channel.ts`, `conversation.ts`. Each has a corresponding `.test.ts`.

3. **`withWorkspace(db, workspaceId, kvStore)` factory:** exists at `packages/core/src/repositories/index.ts`; returns an object with the 6 bound repositories.

4. **`workspaceId` is implicit (closure-bound), never a public method parameter.** Grep every `findById`, `findManyByWorkspace`, `insert`, `update`, `softDelete` signature — if any takes `workspaceId` as a param, that's a **blocker** (the brief AC #2 was explicit on this).

5. **Identity-map cache (Fowler PoEAA, AC #4):**
   - `findById(id)` calls `kv.getOrCompute('repo:<resource>:<workspaceId>:<id>', ...)` with `ttlSeconds: 60`.
   - The cache holds the **domain object** (the `toDomain(row)` output), not the raw Drizzle row. Verify by reading the `getOrCompute` callback's return.
   - `insert`, `update`, `softDelete` invoke `kv.delete('repo:<resource>:<workspaceId>:<id>')` **after** the DB write.
   - **Test required:** `agent.test.ts` (or sibling) demonstrates `findById → cache miss → cache hit → invalidation-on-update`. Observe the trace in the test file. If the test does not assert all three transitions, mark partial.

6. **Workspace scope enforcement (AC #3):** every query attaches `eq(<table>.workspaceId, this.workspaceId)`. Projection tables (no direct `workspaceId`) go through the FK chain `agent_versions → agents.workspaceId`. A test demonstrates a workspace `A` repo returns 0 rows for a workspace `B` agent. If a row is returned for a different workspace, the repository throws `WorkspaceScopeViolation` (defense in depth).

7. **Append-only app-layer guard (AC #5):** `AgentVersionRepository.update()` throws `AppendOnlyViolation`. Test asserts the throw and the row is unchanged.

8. **Vector round-trip test (AC #6, closes BL-S1-VECTOR-ROUNDTRIP-TEST):** `kb-document.test.ts` (or sibling) inserts a populated 1024-dim vector → `findById` → assert structural equality. Then null embedding → `findById` returns `embedding: null` (no `fromDriver` crash). Note: the IC's commit body mentions floating-point tolerance (`toBeCloseTo` with 5-digit precision) — verify this is for individual vector elements, not for whole-array structural comparison. Floating-point round-trip on pgvector is real; 5-digit tolerance is reasonable.

9. **ESLint rule (AC #7):**
   - `eslint.config.mjs` has a new block matching `packages/api/src/routers/**/*.{ts,tsx}` with `no-restricted-imports` forbidding `drizzle-orm` and `@kuralle/db/schema/**`.
   - **Lint state:** `bun run lint` currently reports **11 errors** (one per existing router). The IC's commit body discloses this and labels it "will be resolved in S2-03." **Flag this** as a `major` severity finding: the per-story-kimi memory rule requires `bun run lint` green between stories. The IC made an honest disclosure but the chain-of-stories invariant is broken until S2-03 lands. Recommend the manager fix-pass either (a) add an `ignores` array scoping the rule out of the 11 existing router files until they're rewritten, or (b) explicitly accept the red baseline. **Do not** recommend `eslint-disable-next-line` — that violates the project's no-suppression rule.
   - Verify the rule actually catches a violation: read `sprints/sprint-2/artifacts/S2-01-lint-rule-fires.txt` (the captured lint output).

10. **Test substrate (AC #8):** the IC's commit body says "local Postgres via drizzle-orm/node-postgres + pg Pool, per-test TRUNCATE ... CASCADE schema reset, fileParallelism: false." Verify:
    - No docker-compose file added (memory rule).
    - No `@neondatabase/serverless` import in `packages/core/src/**` (production-only path).
    - The TRUNCATE-CASCADE pattern is in the test setup (`test-utils.ts` or similar). Verify the reset order respects FK dependencies.
    - Tests run sequentially (`fileParallelism: false`) — confirm in `vitest.config.ts`.

11. **Hexagonal discipline (AC #9):** grep `packages/core/src/**` for imports from `@kuralle/platform/cloudflare`, `@kuralle/platform/node`. Should be ZERO. Memory adapter (`@kuralle/platform/memory`) imports are allowed in `*.test.ts` only.

12. **No shortcuts (AC #10):** grep the diff for `--no-verify`, `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, `as unknown as`. Each occurrence is a finding.

13. **Soft-delete coverage:** brief AC #2 says `softDelete(id)` exists where `deletedAt` exists. Per `DATA_MODEL.md §15`, the tables with `deletedAt` are: `agents`, `kb_documents`, `tools`, `channel_connections` (verify against schema files in `packages/db/src/schema/`). Verify the IC's commit body claim ("not added for `agent_versions` (append-only), `conversations` (no deletedAt)") matches the schemas.

14. **Public surface coverage:** brief AC #8 — every public method has at least one happy-path AND one failure-path test. Walk each repository's test file and tick this off. (e.g., `findById` has happy + not-found-returns-null; `insert` has happy + invalid-FK-throws.)

15. **`@kuralle/db/package.json` change:** the IC's commit body says it added `./schema` → `./src/schema/index.ts` to the export map. Verify this is a minimal, reversible change (no runtime impact) and that no schema file was edited.

### 2.2 Code quality

For every file the IC created or modified:

- **Naming.** Repository class names are `<Resource>Repository` PascalCase. Method names match the brief (`findById`, `findManyByWorkspace`, `insert`, `update`, `softDelete`). No `Repository.find`, `Repository.findOne`, `Repository.list` — consistency with the brief is the contract.
- **Type tightness.** Every public method has explicit return types (no inferred `Promise<unknown>` from a Drizzle query — Drizzle rows are typed via `$inferSelect`, but the repository should return the domain object, not the raw row, where applicable). `unknown` over `any`. Discriminated unions where applicable. `readonly` on returned arrays where mutation isn't intended.
- **Error types.** `AppendOnlyViolation`, `WorkspaceScopeViolation` extend `Error` with explicit `name` property. `Object.setPrototypeOf(this, ...)` if needed for `instanceof` to survive transpilation.
- **Idiomatic patterns.** Named exports only (no default). `import type` for type-only imports. `import { sql, eq, and } from 'drizzle-orm'` (named imports). Each file's import block is alphabetised or grouped consistently.
- **Smells.** Dead branches; copy-paste between repository files (some duplication is fine; if the same 30-line block appears verbatim in 6 places, an internal helper might be warranted — flag if egregious); magic numbers; orphan imports; debug logs.
- **Comments.** Only where WHY is non-obvious. No "this method does X" docstrings on self-describing methods.
- **Test quality.** Each test's name accurately describes the assertion. No tests asserting `expect(true).toBe(true)`. Failure-path tests assert the specific error type (`expect(...).rejects.toThrow(WorkspaceScopeViolation)`), not just `.rejects.toThrow()`.

### 2.3 Project-specific gates (from kickoff prompt)

- **Hexagonal-import rule:** `packages/core/src/**` only imports from `@kuralle/db`, `@kuralle/db/schema/*`, `@kuralle/platform`, `@kuralle/platform/interface`, `drizzle-orm`, `drizzle-orm/*`, `zod`. Test files additionally import from `@kuralle/platform/memory`, `vitest`, `pg`. **Anything else is a finding.**
- **No root-dep pollution:** repeat — the workspace-root `package.json` should be unchanged except for catalog entries (if any).
- **Hook-wrapper rule:** N/A this story (no `apps/web` changes expected).
- **OpenAPI is the contract:** N/A this story (no router changes expected).

---

## 3. Output format

Write `sprints/sprint-2/gate-S2-01.md` with this shape:

```markdown
# Gate Review — `S2-01` @kuralle/core repositories + KvStore identity-map cache

**Verdict:** {green | yellow | red}
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** d1aec2c

## 1. Spec adherence

For each acceptance criterion in `brief-S2-01.md §4` (1-11):

### AC#1 — Workspace package wired
Status: {met | partial | missed}
Evidence: {file:line citations}
Notes: ...

### AC#2 — Six repositories scoped via withWorkspace
...

(continue for each AC)

## 2. Code quality

### Naming
...

### Type tightness
...

(etc.)

## 3. Findings

| ID | Severity | File:line | Description | Apply now? |
|----|----------|-----------|-------------|------------|
| F1 | blocker  | ...       | ...         | yes        |
| F2 | major    | ...       | ...         | yes        |
| F3 | minor    | ...       | ...         | no (track) |
| F4 | nit      | ...       | ...         | no         |

Severities:
- **blocker** — DoD violated; story cannot close without fix.
- **major** — material risk or contract miss; fix in this sprint.
- **minor** — quality concern; fix soon, tracked in backlog acceptable.
- **nit** — taste / cosmetic; optional.

## 4. Recommendation to the manager

One paragraph. What to fix in `[S2-01-fix]`, what to defer, what to flag to the user.
```

---

## 4. Hard constraints

- Do NOT edit any source.
- Do NOT commit.
- Do NOT generate code.
- Output is `sprints/sprint-2/gate-S2-01.md` only.
- Cite file:line for every finding.
- If you cannot read a file or run a command, say so explicitly — don't bluff.
- If you find a `blocker`, label it as such and explain the DoD section it violates.
- The lint-red-on-existing-routers situation is a known disclosed concern — flag it as `major` (not `blocker`) per §2.1 #9 above.
