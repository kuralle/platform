# Spec + Code-Quality Gate — `S1-06` Calderon HVAC seed + personal-org metadata

> **Role.** You are a senior backend review engineer with deep production experience in **PostgreSQL seed scripts, idempotent migrations, better-auth's database hooks, and snapshot-driven domain models**. You've audited seed pipelines that the entire team's local dev relies on — you instinctively check for non-deterministic IDs, `now()` calls in primary keys, missing `ON CONFLICT` clauses, and silent CHECK-constraint violations from snapshot improvisations. You take pride in idempotency proofs that aren't theatre.
>
> **Mindset.** You are peer-IC, NOT adversarial — same team as the IC. Goal: keep the team out of the manager's r1 punch list. You walk every brief AC with file:line evidence, mark each met / partial / missed. You re-run the seed to verify second-run produces 0 new rows. You verify the personal-org metadata flag was set in `create-kuralle-auth.ts` (not somewhere else). You verify the seed respects every CHECK constraint added in S1-01..S1-04 (e.g., `voices.provider IN voices_provider_check`, `conversations.outcome IN conversations_outcome_check`, `runtime_deployments.platform IN runtime_deployments_platform_check`, etc.). You verify the polymorphic CHECK trigger from S1-03 doesn't fire on the seeded `channel_endpoints` (channel_kind matches the connection). You verify the AgentIR snapshot shape is grounded in `DATA_MODEL.md §5:347-365` and not improvised. You do NOT rewrite code. You do NOT commit. You write a markdown report only.
>
> **Standards.** Calm, plain language. No bikeshedding — flag only project-rule, RFC-§, or §2.2 rubric violations. Reference brief ACs by number. Read every suspicious file line by line. The "Apply-now items" section in your output must be surgical — file:line + concrete fix description.
>
> **Boundaries.** This brief is the contract. You write `sprints/sprint-1/gate-S1-06.md` and stop. You do not modify any source. You do not commit. You do not adversarial-review (that's r2's job at sprint level).

---

## 1. Context

**Story:** `S1-06` — Calderon HVAC seed + personal-org metadata flag.

**Inputs:**
1. `sprints/sprint-1/brief-S1-06.md` — the contract (16 ACs).
2. `sprints/sprint-1/PLAN.md` § `S1-06`.
3. `.handoff/result-S1-06.txt` — IC transcript (model used: pi-glm = zai / glm-5.1).
4. The diff: `git show 3393bf5`. Read every file the IC created or modified.
5. Reference docs: `DATA_MODEL.md §3 §4 §5 §8 §9 §11`; `sprints/AMENDMENT-002.md` (apikey divergence — the personal-org hook may interact with apikey behaviour).
6. `apps/web/src/mocks/{agents,conversations,kb,numbers,seed}.ts` — for seed-shape parity verification.
7. `packages/auth/src/create-kuralle-auth.ts` — the file the IC edited for the metadata flag.
8. The seed file: `packages/db/scripts/seed-calderon.ts`.
9. The idempotency check: `packages/db/scripts/seed-idempotency-check.ts`.
10. Demo artifacts: `sprints/sprint-1/artifacts/S1-06-seed-counts.txt`, `S1-06-seed-idempotency.txt`.
11. The committed Postgres state — re-run `bun -F @kuralle/db db:seed` (should be a no-op since the IC already seeded), then `bun packages/db/scripts/seed-idempotency-check.ts`.
12. Prior gate reports `gate-S1-01.md`..`gate-S1-04.md` for standing rules.

---

## 2. Your job — walk every brief AC 1-16 + project-specific gates

**Project-specific gates (sprint-1 standing rules):**

A. **Idempotency proof.** Re-run `bun -F @kuralle/db db:seed`. The output must show 0 new rows inserted (every block prints `0 row(s)` or equivalent). Then `bun packages/db/scripts/seed-idempotency-check.ts` PASSes.

B. **Deterministic IDs.** Grep the seed file for `nanoid`, `randomUUID`, `Math.random` — none should appear in primary key generation. Every `INSERT` uses a fixed namespace prefix: `ws_calderon`, `ag_calderon_*`, `av_calderon_*`, `ch_calderon_*`, `ce_calderon_*`, `cv_calderon_*`, `kb_calderon_*`, `wh_calderon_*`.

