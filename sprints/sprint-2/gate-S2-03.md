# Gate Review — `S2-03` agents publish/autoSave/list/get/history + OpenAPI cleanup

**Verdict:** yellow
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** 3b8ecd459838ba57afb68c402e1910b23d7bdd8e

---

## 1. Spec adherence (walk AC#1–#13)

### AC#1 — Five procedures on `agentsRouter`
**Partial.** All five procedures exist with explicit Zod input/output schemas (`packages/api/src/routers/agents.ts:70–217`). `publish` and `autoSave` are mutations. Input shapes match the brief.
- `list` / `history` accept `cursor` in input (`agents.ts:23`) but the handler does **not** pass it to the repository (`agents.ts:78–79`, `agents.ts:211–212`). The repository methods declare `cursor?: string` but also do not implement cursor pagination.
- Output schemas on the agents router are `.strict()` — good.

### AC#2 — `agents.publish` is transactional
**Met.** `AgentRepository.publishVersion` (`packages/core/src/repositories/agent.ts:180–199`) opens one Drizzle transaction, performs insert → `opts.project(tx, ...)` → `UPDATE agents SET activeVersionId = ...`, then commits. Rollback on any step failure is automatic.

### AC#3 — `agents.autoSave` non-transactional projector-skip
**Met.** Single `repos.agentVersions.insert()` call (`agents.ts:187–196`). `versionKind='auto_save'`. No projection callback, no pointer swap, no cache invalidation.

### AC#4 — Workspace scope + cache invalidation timing
**Partial on cache resilience.** Cache invalidation happens **after** the transaction block (`agent.ts:209–212`) — verified by reading the code structure. This satisfies the "after commit" requirement.
- **Gap:** `kvStore.delete` calls are not wrapped in `try/catch`. If a production adapter throws (the Cloudflare/Node stubs today throw `not-implemented`), the error propagates to the client as a 500 even though the publish transaction succeeded. The brief requires the failure to be "logged but does NOT roll back the publish."

### AC#5 — Append-only error surface (`ORPCError('CONFLICT')`)
**Missed.** `agents.publish` (`agents.ts:133–149`) does not catch errors from `repos.agents.publishVersion`. A concurrent publish racing on `nextVersionNumber` → `versionNumber` unique-constraint violation, or any other transactional failure, bubbles up as a raw Postgres error / 500 rather than `ORPCError('CONFLICT')`. The `AppendOnlyViolation` class exists in `@kuralle/core` but is never mapped to an oRPC error code in the router.

### AC#6 — Integration test
**Partial.** `apps/server/src/__tests__/agents.publish.test.ts` has 4 tests (publish round-trip, autoSave, NOT_FOUND on `get`, cache invalidation).
- **Missing:** `NOT_FOUND` test for `agents.publish` specifically (the brief requires this).
- **Missing:** Projection row count assertions (`agent_tool_attachments`, `agent_kb_attachments`, etc.). The `MINIMAL_IR` has empty collections, so the projector writes zero rows; the test never asserts even that zero-count expectation.
- **Missing:** Cache-miss vs cache-hit verification. The test reads before/after publish and asserts `activeVersionId` changed, but does not verify the cache was actually invalidated (no spy or counter on `kvStore.delete`).
- **Test substrate:** In-process oRPC via `~orpc` def + local PG + memory KvStore. Acceptable.

### AC#7 — OpenAPI scope expansion (11 list operations with explicit row schemas)
**Met.** All 11 list routers have `.schemas.ts` siblings and use `z.array(<resourceSchema>)`. Verified by comparing the old `openapi.json` (all 11 list `items` were `anyOf [{}, null]`) to the new spec (all 11 now emit full row schemas with `additionalProperties: false`).
- `openapi.json` diff: **+2719 / –55 lines**, drift gate green (`bun -F server gen:openapi --check` ✅).
- 17 total operations in spec (13 existing + 4 new agent ops).

### AC#8 — `packages/api-client/src/schema.d.ts` regenerated
**Acceptably skipped.** Per AMENDMENT-001 the frontend uses `@orpc/tanstack-query`; `schema.d.ts` is genuinely unnecessary. The IC disclosed this in the commit body ("api-client/schema.d.ts ghost per AMENDMENT-001"). No stale file exists.

