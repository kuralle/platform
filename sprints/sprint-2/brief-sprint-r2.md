# Sprint 2 Adversarial Review (r2) — Editor IR pipeline

> **Role.** You are the **adversarial second-opinion reviewer (`codex/gpt-5.3-codex`)** — a senior staff engineer with deep expertise in **TypeScript ESM, oRPC contracts, Drizzle transactions on Postgres 15, hexagonal architecture, identity-map cache patterns, Zod schema design, fast-check property testing, TanStack Query, Vitest + happy-dom + MSW, React 19, Postgres CHECK constraints, and SLO-as-test discipline**. You have shipped editor pipelines, projection workers, and SLO-gated CI loops in production at the multi-tenant scale; you treat schema integrity, transactional ordering, and cache-invalidation timing as correctness invariants, not performance optimizations.
>
> **Mindset.** You are **adversarial**. The four prior reviewers (`pi/deepseek-v4-pro` IC × 5 stories, `pi/kimi-k2.6` gate × 5 stories, manager r1 × sprint-level) form a defense in depth. Your job is to find what they missed. Pretend they are all overconfident. Read the diff line by line. Verify every "Strength" in r1 against the actual code. Verify every "Met" status in the per-story gates against the actual contract. Critique r1 itself if it praised something that is broken, downgraded a finding that should have been escalated, or missed an architectural concern.
>
> **You are NOT redoing the work.** Your output is a markdown review document at `sprints/sprint-2/review-sprint-r2.md`. Do NOT commit. Do NOT modify any source. Do NOT generate code.

---

## 1. Inputs

Read all of these. Inspect the full diff line by line.

### Story briefs (the contracts)
- `sprints/sprint-2/brief-S2-01.md` (`@kuralle/core` repositories + KvStore identity-map cache)
- `sprints/sprint-2/brief-S2-02.md` (AgentIR Zod schema + projector)
- `sprints/sprint-2/brief-S2-03.md` (5 agents procedures + 11 OpenAPI row schemas)
- `sprints/sprint-2/brief-S2-04.md` (editor wiring + 5-resource hooks)
- `sprints/sprint-2/brief-S2-05.md` (sub-second publish SLO test)

### Per-story gates (`pi/kimi-k2.6` reports)
- `sprints/sprint-2/gate-S2-01.md`
- `sprints/sprint-2/gate-S2-02.md`
- `sprints/sprint-2/gate-S2-03.md`
- `sprints/sprint-2/gate-S2-04.md`
- `sprints/sprint-2/gate-S2-05.md`

### Manager r1 (sandwich review across the full sprint diff)
- `sprints/sprint-2/review-sprint-r1.md` — read this in full. **Critique it where it's wrong.**

### Source RFC sections
- `DATA_MODEL.md §5:307-443` — agents two-row split + projection tables (the locked snapshot shape).
- `DATA_MODEL.md §6:443-478` — workflow projection tables.
- `DATA_MODEL.md §13` — `usage_events` table (extended this sprint by AMENDMENT-005).
- `DATA_MODEL.md §15` — append-only enforcement, soft-delete columns, polymorphic CHECK trigger.
- `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer; `runtime/adapter/`.
- `HEXAGONAL_ARCHITECTURE.md §5` — Fowler PoEAA identity-map.
- `HEXAGONAL_ARCHITECTURE.md §6` — discipline rules (no platform leak, memory adapter for every port).
- `INTERFACE_DESIGNS_RuntimeHost.md §5` — synthesis; the projector's contract.
- `USER_JOURNEYS.md §2 SLO #2` — the published sub-second target.
- `USER_JOURNEYS.md §4` — Journey 2 (publish modal copy is here).
- `USER_JOURNEYS.md §13` — C2/C3/C8 wiring spec.

### RFC amendments ratified this sprint
- `sprints/AMENDMENT-003.md` — `scorerAttachments` per-criterion fields.
- `sprints/AMENDMENT-004.md` — optional `workflow` top-level key.
- `sprints/AMENDMENT-005.md` — `usage_events.payload jsonb` + `slo_violation` kind.

### Carry-forward amendments (still in flight from S0/S1)
- `sprints/AMENDMENT-001.md` — frontend uses `@orpc/tanstack-query`.
- `sprints/AMENDMENT-002.md` — `apikey.referenceId` (no `organizationId`).

### The diff
```bash
git log --oneline 3df24c8..HEAD     # 10 commits
git show 3df24c8..HEAD              # the full sprint diff
```

129 files changed, +13334/-575. Read every source file. Pay special attention to:

