# Story Brief — `S2-02` `AgentIR` Zod schema + synchronous projection worker in `@kuralle/runtime`

> **Role.** You are a senior runtime engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **TypeScript ESM, Zod schema design, Drizzle transactions on Postgres 15, jsonb projection patterns, and property-based testing with fast-check**. You have shipped projection workers in production at the multi-thousand-event-per-second scale; you understand that the snapshot is the source of truth and the projection rows are a derived materialization that must round-trip without loss. You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. The `agent_versions.snapshot` shape is **locked verbatim** in `DATA_MODEL.md §5:347-365` — every field of your `AgentIR` Zod schema cites the line it implements. You verify Drizzle transaction semantics against the installed `.d.ts` and `mcp__context7__query-docs` before guessing — `db.transaction(tx => ...)` rollback semantics differ between drivers. You prefer `.strict()` Zod schemas; unknown fields are a contract violation, not a feature.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. No root devDep additions (memory rule). No `default export`. `import type` for type-only imports. Zod `.strict()` everywhere. No premature abstractions; no async paths in this story (synchronous projection per WBS — async is BL-04).
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S2-02] AgentIR schema + @kuralle/runtime projector`. Do NOT push. One commit per story.

---

## 1. Goal

Two artifacts in two new locations:
1. **`packages/core/src/schemas/agent-ir.ts`** — A Zod schema matching the `agent_versions.snapshot` shape locked in `DATA_MODEL.md §5:347-365` verbatim. Every top-level field cites the §5 line it implements.
2. **`packages/runtime/`** — A new workspace package with a synchronous projection worker at `packages/runtime/src/projector/agent.ts`. Function: `projectAgent(tx, agentVersionId, ir)`. Given a Drizzle transaction handle, the new `agent_versions.id`, and a parsed `AgentIR`, writes `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection` in the same transaction. Returns row counts.

A round-trip property test (50+ generated cases via `fast-check`) proves the IR can be reconstructed from the snapshot + projection rows. A latency test asserts p95 ≤ 200 ms over 100 projections of a representative IR (5 tools / 3 KB docs / 4 guardrails / 6 eval criteria / 8 workflow nodes / 10 edges).

S2-01 ships first and provides the repository layer + test substrate convention this story builds on.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md` — confirms sprint 2.
2. `sprints/sprint-2/PLAN.md` — full sprint plan; story `S2-02` section is the spec.
3. `sprints/sprint-2/brief-S2-01.md` — predecessor story; reuse the test substrate setup (pglite vs. local-pg) S2-01 chose.
4. `sprints/WBS.md` § Sprint 2 → row `S2-02` (around line 144).
5. **`DATA_MODEL.md §5:347-365`** — the locked snapshot shape. **Your `AgentIR` schema is a verbatim implementation.** Paste the cited lines into your schema file as line-citation comments next to each Zod field.
6. `DATA_MODEL.md §5:389-438` — the projection tables. Every row your projector writes maps to a slice of the snapshot. The mapping:
   - `agent_tool_attachments` ← `snapshot.toolAttachments` (Record<toolId, { description?, rules? }>) + `integrationTools` + `mcpClientAttachments` per the `source` enum (`'native' | 'workflow' | 'subagent' | 'integration' | 'mcp'`).
   - `agent_kb_attachments` ← `snapshot.kbAttachments` ([{ documentId }]).
   - `agent_guardrails` ← `snapshot.guardrailGraph` (StoredProcessorGraph — read §5 for shape).
   - `agent_eval_criteria` ← `snapshot.scorerAttachments` (Record<criterionId, { weight, samplingRate }>) — note: the projection table also stores `name`, `description`, `kind`, `rubric`. Where do those come from? Either (a) the IR has these inline per-criterion (more likely — re-read §5 carefully), or (b) the projector hydrates them from the `eval_criteria` master table by `criterionId` lookup. **Verify by reading §5 carefully; if ambiguous, flag.**
   - `workflow_nodes_projection` and `workflow_edges_projection` ← `snapshot.workflowAttachments` (Record<wfId, { description? }>). The workflow snapshot may be deeper than this top-level view; check `DATA_MODEL.md §6` for the projection table shape and the IR side.
