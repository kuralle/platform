# Spec + Code-Quality Gate — `S2-02` AgentIR Zod schema + `@kuralle/runtime` projector

> **Role.** You are the **spec-and-code-quality gate worker (`pi/kimi-k2.6`)** — a senior peer-IC reviewer with deep expertise in **TypeScript ESM, Zod schema design, Drizzle transactions on Postgres 15, jsonb projection patterns, and property-based testing with fast-check**. The IC for this story was `pi/deepseek-v4-pro`. You are **NOT adversarial** — you are the peer-IC keeping the team honest. Your output drives the manager's fix-pass.
>
> **Mindset.** You verify §5:347-365 line-by-line against the schema. You sanity-check the latency claim (p95=2.30ms is suspiciously fast — verify it's measuring real work, not a no-op). You verify the round-trip property test actually round-trips (insert → projection → reconstruct → equal), not just "no error thrown." You verify the IC's two flagged ambiguities (`scorerAttachments` field hydration; `workflow` §5-vs-§6 conflict) are honestly resolved.
>
> **Output.** A markdown report at `sprints/sprint-2/gate-S2-02.md`. **Do NOT commit.** **Do NOT modify any source.**

---

## 1. Inputs

1. The story brief: `sprints/sprint-2/brief-S2-02.md`.
2. The sprint plan: `sprints/sprint-2/PLAN.md` § `S2-02`.
3. The IC's transcript: `.handoff/result-S2-02.txt`.
4. The diff: `git show 22a5685`.
5. **`DATA_MODEL.md §5:347-365`** — the locked snapshot shape.
6. `DATA_MODEL.md §5:389-438` — projection table shapes.
7. `DATA_MODEL.md §6` — workflow projection tables (the IC noted §5-vs-§6 conflict on `workflow`).
8. `HEXAGONAL_ARCHITECTURE.md §1` (ACL anchor in `runtime/`) and `§5` (PoEAA — applied via S2-01).
9. `INTERFACE_DESIGNS_RuntimeHost.md §5` — synthesis spec.
10. `packages/core/src/schemas/agent-ir.ts` — the new Zod schema (212 lines).
11. `packages/core/src/schemas/agent-ir.test.ts` — schema tests.
12. `packages/runtime/src/projector/agent.ts` — projector (184 lines).
13. `packages/runtime/src/projector/agent.test.ts` — round-trip + latency tests.
14. `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json` — representative IR.
15. The artifact files: `sprints/sprint-2/artifacts/S2-02-projector-latency.txt`.
16. **Postgres state** for behavioral verification: `bun -F @kuralle/runtime test 2>&1 | tail -50`.
17. The S2-01 commit `[S2-01-fix]` (`0df9164`) — verify the projector does not depend on its repository layer (it operates inside a transaction handle).

---

## 2. Your job — two halves

### 2.1 Spec adherence

Walk every acceptance criterion in `brief-S2-02.md §4` (1-10). For each:
- **Met / partial / missed.** Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose the miss?

Specific verifications you MUST perform:

1. **`AgentIR` schema matches `DATA_MODEL.md §5:347-365` verbatim (AC#1).** For each top-level field:
   - `name`, `description` (§5:348)
   - `instructions: string` (§5:349) — flat text in v1.
   - `model: { provider, name, temperature, ... }` (§5:350)
   - `defaultOptions: { ... }` (§5:351)
   - `toolAttachments: Record<toolId, { description?, rules? }>` (§5:353)
   - `workflowAttachments: Record<wfId, { description? }>` (§5:354)
   - `subagentAttachments: Record<agentId, { description? }>` (§5:355)
   - `integrationTools: Record<tcpId, { selectedTools[] }>` (§5:356)
   - `mcpClientAttachments: Record<clientId, { allowedTools[] }>` (§5:357)
   - `kbAttachments: [{ documentId }]` (§5:358) — note this is an array of objects, not a Record.
   - `guardrailGraph: StoredProcessorGraph` (§5:359)
   - `scorerAttachments: Record<criterionId, { weight, samplingRate }>` (§5:360)
   - `voiceConfig: { pipelineMode, ttsModel, ttsVoiceId, sttModel, ... }` (§5:362)
   - `channelConfig: Record<channelKind, { ... }>` (§5:363)
   - `complianceConfig: { retentionDays, redactionPatterns, disclosureScript, ... }` (§5:364)
   - `requestContextSchema: <JSON Schema>` (§5:365)
   For each, verify the Zod field exists, has the right type, has a `// §5:NNN` line citation, and is present at the right strictness level. The IC's commit body has a "IR field → §5:line" table — cross-check against `DATA_MODEL.md §5:347-365` directly to confirm no improvisation.

2. **`workflow` field disclosure (IC's flagged ambiguity #2).** The IC adds a top-level optional `workflow` key derived from `§6` (workflow projection tables) because §5:354 only specifies `workflowAttachments` (a thin Record). Verify: (a) is the `workflow` key truly necessary for the projector to write `workflow_nodes_projection` + `workflow_edges_projection`, or could those be derived from `workflowAttachments`? (b) is the optional-shape annotation clear in the schema? Mark as **flag-to-user** finding regardless of severity — this is a real divergence from §5:347-365 verbatim and may warrant an RFC amendment.

3. **`scorerAttachments` field hydration (IC's flagged ambiguity #1).** §5:360 says `scorerAttachments: Record<criterionId, { weight, samplingRate }>`, but the projection table `agent_eval_criteria` has columns `name`, `description`, `kind`, `rubric` that aren't in the IR record value. The IC's projector populates these with defaults (`name=criterionId`, `kind='success'`, `rubric=''`, `description=''`). Verify:
   - Are these defaults reasonable, or should the IR carry the per-criterion `name/description/kind/rubric` inline? Read §5 closely.
   - Is the default-application disclosed in the projector code with a comment?
   - Mark as **flag-to-user** if the divergence is non-trivial — alternatively, it may need to come from a separate `eval_criteria` master table the IC didn't query.

4. **`.strict()` everywhere (AC#2).** Walk the schema; every `z.object(...)` should have `.strict()`. `.passthrough()` is acceptable for `defaultOptions` (§5:351) and `requestContextSchema` (§5:365 — JSON Schema is unbounded by definition). Flag any `.passthrough()` outside those two cases.

5. **`@kuralle/runtime` workspace package wired (AC#3):**
   - `packages/runtime/package.json` exists with declared deps `@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod`. DevDeps: `@kuralle/config`, `@kuralle/platform`, `vitest`, `pg`, `@types/pg`, `fast-check`.
   - **Catalog only:** verify `package.json` (root) was modified to add `fast-check` to the workspace catalog, NOT to root `dependencies` / `devDependencies`. Memory rule: no root devDep additions.
   - `packages/runtime/tsconfig.json`, `vitest.config.ts`, `src/index.ts` exist and follow the `@kuralle/core` precedent.
   - `bun -F @kuralle/runtime check-types` and `bun -F @kuralle/runtime test` exit 0.

6. **`projectAgent(tx, agentVersionId, ir)` signature + behavior (AC#4):**
   - Signature accepts `(tx, agentVersionId, ir)` and returns `Promise<{ toolAttachments, kbAttachments, guardrails, evalCriteria, workflowNodes, workflowEdges }>`.
   - Inserts into the six tables in deterministic order: tool → kb → guardrails → eval → nodes → edges. Order verified.
   - The function does NOT open or commit the transaction (caller's responsibility).
   - Returned counts match IR exactly: `toolAttachments === sumOf(ir.toolAttachments + integrationTools + mcpClientAttachments + subagentAttachments)`. Verify this sum is correct (the IC's row mapping table includes 4 sources → `agent_tool_attachments`).
   - The transaction-handle TYPE is honest: it should accept the Drizzle transaction type that local-pg tests use (`PgTransaction<...> | NodePgDatabase<schema>` union). If the type is over-narrow, flag.

7. **Round-trip property test (AC#5):**
   - 50+ generated cases via `fast-check`.
   - The reconstruction step actually reads projection rows + snapshot, rebuilds an IR, and asserts structural equality (`toEqual` or deep equality), not just "no error thrown."
   - The `Arbitrary<AgentIR>` constraints are reasonable — IC documented them in commit body. Verify:
     - `toolAttachments`: 0-50 entries.
     - `scorerAttachments`: 0-10 entries; `weight ∈ [0,5]` finite; `samplingRate ∈ [0,1]` finite.
     - `guardrailGraph`: 0-10 nodes, edges reference only present nodes.
     - `workflow.edges` form a valid DAG referencing only present node IDs.
     - All floats `noNaN: true` (Postgres `real` cannot store NaN — important).
     - JSON-round-trip sanitization for null-prototype objects — flag if this is a workaround for a deeper issue (it's a known fast-check + JSON.stringify gotcha; reasonable).

8. **Latency assertion (AC#6) — sanity check.** The IC reports p95=2.30ms over 100 fixed-IR projections. **This is suspiciously fast** — verify:
   - The test actually opens a transaction per call (or runs on a real DB), not just calls `projectAgent` against a no-op tx.
   - The fixture IR (`__fixtures__/calderon-dispatcher-ir.json`) has the WBS-specified shape: 5 tools / 3 KB docs / 4 guardrails / 6 eval criteria / 8 workflow nodes / 10 edges. If the fixture is smaller, the latency is less informative.
   - The 100 iterations don't reuse the same transaction (which would give microseconds).
   - The threshold (200 ms) is not silently relaxed.
   - If p95=2.30ms is honest, that's a great signal — but flag if anything looks off.

9. **Hexagonal discipline (AC#7).** `packages/runtime/src/**` only imports from `@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod`. Test files additionally import `@kuralle/platform/memory`, `vitest`, `pg`, `fast-check`. **NO** imports from `@kuralle/platform/cloudflare`, `@kuralle/platform/node`, `@kuralle/platform/memory` outside test files. The S0-06 ESLint rule should already cover this.

10. **All public surfaces tested (AC#8):**
    - `agentIRSchema` — at least 3 tests: parses valid, rejects unknown top-level field, rejects missing required field.
    - `projectAgent` — round-trip property test + latency test + at least one focused failure-path test (e.g., `agentVersionId` doesn't exist → FK violation, asserting Postgres SQLSTATE `23503` (`foreign_key_violation`) on `DrizzleQueryError.cause`).

11. **No shortcuts (AC#9):** grep diff for `--no-verify`, `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, `as unknown as`. Each occurrence is a finding.

12. **No projector for tables outside the six listed (AC anti-scope):** projector should NOT touch `agents`, `agent_versions`, or any other table beyond the six projection tables.

13. **No async path / `projectionsReady` field touched.** WBS defers async to BL-04. If the IC added a `projectionsReady` write or any async-aware code, that's a scope creep finding.

14. **No router edits.** The projector is consumed by S2-03's `agents.publish`. If the IC modified any file under `packages/api/src/routers/`, that's a scope violation.

### 2.2 Code quality

For every file the IC created or modified:

- **Naming.** Schema is `agentIRSchema`; type is `AgentIR`. Projector function is `projectAgent`. Match brief.
- **Type tightness.** Public function has explicit return type. No `any`. `unknown` over `any`.
- **Idiomatic patterns.** Named exports only. `import type` for type-only imports.
- **Smells.** Dead branches, copy-paste, magic numbers, orphan imports, debug logs.
- **Comments.** Each top-level Zod field has a `// §5:NNN` citation comment. Defaults and ambiguity-handling have inline comments explaining WHY.
- **Test quality.** Test names accurately describe assertions. `fast-check` shrinking is enabled (default). Latency reporter outputs the histogram.

### 2.3 Project-specific gates (from kickoff prompt)

- **Hexagonal-import rule.** Enforced via existing ESLint rule (S0-06).
- **No root-dep pollution.** Verify `git show 22a5685 -- package.json` shows ONLY a catalog entry for `fast-check`, not a top-level dep.
- **Hook-wrapper rule:** N/A this story.
- **OpenAPI is the contract:** N/A this story.
- **AriaFlow event drift:** N/A this story (S3+).

---

## 3. Output format

Same shape as `gate-S2-01.md`:

```markdown
# Gate Review — `S2-02` AgentIR Zod schema + @kuralle/runtime projector

**Verdict:** {green | yellow | red}
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** 22a5685

## 1. Spec adherence
{walk AC#1-#10}

## 2. Code quality
{naming / type tightness / smells / etc}

## 3. Findings
| ID | Severity | File:line | Description | Apply now? |

## 4. Recommendation to the manager
{one paragraph}
```

Severities: `blocker` / `major` / `minor` / `nit`. Apply now: yes / no (track) / no.

---

## 4. Hard constraints

- Do NOT edit any source.
- Do NOT commit.
- Do NOT generate code.
- Output is `sprints/sprint-2/gate-S2-02.md`.
- Cite file:line for every finding.
- Verify the schema vs `DATA_MODEL.md §5:347-365` directly — don't trust the IC's mapping table.
- The two flagged ambiguities (`scorerAttachments` defaults; `workflow` §5-vs-§6) are explicit IC asks for manager decision — treat them as `major` flag-to-user findings even if the implementation is reasonable. The manager (and possibly the user) decides whether they need an RFC amendment.