- `packages/core/src/repositories/agent.ts` (publishVersion is the most load-bearing function in the sprint)
- `packages/runtime/src/projector/agent.ts` (AMENDMENT-003 + AMENDMENT-004 plumbing; AMENDMENT-004 inserts into 6 tables in deterministic order)
- `packages/runtime/src/instrumentation/slo.ts` (AMENDMENT-005 payload contract)
- `packages/api/src/routers/agents.ts` (transactional publish handler with try/catch + SLO instrumentation)
- `packages/db/src/migrations/0012_s2_05_usage_events_slo.sql` (the migration with `IF EXISTS` guards — see the M1 mystery in r1)
- `apps/web/src/routes/_app.agents.$agentId.tsx` (auto-save effect, publish.reset() pulse, sticky bar transitions)
- `apps/web/src/__tests__/editor-publish-flow.test.tsx` (real-production-primitive harness; vi.useFakeTimers integration)
- `eslint.config.mjs` (S2-01 ignores list + S2-04 forbidden-mock-import addition)

### Postgres state for behavioral verification (optional)
- `postgres://kuralle:kuralle@localhost:5432/kuralle_dev`
- `psql -d kuralle_dev -c "\d+ usage_events"` to verify constraints.

---

## 2. Your job — find what the prior four reviewers missed

### 2.1 Critique r1 itself

r1's verdict: 0 blockers, 2 majors (M1: missing CHECK constraint mystery; M2: cursor pagination dishonesty), 4 minors (m1-m4: telephony shim doc, ignores cleanup, fastcheck flake, codegen gate-partial), 2 nits.

Your job: **disagree where r1 was wrong**.

- Did r1 over-praise the transactional publish path? Specifically: the cache invalidation happens **after `tx.commit()` succeeds**, but a concurrent reader between commit and `kv.delete` returns the stale cached value. Is this a 60s eventual-consistency window, a single-process race, or a real production bug? Rule on it.
- Did r1 under-rate M1 (the missing CHECK)? The S1-04 fix-pass already touched these CHECKs once. If `usage_events_kind_check` was missing, are `tools_kind_check`, `agent_versions_version_kind_check`, `agent_eval_criteria_kind_check`, `workflow_nodes_projection_kind_check`, `channel_connections_channel_kind_check`, `routing_rules_rule_kind_check`, `runtime_deployments_kind_check`, `tool_catalog_providers_*_check` also missing? If yes, **escalate M1 to a blocker** and recommend `[S2-fix]` ship a correction migration.
- Did r1 miss a blocker? Re-walk the publish handler error mapping in `packages/api/src/routers/agents.ts:154-166`. The catch block re-maps SQLSTATE 23505/23503/0A000 to ORPCError CONFLICT. What about other SQLSTATEs that should be CONFLICT (`40001` serialization_failure, `40P01` deadlock_detected)? They'd surface as raw 500. Is this a major concern given the publish is transactional?

### 2.2 Look for non-obvious issues

**Race conditions / cache coherency:**
- `packages/core/src/repositories/agent.ts:209` — `kv.delete(cacheKey(workspaceId, agentId))` runs after `db.transaction(...)` resolves. Between `tx.commit()` and `kv.delete`, a concurrent `findById` returns the stale entry. The 60s TTL bounds the staleness, but the brief AC#4 said "cache holds the domain object" — a stale domain object during the publish window is a contract divergence that single-process tests don't catch.
- `packages/core/src/repositories/agent.ts:177` — `findById(opts.agentId)` is called before the transaction starts to capture `parentVersionId`. If a concurrent publisher commits between this read and the transaction's snapshot, the new version's `parentVersionId` points at a now-stale parent. The brief said "git-style forward compat"; check whether this concurrency window can produce a non-linear version graph.

**Edge cases:**
- What happens when `agents.publish` is called with an empty `AgentIR` (zero tools, zero KB attachments, zero guardrails)? Does the projector still complete? Is the `versionNumber` still incremented?
- What happens if `nextVersionNumber` returns `1` on a fresh agent but the agent was just inserted in another transaction? Is there a `(agentId, versionNumber)` unique-violation race?
- The `useEditorReducer` (`apps/web/src/contexts/editor.tsx:14-21`) returns `{ ir: {} as AgentIR, original: {} as AgentIR }` initially. Until the seed `useEffect` fires, `state.ir === state.original` is `true` (`isDirty=false`) — so a user who edits before the seed completes loses their edit on seed. Verify the seed `useRef` guard at `_app.agents.$agentId.tsx:33-40` is race-tight.

**Type-safety holes:**
- Search for `as any`, `as unknown as`, `// eslint-disable`, `@ts-ignore`, `as` casts. The IC standard is no shortcuts. Look in test files and source files alike.
- The `toJsonb(ir)` helper in `packages/runtime/src/projector/agent.test.ts` exists to centralize a single `as unknown as Record<string, unknown>` cast — is the cast genuinely necessary, or does Zod's `z.infer<typeof agentIRSchema>` produce a type that's structurally `Record<string, unknown>`-assignable?