7. `DATA_MODEL.md §6` — workflow projection tables. Read the full section to understand `workflow_nodes_projection` + `workflow_edges_projection`.
8. `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer; `runtime/adapter/` is the ACL anchor for S3+. Your projector lives at `packages/runtime/src/projector/`, NOT `packages/runtime/src/adapter/`. The adapter dir is reserved for S3's AriaFlow translation layer.
9. `INTERFACE_DESIGNS_RuntimeHost.md §5` — synthesis spec. **Read the full section** to verify the projector worker is consistent with what S3+ will build on top.
10. `packages/db/src/schema/agents.ts` — verify each projection table's column shape (the projector inserts into these). The shape was shipped in S1-02.
11. `packages/db/src/schema/index.ts` — re-exports.
12. `packages/core/src/repositories/index.ts` (created in S2-01) — verify the `withWorkspace` factory; your projector does NOT use repositories (it operates inside a transaction handle, not the cached repo layer), but you may want to **double-check whether it needs to invalidate the identity-map cache after writing projection rows.** Per S2-03's responsibility and the user's pre-sprint decision, the cache is invalidated by the publish path *after `tx.commit()`* — your projector does not own that; you operate within the transaction and let the caller invalidate.
13. `packages/core/src/test-utils.ts` (created in S2-01) — reuse the local-pg test substrate setup. **Do not duplicate it inside `@kuralle/runtime`.** Either re-export from `@kuralle/core` or import directly.
14. `packages/db/scripts/seed-calderon.ts` — precedent for constructing a representative IR. The Calderon HVAC dispatcher's snapshot shape is the model for your fixture.
15. `packages/config/tsconfig.base.json` — base tsconfig.
16. `package.json` (root) — workspace catalog. **DO NOT add deps here.**
17. `eslint.config.mjs` — current ESLint; the S0-06 hexagonal rule applies (no `platform/cloudflare` or `platform/node` imports from `runtime`).

When in doubt about Drizzle transactions or `fast-check`'s `Arbitrary<T>` shape, use `mcp__context7__query-docs` against `drizzle-orm` and `fast-check` resolved IDs. Memory rule: verify before guessing.

---

## 3. Files you will create or modify

**Create:**
- `packages/runtime/package.json` — declares `@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod` as deps; `@kuralle/config`, `@kuralle/platform`, `vitest`, `pg`, `@types/pg`, `fast-check` as devDeps. Use `catalog:` for shared versions; pin `fast-check` to its latest stable via `bun pm view fast-check version`. **Add `fast-check` to the workspace catalog** in `package.json` if it isn't already (catalog-only addition is allowed; root devDep is not).
- `packages/runtime/tsconfig.json`
- `packages/runtime/vitest.config.ts`
- `packages/runtime/src/index.ts` — public re-exports.
- `packages/runtime/src/projector/agent.ts` — `projectAgent(tx, agentVersionId, ir)`.
- `packages/runtime/src/projector/agent.test.ts` — round-trip property test + latency test.
- `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json` — known-good IR mirroring the seed shape (5 tools / 3 KB / 4 guardrails / 6 eval / 8 nodes / 10 edges).
- `packages/runtime/README.md` — short public-surface doc.
- `packages/core/src/schemas/agent-ir.ts` — `agentIRSchema` Zod object + `AgentIR` inferred type. Each top-level field has a `// §5:NNN` line citation comment.
- `packages/core/src/schemas/agent-ir.test.ts` — schema tests: parse a valid IR; reject unknown fields; reject missing required fields.

**Modify:**
- `packages/core/src/index.ts` — re-export `AgentIR` and `agentIRSchema`.
- `packages/core/package.json` — no new deps expected; verify `zod` is already declared.
- `package.json` (root) — **only** if a new shared dep needs a catalog entry (e.g., `fast-check`). Catalog-only edit; do NOT add to root `dependencies` or `devDependencies`.

**Do not touch:**
- `packages/api/src/routers/**` — that's S2-03's job.
- `packages/db/src/**` — schema is S1's; you consume it.
- `packages/platform/src/**` — port is fixed.
- `apps/web/**`, `apps/server/**` — those are S2-03 / S2-04's job.
- `packages/runtime/src/adapter/**` — reserved for S3's AriaFlow ACL.
- Any landed migration file.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`AgentIR` Zod schema matches `DATA_MODEL.md §5:347-365` verbatim.** Every top-level field listed in §5 (`name`, `description`, `instructions`, `model`, `defaultOptions`, `toolAttachments`, `workflowAttachments`, `subagentAttachments`, `integrationTools`, `mcpClientAttachments`, `kbAttachments`, `guardrailGraph`, `scorerAttachments`, `voiceConfig`, `channelConfig`, `complianceConfig`, `requestContextSchema`) is present in the Zod object with the type indicated by §5. Each field has a `// DATA_MODEL.md §5:NNN` line-citation comment showing which §5 line it implements. The schema header has the line-range citation `§5:347-365` and the project-clock date.

2. **Schema is `.strict()`** at every level: unknown top-level fields are rejected, unknown fields inside nested objects are rejected. Missing required fields raise a Zod validation error with the field path. **Inferred type is exported** as `export type AgentIR = z.infer<typeof agentIRSchema>`.

3. **`packages/runtime/` workspace package wired.** `bun install` resolves it; `turbo` picks it up; `bun -F @kuralle/runtime check-types` and `bun -F @kuralle/runtime test` pass. No root devDep additions.

