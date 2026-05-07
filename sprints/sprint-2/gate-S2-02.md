# Gate Review — `S2-02` AgentIR Zod schema + @kuralle/runtime projector

**Verdict:** yellow
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** 22a5685

---

## 1. Spec adherence

### AC#1 — `AgentIR` schema matches `DATA_MODEL.md §5:347-365` verbatim
**Met.** Every top-level field listed in §5:348-365 is present in `agentIRSchema` with the correct Zod type and a `// §5:NNN` citation comment. `.strict()` is applied at every nested object level. `defaultOptions` (§5:351) and `requestContextSchema` (§5:365) correctly use `.passthrough()` to accommodate unbounded JSON shapes. No improvisation detected.

Cross-checked field-by-field:
- `name`, `description` → `z.string()` // §5:348 ✅
- `instructions` → `z.string()` // §5:349 ✅
- `model` → `modelSchema` (provider, name, temperature?) // §5:350 ✅
- `defaultOptions` → `.passthrough().default({})` // §5:351 ✅
- `toolAttachments` → `Record<toolId, {description?, rules?}>` // §5:353 ✅
- `workflowAttachments` → `Record<wfId, {description?}>` // §5:354 ✅
- `subagentAttachments` → `Record<agentId, {description?}>` // §5:355 ✅
- `integrationTools` → `Record<tcpId, {selectedTools[]}>` // §5:356 ✅
- `mcpClientAttachments` → `Record<clientId, {allowedTools[]}>` // §5:357 ✅
- `kbAttachments` → `[{documentId}]` // §5:358 ✅
- `guardrailGraph` → `guardrailGraphSchema` (nodes+edges) // §5:359 ✅
- `scorerAttachments` → `Record<criterionId, {weight, samplingRate}>` // §5:360 ✅
- `voiceConfig` → `voiceConfigSchema` // §5:362 ✅
- `channelConfig` → `Record` // §5:363 ✅
- `complianceConfig` → `complianceConfigSchema` // §5:364 ✅
- `requestContextSchema` → `.passthrough().default({})` // §5:365 ✅

### AC#2 — Schema is `.strict()` everywhere
**Met.** All `z.object` / `z.strictObject` schemas carry `.strict()`. The only `.passthrough()` instances are `defaultOptions` and `requestContextSchema`, which are explicitly permitted by the brief for unbounded JSON shapes.

### AC#3 — `@kuralle/runtime` workspace package wired
**Met.** `packages/runtime/package.json` exists with correct dependencies (`@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod`) and devDependencies (`@kuralle/config`, `@kuralle/platform`, `vitest`, `pg`, `@types/pg`, `fast-check`). `fast-check` was added to the workspace catalog only — no root `dependencies` / `devDependencies` pollution (root `package.json` diff verified). `tsconfig.json`, `vitest.config.ts`, `src/index.ts` all present and follow the `@kuralle/core` precedent. `bun -F @kuralle/runtime check-types` exits 0. `bun -F @kuralle/runtime test` exits 0 (6/6 passed).

### AC#4 — `projectAgent(tx, agentVersionId, ir)` signature + behavior
**Met.** Signature accepts `(tx, agentVersionId, ir)` and returns `Promise<ProjectionCounts>`. Inserts into the six projection tables in deterministic order: tool → kb → guardrail → eval → nodes → edges. Does NOT open or commit the transaction. Returned `toolAttachments` count equals the sum of `toolAttachments` + `integrationTools` + `mcpClientAttachments` + `subagentAttachments` entries. Verified against fixture: 5 native + 1 integration + 1 mcp + 1 subagent = 8.

