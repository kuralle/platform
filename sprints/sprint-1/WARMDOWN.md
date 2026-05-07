# Sprint 1 — Warm-down

> **Author (main session):** Claude Opus 4.7 (1M context) · 2026-05-07.
> **Sprint window:** 2026-05-07 single-session sprint (condensed from WBS-default 1-week cadence).
> **Outcome:** Goal hit. All 6 stories shipped, all 18 codegen steps from `DATA_MODEL.md §18` landed as Drizzle files, and the OpenAPI surface grew from 2 → 13 operations. One UI asymmetry against the WBS DoD line carried forward as a backlog item.

---

## 1. Goal recap

**Sprint goal (from WBS § Sprint 1):** Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally.

**Did we hit it?** **Yes.** Every domain table from `DATA_MODEL.md §4–§13` is now a Drizzle schema file with a corresponding migration applied to local Postgres. 11 oRPC router groups (`agents`, `conversations`, `channels`, `kb`, `tools`, `batches`, `webhooks`, `secrets`, `voices`, `compliance`, `receipts`) are mounted under `appRouter`, each emitting one `list` procedure into `apps/server/openapi.json`. The Calderon HVAC seed is idempotent and creates 42 rows on first run. The DB has **60 base tables** total (12 better-auth + S0 ext + ~48 from S1) and **14 audit_log_events partitions** (May 2026 → June 2027 inclusive).

The one asymmetry against the WBS DoD line: only the **C1 agents list** UI screen is wired to the real router via `useAgents()`. The other screens (B1, F1, /knowledge, /telephony, /phone-numbers) still consume mock data; the seeded data is in the DB but not visible until S2 wires their hooks. This is captured in §4 KI-1-01 and as backlog item BL-S1-WIRE-REMAINING-HOOKS.

---

## 2. Stories shipped

| Story | Status | Commit | Demo | Notes |
|-------|--------|--------|------|-------|
| S1-01 | Done | `7d62fa1` + fix `cc87911` | [tables](./artifacts/S1-01-tables.txt), [enum-checks](./artifacts/S1-01-enum-check-fails.txt) | Knowledge + tools + voices + 4 S0 enum CHECKs + 8 new enum CHECKs (fix-pass). pgvector ivfflat seeded. |
| S1-02 | Done | `f18e8ff` + fix `9708ee8` | [trigger](./artifacts/S1-02-trigger.txt), [tables](./artifacts/S1-02-tables.txt) | Agents two-row split + 6 projection tables. Append-only `BEFORE UPDATE` trigger on `agent_versions`. DESC index ordering + full `relations()` coverage in fix-pass. |
| S1-03 | Done | `c27bb66` + fix `2ee02e4` | [trigger](./artifacts/S1-03-channel-trigger.txt), [tables](./artifacts/S1-03-tables.txt) | Channels + conversations + runtime sidecars (13 tables). Polymorphic CHECK trigger on `channel_endpoints` per `DATA_MODEL.md §15`. 16 enum CHECKs + 2 missing FKs added in fix-pass. |
| S1-04 | Done | `d63dacf` + fix `6a77ad7` | [partitions](./artifacts/S1-04-partitions.txt), [tables](./artifacts/S1-04-tables.txt) | Cross-cutting tables (12). Partitioned `audit_log_events` with composite PK `(id, created_at)`. Late FKs for `secrets` from S1-01 + S1-03. Smoke coverage closed in fix-pass. |
| S1-05 | Done | `497de27` (no fix needed) | [openapi-diff](./artifacts/S1-05-openapi-diff.txt), [c1-empty](./artifacts/S1-05-c1-empty.txt) | 11 oRPC router groups + `useAgents` hook + MSW v2 test. Gate verdict 🟢 GREEN with zero Apply-now items — the only fully-clean first-pass story this sprint. |
| S1-06 | Done | `3393bf5` + fix `f8a2f56` | [seed-counts](./artifacts/S1-06-seed-counts.txt), [seed-idempotency](./artifacts/S1-06-seed-idempotency.txt) | Calderon HVAC seed + personal-org `metadata={"personal":true}` flag. Turn counts expanded on cv_003/cv_004 in fix-pass. |
| **Sprint-fix** | Done | `f87e71b` | [sprint-fix-pass](./artifacts/sprint-1-fix-pass.txt) | Forward audit partitions through 2027-06; DATA_MODEL §15 amendment narrowing append-only DB enforcement to `agent_versions` only; vector `fromDriver` null-safety. |

No stories slipped.

---

## 3. What's working

