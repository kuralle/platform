# Spec + Code-Quality Gate — `S2-03` agents.{publish, autoSave, list, get, history} + OpenAPI cleanup

> **Role.** You are the **spec-and-code-quality gate worker (`pi/kimi-k2.6`)** — a senior peer-IC reviewer with deep expertise in **TypeScript ESM, oRPC procedures, Zod schemas, Drizzle transactions on Postgres 15, OpenAPI 3 emission, and contract-driven API design**. The IC for this story was `pi/deepseek-v4-pro`. You are **NOT adversarial** — you are the peer-IC keeping the team honest. Your output drives the manager's fix-pass.
>
> **Mindset.** You verify each of the five new procedures lands the contract from `brief-S2-03.md §4`. You read `apps/server/openapi.json` to verify the 11 list operations now emit explicit row schemas (not `anyOf [{}, null]`). You check the transactional sequence of `agents.publish`: insert version → run projector → swap pointer → commit → cache-invalidate. You verify cache-invalidation timing relative to commit (after, not during). You verify sensitive columns (`secrets.ciphertext`, `kb.embedding`) are explicitly omitted with rationale.
>
> **Output.** A markdown report at `sprints/sprint-2/gate-S2-03.md`. **Do NOT commit.** **Do NOT modify any source.**

---

## 1. Inputs

