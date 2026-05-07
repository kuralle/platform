# Sprint 2 Review (r1, sandwich) — Editor IR pipeline

> **Reviewer (main session):** Claude Opus 4.7 (1M context) · 2026-05-08
> **Diff under review:** `3df24c8..HEAD` (10 commits, 129 files, +13334/-575 lines)
> **Stories covered:** S2-01..S2-05 + per-story fix-passes
> **Per-story gates:** all five `pi/kimi-k2.6` reviews are on disk (`gate-S2-{nn}.md`); each verdict was yellow with all Apply-now items resolved by the per-story fix-pass commits before the next IC fired.

The per-story-kimi memory rule was honored: each IC commit was gated, fix-passed, and re-verified green before the next IC fired. This sandwich review focuses on **architectural / cross-cutting / sprint-scope** concerns — what r1 sees that per-story gates can't (the seam between repository → router → hook → component, and the through-line of the three RFC amendments).

---

## 1. Strengths

Specific, load-bearing decisions the team got right.

- **Hexagonal layering shipped honestly.** `packages/core/src/repositories/agent.ts:50` → `packages/runtime/src/projector/agent.ts:48` → `packages/api/src/routers/agents.ts:117` form a clean dependency tree. Repositories don't import platform adapters; the projector consumes only `@kuralle/db` + `@kuralle/core`; routers consume only `@kuralle/core` + `@kuralle/runtime`. The `S2-01` ESLint rule (`eslint.config.mjs:101-128`) catches drizzle-orm leaks at the router boundary — exercised in S2-03 when the IC routed every agent procedure through the repository.
- **Transactional publish pipeline is correct.** `packages/core/src/repositories/agent.ts:169-215` implements the locked sequence: insert version → run projector inside the same `db.transaction(...)` callback → swap `agents.activeVersionId` → commit → `kv.delete` ONLY after the transaction resolves. The cache-invalidation timing (after, not during) is verified by the integration test (`apps/server/src/__tests__/agents.publish.test.ts:177-208`) and the SLO assertion still holds (p95 ≤ 1 s with this sequencing). This is the correctness contract from `DATA_MODEL.md §5` + `USER_JOURNEYS.md §2 SLO #2` — and it's enforced by the code, not just by review.
- **Three RFC amendments ratified with full disclosure.** AMENDMENT-003 (`scorerAttachments` per-criterion fields), AMENDMENT-004 (optional `workflow` top-level key bridging `§5` and `§6`), AMENDMENT-005 (`usage_events.payload jsonb` + `slo_violation` kind) all landed within Sprint 2 with explicit user ratification (-003, -004) or manager-authored migration (-005). Each amendment file cites `DATA_MODEL.md` line ranges, lists concrete edits, names a resolution path forward, and has a footnote on why an alternative was rejected. This is exactly the WBS §1.2 rule 4 in practice.
- **The S2-04 click-through test rewrite is the load-bearing fix of the sprint.** The IC's first attempt at `apps/web/src/__tests__/editor-publish-flow.test.tsx` was an ad-hoc fetch-stub harness — kimi caught it (gate-S2-04 F01). The fix-pass rewrite mounts real production primitives (`useAgentAutoSave`, `useAgentPublish`, `useEditorReducer`, `PublishConfirmationModal`) inside `EditorTestShell` (`editor-publish-flow.test.tsx:84-159`) and exercises the genuine 30s-debounce → MSW autoSave hit → reducer.original snap → "Saved" transition with `vi.useFakeTimers`. This is the contract the brief asked for; the IC's first pass missed it; the fix-pass closed it.
- **F06 caught a genuine project-wide gap.** The kimi gate on S2-04 discovered the `forbidden-mock-import` ESLint rule referenced throughout S0/S1/S2 docs **had never actually existed in `eslint.config.mjs`**. The fix-pass added it with a properly-scoped `ignores` array for deferred screens. This is the kind of audit-trail integrity check r1 expects from the gate loop, and the loop delivered.
- **AMENDMENT-005's discovery is informative, not just a fix.** While shipping migration `0012`, the manager discovered that `usage_events_kind_check` from migration `0010` had never actually been applied to the local DB (the `IF EXISTS` guard in 0012 was the tell — see `packages/db/src/migrations/0012_s2_05_usage_events_slo.sql:13`). That's a real S1 carry-forward bug — see Critique M1.

I could identify six load-bearing strengths. The sprint shipped substantive work.

---

## 2. Critique

Order: blockers first, then majors, minors, nits.

### 2.1 Blockers

None. Every per-story gate's `Apply-now` findings are resolved; CI baseline is green; OpenAPI drift gate green; all tests pass; no `--no-verify` / `@ts-ignore` / shortcuts in the diff.

### 2.2 Majors

#### M1. The `usage_events_kind_check` CHECK constraint from S1 migration `0010` was never applied to the local DB

