# Sprint 1 — Review (r1, sandwich)

> **Reviewer (main session):** Claude Opus 4.7 (1M context) · 2026-05-07.
> **Diff under review:** `bd25eda..HEAD` — 12 commits, 93 files, +33,322 / −14 lines.
> **Stories:** S1-01..S1-06 (every story shipped + per-story fix-pass landed).
> **Per-story gate verdicts:** S1-01 yellow→fixed, S1-02 yellow→fixed, S1-03 yellow→fixed, S1-04 green (1 minor), S1-05 green (no findings), S1-06 yellow→fixed.

The sandwich method: strengths first, substantive critique second, constructive close third. Every "good" cites file:line; every critique cites file:line plus a rule the diff violates.

---

## 1. Strengths

### 1.1 Migration chain is reproducibly clean across 11 files (0000..0010)

Every story landed its own migration index without rewriting prior ones, and every fix-pass added a new migration rather than amending. From-scratch replay (`drop public + drizzle, CREATE EXTENSION vector, db:migrate`) reapplies all 11 migrations cleanly and the four smokes (`smoke-S1-01..04.ts`) pass against the rebuilt DB. This is the "you can blow away your dev DB on Friday and rebuild it Monday" guarantee that makes a schema-heavy sprint sustainable.

### 1.2 The `BEFORE UPDATE` trigger on `agent_versions` is the right shape

`packages/db/src/migrations/0005_s1_02_meta.sql:47-57` declares the trigger as `BEFORE UPDATE ... FOR EACH ROW` — INSERT and DELETE (cascade prune for auto_save rows) remain unrestricted. Per `DATA_MODEL.md §15:1206-1210`, `agent_versions` is the only domain table where UPDATE is genuinely never legitimate (drafts/auto-saves are new rows; `agents.activeVersionId` lives on a different table). The IC's choice to apply the trigger only here, and explicitly NOT to `conversation_turns` / `webhook_deliveries` / etc. (S1-03 brief AC 11 + S1-04 brief AC 6), is correct — those tables have legitimate UPDATE paths (`deliveryStatus` changes, retry counters). This is restraint backed by design knowledge, not blanket rule-application.

### 1.3 Polymorphic CHECK trigger from `DATA_MODEL.md §15:1237-1238` is implemented verbatim

`packages/db/src/migrations/0008_s1_03_meta.sql` (S1-03 meta) declares `channel_endpoint_kind_matches()` firing `BEFORE INSERT OR UPDATE` on `channel_endpoints`, raising on mismatched `channel_kind`. The smoke runner (`smoke-S1-03.ts`) verifies both the rejection path AND the mutual-FK round-trip (insert endpoint → insert routing_rule → UPDATE endpoint with rules_id). The denormalisation discipline §15 calls out is enforced at the DB layer, not deferred to app code.

### 1.4 Partition discipline on `audit_log_events` is honest about its trade-offs

`packages/db/src/migrations/0010_calm_betty_brant.sql` uses `PARTITION BY RANGE (created_at)` with composite PK `(id, created_at)` (the only stable shape for a Postgres partitioned table). The IC's commit body explicitly disclosed the divergence from `DATA_MODEL.md §11:1010` ("id text primary key") and explained why. Three monthly child partitions (May/June/July 2026) seeded; routing verified by `smoke-S1-04.ts`. This is one of the WBS's flagged risks (line 129) handled cleanly.

### 1.5 Frontend hook-wrapper discipline holds across the new surface

`apps/web/src/hooks/api/agents.ts:1-13` wraps `$api.agents.list.queryOptions(...)` per the `health.ts` precedent; `apps/web/src/routes/_app.agents.index.tsx:27` is a surgical 1-line swap from the mock import to `useAgents`. The ESLint forbidden-import rules from S0 (lines 32-73 of `eslint.config.mjs`) are not relaxed; `bun run lint` returns 0 errors with no new exceptions added. AMENDMENT-001's contract — wrapper IS the contract, library is implementation — held.

### 1.6 GLM-5.1 produced cleaner first-pass work than DeepSeek on tooling/composition stories

