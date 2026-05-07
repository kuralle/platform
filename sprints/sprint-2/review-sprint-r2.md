# Review (r2, second opinion) — Sprint 2 Editor IR pipeline

> **Reviewer (`codex` worker):** GPT-5 (codex) · 2026-05-08.
> **Scope:** sprint-level, diff `3df24c8..HEAD`.
> **Inputs:** all S2 briefs/gates, `review-sprint-r1.md`, and source files/migrations/tests listed in the brief.

---

## 1. Endorsement / disagreement with r1

- **Override r1.** r1 says “0 blockers” and over-praises publish correctness; that is wrong on current HEAD. I found one blocker and two additional majors that affect correctness: (1) editor tabs hard-gate on `if (!ir.instructions)` and therefore treat a valid empty-string instruction set as perpetual loading (`apps/web/src/routes/_app.agents.$agentId.behavior.tsx:28`, `...models.tsx:87`, `...compliance.tsx:58`) even though `AgentIR` allows `instructions: z.string()` (`packages/core/src/schemas/agent-ir.ts:192`), (2) publish lineage (`parentVersionId`) is derived from cached read outside transaction (`packages/core/src/repositories/agent.ts:177-190`) and can become stale/non-linear under cache-delete failure + concurrent publish, and (3) SQLSTATE mapping in publish catch omits transactional conflict classes `40001` and `40P01` (`packages/api/src/routers/agents.ts:161-166`).

---

## 2. What r1 missed

### 2.1 Concurrency / race conditions

- **`parentVersionId` can be wrong (non-linear graph risk)** at [`packages/core/src/repositories/agent.ts:177-190`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/packages/core/src/repositories/agent.ts:177). Severity: **major**. Why r1 missed it: r1 focused on post-commit cache invalidation timing, but missed that lineage parent is read via `findById` (cache-backed) *before* transaction. If prior publish commit succeeds but cache delete fails (explicitly tolerated by design at `agent.ts:209-222`), stale `activeVersionId` can persist for TTL 60s and be written as the parent for a later publish. This violates the intent of git-style parent linkage in `DATA_MODEL.md §5` (`parentVersionId`, line 339). Proposed fix: in `[S2-fix]`, resolve parent inside the same transaction from DB (non-cached), and ideally compute next version in the same transaction too.

- **Read-after-commit stale window exists but is not a blocker by itself** at [`packages/core/src/repositories/agent.ts:209-222`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/packages/core/src/repositories/agent.ts:209). Severity: **minor**. r1’s framing (“transactional publish pipeline is correct”) is incomplete; there is a real race window between commit and cache delete for concurrent readers. However, this is explicitly permitted by `brief-S2-03.md` AC#2 (post-commit invalidation; failure should not roll back and TTL bounds staleness). This is consistency tradeoff, not immediate ship blocker.

### 2.2 Edge cases not tested

- **Valid empty `instructions` bricks editor tabs** at [`apps/web/src/routes/_app.agents.$agentId.behavior.tsx:28`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/apps/web/src/routes/_app.agents.$agentId.behavior.tsx:28), [`...models.tsx:87`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/apps/web/src/routes/_app.agents.$agentId.models.tsx:87), [`...compliance.tsx:58`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/apps/web/src/routes/_app.agents.$agentId.compliance.tsx:58). Severity: **blocker**. Why: `AgentIR` accepts empty string (`z.string()`; `agent-ir.ts:192`), user can clear prompt and save, then all tabs show “Loading agent configuration…” forever because they use falsy-string check as loading sentinel. Proposed fix: in `[S2-fix]`, replace sentinel with an explicit loading flag tied to query/seed completion, not field content.

### 2.3 Threading-model assumptions (Bun vs Node)

- Nothing to add — r1 covered this sufficiently.

### 2.4 Memory / resource leaks

- Nothing to add — no leak-level issue found in changed runtime/editor/server paths.

### 2.5 Type-safety holes

- **Remaining double-cast in runtime property test** at [`packages/runtime/src/projector/agent.test.ts:30-31`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/packages/runtime/src/projector/agent.test.ts:30). Severity: **nit**. Test helper still does `as unknown as`. Not production-risk, but contrary to stated standard.

### 2.6 Untested code paths

- **Publish conflict mapping does not cover serialization/deadlock** at [`packages/api/src/routers/agents.ts:161-166`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/packages/api/src/routers/agents.ts:161). Severity: **major**. Current remap covers `23505/23503/0A000` only. `40001` (serialization failure) and `40P01` (deadlock) are plausible for transactional publish and currently leak as raw 500. Proposed fix: `[S2-fix]` map both to `ORPCError('CONFLICT')` or explicit retryable error class; add integration tests for both paths.