- **Schema is reproducibly buildable.** From-scratch replay (`drop public + drizzle, CREATE EXTENSION vector, db:migrate`) reapplies migrations 0000..0011 cleanly. All 60 tables present.
- **Per-story smokes all green.**
  - `smoke-S1-01`: GREEN (5 voices, 2 indexes, 4 S0 enum CHECKs, 8 S1-01 enum CHECKs, valid INSERT, cleanup).
  - `smoke-S1-02`: 16/16 (agents two-row split + trigger + UNIQUE dedup).
  - `smoke-S1-03`: 28/28 (channels chain + polymorphic trigger + 4 unique-violations + mutual-FK round-trip).
  - `smoke-S1-04`: 41/41 (12 cross-cutting tables + partition routing + 16 CHECK rejections + late FKs).
- **Web app tests** 38/38 (existing health.test.tsx + new agents.test.tsx with MSW v2).
- **Platform tests** still 53/53 from S0.
- **OpenAPI drift gate clean.** `apps/server/openapi.json` grew 2 → 13 operations; `gen:openapi --check` exits 0.
- **Idempotent seed.** `bun -F @kuralle/db db:seed` first run inserts 42 rows; second run inserts 0; idempotency-check script verifies row counts match.
- **Personal-org metadata flag.** Re-running `bun -F @kuralle/auth smoke-local` confirms new personal organizations are created with `metadata={"personal":true}`.
- **Forward audit partitions.** 14 monthly partitions live (May 2026 → June 2027). Inserts with `created_at='2027-03-15'` route to `audit_log_events_2027_03` correctly.

---

## 4. What's not working / known issues

| ID | Description | Severity | Owner | Tracking |
|----|-------------|----------|-------|----------|
| KI-1-01 | UI asymmetry — only C1 agents list reads from real router; B1, F1, /knowledge, /telephony, /phone-numbers still mock-driven. WBS DoD line was aspirational; reality is C1-only. | major | next sprint | BL-S1-WIRE-REMAINING-HOOKS |
| KI-1-02 | OpenAPI list operations have `items: anyOf [{}, null]` (z.unknown()-derived). Downstream SDK consumers will get untyped payloads. Per S1-05 brief AC 1 contract — explicit Zod schemas land with the repository pattern in S2-03. | major | S2-03 | BL-S1-OPENAPI-ITEM-SCHEMAS |
| KI-1-03 | `audit_log_events` partition rollover automation NOT shipped. 14 months of runway exist (through 2027-06); after that, inserts hard-fail until a new partition is added. Either monthly cron or quarterly migration cadence needed. | minor (becomes major in 2027-Q2) | ops | BL-S1-AUDIT-ROLLOVER |
| KI-1-04 | `kb_chunks_embedding_idx` ivfflat with `lists=100` is over-provisioned for the seeded scale (0–1 rows). WBS line 130 already deferred this to S5 perf check. | nit | S5 | (existing WBS §130 note) |
| KI-1-05 | Migration directory now has 12 files; the "drizzle-kit emit + hand-authored _meta.sql" two-file-per-story-pair pattern from S1-02/03 will get unwieldy if S2+ continue it. | nit | retro | (see §11 try-next) |
| KI-1-06 | Vector customType `fromDriver` is now null-safe but un-tested for actual pgvector round-trip. Drizzle runtime decode path was not exercised this sprint (only SQL-level inserts hit the column). | minor | S2 | BL-S1-VECTOR-ROUNDTRIP-TEST |

---

## 5. Decisions made

