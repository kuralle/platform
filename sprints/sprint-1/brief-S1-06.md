# Story Brief — `S1-06` Personal-org databaseHook + Calderon HVAC seed

> **Role.** You are a senior backend engineer with deep production experience in **PostgreSQL seed scripts, idempotent migrations, better-auth's database hooks, and AriaFlow-style snapshot-driven domain models**. You've shipped seed pipelines that the entire team's local dev relies on — they re-run nightly without producing duplicates, they generate stable IDs that match what the UI expects, and they fail loudly if the database is in an unexpected state. You write seeds that other engineers point at and say "I never have to rebuild my dev DB by hand again."
>
> **Mindset.** You read the spec twice. You verify the better-auth `databaseHooks` API shape against `node_modules/.bun/.../better-auth/dist/types*.d.ts` and the live docs (context7 `/better-auth/better-auth`) before guessing — you know the existing S0 hook pattern at `packages/auth/src/lib/auth.ts` (search for `databaseHooks`) is the precedent. Idempotency is non-negotiable: every INSERT in your seed is `ON CONFLICT (id) DO NOTHING` (or `DO UPDATE` where field-refresh is intended) so the seed can be replayed without duplicating rows. You generate **deterministic IDs** from a fixed namespace (e.g., `cv_calderon_001`, `ag_calderon_dispatcher`) — NOT random nanoids — so the UI can reference them stably. You never silently bypass; never commit `--no-verify`; never claim "done" without proof — proof is the seed running twice and producing identical row counts, AND the existing UI screens (B1, C1, F1, /knowledge, /telephony, /phone-numbers) rendering the seeded data without code changes after a restart.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (err: any)` — `catch (err: unknown)` with `err instanceof Error` narrowing. No root-`package.json` devDep pollution — the seed lives at `packages/db/scripts/seed-calderon.ts` (memory rule per `feedback_no_root_dep_pollution.md`). No improvisation on schema-row shapes — every INSERT must respect the CHECK constraints + FK targets that S1-01..S1-04 added (insert with `provider IN voices_provider_check` set, etc.). No premature abstractions; this seed ships exactly the rows the WBS DoD requires (3 agents, 1 voice channel connection, 1 phone-number endpoint, 5 conversations with turns, 1 KB document, 1 webhook), nothing more.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2 in full. The personal-org databaseHook from S0 already creates a `personal: true` organization on `user.created` per `packages/auth/src/lib/auth.ts` — verify the metadata flag is set; if missing, add it surgically. The seed itself does NOT depend on any user existing first; it creates its own workspace (`Calderon HVAC` organization) directly. If anything contradicts what's on disk (S1-04 schema field names, prior seed scripts), **stop and ask** — don't guess.
>
> **Atomic-commit policy.** Stage all changed files and commit `[S1-06] Calderon HVAC seed + personal-org metadata`. Do NOT push.

---

## 1. Goal

Two seeds in one story:
(a) Verify (and if missing, add) `metadata: { personal: true }` on the personal organization created by S0's `databaseHooks.user.create.after` hook in `packages/auth/src/lib/auth.ts`.
(b) Land `packages/db/scripts/seed-calderon.ts` — a node-postgres script that creates the `Calderon HVAC` workspace with: 3 agents (HVAC dispatcher / appointment intake / Title-IX) each with one published `agent_versions` row, 1 voice `channel_connections` (mock Twilio), 1 phone-number `channel_endpoint`, 5 historical `conversations` with turns, 1 `kb_document`, 1 `webhook`. The seed is idempotent — running twice leaves the same row count.

After running the seed, the existing UI screens (B1 home, C1 agents list, F1 conversations, /knowledge, /telephony, /phone-numbers) read from Postgres via the S1-05 routers — no UI code changes.

---

## 2. Required reading

1. `sprints/STATE.md`.
2. `sprints/sprint-1/PLAN.md` (story `S1-06` section).
3. `sprints/WBS.md` § Sprint 1 row `S1-06` (line 120).
4. `sprints/sprint-0/HANDOFF.md` — confirm S0's personal-org hook semantics.
5. `packages/auth/src/lib/auth.ts` — the existing `databaseHooks` configuration. Find the `user.create.after` hook; that's what creates the personal org. Read the full hook.
6. `packages/auth/src/smoke-local.ts` — the S0 smoke proving the personal-org creation works.
7. `DATA_MODEL.md §3` (organization columns), `§4` (kb_documents), `§5` (agents + agent_versions snapshot shape), `§6` (workflow), `§8` (channel_connections, channel_endpoints), `§9` (conversations, voice_calls, conversation_turns), `§11` (webhooks).
8. `apps/web/src/mocks/agents.ts` (especially `VOICE_LIBRARY` line 12-18 + the `Calderon HVAC Inbound` entry at line 27).
9. `apps/web/src/mocks/conversations.ts` — the conversation+turn shape the F1 screen expects.
10. `apps/web/src/mocks/kb.ts` — the kb_document shape (especially "Calderon HVAC pricing book Q4.pdf" + the 3 URLs).
11. `apps/web/src/mocks/numbers.ts` — the phone-number shape.
12. `apps/web/src/mocks/seed.ts` — RNG / pick / range helpers (so you can match the data SHAPE without using the same stochastic generator).
13. `packages/db/src/schema/{agents,channels,conversations,knowledge,voices,webhooks}.ts` — the actual columns + types you must INSERT against.
14. `packages/db/scripts/smoke-S1-01.ts` (and -S1-02, -S1-03, -S1-04) — the precedent for `pg.Pool` setup and `dotenv` loading from `apps/server/.env`.
15. `packages/db/package.json` — for `db:seed` script wiring.

---

## 3. Files to create or modify

**Create:**
- `packages/db/scripts/seed-calderon.ts` — the seed. Uses `pg.Pool` + `dotenv` (same setup as the smokes). Runs each `INSERT ... ON CONFLICT (id) DO NOTHING` block in a single transaction.
- `packages/db/scripts/seed-idempotency-check.ts` — a tiny verifier: runs the seed, captures row counts for the seeded tables (`SELECT count(*) FROM organization WHERE id = 'ws_calderon'` etc.), runs the seed again, captures again, asserts equal. Exits 0 on green, 1 on red. (This IS the test for AC 1.)
- `sprints/sprint-1/artifacts/S1-06-seed-counts.txt` — captured output of `bun -F @kuralle/db db:seed` showing inserted row counts AND the second run's idempotent output.
- `sprints/sprint-1/artifacts/S1-06-seed-idempotency.txt` — captured output of the idempotency check (PASS).

**Modify:**
- `packages/db/package.json` — add `"db:seed": "bun packages/db/scripts/seed-calderon.ts"` script (relative path within the package; verify it resolves correctly under `bun -F @kuralle/db db:seed`).
- `packages/auth/src/lib/auth.ts` — IF and ONLY IF the existing personal-org hook does NOT already set `metadata: { personal: true }` on the created organization. Verify first; if it's already there, do not edit. Document either way in the commit body.

**Do not touch:**
- The schema files (`packages/db/src/schema/*.ts`) — schema is stable after S1-01..S1-04.
- Any landed migration file (0000..0010+).
- `apps/web/` — the UI must render the seed without code changes (this is the proof).
- Repo-root `package.json`.

---

## 4. Acceptance criteria

1. **Seed is idempotent.** `bun -F @kuralle/db db:seed` runs twice → same row counts. Verified by `seed-idempotency-check.ts`. The `ON CONFLICT (id) DO NOTHING` (or `DO UPDATE` where appropriate) covers every INSERT; the seed never relies on `random()` or `now()` for primary keys.

2. **Deterministic IDs**. Use a fixed namespace prefix per resource type with stable integer suffixes:
   - `ws_calderon` — workspace (organization).
   - `ag_calderon_dispatcher`, `ag_calderon_intake`, `ag_calderon_titleix` — 3 agents.
   - `av_calderon_dispatcher_v1`, `av_calderon_intake_v1`, `av_calderon_titleix_v1` — 3 published agent_versions.
   - `ch_calderon_voice` — 1 voice channel_connection.
   - `ce_calderon_e164_main` — 1 phone-number channel_endpoint.
   - `cv_calderon_001` .. `cv_calderon_005` — 5 conversations.
   - `cvt_<conv>_<ord>` — conversation_turns.
   - `kb_calderon_pricing_q4` — 1 kb_document.
   - `wh_calderon_main` — 1 webhook.

3. **Workspace row matches `DATA_MODEL.md §3`** — `id='ws_calderon'`, `name='Calderon HVAC'`, `slug='calderon-hvac'`, `environment='production'`, `region='us-east-1'`, `compliance_mode='tcpa'` (per `apps/web/src/mocks/agents.ts:21` `home-services` → `tcpa`), `metadata={"vertical":"home-services"}`. `created_at` and `updated_at` use `now()` only on first insert; the `ON CONFLICT` skips re-stamping.

4. **3 agents** matching the WBS DoD: HVAC dispatcher / appointment intake / Title-IX:
   - Each has `agents.id`, `agents.workspace_id='ws_calderon'`, `agents.status='published'`, `agents.active_version_id` set to the corresponding `av_calderon_*_v1`.
   - Each has one `agent_versions` row with `version_number=1`, `version_kind='publish'`, `published_at=now()` (first run only — keep idempotent), `snapshot` matching the AgentIR shape from `DATA_MODEL.md §5:347-365`. The snapshot is a full jsonb document — pull the prompt/instructions from `apps/web/src/mocks/conversations.ts` line 6 ("Thanks for calling Calderon HVAC...") + reasonable model + voice config.
   - **The agents.active_version_id ↔ agent_versions chicken-and-egg** is solved by inserting `agents` first with `active_version_id=NULL`, then inserting `agent_versions`, then `UPDATE agents SET active_version_id = ... WHERE id = ...`. Same pattern as the S1-02 smoke.

5. **1 voice `channel_connections`** matching the `Calderon HVAC` mock voice channel — provider='twilio-native', channel_kind='voice', display_name='Calderon HVAC Voice', status='connected', config='{"twilioAccountSid":"AC_DEMO","mockMode":true}'::jsonb.

6. **1 phone-number `channel_endpoints`**:
   - `connection_id='ch_calderon_voice'`, `channel_kind='voice'`, `identifier='+15551234567'` (or pick from the mocks/numbers.ts catalogue), `attached_agent_id='ag_calderon_dispatcher'`, `attached_agent_version_id='av_calderon_dispatcher_v1'`, `display_name='Main Line'`.
   - The polymorphic CHECK trigger (S1-03) MUST not fire — `channel_kind='voice'` matches the connection's `channel_kind='voice'`.

7. **5 historical `conversations`** + their turns:
   - Each has `agent_id`, `agent_version_id`, `bundle_hash=NULL`, `channel_kind='voice'`, `channel_endpoint_id='ce_calderon_e164_main'`, `thread_key='voice:calderon-call-001'..'..-005'`, `direction='inbound'`, `participant_id` (E.164 caller), `started_at` and `ended_at` set to historical timestamps (use fixed offsets from a frozen base date so `ON CONFLICT` works), `outcome` from §9:688 (mix: 1 booked, 1 qualified, 1 missed, 1 voicemail, 1 escalated), `duration_sec`, `cost_usd` (small; e.g., 0.42).
   - Each conversation has 4-6 `conversation_turns` (alternating speaker between caller and agent, ordinal 1..N, text from `apps/web/src/mocks/conversations.ts:5-16`).
   - Voice turns have `message_id=NULL` (idempotent under the partial-unique dedup index — null entries don't conflict).

8. **1 `kb_documents`**:
   - `id='kb_calderon_pricing_q4'`, `workspace_id='ws_calderon'`, `name='Calderon HVAC pricing book Q4.pdf'`, `source='file'`, `size_bytes=42000`, `status='ready'`, `rag_indexed=true`, `embedding_model='openai-text-embedding-3-large'`, `created_by_user_id=NULL`.

9. **1 `webhooks`**:
   - `id='wh_calderon_main'`, `workspace_id='ws_calderon'`, `url='https://hooks.calderonhvac.com/api/calls'`, `events=array['conversation.completed','batch.completed']`, `signing_secret='whsec_demo_calderon_seed'`, `active=true`.

10. **All inserts respect CHECK constraints from S1-01..S1-04.** Run the seed; the smoke-S1-01/02/03/04 runners must still all be green afterwards. The seed must NOT introduce values that violate any CHECK (e.g., do not set `voices.provider='custom'` — that would be rejected by `voices_provider_check`).

11. **Personal-org metadata flag**: read `packages/auth/src/lib/auth.ts`. If the existing `databaseHooks.user.create.after` hook sets `metadata: { personal: true }` on the created organization, leave it alone. If it does NOT, add the metadata. Verify post-edit by re-running `bun -F @kuralle/auth smoke-local` (or whatever script S0 left) — the personal org must still be created end-to-end and now have the metadata flag.

12. **Type-check + lint green.** `bun run check-types --force`; `bun run lint` (0 errors, no new warnings beyond the pre-existing one). No `catch (err: any)` in the seed.

13. **OpenAPI drift gate** still green; no router changes.

14. **All prior smokes still green.** `bun packages/db/scripts/smoke-S1-01.ts`, `-S1-02.ts`, `-S1-03.ts`, `-S1-04.ts` (latter if it exists yet). The seed's ON CONFLICT logic must not interact with the smokes' test-prefixed rows.

15. **Demo artifacts.** `S1-06-seed-counts.txt` (first + second run, identical), `S1-06-seed-idempotency.txt` (the verifier's PASS).

16. **Atomic commit.** Body covers: deterministic IDs schema, idempotency strategy, AgentIR snapshot shape choice, polymorphic-trigger compliance, personal-org metadata edit (or no-op), trade-offs accepted (especially around what the seed does NOT do — e.g., no voice_calls sidecar rows, no agent_tool_attachments, no conversation_evals, since those screens aren't in the WBS DoD list).

---

## 5. Definition of Done

- [ ] All 16 ACs met.
- [ ] Seed is idempotent (verified by the check script).
- [ ] All 4 prior smokes green; `bun run check-types --force` 6/6; `bun run lint` 0 errors / 1 pre-existing warning; `bun -F @kuralle/platform test` 53/53; `bun -F server gen:openapi --check` clean.
- [ ] No `--no-verify`, no `@ts-ignore`, no `catch (err: any)`.
- [ ] Atomic commit `[S1-06] Calderon HVAC seed + personal-org metadata` with the §3 file list only.

---

## 6. What NOT to do

- Do NOT modify `apps/web/`. The UI proof is "no UI code changes; existing screens render the seeded data." Touching the UI invalidates the proof.
- Do NOT delete `apps/web/src/mocks/*` files. Mock removal is a backlog item (BL-S1-XX), not part of S1-06.
- Do NOT add `voice_calls`, `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_*_projection`, `conversation_tool_calls`, `conversation_evals`, `runtime_sessions`, `session_checkpoints`, `runtime_deployments`, `secrets`, `usage_events`, `monthly_receipts`, `batches`, `batch_recipients`, `audit_log_events`, etc. seed rows. Out of scope.
- Do NOT mock `pg` — use a real local Postgres connection (the smokes do).
- Do NOT add fancy seed CLI flags (`--reset`, `--only-agents`, etc.). The seed is one-shot, idempotent, no flags. Future stories can extend.
- Do NOT add deps to repo-root `package.json` — `pg`, `dotenv`, `drizzle-orm` are all in `@kuralle/db`'s deps.
- Do NOT regenerate `apps/server/openapi.json` — no router changes.
- Do NOT improvise the `agent_versions.snapshot` shape. The brief AC 4 + `DATA_MODEL.md §5:347-365` is the contract. Wrapping the snapshot in unexpected fields will be a finding.

---

## 7. Demo artifacts

1. `sprints/sprint-1/artifacts/S1-06-seed-counts.txt` — first run shows N rows inserted per table; second run shows 0 rows inserted (or `(0 rows)` from `ON CONFLICT DO NOTHING`).
2. `sprints/sprint-1/artifacts/S1-06-seed-idempotency.txt` — the verifier's `PASS` line plus the row counts before/after.

---

## 8. Reporting back

Atomic commit, body covering: ID conventions; idempotency strategy; AgentIR snapshot shape choice; polymorphic-trigger compliance; personal-org metadata change (yes/no/why); trade-offs (no voice_calls sidecar, no projection rows, etc.).

No push. No PR.

---

## 9. If you get stuck

- If S1-04 hasn't landed yet (no `secrets.ts`, `webhooks.ts`, etc. in schemas): **STOP**. Sequential per-story flow violation; report and exit.
- If `apps/web/src/mocks/` doesn't have the exact text/data you need for a turn or KB doc: pick reasonable values that preserve domain feel and document the choice.
- If the existing personal-org hook is more elaborate than expected (e.g., uses RLS context): leave it alone unless the metadata flag is missing.
- If the seed runs but the UI doesn't render the data: that's a debugging signal — verify the S1-05 routers actually read from `agents`/`conversations`/etc. and not from a mock import. (S1-05 may have only wired one hook; the rest of the screens may still be mock-driven. That's acceptable — the WBS DoD says "after running the seed, every existing UI screen renders," but the realistic Sprint 1 scope is "screens that have S1-05 hooks render correctly; rest still show mocks." Document the asymmetry in the commit body.)

Sincere work only. Never claim done without proof.