S1-05's per-story gate came back **green with zero Apply-now items** — the 11 routers, the MSW infra, the C1 page swap, and the OpenAPI regeneration all landed without findings. S1-06's gate was yellow but only because of a turn-count miss (3 vs the 4–6 the brief required) and a documentation gap; everything substantive (idempotency, deterministic IDs, CHECK compliance, polymorphic-trigger compliance, AgentIR snapshot shape) was correct. By contrast, the four DeepSeek stories all came in yellow with multiple Apply-now items — most consistently the same blind spot (missing CHECK constraints on enum-text columns, 8 in S1-01 then 16 more in S1-03). The pattern suggests GLM-5.1 may be a better default IC for composition-heavy stories; DeepSeek remains strong on schema/DDL but tends to repeat the same class of miss when the brief leaves it implicit.

---

## 2. Critique

### 2.1 Blockers

None. Every blocker that surfaced in per-story gates was resolved in its `[S1-{nn}-fix]` commit.

### 2.2 Majors

#### M1. UI asymmetry vs WBS DoD line — only C1 actually displays seeded data

- **Where:** `sprints/WBS.md:120` (the S1-06 DoD line) vs the actual code in `apps/web/src/routes/`.
- **What:** The WBS row says "After running the seed, every existing UI screen renders the seeded data — B1 home, C1 agents list, F1 conversations, /knowledge, /telephony, /phone-numbers." S1-05 only wired `useAgents()` for the C1 list. The other screens still consume `@/mocks` imports, so they will not show seeded data even though the seed ran successfully.
- **Why it violates the spec:** The WBS DoD line is a contract; the IC's S1-06 commit body did not disclose the asymmetry until the fix-pass commit at my prompting. We're shipping a sprint where the demo-as-described doesn't fully work.
- **Severity:** major (it's not a blocker — the data IS in the DB and S2 can wire the rest of the screens — but the WBS line is misleading).
- **Proposed fix:** Document the asymmetry in `WARMDOWN.md §2 (what's working / not)` and create backlog item `BL-S1-XX: wire B1/F1/knowledge/telephony/phone-numbers hooks` so S2's plan picks it up. No code change in this sprint.

### 2.3 Minors

#### m1. OpenAPI item schemas are `unknown` for all 11 list operations

- **Where:** `apps/server/openapi.json` after S1-05 — every `/<group>/list` operation's `items` field has `anyOf: [{}, {type: "null"}]` (i.e., unknown).
- **What:** Brief AC 1 + the kimi gate accepted this as the only feasible shape for stubs typed against Drizzle `$inferSelect` without a Zod-to-Drizzle codegen. Downstream SDK consumers (post-MVP) would get untyped payloads.
- **Severity:** minor (it's the documented stub shape, and S2 will replace each handler with real Zod-validated outputs from the repository pattern).
- **Proposed fix:** Add a backlog item `BL-S1-YY: replace stub item schemas with Zod-derived row schemas in S2-03` and reference it in the WARMDOWN.

#### m2. `kb_chunks_embedding_idx` ivfflat index with `lists=100` is overkill for 0–1 rows

- **Where:** `packages/db/src/migrations/0001_crazy_purifiers.sql:101-104`.
- **What:** ivfflat is most useful at ≥10K rows; with the seeded 0 rows it adds index-write cost on every insert without query benefit. The WBS line 130 documents this risk and defers to S5 perf check.
- **Severity:** minor (acceptable as-is per the WBS deferral; just confirming the comment is in place).
- **Proposed fix:** None — existing deferral note is sufficient.

#### m3. Migration 0007/0008 (drizzle-kit emit + hand-authored meta) is the most fragile pattern in the chain

- **Where:** `packages/db/src/migrations/0007_moaning_arachne.sql` + `0008_s1_03_meta.sql`.
- **What:** S1-03 used the pattern "drizzle-kit emits CREATE TABLE; we hand-author CHECK + trigger + partial-index in a separate `_meta.sql`". This works but means every story-pair is two files instead of one. If S2 schema work follows the same pattern, the migration directory will get unwieldy.
- **Severity:** minor (the chain works; just a maintainability flag for S2 planning).
- **Proposed fix:** None this sprint. In WARMDOWN's "retrospective → try-next" section, propose: "consolidate _meta hand-authored statements into the same drizzle-kit-named file when generating, rather than splitting."

### 2.4 Nits

- `packages/db/scripts/smoke-S1-04.ts` smoke runner is the longest in the project (~500 lines) and could benefit from helper extraction in S2 — but this is post-MVP polish.
- The seed's `agent_versions.snapshot` field shape is grounded in `DATA_MODEL.md §5:347-365` per the S1-06 gate, but a future reader without that reference will not know the shape is a contract. A one-line link comment in `seed-calderon.ts` would help.
- Several brief files (S1-03, S1-04, S1-06) drifted from the early (S1-01, S1-02) brief shape — section numbering varies, "What NOT to do" sections drift in length. Not a concern for this sprint; trend toward consistency in S2.

---

## 3. Cross-cutting concerns

- **Test coverage of failure paths:** Every smoke runner exercises at least one CHECK rejection, one trigger fire (where applicable), and one UNIQUE violation. No swallowed errors; all `catch (e: unknown)` with narrowing per the post-S1-01-fix discipline.
- **Type-safety holes:** One `as unknown as Agent[]` cast in `apps/web/src/routes/_app.agents.index.tsx` at the C1 swap. Documented as deliberate S2-deferred mapping in the S1-05 commit body; gate accepted it as honest, not papered-over. Acceptable.
- **Performance:** The partitioned audit table and ivfflat index are deferred-perf items per the WBS (lines 129-130). The synchronous projection worker doesn't ship until S2-02; current schema accommodates the future async path via `agent_versions.projectionsReady boolean` (deferred per `DATA_MODEL.md §5:443`).
- **Concurrency:** No async / queue / worker code in this sprint — schema only. Concurrent-write safety of the seed is mediated by `ON CONFLICT (id) DO NOTHING`; any production-user with `id LIKE 'cv_calderon_%'` would silently lose their own row, but that namespace is reserved for the seed.
- **Telemetry:** No telemetry events added in S1; first events ship in S2 with the projection worker.
- **Wire-protocol drift:** OpenAPI grew 2 → 13 operations cleanly via `gen:openapi`; drift gate (`bun -F server gen:openapi --check`) holds. AMENDMENT-001 is honored — `@orpc/tanstack-query` is the wrapper; `openapi-typescript` is not introduced.
- **Bundle size / dependency surface:** S1-05 added MSW v2 + happy-dom to `apps/web` only — `apps/web/package.json` diff is +5 lines; no root pollution. Per memory `feedback_no_root_dep_pollution.md`, this is correct.
- **AMENDMENT compliance:** AMENDMENT-001 (frontend client) and AMENDMENT-002 (apikey divergence) both held — no `apikey.organizationId` regression, no `revokedAt` re-introduction, no `@kuralle/api-client` or `@/providers/api-provider` import outside the allow-list.
- **Hexagonal-import lint:** No domain code (`packages/api/`, `packages/db/`) imports `@kuralle/platform/cloudflare`, `@kuralle/platform/node`, or `@kuralle/platform/memory` (verified by grep). Test files are exempt; no test files added in this sprint.

---

## 4. Constructive close

Start with M1 (the UI asymmetry — pure documentation in WARMDOWN + a backlog item). Once that's captured, the sprint is ready for closeout. The minors (m1, m2, m3) are all backlog items, not fix-pass items. Codex r2's adversarial pass may surface things I missed — wait for that before committing the sprint-level fix-pass. The sprint's overall structure is sound: the schema is reproducibly buildable, the OpenAPI surface is wired, the seed is idempotent, and the per-story gates closed every load-bearing finding. The "GLM-5.1 vs DeepSeek" data point in §1.6 is worth carrying into S2 planning.

---

## 5. Verdict

- [x] **Approve with minor fixes.** No blockers; one major (M1) is documentation-only; minors are backlog items. Pending codex r2 confirmation.

Path forward: wait for codex r2; consolidate any new Apply-now items from r2 into a single `[S1-fix]` sprint commit (or skip if r2 has no findings); then `[S1-close]` with WARMDOWN + HANDOFF + STATE bump.