- **Decision:** `audit_log_events` parent table uses composite PK `(id, created_at)` instead of the `DATA_MODEL.md §11:1010` documented `id text primary key`. **Rationale:** Postgres requires the partition key in the PK for `PARTITION BY RANGE`; the divergence is a Postgres artifact, not a logical change (id alone remains globally unique via the prefixed nanoid scheme). **Source:** `sprints/sprint-1/brief-S1-04.md §4 AC 2`. **Documented:** S1-04 commit body (`d63dacf`).
- **Decision:** DB-level UPDATE-blocking enforcement of "append-only" semantics applies ONLY to `agent_versions`. The other 9 tables on the `DATA_MODEL.md §15:1206-1209` append-only list rely on application-layer + sink discipline. **Rationale:** legitimate runtime UPDATE paths exist on `conversation_turns.deliveryStatus`, `webhook_deliveries.attemptCount/responseStatus`, `runtime_deployments.terminatedAt`, etc.; a DB trigger would break those paths. **Source:** codex r2 review (`sprints/sprint-1/review-sprint-r2.md` Apply-now 2). **RFC amendment:** `DATA_MODEL.md §15` updated in `[S1-fix]` (`f87e71b`).
- **Decision:** Personal organization `metadata` field carries `{"personal": true}` going forward. **Rationale:** S0 only set the boolean `isPersonal` column; gate-S1-06 + brief required also setting the metadata text column for downstream code that reads metadata. **Source:** `sprints/sprint-1/brief-S1-06.md §4 AC 11`. **Edit:** `packages/auth/src/create-kuralle-auth.ts` in S1-06 (`3393bf5`).
- **Decision:** Per-story kimi gates were **batched in parallel after the final IC of the sprint** instead of running per-IC. **Rationale:** user signal mid-sprint that progress had slowed; the override is documented in memory `feedback_batch_gates_when_speed_matters.md`. Sprint-level r1 + codex r2 stayed as the safety net (codex r2 caught 4 production-relevant gaps the per-story gates didn't). **Source:** mid-sprint user message between S1-04 gate and S1-05 IC fire.
- **Decision:** S1-05 + S1-06 ICs ran on `pi-glm` (zai/glm-5.1, 200K ctx) instead of the default `pi-deepseek-v4-pro` (1M ctx). **Rationale:** user signal that progress had slowed and a model swap could help. **Result:** S1-05 gate came in 🟢 GREEN with zero Apply-now items — first fully-clean first-pass story this sprint. S1-06 came in yellow with 3 small items (turn count + doc gap), comparable to deepseek's average. GLM-5.1 looks competitive on tooling/composition stories; deepseek remains strong on schema.

---

## 6. Wiki / RFC amendments this sprint

| Amendment | File | Section | Commit |
|-----------|------|---------|--------|
| Append-only DB-enforcement scope narrowed to `agent_versions` only; rationale documented for the other 9 tables. | `DATA_MODEL.md` | §15 | `f87e71b` |

---

## 7. Metrics

- **Commits this sprint:** 13 (S1-01..S1-06 + 5 fix-passes + sprint-fix).
- **Files changed:** 99 (94 from stories + 5 from sprint-fix-pass + warmdown set when this commits).
- **Lines:** +33,322 / −14 (overwhelmingly schema + migration snapshots).
- **DB tables (post-S1):** 60 base tables (was 12 after S0).
- **Migration files:** 12 (0000 + 11 added this sprint).
- **OpenAPI operations:** 13 (was 2 after S0; +11 from S1-05).
- **Schema exports:** 95 (across 13 schema files in `packages/db/src/schema/`).
- **Smoke runners:** 4 (S1-01..S1-04), 86 PASS assertions total.
- **Web tests:** 38 (was 36; +2 for `useAgents` happy + failure).
- **Platform tests:** 53/53 unchanged.
- **Audit partitions:** 14 (May 2026 → June 2027 inclusive).
- **Calderon seed row count:** 42 (1 org + 3 agents + 3 agent_versions + 1 channel_connection + 1 channel_endpoint + 5 conversations + 26 conversation_turns + 1 kb_document + 1 webhook).
- **Per-story kimi gate verdicts:** S1-01 yellow, S1-02 yellow, S1-03 yellow, S1-04 green, S1-05 GREEN (zero findings), S1-06 yellow.
- **Manager r1:** approve with 1 major (UI asymmetry, doc-only) + 3 minors (all backlog).
- **Codex r2:** "Strengthen r1" with 4 Apply-now items (1 blocker resolved, 2 majors — 1 resolved + 1 deferred to S2-03 with backlog tracking, 1 minor resolved).

---

## 8. Backlog updates

New backlog items from this sprint:

- **BL-S1-WIRE-REMAINING-HOOKS** — wire `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers` hooks; replace mock imports in B1, F1, /knowledge, /telephony, /phone-numbers screens. Trigger: any S2 story that touches these screens. Earliest landing: S2-04 (which already lists `useAgent`/`useAgentPublish`/`useAgentAutoSave`/`useAgentHistory` — extending scope to cover the rest is natural).
- **BL-S1-OPENAPI-ITEM-SCHEMAS** — replace `items: z.array(z.unknown())` in all 11 list routers with explicit Zod schemas mirroring the Drizzle row types. Required for typed SDK consumers. Trigger: S2-03 (`agents.publish/autoSave/list/get/history` already requires regenerating `openapi.json` with full Zod-derived schemas — extend to the other 10 routers in the same step).
- **BL-S1-AUDIT-ROLLOVER** — add monthly cron job OR quarterly hand-authored migration cadence to keep `audit_log_events` partitions ahead of the project clock. Trigger: ops decision on automation framework. Earliest landing: any sprint with ops-tooling work.
- **BL-S1-VECTOR-ROUNDTRIP-TEST** — add a Drizzle-runtime test that inserts a populated `kb_chunks.embedding number[]` and reads it back, verifying customType `toDriver`/`fromDriver` round-trip. Trigger: S2 repository code touches `KbDocumentRepository`.

S0 backlog status:
- **BL-S0-01** (Neon + Workers gate-partial close): unchanged. Still awaiting credentials.
- **BL-S0-02** (enum CHECKs supplement): **closed in S1-01-fix** (`cc87911`).
- **BL-S0-03** (split `@kuralle/env`): unchanged. S2 architectural cleanup.
- **BL-S0-04** (replace 3 global ESLint relaxations): unchanged. S2 cleanup. The new lint warning in `packages/db/scripts/smoke-S1-01.ts` was fixed in S1-01-fix; all sprint-1 smoke runners use `catch (err: unknown)` correctly.
- **BL-S0-05** (`apikey.revoked_at` supplement): unchanged. Post-MVP.
- **BL-S0-06** (assign explicit completion sprint for stub routers): **closed in S1-05** (all 11 router groups landed).

---

## 9. Retrospective

### Keep

- **Per-story atomic commits.** Every IC commit was ONE commit; every manager fix-pass was ONE commit. The sprint history reads cleanly from `git log --oneline`.
- **Strong-role-based brief openers** (added after S1-02 gate, per memory `feedback_strong_role_prompting.md`). Subjective but the briefs from S1-03 onward had richer per-IC framing; S1-05's GREEN verdict on the first pass suggests the framing helped.
- **Sprint-level r1 + codex r2 as the safety net.** When the per-story kimi gates were batched (mid-sprint user override), codex r2 caught 4 production-relevant gaps the per-story gates didn't — including the audit-partition future-failure that would have hard-failed Aug 2026 writes.
- **Hand-authored SQL where Drizzle can't speak Postgres natively.** Partitions, triggers, partial indexes with predicates, CHECK constraints — all hand-authored in `_meta.sql` files alongside drizzle-kit's auto-emit. The pattern works.

### Change

- **CHECK-constraint blind spot in DeepSeek IC.** S1-01, S1-03 both missed the same class — enum-text columns without CHECK constraints. The brief made the rule implicit ("text + CHECK for parity"); the IC only applied it to the most obvious columns. **Change:** future briefs that add new enum-text columns must enumerate every column + tuple explicitly in the AC list, not via a meta-rule.
- **Two-file-per-story-pair migration pattern (S1-02/S1-03)** is awkward. drizzle-kit's auto-emit goes in one file, my hand-authored CHECKs/triggers/partial-indexes in `_NN_meta.sql`. Twelve migrations are now in the directory — six pairs.
- **The `bun-lock` lockfile drifts** every fresh `bun install` even when nothing changed (S0 carry-forward; saw it again at the top of S1). Investigate or accept as friction.

### Try-next

- **Consolidate `_meta.sql` into the same drizzle-kit-named file when generating** rather than splitting. Drizzle-kit is happy to accept hand-edits in the file it just emitted as long as `_journal.json` stays consistent. This would halve the migration file count.
- **Continue using `pi-glm` for tooling/composition-heavy stories.** S1-05's clean first-pass result suggests it's at least as competent as deepseek on this surface, and faster wallclock.
- **Continue using `pi-deepseek-v4-pro` for schema/DDL stories.** S1-01..S1-04 had wider surface area (more spec lines, more constraints) — deepseek's thoroughness shows even when it misses things, and the misses are typically additive (constraints to add) rather than substantive (wrong shapes).
- **Adopt the batched-gate workflow as the default**, not the override. Per-story kimi adds 10 min per cycle; with 6 stories that's an hour. Sprint-level r1 + codex r2 catch the cross-cutting things kimi misses anyway. Update memory `feedback_per_story_kimi_review.md` to reflect this if the next sprint validates it.

---

## 10. Pointers (for the next session)

- **Read first:** `sprints/STATE.md` (will be updated to point at S2 in this commit).
- **Sprint 2 source RFC §:** `DATA_MODEL.md §5` (agent two-row split — already landed; S2 builds the projection worker on top), `HEXAGONAL_ARCHITECTURE.md §1` (Anti-Corruption Layer in `runtime/adapter/`), `USER_JOURNEYS.md §4` (Journey 2 — building/editing an agent).
- **Sprint 2 dependencies on S1:** every projection table from S1-02 (`agent_*_attachments`, `workflow_*_projection`) — projection worker writes them. Every router from S1-05 — repository pattern wraps them. Calderon HVAC seed from S1-06 — projection worker tested against the seeded `agent_versions.snapshot` rows.
- **Carry-forwards:** BL-S1-WIRE-REMAINING-HOOKS (S2-04 picks up), BL-S1-OPENAPI-ITEM-SCHEMAS (S2-03 picks up), BL-S1-AUDIT-ROLLOVER (ops, no S2 owner), BL-S1-VECTOR-ROUNDTRIP-TEST (S2 KbDocumentRepository).
- **Latent ops debt:** audit_log_events partitions run out 2027-06; alarm or cadence needed before then.
- **Codegen Gate-Partial (BL-S0-01)** still open. Schema work doesn't need it. Runtime work in S2+ does — the projection worker runs against local Postgres; Workers + Neon-HTTP transport remains untested.