- **Where:** discovered while applying `packages/db/src/migrations/0012_s2_05_usage_events_slo.sql`. The original CHECK lives at `packages/db/src/migrations/0010_calm_betty_brant.sql:258`.
- **What:** When `bun -F @kuralle/db db:migrate` ran against local pg for the first time post-0011, the new 0012 migration's `DROP CONSTRAINT usage_events_kind_check` failed with `does not exist`. The migration file from S1 had the `ADD CONSTRAINT` but the DB never gained the constraint. Either drizzle-kit silently dropped the statement, the migration partially failed, or the table was recreated by a later migration. The S2-05 IC test was inserting `kind='slo_violation'` rows that should have been blocked by the CHECK — they passed because the CHECK was missing.
- **Why it violates the spec:** `DATA_MODEL.md §13` lists the eleven `usage_events.kind` enum values and the constraint enforcing them; per `WBS.md §1.2 rule 8`, telemetry kinds are gated by the CHECK. Without it, the DB would have accepted any `kind` value — that's a real data-integrity gap.
- **Severity:** **major** — the constraint *now* exists post-0012 (re-applied via the AMENDMENT-005 migration), but other CHECK constraints from the same `0010_calm_betty_brant.sql` (or sibling migrations) might be in the same broken state. We don't know which.
- **Proposed fix:** in `[S2-fix]` (or as a Phase B follow-up), audit every `ADD CONSTRAINT ... CHECK` in the `0010..0011` migration files against the live local schema (`psql \d+ <table>` per table). Any constraint that's missing in the DB but expected by the migration file is the same class of bug. Track surviving fixes as a small ops-tooling commit, OR open `BL-S2-CHECK-CONSTRAINT-AUDIT` if the audit takes more than 15 minutes.

#### M2. `agents.list` and `agents.history` accept `cursor` but never paginate

- **Where:** `packages/api/src/routers/agents.ts:78-82`, `agents.ts:249-253`. `cursor` flows through `cursorInput` but the handler always returns `cursor: null`.
- **What:** The OpenAPI surface advertises a paginated endpoint. The implementation truncates at `limit` and never offers a next-page cursor. Frontend hooks (`useAgents`, `useAgentHistory`) accept `cursor` and pass it to the input but the parameter has no effect.
- **Why it violates the spec:** `WBS.md §1.2 rule 5` says "OpenAPI is the contract"; an unimplemented parameter in the contract surface is a lie about capabilities. The S2-03 brief AC#1 was explicit that `list` and `history` are paginated.
- **Severity:** **major** — but already disclosed in the `[S2-03-fix]` commit body and tracked as `BL-S2-CURSOR-PAGINATION`. The codex r2 review will rule on whether to fix in `[S2-fix]` (small server-side change) or carry forward.
- **Proposed fix:** either (a) implement the cursor in `findManyByWorkspace` / `findByAgentId` using `(updatedAt DESC, id)` keyset pagination — ~20 LOC; or (b) remove the `cursor` parameter from the input schema entirely and re-introduce it when S3 needs it. Recommend (a) — it's small enough and it makes the contract honest.

### 2.3 Minors

#### m1. `useTelephony` / `usePhoneNumbers` hook docstrings claim filtering they don't perform

- **Where:** `apps/web/src/hooks/api/telephony.ts:6` and `apps/web/src/hooks/api/phone-numbers.ts:6`.
- **What:** Header comments say "filtered for voice channels" and "channel endpoints by phone number" but the implementation just delegates to `channels.list` with no filter argument. The hooks return all channels.
- **Why:** WBS rule 9 says docs match reality. Misleading docstrings are worse than no docstrings — they actively encourage wrong assumptions in S3+ work.
- **Severity:** minor.
- **Proposed fix:** rewrite the comment to say "Currently aliases `channels.list`; will swap to a dedicated channels-by-kind filter when S3 ships the `channels.endpoints` router." One-line change in two files.

#### m2. ESLint `ignores` array on the S2-01 router rule still lists all 11 router files

- **Where:** `eslint.config.mjs:108-128`. The `ignores` array (added by `[S2-01-fix]`) lists all 11 routers as scoped out from the `no-restricted-imports` rule. After S2-03 rewrote every router to go through `@kuralle/core` repositories, the list should empty out — but it still has all 11.
- **What:** S2-03's IC was supposed to remove each filename from the `ignores` array as it rewrote the corresponding router. It didn't. The rule isn't enforcing on the rewritten routers because they're still scoped out.
- **Why:** WBS rule 6 — discipline rules must remain enforceable. A rule scoped out of the very files it was meant to gate is a no-op.
- **Severity:** minor (rule fires on hypothetical future edits to those files, just not on current state).
- **Proposed fix:** in `[S2-fix]`, empty the `ignores` array. Verify lint stays green. Any router that still imports drizzle-orm/schema after that delete is a hidden S2-03 miss — fix it.