### AC#9 — Sensitive column omissions documented
**Met.** `secrets.schemas.ts:5–9` documents `ciphertext` omission. `kb.schemas.ts:5–8` documents `embedding` omission. Both headers cite `DATA_MODEL.md` rationale.

### AC#10 — No raw `drizzle-orm` or `@kuralle/db/schema/**` imports in routers
**Met.** Grep of `packages/api/src/routers/**/*.ts` shows zero direct `drizzle-orm` or `@kuralle/db/schema` imports. ESLint `no-restricted-imports` rule applies to all 11 routers (the `ignores` array was removed in `eslint.config.mjs`).

### AC#11 — All gates green
**Met.**
- `bun run check-types` ✅ (8/8 cached, green)
- `bun run lint` ✅ (0 errors; 1 pre-existing warning in `packages/env/src/web.ts`)
- `bun -F server test` ✅ (8 passed — 4 tests × 2 files because vitest picks up both `src/` and `dist/src/`; harmless)
- `bun -F server gen:openapi --check` ✅

### AC#12 — No shortcuts
**Partial.** The integration test file contains two deviations:
- `apps/server/src/__tests__/agents.publish.test.ts:10`: `/* eslint-disable @typescript-eslint/no-explicit-any */`
- `apps/server/src/__tests__/agents.publish.test.ts:84`: `as unknown as Context["session"]`
Both are in test code, but the brief’s standard (“No `@ts-ignore`, `as unknown as`”) and the gate instructions explicitly flag these.

### AC#13 — Atomic commit
**Met.** Subject `[S2-03] agents publish/autoSave/list/get/history + OpenAPI row schemas across 11 routers` matches the brief. Body lists new operations, transactional sequence, omitted columns, OpenAPI diff size, and integration test summary.

---

## 2. Code quality

### Naming
Procedures (`list`, `get`, `publish`, `autoSave`, `history`), schema files (`<resource>.schemas.ts`), and repo additions (`publishVersion`, `nextVersionNumber`, `findByAgentId`, `RepoDb`) all match the brief.

### Type tightness
- No `any` in production router or repository source.
- `unknown` used correctly for jsonb fields (`metadata`, `snapshot`, `perAgent`, `failures`).
- `ORPCError` thrown with explicit `"NOT_FOUND"` codes.
- `import type` used for type-only imports in `context.ts`.

### Error handling
- `agents.publish` does **not** catch and remap transactional failures → `ORPCError('CONFLICT')`. This is the biggest error-surface gap.
- `WorkspaceScopeViolation` exists as defense-in-depth in repositories but is never translated to `ORPCError('NOT_FOUND')` at the router boundary.

### Idiomatic patterns
- Named exports only — no `default export` found.
- `agents.schemas.ts` uses `.strict()` consistently.
- The **10 non-agent list routers** use `z.object({ items: z.array(...), cursor: ... })` **without `.strict()`** on the outer output shape. Inconsistent with the agents router and the brief’s “Zod `.strict()` everywhere” standard.

### Smells
- `agents.publish` double-parses `ir`: oRPC input schema already validates `agentIRSchema`, then the handler calls `agentIRSchema.parse(input.ir)` redundantly (`agents.ts:136`).
- All 11 list routers ignore `cursor` (return `cursor: null` always). For the 10 stub routers this is expected; for `agents.list` and `agents.history` it is a partial implementation.

### Comments
- Transactional-sequence comment present in `AgentRepository.publishVersion` (`agent.ts:163–167`).
- Cache-invalidation timing comment is implicit in the code structure (delete after `await this.db.transaction(...)`) but lacks an explicit inline comment.
- Sensitive-omission rationale comments present in `secrets.schemas.ts` and `kb.schemas.ts`.

### Test quality
- Test names are descriptive.
- The `call()` helper directly invokes the `~orpc` def handler. This is clean for in-process testing.
- **Weaknesses:** no projection-row assertions, no `NOT_FOUND` coverage for `publish`, no spy on `kvStore.delete` for cache invalidation, no AMENDMENT-003/004 fixture data.

---

## 3. Carry-forwards from S2-02 amendments