C. **CHECK-constraint compliance.** Walk every `INSERT` in the seed and verify every enum-text column value falls within the matching CHECK constraint set:
   - `organization.environment` IN `('production','staging','sandbox')`.
   - `organization.region` IN `('us-east-1','us-west-2','eu-west-1')`.
   - `organization.compliance_mode` IN `('none','hipaa','ferpa','tcpa')`.
   - `agents.status` IN `('draft','published','archived')`.
   - `agent_versions.version_kind` IN `('auto_save','manual_save','publish')`.
   - `kb_documents.source` IN `('file','url','text')`; `kb_documents.status` IN `('ready','indexing','needs_refresh','failed')`.
   - `voices.provider` IN `('elevenlabs','cartesia','openai','google','deepgram')`.
   - `channel_connections.status` IN `('connected','available','coming-soon','error','degraded')`; `channel_connections.channel_kind` IN the channel_kind tuple.
   - `channel_endpoints.channel_kind` matches the connection's (polymorphic CHECK trigger).
   - `conversations.direction` IN `('inbound','outbound')`; `conversations.outcome` IN the §9:688 8-tuple.
   - `conversation_turns.speaker` IN `('agent','caller','system')`.

D. **Personal-org metadata flag** — IC committed an edit to `packages/auth/src/create-kuralle-auth.ts`. Verify the edit is surgical (single field added; no other refactors). Re-run `bun -F @kuralle/auth smoke-local` — the personal org must still be created AND now have the `metadata` flag set.

E. **WBS DoD line check** — the WBS row S1-06 line 120 says: "After running the seed, the existing UI screens render the seeded data without code changes (B1 home, C1 agents list, F1 conversations, /knowledge, /telephony, /phone-numbers all show the seeded fixtures via the empty-but-wired routers from S1-05)."
   - **Reality check:** S1-05 only wired `useAgents()`. The other screens still consume mocks. So only **C1 agents list** can actually display seeded data through the real router; the rest are still mock-driven. The IC SHOULD document this asymmetry in the commit body. Verify.

F. **AgentIR snapshot shape grounded** in `DATA_MODEL.md §5:347-365`. The seed creates 3 published agent_versions with `snapshot jsonb`. Verify:
   - The snapshot has the documented fields: `name`, `description`, `instructions`, `model`, `defaultOptions`, `toolAttachments`, `workflowAttachments`, `subagentAttachments`, `integrationTools`, `mcpClientAttachments`, `kbAttachments`, `guardrailGraph`, `scorerAttachments`, `voiceConfig`, `channelConfig`, `complianceConfig`, `requestContextSchema`.
   - Or, if the IC chose a minimal v1 shape (only the load-bearing fields), the omission is documented in the commit body.

G. **No out-of-scope edits.** The diff should NOT touch `apps/web/`, schema files, landed migrations, the repo-root `package.json`. Verify.

H. **No `catch (e: any)` / lint still 0 errors / no new warnings.**

I. **Polymorphic-trigger compliance** — the seed creates `channel_endpoints` with `channel_kind='voice'` against a `channel_connection` with `channel_kind='voice'`. The S1-03 trigger should NOT fire. Re-run the seed; if it ran clean, this is implicit verification.

J. **Conversations + turns shape parity** with `apps/web/src/mocks/conversations.ts`. The seeded turns should have alternating speakers, ordinals 1..N, message_id=NULL (voice path).

**Code quality (per the §2.2 rubric):**
- Naming, type tightness (no `any`), idiomatic patterns, smells.
- Watch for: hardcoded large jsonb literals (acceptable here; this IS a seed); magic dates (must use a frozen `BASE_DATE` or similar to keep idempotency stable across the calendar year).

---

## 3. Output

Write **`sprints/sprint-1/gate-S1-06.md`** with the standard sections from `STORY-BRIEF-GATE.md` §3:
1. Spec adherence table (16 ACs + project-specific A-J).
2. File-list adherence table (6 files expected: 2 new scripts, 2 modifications, 2 demo artifacts).
3. Wiring + demo artifact verification.
4. Code quality bullets.
5. Honest summary paragraph.
6. Recommended action: `Ready for fix-pass` / `Needs IC re-fire` / `Ambiguous — manager owns`.
7. **Apply-now items** — numbered, file:line, surgical fix description.

Verdict at top: green / yellow / red.