**Minor:** Transaction-handle type is `PgTransaction<any, any, TablesRelational>` with an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` (`agent.ts:49`). The brief asked for a driver-agnostic union or parameterized HKT, not `any`.

### AC#5 — Round-trip property test (50+ generated cases)
**Partial.** The test generates 50 cases via `fast-check` (`numRuns: 50`) and does read projection rows + snapshot, reconstruct an IR, and assert field-by-field equality. However, it does **not** assert structural equality of the full reconstructed IR (no top-level `toEqual`). Specifically:
- `scorerAttachments.samplingRate` is lost in projection (schema mismatch) and the reconstruction hard-codes `samplingRate: 0` (`agent.test.ts:350`) without asserting the original value.
- `workflowAttachments` and `subagentAttachments` descriptions are not verified in the reconstructed IR.
- Guardrail edges are carried over from the snapshot, not from projection rows (honest because no edge projection table exists), but the test doesn't prove they round-trip independently.

**Minor:** `toolAttachmentsArb` uses `maxKeys: 10` (`agent.test.ts:148`) while the commit body documents "0-50 entries". Code and docs are out of sync.

**Minor:** `workflowArb` does not enforce a DAG constraint on generated edges; it only validates node-id presence. The brief explicitly requires "workflow.edges form a valid DAG referencing only present node IDs".

### AC#6 — Latency assertion (p95 ≤ 200 ms)
**Met with note.** The test opens a fresh transaction per iteration, uses the specified representative IR (5 tools / 3 KB docs / 4 guardrails / 6 eval criteria / 8 workflow nodes / 10 edges), and asserts p95 ≤ 200 ms. Observed p95 = 2.30 ms on local Postgres. The number is surprisingly low but honest: it measures only the six `tx.insert` calls inside an uncommitted transaction against a local DB with effectively zero network latency. The threshold is not relaxed.

### AC#7 — Hexagonal discipline
**Met.** `packages/runtime/src/**` imports only from `@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod`. Test files additionally import `@kuralle/core/test-utils`, `vitest`, `pg`, `fast-check`. No imports from `@kuralle/platform/cloudflare`, `@kuralle/platform/node`, or `@kuralle/platform/memory`. ESLint passes (0 errors, 1 pre-existing warning in `env/src/web.ts`).

### AC#8 — All public surfaces tested
**Met.** `agentIRSchema` has 13 tests (parse valid, reject unknown top-level, reject unknown nested, reject missing required, enum validation, default application, etc.). `projectAgent` has round-trip property test, latency test, FK violation failure-path test, data integrity test, and deterministic-order test. The FK violation test asserts Postgres SQLSTATE `23503` on the error cause.

### AC#9 — No shortcuts
**Partial.** Two `// eslint-disable-next-line @typescript-eslint/no-explicit-any` found (`agent.ts:49`, `agent.test.ts:213`). Two `as unknown as Record<string, unknown>` casts found (`agent.test.ts:229`, `604`) used to coerce `AgentIR` into Drizzle's `jsonb` insert type. No `--no-verify`, `@ts-ignore`, `catch (e: any)`, or `default export`.

### AC#10 — No projector for tables outside the six listed
**Met.** Projector only touches `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`.

### AC#11 — No async path / `projectionsReady` field touched
**Met.** No async seam or `projectionsReady` write. Synchronous only.

### AC#12 — No router edits
**Met.** No files under `packages/api/src/routers/` modified.

---

## 2. Code quality

**Naming:** `agentIRSchema`, `AgentIR`, `projectAgent`, `ProjectionCounts` all match brief conventions. ✅

**Type tightness:** Public function has explicit return type `Promise<ProjectionCounts>`. `unknown` used in `catch (e: unknown)` (`agent.test.ts:688`). `any` is only used in the transaction-type workaround. ✅

**Idiomatic patterns:** Named exports only. `import type` for type-only imports (`PgTransaction`, `AgentIR`, `ExtractTablesWithRelations`). ✅

**Smells:** None detected. No dead branches, orphan imports, debug logs, or magic numbers outside of test fixture construction. ✅

**Comments:** Each top-level Zod field cites `// §5:NNN`. The projector header includes a full paragraph explaining the `scorerAttachments` default-application rationale. ✅

**Test quality:** Test names are descriptive. `fast-check` shrinking is enabled by default. Latency histogram is printed to console. `endOnFailure: true` on the property test stops at first failure for faster debugging. ✅

---

## 3. Findings

| ID | Severity | File:line | Description | Apply now? |
|---|---|---|---|---|
| F01 | major | `packages/core/src/schemas/agent-ir.ts:206` | Optional top-level `workflow` key is a divergence from `DATA_MODEL.md §5:347-365` (which only lists `workflowAttachments`). Necessary for the projector to populate `workflow_nodes_projection` + `workflow_edges_projection` per §6, but it is a spec deviation that requires manager/user decision (RFC amendment). | no (track) |
| F02 | major | `packages/runtime/src/projector/agent.ts:130-144` | `scorerAttachments` IR shape (`{weight, samplingRate}`) does not carry `name`, `description`, `kind`, `rubric` required by `agent_eval_criteria` projection table. Projector applies defaults (`name=criterionId`, `kind='success'`, empty strings). Disclosed in comment, but this is a semantic data-loss gap that requires manager/user decision (expand IR or add master table). | no (track) |
| F03 | major | `packages/runtime/src/projector/agent.test.ts:365-525` | Round-trip property test reconstructs IR field-by-field but never asserts full structural equality (`toEqual` on the whole object). `samplingRate` is hard-coded to `0` in reconstruction (line 350) and not checked against original. Does not fully prove lossless round-trip per AC#5. | yes |
| F04 | minor | `packages/runtime/src/projector/agent.ts:49` | Transaction-handle type uses `PgTransaction<any, any, ...>` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`. Brief asked for a driver-agnostic union or parameterized HKT, not `any`. | yes |
| F05 | minor | `packages/runtime/src/projector/agent.test.ts:148` | `toolAttachmentsArb` documents `0-50` entries in commit body but code uses `maxKeys: 10`. Code and docs out of sync. | yes |
| F06 | minor | `packages/runtime/src/projector/agent.test.ts:229,604` | `as unknown as Record<string, unknown>` casts to coerce `AgentIR` into Drizzle `jsonb` insert type. A typed helper (e.g., `toJsonb(ir)`) would avoid the cast. | yes |
| F07 | minor | `packages/runtime/src/projector/agent.test.ts:174-189` | `workflowArb` does not enforce DAG constraint on generated edges; only validates node-id presence. Brief explicitly requires "valid DAG referencing only present node IDs". | yes |
| F08 | nit | `packages/core/src/schemas/agent-ir.ts:183,205` | `z.strictObject({}).passthrough()` is contradictory (strict then passthrough). Use `z.object({}).passthrough()` for unbounded JSON shapes. | yes |

---

## 4. Recommendation to the manager

The commit is solid — all tests pass green, the schema is a verbatim implementation of §5:347-365, and the projector behaves deterministically inside the caller's transaction. The two flagged ambiguities (`workflow` §5-vs-§6; `scorerAttachments` projection defaults) are honestly disclosed in both the commit body and inline code comments, and the stopgap implementations are reasonable for Sprint 2. However, they are real divergences from the locked spec and **must** be resolved with an RFC amendment or `DATA_MODEL.md` update before S2-03 wires the projector into `agents.publish`. The round-trip test should be tightened to assert full structural equality (or explicitly document which fields are intentionally non-round-tripping) so the property test actually proves the contract it claims to prove. The four minor hygiene items (`any` tx type, Arbitrary docs sync, DAG constraint, `as unknown as` casts) are quick fixes that should be applied in the `[S2-02-fix]` pass. **Verdict: yellow — ship after fix-pass for F03-F07, and track F01-F02 for spec resolution.**