### AMENDMENT-003 — `scorerAttachments` expanded fields
**Not exercised by integration test.** The `MINIMAL_IR` uses `scorerAttachments: {}`. The test does not pass an IR with `name`, `description`, `kind`, or `rubric` fields, nor does it assert `agent_eval_criteria` rows. The projector code in `packages/runtime/src/projector/agent.ts:112–125` correctly implements the amendment (falls back to defaults).

### AMENDMENT-004 — `workflow` top-level key
**Not exercised by integration test.** The `MINIMAL_IR` omits `workflow`. The projector code correctly branches on `ir.workflow?.nodes/edges` (`agent.ts:128–145`).

---

## 4. Findings

| ID | Severity | File:line | Description | Apply now? |
|---|---|---|---|---|
| F01 | major | `packages/api/src/routers/agents.ts:133–149` | `agents.publish` handler has no try/catch around `repos.agents.publishVersion`. Transactional failures (unique constraint, append-only trigger, etc.) bubble up as raw 500s instead of `ORPCError('CONFLICT')`. | Yes |
| F02 | major | `apps/server/src/__tests__/agents.publish.test.ts` | Missing `NOT_FOUND` test for `agents.publish` with a non-existent `agentId`. AC#6 explicitly requires this. | Yes |
| F03 | minor | `apps/server/src/__tests__/agents.publish.test.ts` | Missing projection row count assertions (`agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`). The `MINIMAL_IR` has empty collections, so even a zero-count assertion would be better than nothing. | Yes |
| F04 | minor | `apps/server/src/__tests__/agents.publish.test.ts` | AMENDMENT-003 and AMENDMENT-004 are not exercised. Add a second fixture IR with `scorerAttachments` containing per-criterion fields and `workflow.nodes/edges` with ≥2 nodes + 1 edge, then assert the projection rows landed. | Yes |
| F05 | minor | `packages/api/src/routers/{conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.ts:11` | `listOutput` schemas lack `.strict()`. The agents router uses `.strict()` on all outputs; the other 10 routers should match for consistency. | Yes |
| F06 | minor | `packages/api/src/routers/agents.ts:78–79`, `agents.ts:211–212` | `agents.list` and `agents.history` accept `cursor` in input but never pass it to the repository (always return `cursor: null`). Either implement cursor pagination or remove the parameter from the input schema. | Yes |
| F07 | minor | `packages/core/src/repositories/agent.ts:209–212` | `kvStore.delete` calls after publish are unguarded. If a production `KvStore` adapter throws, the client sees a 500 despite a successful publish. Wrap in `try/catch` and log. | Yes |
| F08 | minor | `apps/server/src/__tests__/agents.publish.test.ts:10`, `test.ts:84` | `eslint-disable @typescript-eslint/no-explicit-any` and `as unknown as Context["session"]` are present in the diff. Replace with a typed test-context factory or use `satisfies Context`. | Yes |
| F09 | nit | `packages/api/src/routers/agents.ts:136` | Redundant `agentIRSchema.parse(input.ir)` — oRPC already validates the input shape. Remove or replace with a type-only assertion. | Yes |

---

## 5. Recommendation to the manager

**Verdict: yellow.** The core transactional publish path, OpenAPI cleanup, and schema hygiene are solid. The commit lands 5 agent procedures, 11 explicit row schemas, and a green drift gate. However, the error-surface contract for `agents.publish` is incomplete (raw errors instead of `ORPCError('CONFLICT')`), and the integration test leaves several AC#6 assertions unverified (publish NOT_FOUND, projection row counts, cache-miss verification, AMENDMENT-003/004 exercise).

**Fix-pass priority:**
1. Add try/catch in `agents.publish` handler to remap repository/transaction errors to `ORPCError('CONFLICT')` (F01).
2. Expand the integration test to cover the four gaps noted in F02–F04.
3. Add `.strict()` to the 10 non-agent `listOutput` schemas (F05) and wire or drop `cursor` (F06).
4. Guard `kvStore.delete` in `publishVersion` with try/catch+log (F07).
5. Remove the `eslint-disable` and `as unknown as` from the test file (F08).

After the fix pass, re-run the full verification suite (`check-types`, `lint`, `gen:openapi --check`, `bun -F server test`) and update the artifact files if the diff changes.
