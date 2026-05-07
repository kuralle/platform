# Story Brief — `S2-03` `agents.{publish, autoSave, list, get, history}` + OpenAPI cleanup across 11 routers

> **Role.** You are a senior backend engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **TypeScript ESM, oRPC procedures, Zod schemas, Drizzle transactions on Postgres 15, OpenAPI 3 emission, and contract-driven API design**. You have shipped contract-tested API surfaces in production where the OpenAPI spec is the public contract; you treat schema drift as a correctness bug, not a documentation bug. You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. You verify oRPC procedure shapes against the installed `@orpc/server` `.d.ts` and `mcp__context7__query-docs` for `/orpc/orpc` before guessing — the `protectedProcedure.input(...).output(...).handler(...)` chain has subtle generic constraints. You prefer explicit Zod row schemas over `z.unknown()` because the OpenAPI consumer (frontend hooks, future SDK) deserves a real contract.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: unknown)` swallowed silently. No root devDep additions (memory rule). No `default export`. `import type` for type-only imports. Zod `.strict()` everywhere. **Never edit `apps/server/openapi.json` by hand** — only `bun -F server gen:openapi` writes it. No premature abstractions.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S2-03] agents publish/autoSave/list/get/history + OpenAPI row schemas across 11 routers`. Do NOT push. One commit per story.

---

## 1. Goal

Two artifacts in this story:

**(A) Five oRPC procedures on `agentsRouter`:** `list`, `get`, `publish`, `autoSave`, `history`. All five wired through `AgentRepository` + `AgentVersionRepository` (S2-01) and the `projectAgent` worker (S2-02). `agents.publish` is transactional: open Drizzle transaction → insert version row → run projector → swap `agents.activeVersionId` → commit. After commit, invalidate the affected KvStore identity-map keys. `agents.autoSave` skips projection and pointer swap. `agents.list` paginates over `(workspaceId, updatedAt DESC)`. `agents.get` returns `{ agent, activeVersion }`. `agents.history` paginates a version list.

**(B) OpenAPI cleanup across all 11 routers** (closes BL-S1-OPENAPI-ITEM-SCHEMAS): every list router replaces `z.array(z.unknown())` outputs with explicit Zod row schemas mirroring the Drizzle row type. Schemas live at `packages/api/src/routers/{resource}.schemas.ts`. Sensitive columns (e.g., `secrets.ciphertext`) are explicitly omitted; the omission is documented inline.