#### m3. Pre-existing fast-check ID-collision flake in `@kuralle/runtime` round-trip property test

- **Where:** `packages/runtime/src/projector/agent.test.ts:418-420`. The `agentId` is generated as `ag_fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` — `Math.random` collides every ~30 iterations under fast-check's tight loop, causing a PK violation and test failure.
- **What:** This isn't S2-05 — it's S2-02's test. The IC of S2-03 noted it; S2-04 didn't surface; S2-05's verification chain hit it twice in a row. Tracked as `BL-S2-FASTCHECK-ID-FLAKE`.
- **Why:** WBS rule 11 — "no shortcuts" includes "no flaky tests pretending to be deterministic." The contract a property test makes is "every input class either passes or shrinks to a counterexample." A PK collision on test-generated IDs is neither.
- **Severity:** minor (re-run passes; doesn't block CI definitively but pollutes the ledger).
- **Proposed fix:** one-line change at `agent.test.ts:418` — use `crypto.randomUUID().slice(0, 8)` instead of `Math.random().toString(36).slice(2, 8)`. Closes the flake. Apply in `[S2-fix]`.

#### m4. Codegen Gate-Partial from S0 is still in force; production transport untested

- **Where:** sprint-wide. Every test runs against local pg + memory `KvStore`; no integration test exercises Workers + Neon-HTTP transport.
- **What:** `sprints/sprint-0/GATE-PARTIAL.md` flagged the codegen gate as partial because Neon credentials were unavailable. S2 ships substantive runtime + repository code but doesn't close the gap.
- **Why:** WBS §5 risks list this explicitly. Without production transport tests, we don't know the publish path holds the SLO at p95 ≤ 1s under the actual production deployment.
- **Severity:** minor (S2 didn't claim to close the gate; backlog item `BL-S0-01` covers it).
- **Proposed fix:** none in S2. Note in WARMDOWN that the SLO holds locally with sub-3ms p95, leaving substantial headroom for the network round-trip cost; production transport closure stays in `BL-S0-01`.

### 2.4 Nits

#### n1. `__tests__/` placement is inconsistent across the workspace

- **Where:** `apps/server/src/__tests__/`, `apps/web/src/__tests__/`, `packages/core/src/repositories/*.test.ts`, `packages/runtime/src/projector/agent.test.ts`. Three different conventions across four packages.
- **What:** Some tests are colocated with source (`packages/core`, `packages/runtime`); others are in dedicated `__tests__/` directories (`apps/server`, `apps/web`).
- **Severity:** nit.
- **Proposed fix:** defer. Pick one convention as part of a future cleanup pass; not in S2.

#### n2. SLO threshold + auto-save timing constants are scattered across packages

- **Where:** `SLO_PUBLISH_THRESHOLD_MS` in `packages/runtime/src/instrumentation/slo.ts:5`, `AUTO_SAVE_DELAY_MS` in `apps/web/src/routes/_app.agents.$agentId.tsx:11`, `PUBLISH_LIVE_PULSE_MS` in same file.
- **What:** Three timing constants in three files, no shared config module.
- **Severity:** nit. Acceptable for v1; revisit if a fourth SLO joins.
- **Proposed fix:** defer.

---

## 3. Constructive close

The sprint executed end-to-end on the editor IR pipeline contract: a real `agent_versions.snapshot` is written, a synchronous projector lands six tables in one transaction, the pointer swap is atomic, the cache invalidation is post-commit, and the publish-modal-to-live transition is sub-second. The five UI hooks land C2/C3/C8 + the four read-only screens; the click-through test exercises real production code via Vitest + happy-dom + MSW (per the user's pre-sprint decision). Three RFC amendments were ratified cleanly, with the spec-vs-implementation diff explicitly documented.

Going into Phase B's r2 (`codex/gpt-5.3-codex` adversarial review), the highest-leverage things to look for are:

1. **The `usage_events_kind_check` mystery (M1).** Are other S1 CHECK constraints in the same broken state? r2 should run a focused audit script that pulls every CHECK from the migration files and compares against `psql \d+`.
2. **Whether the publish path's cache-invalidation timing has any race with concurrent reads.** A read-after-write that uses the cached agent in a different process won't see the new `activeVersionId` until 60s TTL expires. Single-process tests pass; r2 can rule on whether the production cache strategy needs a per-write fence (vs. accepting eventual consistency).
3. **The cursor-pagination dishonesty (M2).** Is the parameter genuinely harmless to leave unimplemented, or does it mask a coverage gap that S3's `useConversations` will inherit?
4. **Hidden hexagonal-import paths.** The S2-04 `forbidden-mock-import` rule was missing for an entire sprint cycle. Are there other documented-but-missing rules?

The manager's `[S2-fix]` will land at minimum: m2 (empty the routers `ignores`), m3 (fast-check ID flake), and either fix or defer M1, M2 with explicit reasoning. The codex r2 verdict shapes everything else.