**Hidden coupling:**
- The S2-04 forbidden-mock-import rule has an `ignores` array (`eslint.config.mjs:75-87`) listing 8 deferred screens. Are any of those screens in the WBS for S3? If so, the `ignores` entry must be removed when its sprint lands. Is there documentation enforcing that?
- The `RepoDb` union type (`packages/core/src/repositories/types.ts`) accepts `NodePgDatabase | NeonHttpDatabase`. Is this honest? Some Drizzle methods may be available on one driver but not the other. Are repository methods guaranteed to work on both?

**Latency regressions / perf:**
- `apps/web/src/routes/_app.agents.$agentId.tsx:51-67` — the auto-save useEffect re-runs on every IR change. Each re-run clears the prior timer and starts a new 30s timer. If a user types 60 characters in 60 seconds, the timer fires 60 times — but the brief said the timer fires 30s after the LAST edit. Verify this is correct.
- `packages/core/src/repositories/agent.ts:177` — `findById` on the publish path. This is a cache hit if the agent was recently read; a cache miss otherwise. Does the publish flow benefit from the cache, or is it always a cold read? The S2-05 SLO histogram (p95=2.9ms) is suspiciously fast — sanity-check the test exercises real disk I/O.

**Security:**
- `packages/api/src/routers/agents.ts` — the publish handler accepts `agentIRSchema` input. The schema is `.strict()` — verify there's no `passthrough` leak that would let a malicious client write extra fields to the snapshot.
- The new `usage_events.payload` jsonb column accepts arbitrary jsonb. Should `recordSloViolation` validate the payload shape, or trust the caller? If untrusted callers can write payloads, what's the SQL-injection / deserialization-attack surface for downstream readers?

**Telemetry / observability:**
- Does `agents.publish` emit any telemetry beyond the SLO violation row? The WBS mentions `usage_events.kind` should reflect what's billed; should publish emit a `usage_events.kind='publish'` row? Or is publish itself zero-cost from a billing perspective? Rule on it.

**Untested code paths:**
- The publish handler's catch block (`agents.ts:154-166`) maps three SQLSTATEs to CONFLICT and rethrows everything else. Are there tests for any of these paths? The S2-03-fix integration test asserts NOT_FOUND but does it assert the CONFLICT behavior?
- `recordSloViolation` (`packages/runtime/src/instrumentation/slo.ts:33-50`) has a happy path (write payload) but no failure path. What if the FK constraint on `agent_id` fails because the agent was deleted between publish and SLO insert? The fire-and-forget `.catch(() => {})` swallows it. Should that error be logged?

**Migration integrity:**
- AMENDMENT-005's migration `0012` uses `ADD COLUMN IF NOT EXISTS` and `DROP CONSTRAINT IF EXISTS` — defensive but indicates the IC didn't trust the prior state. Are these guards covering for a real bug (M1) or just over-engineering? Verify by inspecting the local DB state via `psql \d+ usage_events` against the migration file.
- Is the `payload` column properly typed in the Drizzle schema? Does `usageEvents.$inferSelect.payload` resolve to `unknown`, `any`, or a typed shape?

### 2.3 What's NOT there

- Has the OpenAPI spec been verified post-AMENDMENT-005? The new payload column doesn't surface in the contract; should it?
- Did any sprint story add a Drizzle relation declaration that's missing the inverse?
- Are there any TODO / FIXME / XXX comments left in the diff that should be tracked as backlog items?
- Does the warmdown have everything it needs? (You don't need to write the warmdown — the manager does — but flag missing data the warmdown will need.)

### 2.4 Read r1 itself for accuracy

For each strength r1 listed:
- Verify the code at the cited file:line actually does what r1 says.
- Disagree if r1's framing is wrong.

For each critique r1 listed:
- Verify the cited issue exists.
- Rule on whether r1's severity is right (escalate or de-escalate).
- Add critique items r1 didn't see.

---

## 3. Output

Write `sprints/sprint-2/review-sprint-r2.md` from `sprints/templates/REVIEW-r2.md`.

Your verdict at the end is one of:

- **Endorse r1.** r1 caught everything. (Rare. If you reach this, double-check.)
- **Strengthen r1.** r1 was substantially right; here are additional items.
- **Override r1.** r1 missed a blocker or got severity wrong.

For each item you raise:
- Severity: `blocker` / `major` / `minor` / `nit`.
- Apply now (in `[S2-fix]`) or track to backlog (with id).
- Cite file:line + the spec rule (RFC § / WBS DoD line / language semantics).

---

## 4. Hard constraints

- Do NOT edit any source.
- Do NOT commit.
- Do NOT generate code.
- Output is `sprints/sprint-2/review-sprint-r2.md` only.
- Cite file:line for every finding.
- If you cannot run a command (e.g., the local DB is unreachable), state that explicitly — don't bluff.
- Critique r1 by name where it's wrong. Don't be polite about it.
- A blocker means the sprint should NOT close until it's fixed. Use sparingly but not never.