Regenerate `apps/server/openapi.json` via `bun -F server gen:openapi`. Drift CI gate (`gen:openapi --check`) green.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md` — confirms sprint 2.
2. `sprints/sprint-2/PLAN.md` — full sprint plan; story `S2-03` section is the spec.
3. `sprints/sprint-2/brief-S2-01.md` and `brief-S2-02.md` — predecessor stories. Their commits (`[S2-01]`, `[S2-02]`) MUST be on disk before you start. Reuse the test substrate, repository factory, and projector function exactly.
4. `sprints/WBS.md` § Sprint 2 → row `S2-03` (around line 145).
5. `sprints/sprint-1/HANDOFF.md` — especially:
   - **OpenAPI item schemas are `unknown`.** All 11 list operations emit `items: anyOf [{}, null]`. **This story closes that.**
   - **Hooks-only frontend access** rule from the kickoff prompt. Your routers MUST NOT bypass hooks; that's S2-04's concern but verify nothing in your output forces it.
5b. `sprints/AMENDMENT-002.md` — `apikey.referenceId` (no `organizationId`). Affects how you reason about routers that intersect with auth.
6. `DATA_MODEL.md §5:307-443` — agents two-row split + projection tables. Your `agents.publish` writes the version + projection rows; your `agents.history` reads from `agent_versions`.
7. `DATA_MODEL.md §15` (around lines 1204-1252) — append-only enforcement scope amendment. `agents.publish` must respect the chicken-and-egg pattern: insert version first (with `activeVersionId` left at its prior value), then `UPDATE agents SET activeVersionId = newVersionId` — both inside the same transaction.
8. `USER_JOURNEYS.md §4` — Journey 2; the `live calls will see the new version after this call ends` copy lives here. Your publish procedure does NOT show this copy (S2-04 does); but your error messages should be consistent with §4's tone.
9. `USER_JOURNEYS.md §13` — C2/C3/C8 wiring spec. Your procedures are what S2-04's hooks call.
10. `packages/api/src/index.ts` — `protectedProcedure`, `publicProcedure`, oRPC context.
11. `packages/api/src/context.ts` — `Context` shape (has `session`).
12. `packages/api/src/routers/index.ts` — `appRouter` shape.
13. `packages/api/src/routers/agents.ts` — current `list` stub from S1-05. You're rewriting this file.
14. `packages/api/src/routers/{conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.ts` — current stubs. All 10 get `.schemas.ts` siblings + their `list` outputs swap from `z.array(z.unknown())` to `z.array(<resourceSchema>)`.
15. `packages/db/src/schema/{agents,conversations,channels,knowledge,tools,batches,webhooks,secrets,voices,compliance,billing}.ts` — every Drizzle row type your schemas mirror. Use `<table>.$inferSelect` as the source of truth.
16. `packages/core/src/repositories/index.ts` (from S2-01) — `withWorkspace` factory. Your routers call `const repos = withWorkspace(db, ctx.session.activeWorkspaceId, kvStore)`.
17. `packages/core/src/schemas/agent-ir.ts` (from S2-02) — `agentIRSchema`. `agents.publish` and `agents.autoSave` use it as input validation.
18. `packages/runtime/src/projector/agent.ts` (from S2-02) — `projectAgent`. `agents.publish` calls it inside the transaction.
19. `apps/server/scripts/gen-openapi.ts` — the generator that writes `apps/server/openapi.json`. Sort is stable; if drift after your edits, the generator output is the source of truth.
20. `apps/server/openapi.json` — current canonical 13 operations. After your work, it grows with `agents.publish/autoSave/get/history` (4 new ops; `list` exists). Plus row schemas appear in all 11 list outputs.
21. `packages/api-client/src/schema.d.ts` — regenerated. Run the gen step S0 wired (check `packages/api-client/package.json` for the script name).
22. `eslint.config.mjs` — the S2-01 `no-restricted-imports` rule on `packages/api/src/routers/**` blocks raw `drizzle-orm` / `@kuralle/db/schema/**` imports. Your routers must go through repositories.

When in doubt about oRPC procedure types or Zod-to-JSON-Schema conversion, use `mcp__context7__query-docs` against `/orpc/orpc` and read the installed `node_modules/.bun/.../@orpc/server/dist/*.d.mts`. Memory rule: verify before guessing.

---

## 3. Files you will create or modify

**Create:**
- `packages/api/src/routers/agents.schemas.ts` — `agentSchema`, `agentVersionSchema`, `agentWithVersionSchema`, `agentHistoryItemSchema`. All `.strict()`.
- `packages/api/src/routers/conversations.schemas.ts` — `conversationSchema` (Drizzle `conversations.$inferSelect` mirrored).
- `packages/api/src/routers/channels.schemas.ts` — `channelSchema`.
- `packages/api/src/routers/kb.schemas.ts` — `kbDocumentSchema`. **Do NOT include `embedding` in the schema** — vectors are not transported over the wire by default; if a chunk endpoint is needed later, that's a separate sprint.
- `packages/api/src/routers/tools.schemas.ts` — `toolSchema`.
- `packages/api/src/routers/batches.schemas.ts` — `batchSchema`.
- `packages/api/src/routers/webhooks.schemas.ts` — `webhookSchema`.
- `packages/api/src/routers/secrets.schemas.ts` — `secretSchema` **with `ciphertext` explicitly OMITTED** (per `DATA_MODEL.md §11` — secret material never leaves the server). Header comment cites the exclusion rationale.
- `packages/api/src/routers/voices.schemas.ts` — `voiceSchema`.
- `packages/api/src/routers/compliance.schemas.ts` — `complianceEvaluationSchema` (or whatever the list endpoint actually returns).
- `packages/api/src/routers/receipts.schemas.ts` — `monthlyReceiptSchema` **with `pdfStorageKey` exposed but not the PDF body** (signed URL is fetched separately in S5).
- `apps/server/src/__tests__/agents.publish.test.ts` (or per existing convention if `apps/server` already has a `__tests__` pattern; IC greps first) — integration test: `agents.publish` → `list` → `get` → `history` round-trip.

**Modify:**
- `packages/api/src/routers/agents.ts` — extend from 1 to 5 procedures. Use `withWorkspace(db, ctx.session.activeWorkspaceId, kvStore)` factory; transactional `publish`; no direct `db.select` (the S2-01 ESLint rule enforces this).
- `packages/api/src/routers/{conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.ts` — replace `z.array(z.unknown())` output with `z.array(<resourceSchema>)`. The handler return-type cast (`as (typeof <table>.$inferSelect)[]`) becomes unnecessary because the schema is explicit. Keep the existing `list` shape; do NOT add new procedures.
- `apps/server/openapi.json` — regenerated via `bun -F server gen:openapi`. **Do not hand-edit.**
- `packages/api-client/src/schema.d.ts` — regenerated via the api-client generation step.
- `packages/api/package.json` — add `@kuralle/core`, `@kuralle/runtime` as deps (workspace:*).

**Do not touch:**
- `packages/db/src/**` — schema is S1's; you consume it.
- `packages/core/src/**`, `packages/runtime/src/**` — those are S2-01 / S2-02's; you consume them.
- `apps/web/**` — that's S2-04's.
- Migration files.
- `apps/server/src/index.ts` (the Hono entry) — unless your tests genuinely require modifying the handler wiring, in which case explain in the commit body.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **Five procedures on `agentsRouter`.** Names: `list` (existing, expanded), `get`, `publish`, `autoSave`, `history`. Each has explicit Zod input + output schemas; `publish` and `autoSave` are mutations. Inputs:
   - `list({ workspaceId, cursor?, limit? })` → `{ items: agentSchema[], cursor }`. (Note: workspaceId in input matches existing S1-05 shape; long-term it should come from session — out of scope this story.)
   - `get({ workspaceId, agentId })` → `{ agent, activeVersion: agentVersionSchema | null }`.
   - `publish({ workspaceId, agentId, ir: agentIRSchema })` → `{ versionId, versionNumber, activeVersionId }`. Validates `ir` with `agentIRSchema.parse` (which is `.strict()`).
   - `autoSave({ workspaceId, agentId, ir })` → `{ versionId, versionNumber }`.
   - `history({ workspaceId, agentId, cursor?, limit? })` → `{ items: agentVersionSchema[], cursor }`.
2. **`agents.publish` is transactional.** One Drizzle `db.transaction(async (tx) => { ... })`:
   - Insert `agent_versions` row with `versionKind='publish'`, `parentVersionId = current activeVersionId`, `versionNumber = MAX(versionNumber) + 1`.
   - Call `projectAgent(tx, newVersionId, ir)`.
   - `UPDATE agents SET activeVersionId = newVersionId, status = 'published', updatedAt = now()` (the trigger from S1-02 fires only on `agent_versions UPDATE`, not on `agents UPDATE` — verified).
   - Commit.
   - **After commit succeeds**: invalidate identity-map cache via `kvStore.delete('repo:agent:<workspaceId>:<agentId>')` and `kvStore.delete('repo:agent_version:<workspaceId>:<newVersionId>')`. Failure to delete the cache key (e.g., KvStore unavailable) is logged but does NOT roll back the publish — TTL will expire it within 60s.
3. **`agents.autoSave` is non-transactional projector-skip.** Single `INSERT INTO agent_versions` with `versionKind='auto_save'`, `versionNumber = MAX(versionNumber) + 1`, `parentVersionId = current activeVersionId`. No projection. No pointer swap. No cache invalidation needed (the active version hasn't changed).
4. **Workspace scope is enforced.** Every procedure asserts the agent (or version) belongs to the requested workspace. If a query returns a row for a different workspace, throw `ORPCError('NOT_FOUND')` (don't leak existence). The repository's `WorkspaceScopeViolation` (S2-01) is the defense-in-depth path.
5. **Append-only error surface.** If a caller tries to `publish` with a stale `agentVersionId` (e.g., trying to update an existing version row directly, which is impossible via the procedures but possible via misuse), the request returns a clean `ORPCError('CONFLICT')` with a message — not a raw Postgres error code.
6. **Integration test passes.** `apps/server/src/__tests__/agents.publish.test.ts`:
   - Set up an in-process oRPC server (or call the procedures directly via the `appRouter` shape — IC chooses, documents).
   - Wire local-pg + memory `KvStore`.
   - Insert a fixture organization (workspace) + agent.
   - Call `agents.publish` with a fixture IR (reuse `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json`).
   - Assert `agents.list` shows the agent with the new `activeVersionId`.
   - Assert `agents.get` returns `{ agent, activeVersion }` with the new version.
   - Assert `agents.history` returns the new version + any prior versions.
   - Assert the projection rows were written (count `agent_tool_attachments` etc. matches IR).
   - Test the cache-invalidation path: read once (cache miss), publish, read again (cache miss again because the publish invalidated).
7. **OpenAPI scope expansion.** Every list router has an explicit Zod schema in its `.schemas.ts` sibling file; all 11 list outputs use `z.array(<resourceSchema>)`. `bun -F server gen:openapi` regenerates `apps/server/openapi.json`; `bun -F server gen:openapi --check` is green; the diff (`git diff apps/server/openapi.json`) shows full row schemas where `anyOf [{}, null]` used to be. Capture into `sprints/sprint-2/artifacts/S2-03-openapi-diff.txt`.
8. **`packages/api-client/src/schema.d.ts` regenerated and committed.** Verify by running the gen step (whatever S0-05 wired).
9. **Sensitive column omissions documented.** `secrets.schemas.ts` has a header comment explaining `ciphertext` is omitted. `kb.schemas.ts` has a header comment explaining `embedding` is omitted from list output.
10. **No raw `drizzle-orm` or `@kuralle/db/schema/**` imports in `packages/api/src/routers/**`.** The S2-01 ESLint rule passes. All DB access goes through repositories.
11. **`bun run check-types`, `bun run lint`, `bun -F server test`, `bun -F server gen:openapi --check` green.**
12. **No `--no-verify`, `@ts-ignore`, `catch (e: any)`, root devDep additions, default exports, `as unknown as` casts.**
13. **Atomic commit `[S2-03] agents publish/autoSave/list/get/history + OpenAPI row schemas across 11 routers`.** Body includes:
    - The list of 4 new operations + 11 schema files added.
    - The transactional sequence for `agents.publish` (4 steps + cache invalidation).
    - The omitted-column list with rationale (`secrets.ciphertext`, `kb.embedding`).
    - OpenAPI diff size (lines added).
    - Demo artifact: `sprints/sprint-2/artifacts/S2-03-openapi-diff.txt`.

---

## 5. Demo artifact

`sprints/sprint-2/artifacts/S2-03-openapi-diff.txt` — `git diff apps/server/openapi.json | head -100` showing both the new `agents.publish` operation (with `agentIR` request body fully specified) and at least one previously-`{}` list output now showing a full row schema.

`sprints/sprint-2/artifacts/S2-03-integration-test.txt` — `bun -F server test 2>&1 | tail -30` showing the publish round-trip test passing.

---

## 6. Anti-scope (what NOT to do)

- **Do not** add procedures beyond the five specified for `agents`. No `agents.delete`, `agents.archive`, `agents.fork` — none of those are in S2's WBS.
- **Do not** add procedures to the other 10 routers (just expand their list output schema; don't add `get`, `create`, etc.). Those land in their respective sprints.
- **Do not** edit `apps/server/openapi.json` by hand. Only the generator writes it.
- **Do not** hand-edit `packages/api-client/src/schema.d.ts`. Only the generator writes it.
- **Do not** bypass repositories with raw `db.select` in routers — the S2-01 ESLint rule will fire.
- **Do not** add `apps/web` changes (S2-04's job).
- **Do not** add deps to the workspace-root `package.json` (memory rule).
- **Do not** silently accept Zod validation failures — `agentIRSchema.parse(input.ir)` throws on unknown fields; that's the contract. If a frontend test fails because of a schema mismatch, the frontend is wrong, not the schema.
- **Do not** change the OpenAPI generator's sort logic. If drift after your edits, your edits are out of sync with the generator's output, not the other way around.

---

## 7. Verification before you commit

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle
bun install --frozen-lockfile 2>&1 | tail -3
bun -F server gen:openapi 2>&1 | tail -5
bun run check-types 2>&1 | tail -5
bun run lint 2>&1 | tail -5
bun -F server gen:openapi --check 2>&1 | tail -3
bun -F server test 2>&1 | tail -30
```

All six must be green. The `[S2-01]` and `[S2-02]` commits must be on disk before you start.

If you cannot make a SLO / criterion above hold, **stop and flag** rather than skip a test.