### 2.7 Hidden coupling / dependency violations

- **Deferred forbidden-mock ignore list has no expiry enforcement** at [`eslint.config.mjs:77-86`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/eslint.config.mjs:77). Severity: **minor**. r1 called this in passing but underweighted the coupling risk: deferred screens can remain permanently exempt unless tracked against WBS/S3 owners. Proposed fix: backlog item with owner/date, or fail lint when ignore entries persist past sprint tag.

### 2.8 Latency regressions

- Nothing to add — SLO test is real and instrumentation now lands payload correctly.

### 2.9 Security concerns

- **No passthrough leak in `agents.publish` input contract**. `agentIRSchema` is strict at top-level (`agent-ir.ts:188-221`), with deliberate passthrough only for `defaultOptions` and `requestContextSchema` (`agent-ir.ts:194`, `131-134`). Severity: none. r1 did not misstate this, but it should be explicitly closed as safe.

### 2.10 Wire-protocol drift

- **Cursor contract still dishonest for agents list/history** at [`packages/api/src/routers/agents.ts:82-85`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/packages/api/src/routers/agents.ts:82), [`253-257`](/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/packages/api/src/routers/agents.ts:253). Severity: **major** (same as r1 M2). Input accepts cursor, output always `cursor: null`, repository ignores cursor.

### 2.11 Bundle bloat / transitive dependency surface

- Nothing to add — no significant new runtime dependency bloat in this diff.

### 2.12 Missing artifacts (tests, telemetry, README, demo)

- Nothing material missing now. SLO payload telemetry is implemented in runtime schema + instrumentation (`packages/db/src/schema/billing.ts:51-56`, `packages/runtime/src/instrumentation/slo.ts:46-50`).

---

## 3. Critique of r1 itself

- **r1 “0 blockers” is wrong**: it missed the empty-instructions hard lock (blocker above). This is a user-facing dead-end for valid schema data.
- **r1 over-praised transactional publish path** (`review-sprint-r1.md:17`) by not checking lineage read location. Parent linkage is resolved outside tx through cache-backed `findById` (`agent.ts:177`), which is not strong enough for graph correctness.
- **r1 likely over-rated M1 as current major on HEAD**. I verified local DB constraints directly: `usage_events_kind_check` exists and sibling checks also exist (`tools_kind_check`, `agent_versions_version_kind_check`, `agent_eval_criteria_kind_check`, `workflow_nodes_projection_kind_check`, `channel_connections_channel_kind_check`, `routing_rules_rule_kind_check`, `runtime_deployments_kind_check`, and tool catalog checks). Evidence from `psql` confirms these are present now. Keep historical note, but this should no longer gate Sprint 2 close.
- **r1 did not challenge SQLSTATE coverage depth**. `40001`/`40P01` omission should have been called as major in a transactional mutation path.

---

## 4. Cross-cutting

- The highest-risk seam is the publish correctness trilogy: version number allocation outside tx (`agents.ts:137-139`), parentVersion derivation outside tx and via cache (`agent.ts:177-178`), and partial SQLSTATE remap (`agents.ts:161-166`). Individually survivable, together they create avoidable conflict/lineage ambiguity under concurrency.
- The editor loading sentinel bug repeats in three tabs with identical predicate (`if (!ir.instructions)`), indicating copy-propagated state modeling issue rather than isolated typo.

---

## 5. Verdict

- [ ] **Endorse r1.** Diff is mergeable once r1's items resolve.
- [ ] **Strengthen r1.** Diff has additional items I found; merge blocked until items below resolve.
- [x] **Override r1.** Disagree with r1 on a blocking item; main session must adjudicate.

Main-session resolution list:

1. **[blocker][S2-fix]** Replace `if (!ir.instructions)` loading sentinels in C2/C3/C8 with explicit loaded-state gating; add regression test for `instructions: ""`.
2. **[major][S2-fix]** Move publish parent-version derivation to a non-cached read inside transaction; optionally co-locate next-version allocation in same tx.
3. **[major][S2-fix]** Expand publish SQLSTATE remap to include `40001` + `40P01` and test those paths.
4. **[major][backlog or S2-fix]** Resolve cursor pagination dishonesty: implement keyset cursor or remove cursor input from contract until implemented.