4. **`projectAgent(tx, agentVersionId, ir)` signature and behavior:**
   - Type signature: `(tx: PgTransaction<NeonHttpQueryResultHKT, typeof schema>, agentVersionId: string, ir: AgentIR) => Promise<{ toolAttachments: number; kbAttachments: number; guardrails: number; evalCriteria: number; workflowNodes: number; workflowEdges: number }>`. (Use the actual Drizzle transaction-handle type; verify against the installed `.d.ts` — for local-pg testing the type may differ from neon-http; the projector should accept the union or be parameterized over the driver-specific HKT.)
   - Inserts into the six projection tables in deterministic order — `agent_tool_attachments` first, then `kb`, `guardrails`, `eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`. Deterministic order makes commit-by-commit diffs and audit trails stable.
   - **Same transaction as the version insert**: caller (S2-03's `agents.publish`) opens the transaction, inserts the version, calls `projectAgent`, then commits. Your function does NOT open or commit the transaction. If any insert fails, the caller's transaction rolls back.
   - Returns row counts that match the IR exactly: `result.toolAttachments === sumOf(ir.toolAttachments + ir.integrationTools + ir.mcpClientAttachments)`, `result.kbAttachments === ir.kbAttachments.length`, etc.

5. **Round-trip property test (50+ generated cases).** `packages/runtime/src/projector/agent.test.ts` uses `fast-check` to generate valid `AgentIR` instances. For each generated IR:
   - Insert a fresh `agents` + `agent_versions` row pair.
   - Call `projectAgent(tx, versionId, ir)`.
   - Read back the projection rows + the `snapshot` jsonb.
   - Reconstruct an IR from the projection rows + snapshot.
   - Assert the reconstructed IR is structurally equal to the original.
   - The `Arbitrary<AgentIR>` constrains generated IRs to realistic shapes (e.g., `toolAttachments` 0-50 entries, `workflowEdges` form a valid DAG referencing only present node IDs). Constraints documented inline.

6. **Latency assertion (p95 ≤ 200 ms).** Same test file: run 100 projections of `__fixtures__/calderon-dispatcher-ir.json` (representative size). Capture wall-clock per call. Assert p95 ≤ 200 ms. Histogram (min / p50 / p95 / p99 / max) printed by the test reporter and captured into `sprints/sprint-2/artifacts/S2-02-projector-latency.txt`. Test fails if p95 > 200 ms — **do NOT skip or relax** the threshold; flag to the user instead.

7. **Hexagonal discipline.** `packages/runtime/src/**` imports from `@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod` only (and `fast-check` in test files). NO imports from `@kuralle/platform/cloudflare`, `@kuralle/platform/node`, `@kuralle/platform/memory` (memory adapter is for tests only — and even then, the projector test runs against local-pg, not against memory `KvStore`). The S0-06 ESLint rule should already cover this; if it doesn't, that's a finding — flag.

8. **All public surfaces tested.** `agentIRSchema` has at least 3 tests: parses valid IR, rejects unknown top-level field, rejects missing required field. `projectAgent` has the round-trip property test + the latency test + at least one focused failure-path test (e.g., calling with an `agentVersionId` that doesn't exist raises an FK violation; assert it's the expected `feature_not_supported` or `foreign_key_violation` Postgres error code).

9. **No `--no-verify`, `@ts-ignore`, `catch (e: any)`, root devDep additions, default exports, async-only-when-needed.** No speculative methods. No projector for tables outside the six listed.

10. **Atomic commit `[S2-02] AgentIR schema + @kuralle/runtime projector`.** Body includes:
    - The line-by-line mapping `IR field → §5:line` (a short table).
    - The line-by-line mapping `IR field → projection table column`.
    - The projector's row-order rationale.
    - `fast-check` Arbitrary constraints (one paragraph).
    - Latency histogram (min / p50 / p95 / p99 / max ms).
    - Demo artifact path: `sprints/sprint-2/artifacts/S2-02-projector-latency.txt`.

---

## 5. Demo artifact

`sprints/sprint-2/artifacts/S2-02-projector-latency.txt` — vitest reporter output showing:
- The round-trip property test passing 50+ cases.
- The 100-iteration latency histogram with p95 ≤ 200 ms.
- The schema-only tests (parse / reject) passing.

---

## 6. Anti-scope (what NOT to do)

- **Do not** add `agent_versions.projectionsReady` async path. WBS explicitly defers async to BL-04. Synchronous only in S2.
- **Do not** wire the projector into a router. That's S2-03's job.
- **Do not** add the AriaFlow ACL adapter at `packages/runtime/src/adapter/`. That's S3's job.
- **Do not** invent IR fields not in `DATA_MODEL.md §5:347-365`. If §5 is ambiguous, flag — don't paper over.
- **Do not** silently relax the 200 ms p95 threshold. The threshold is the SLO; if it fails, flag.
- **Do not** add deps to the workspace-root `package.json` (memory rule). Catalog entries are OK; root deps are not.
- **Do not** edit migrations, the schema files, or any router file.
- **Do not** speculate on cache invalidation (S2-03 owns it) or on multi-region projection (BL-06).

---

## 7. Verification before you commit

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle
bun install --frozen-lockfile 2>&1 | tail -3
bun run check-types 2>&1 | tail -5
bun run lint 2>&1 | tail -5
bun -F @kuralle/core test 2>&1 | tail -10
bun -F @kuralle/runtime test 2>&1 | tail -20
```

All five must be green. The `[S2-01] @kuralle/core repositories + KvStore identity-map cache` commit must already be on disk before you start (S2-01 is your predecessor).

If you cannot make the SLOs / criteria above hold, **stop and flag** rather than skip a test.