1. The story brief: `sprints/sprint-2/brief-S2-03.md`.
2. The sprint plan: `sprints/sprint-2/PLAN.md` § `S2-03`.
3. The IC's transcript: `.handoff/result-S2-03.txt`.
4. The diff: `git show 3b8ecd4`.
5. **`DATA_MODEL.md §5:307-443`** — agents two-row split + projection tables.
6. `DATA_MODEL.md §15` — append-only enforcement scope (verify `agents.activeVersionId` UPDATE path is unaffected).
7. `USER_JOURNEYS.md §4` — Journey 2 publish flow.
8. `USER_JOURNEYS.md §13` — C2/C3/C8 wiring spec.
9. `sprints/AMENDMENT-001.md` — frontend uses `@orpc/tanstack-query`; verify the IC didn't regenerate an `openapi-fetch`-style schema.d.ts.
10. `sprints/AMENDMENT-002.md` — `apikey.referenceId`; affects how routers reason about org-scoping (no direct impact on S2-03 routers but verify nothing assumes `organizationId`).
11. `sprints/AMENDMENT-003.md`, `AMENDMENT-004.md` — ratified in S2-02 fix-pass; the projector implementation already accommodates them. Verify the IC's `publish` flow uses the projector correctly.
12. `packages/api/src/routers/agents.ts` — the rewritten router (5 procedures).
13. `packages/api/src/routers/agents.schemas.ts` — `agentSchema`, `agentVersionSchema`, `agentWithVersionSchema`, `agentHistoryItemSchema`.
14. `packages/api/src/routers/{conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.schemas.ts` — 10 row-schema files.
15. `packages/api/src/routers/{...}.ts` — 10 list routers updated to use the new schemas.
16. `apps/server/openapi.json` — should now show full row schemas everywhere.
17. `apps/server/src/__tests__/agents.publish.test.ts` (or named per the IC's choice) — the integration test.
18. `packages/core/src/repositories/agent.ts`, `agent-version.ts`, `index.ts`, `types.ts` — repository changes (the IC added `publishVersion`, `nextVersionNumber`, `findByAgentId`, `RepoDb` union type).
19. `packages/api/src/index.ts` and `apps/server/src/index.ts` — context wiring; the IC's commit body mentions extending the oRPC context with `db` + `kvStore`. Verify the wiring is honest (the test substrate uses memory KvStore; production uses real KvStore).
20. The artifact files: `sprints/sprint-2/artifacts/S2-03-openapi-diff.txt`, `S2-03-integration-test.txt`.

---

## 2. Your job — two halves

### 2.1 Spec adherence

Walk every acceptance criterion in `brief-S2-03.md §4` (1-13). For each:
- **Met / partial / missed.** Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose the miss?

Specific verifications you MUST perform:

1. **Five procedures on `agentsRouter` (AC#1):** `list`, `get`, `publish`, `autoSave`, `history`. Each has explicit Zod input + output schemas; `publish` and `autoSave` are mutations. Verify:
   - Inputs match the brief's signatures (`{ workspaceId, agentId, ir }` for publish/autoSave; `{ workspaceId, agentId }` for get; pagination for list/history).
   - Output schemas have `.strict()` (or equivalent) — no `passthrough` leakage.

2. **`agents.publish` is transactional (AC#2):** verify the four-step sequence:
   - Insert `agent_versions` row with `versionKind='publish'`, `parentVersionId = current activeVersionId`, `versionNumber = MAX(versionNumber) + 1`.
   - Call `projectAgent(tx, newVersionId, ir)`.
   - `UPDATE agents SET activeVersionId = newVersionId, status = 'published', updatedAt = now()`.
   - Commit.
   All four happen inside the same `db.transaction(async (tx) => { ... })`. Failure rolls back.

3. **Cache invalidation timing (AC#4):** `kvStore.delete('repo:agent:<workspaceId>:<agentId>')` and `kvStore.delete('repo:agent_version:<workspaceId>:<newVersionId>')` happen **after `tx.commit()` succeeds**, not during. Verify the code structure — the kv.delete should be outside the transaction callback. Failure to delete the cache key is logged but does NOT roll back the publish.

4. **`agents.autoSave` non-transactional path (AC#3):** single `INSERT` with `versionKind='auto_save'`, `versionNumber = MAX(versionNumber) + 1`, no projection, no pointer swap, no cache invalidation needed. Verify these are absent from the autoSave handler.

5. **Workspace scope enforcement (AC#4):** every procedure asserts the agent belongs to the requested workspace. Cross-workspace requests return `ORPCError('NOT_FOUND')` (don't leak existence). The repository's `WorkspaceScopeViolation` is defense-in-depth.

6. **Append-only error surface (AC#5):** misuse of publish returns `ORPCError('CONFLICT')` cleanly, not raw Postgres error codes.

7. **Integration test (AC#6):** `apps/server/src/__tests__/agents.publish.test.ts` (or the IC's chosen path) asserts:
   - `agents.publish` → `agents.list` → `agents.get` → `agents.history` round-trip.
   - The new version is visible in `list.items[0].activeVersionId`.
   - `get` returns `{ agent, activeVersion }` with the new version's snapshot.
   - `history` returns the new version + any prior versions.
   - Projection rows count matches IR (toolAttachments, etc.).
   - **Cache invalidation path:** read once (cache miss), publish, read again (cache miss again because publish invalidated). The IC's commit body claims this is covered — verify.
   - **NOT_FOUND**: a publish for a non-existent agent returns `NOT_FOUND`.

8. **OpenAPI scope expansion (AC#7):**
   - All 11 list operations have explicit Zod row-schema outputs (verify each `.schemas.ts` file).
   - `apps/server/openapi.json` regenerated; `bun -F server gen:openapi --check` is green.
   - The diff (`S2-03-openapi-diff.txt`) shows full row schemas where `anyOf [{}, null]` used to be — count the new schema definitions.
   - Sensitive columns honored: `secrets.ciphertext` not in `secrets.schemas.ts`; `kb.embedding` not in `kb.schemas.ts`. Both files have header comments explaining the exclusion.

9. **`@kuralle/api-client/src/schema.d.ts` regenerated and committed (AC#8):** the IC's commit body mentions "schema.d.ts ghost per AMENDMENT-001" — verify what was done. Per AMENDMENT-001 the frontend uses `@orpc/tanstack-query` (not `openapi-fetch`), so the `.d.ts` file may genuinely be unnecessary. If the IC skipped it with rationale, that's acceptable; if the file exists but is stale, that's a finding.

10. **Sensitive omissions documented (AC#9):** check `secrets.schemas.ts` and `kb.schemas.ts` headers for the exclusion rationale.

11. **No raw `drizzle-orm` or `@kuralle/db/schema/**` imports in `packages/api/src/routers/**` (AC#10):** the S2-01 ESLint rule passes. The IC removed router files from the `ignores` array as it rewrote each — verify `eslint.config.mjs` reflects this.

12. **All gates green (AC#11):** `bun run check-types`, `bun run lint`, `bun -F server test`, `bun -F server gen:openapi --check`. Verify each.

13. **No shortcuts (AC#12):** grep diff for `--no-verify`, `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, `as unknown as`. Each is a finding.

14. **Atomic commit (AC#13):** subject + body match the brief's commit-policy.

### 2.2 Code quality

For every file the IC created or modified:

- **Naming.** Procedures are `list`, `get`, `publish`, `autoSave`, `history`. Schema files are `<resource>.schemas.ts`. Repo additions: `publishVersion`, `nextVersionNumber`, `findByAgentId`. Match the brief.
- **Type tightness.** No `any`. `unknown` for jsonb fields. `ORPCError` thrown with explicit codes.
- **Error handling.** `agents.publish` catches and rethrows transactional failures as `ORPCError('CONFLICT')` or surfaces them honestly. Cache-delete failures are logged-not-thrown.
- **Idiomatic patterns.** Named exports only. `import type` for type-only imports. `.strict()` Zod everywhere.
- **Smells.** Dead branches, copy-paste, magic numbers, orphan imports, debug logs.
- **Comments.** Sensitive-omission rationale; transactional-sequence comment in `publish`; cache-invalidation timing comment.
- **Test quality.** Integration test names are descriptive. MSW or in-process oRPC server is used cleanly. Cache-trace assertion uses a counter or spy.

### 2.3 Project-specific gates (from kickoff prompt)

- **OpenAPI is the contract.** Drift gate green. No hand-edits to `openapi.json`. Any router changes regenerate the file.
- **Hexagonal-import rule.** The new repository additions live in `packages/core/src/`; verify they don't leak platform/cloudflare or platform/node imports.
- **No root-dep pollution.** Root `package.json` should be unchanged (catalog or no change).
- **Hook-wrapper rule.** N/A this story (no `apps/web` changes; that's S2-04).
- **AriaFlow event drift:** N/A (S3+).

### 2.4 The two carry-forwards from S2-02 amendments

Verify the publish path correctly:
- **AMENDMENT-003:** `agents.publish`'s call to `projectAgent(tx, ...)` propagates the optional `scorerAttachments[id].{name, description, kind, rubric}` fields end-to-end. The integration test should pass an IR with these fields and assert the `agent_eval_criteria` rows hold them (not the defaults).
- **AMENDMENT-004:** `agents.publish` accepts an IR with the optional `workflow.nodes/edges` and projects them into `workflow_nodes_projection` + `workflow_edges_projection`. Integration test should exercise an IR with at least 2 nodes + 1 edge and assert the rows landed.

If either amendment isn't exercised by the integration test, mark as a `minor` finding.

---

## 3. Output format

Same shape as `gate-S2-01.md` and `gate-S2-02.md`:

```markdown
# Gate Review — `S2-03` agents publish/autoSave/list/get/history + OpenAPI cleanup

**Verdict:** {green | yellow | red}
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** 3b8ecd4

## 1. Spec adherence (walk AC#1-#13)

## 2. Code quality

## 3. Findings
| ID | Severity | File:line | Description | Apply now? |

## 4. Recommendation to the manager
```

Severities: `blocker` / `major` / `minor` / `nit`.

---

## 4. Hard constraints

- Do NOT edit any source.
- Do NOT commit.
- Do NOT generate code.
- Output is `sprints/sprint-2/gate-S2-03.md`.
- Cite file:line for every finding.
- Verify the OpenAPI diff personally — count the new schema definitions and confirm the 11 list operations all changed shape.
- Verify the cache-invalidation timing (after commit, not during) by reading the code structure.
