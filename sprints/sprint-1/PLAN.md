# Sprint 1 — Plan

**Sprint name:** Schema
**Sprint goal (one sentence):** Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally.
**Sprint window:** 2026-05-07 → 2026-05-08 (single-session sprint, condensed from WBS-default 1-week cadence)
**Author (main session):** Claude Opus 4.7 (1M context) · 2026-05-07

---

## 1. Stories

Six stories. Per-story flow per memory `feedback_per_story_kimi_review.md`: brief → `pi/deepseek-v4-pro` IC bg → atomic `[S1-{nn}]` commit → `pi/kimi-k2.6` gate bg → manager `[S1-{nn}-fix]` → next IC.

### `S1-01` — Knowledge + tools + voices + enum-CHECK supplement

**Description:** Drizzle files for the read-mostly catalogue tables — `kb_documents`, `kb_chunks` (with `pgvector` extension and `vector(1024)` ivfflat index), `voices` (with stock catalogue seed matching `apps/web` mocks), `tools`, `tool_catalog_providers` — committed as `packages/db/src/schema/{knowledge,tools,voices}.ts` and re-exported from `packages/db/src/schema/index.ts`. **Folds in BL-S0-02:** the same migration adds `CHECK` constraints for `organization.{environment,region,complianceMode}` and `user.systemRole` (the columns already exist as `text` from S0; this story constrains them). Migration files generated via `drizzle-kit generate` and verified via local-Postgres `drizzle-kit migrate`.

**Acceptance criteria:**
1. `pgvector` extension is created via raw SQL (`CREATE EXTENSION IF NOT EXISTS vector;`) before any `vector(1024)` column is created — Drizzle migration ordering matters.
2. `kb_documents`, `kb_chunks`, `voices`, `tools`, `tool_catalog_providers` exist in local Postgres after `bun -F @kuralle/db db:migrate`.
3. `kb_chunks.embedding vector(1024)` has an ivfflat index (`USING ivfflat (embedding vector_cosine_ops)`).
4. All FKs and indexes from `DATA_MODEL.md §4 §5 §7` are present (workspace-scoped, soft-delete-aware where §15 says).
5. Stock voice catalogue seeded via a hand-authored SQL block in the migration file (rows match `apps/web/src/lib/mocks/voices.ts` fixture or equivalent — IC must grep first).
6. `0001_enum_checks.sql` (or appended to the same generated migration) adds CHECKs for the four enum-text columns. Inserts of bad values fail with the constraint name in the error.
7. `bun run check-types`, `bun run lint`, and a `pgsql -c "\dt"` smoke after `db:migrate` are green.

**Files expected to be created or modified:**
- `packages/db/src/schema/knowledge.ts` (new) — `kb_documents`, `kb_chunks`
- `packages/db/src/schema/tools.ts` (new) — `tools`, `tool_catalog_providers`
- `packages/db/src/schema/voices.ts` (new) — `voices`
- `packages/db/src/schema/index.ts` — re-exports
- `packages/db/src/migrations/0001_*.sql` (drizzle-kit emit) — schema additions
- `packages/db/src/migrations/0002_enum_checks.sql` (hand-authored if drizzle-kit can't emit CHECKs cleanly; else append to 0001)
- `packages/db/src/migrations/meta/_journal.json` — auto-updated
- `packages/db/scripts/seed-voice-catalogue.ts` (new, or inline in migration) — only if seed must run as code; preferred path is SQL in the migration file
- `apps/web/src/lib/mocks/voices.ts` — read-only reference; do not edit

**Test fixtures:** none in this story (schema is exercised by S1-05 hook tests and S1-06 seed verification). A short `packages/db/scripts/smoke-migrate.ts` may be added inside `@kuralle/db` (per memory rule on no-root-dep-pollution) to run migrate-then-`\dt` end-to-end against local Postgres.

**Demo artifact:** `sprints/sprint-1/artifacts/S1-01-tables.txt` — `pgsql -c "\dt"` output showing the new tables and `\d+ kb_chunks` showing the ivfflat index.

### `S1-02` — Agents two-row split + projections

**Description:** Drizzle files for the agent aggregate as specified in `DATA_MODEL.md §5`. Two-row split: `agents` (thin pointer row, `activeVersionId` FK to `agent_versions.id`) and `agent_versions` (fat snapshot with `snapshot jsonb`, `versionKind` enum text, `parentVersionId` self-FK). Plus the projection tables that S2 will write into (`agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`). Append-only behavior for `agent_versions` is enforced by **a Postgres trigger** (`AFTER UPDATE` raising `FEATURE_NOT_SUPPORTED` exception) — S1 lands the trigger; the repo-layer guard ships in S2.

**Acceptance criteria:**
1. Schema matches `DATA_MODEL.md §5` verbatim — column names, types, FK targets, ON DELETE policies. No improvisation.
2. `agents.activeVersionId` is `text references agent_versions(id)`. The FK is **deferrable initial deferred** (chicken-and-egg: a fresh agent has no version yet — alternative is `nullable` with a runtime guard; pick whichever the IC verifies works against the migration order).
3. `agent_versions.versionKind` accepts only `auto_save | manual_save | publish` (CHECK constraint), default `manual_save` per `DATA_MODEL.md §5:338`.
4. `agent_versions.parentVersionId` self-references `agent_versions.id` ON DELETE SET NULL (preserves history if a parent is removed — defensive).
5. Append-only trigger: `CREATE TRIGGER agent_versions_no_update BEFORE UPDATE ON agent_versions FOR EACH ROW EXECUTE FUNCTION raise_append_only();` raises `feature_not_supported` with a clear message. The trigger fires on any `UPDATE`, including no-op updates. Exception: `agents.activeVersionId` is on `agents`, not `agent_versions` — its update path is unaffected.
6. All projection tables have FKs to `agent_versions.id` ON DELETE CASCADE (per §5).
7. `bun -F @kuralle/db db:migrate` against local Postgres applies cleanly; a smoke insert of one `agents` + one `agent_versions` succeeds; an `UPDATE agent_versions` raises the trigger.

**Files expected to be created or modified:**
- `packages/db/src/schema/agents.ts` (new) — `agents`, `agent_versions`, `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`
- `packages/db/src/schema/index.ts` — re-exports
- `packages/db/src/migrations/0003_*.sql` (drizzle-kit emit + hand-authored trigger DDL)

**Test fixtures:** smoke insert script at `packages/db/scripts/smoke-agents-trigger.ts`.

**Demo artifact:** `sprints/sprint-1/artifacts/S1-02-trigger.txt` — psql session showing the trigger raising on UPDATE.

### `S1-03` — Channels + conversations + runtime sidecars

**Description:** The conversation graph from `DATA_MODEL.md §8 §9 §10`. `channel_connections`, `channel_endpoints` (with the §15 polymorphic CHECK trigger that pins `channel_endpoints.channelKind` to `channel_connections.channelKind`), `routing_rules`, `conversations`, `voice_calls`, `messaging_threads`, `conversation_turns` (with `messageId` dedup unique index per `DATA_MODEL.md §9` idempotency rule), `conversation_tool_calls`, `conversation_extracted_fields`, `conversation_evals` (non-nullable `rubricSnapshot jsonb`), `runtime_sessions`, `session_checkpoints`, `runtime_deployments`. Plus the CHECK constraint on `channel_endpoints` requiring `attachedAgentId IS NOT NULL OR routingRulesId IS NOT NULL` (DoD line).

**Acceptance criteria:**
1. Channel-polymorphic enum text + CHECK on `{voice, sms, web_chat, whatsapp, ...}` (exact set per §8) for both `channel_connections.channelKind` and `channel_endpoints.channelKind`.
2. CHECK trigger from `DATA_MODEL.md §15` enforces `channel_endpoints.channelKind = (SELECT channelKind FROM channel_connections WHERE id = channel_endpoints.connectionId)` on insert and update.
3. `channel_endpoints` has a CHECK ensuring `attached_agent_id IS NOT NULL OR routing_rules_id IS NOT NULL`.
4. `conversation_turns` has a unique partial index `(channel_endpoint_id, message_id) WHERE message_id IS NOT NULL` for idempotency dedup.
5. `conversation_evals.rubric_snapshot` is `jsonb NOT NULL`.
6. All indexes from §9/§15 present (cursor index on `(workspaceId, startedAt DESC)`, etc.).
7. Migration applies cleanly; a smoke insert chain (`organization → channel_connection → channel_endpoint → conversation → conversation_turn`) succeeds; a violation of the channelKind trigger raises with the trigger name.

**Files expected to be created or modified:**
- `packages/db/src/schema/channels.ts` (new) — `channel_connections`, `channel_endpoints`, `routing_rules`
- `packages/db/src/schema/conversations.ts` (new) — `conversations`, `voice_calls`, `messaging_threads`, `conversation_turns`, `conversation_tool_calls`, `conversation_extracted_fields`, `conversation_evals`
- `packages/db/src/schema/runtime.ts` (new) — `runtime_sessions`, `session_checkpoints`, `runtime_deployments`
- `packages/db/src/schema/index.ts` — re-exports
- `packages/db/src/migrations/0004_*.sql` (drizzle-kit emit + hand-authored trigger DDL)

**Test fixtures:** smoke chain script at `packages/db/scripts/smoke-channel-trigger.ts`.

**Demo artifact:** `sprints/sprint-1/artifacts/S1-03-channel-trigger.txt` — psql session showing the polymorphic CHECK trigger raising on a mismatched channelKind insert.

### `S1-04` — Cross-cutting tables (audit partitioned, billing, secrets, webhooks, compliance, guardrails, batches)

**Description:** The remaining tables from `DATA_MODEL.md §11 §12 §13`. `secrets` (KMS-envelope `ciphertext bytea`), `webhooks`, `webhook_deliveries`, `audit_log_events` (monthly partitioned per §11 — partition for current and next two months created in the migration), `workspace_compliance_posture`, `compliance_evaluations`, `guardrail_events`, `billing_subscriptions`, `usage_events`, `monthly_receipts`, `batches`, `batch_recipients`. RLS policies are explicitly **not** created in this sprint (deferred to S5 per `DATA_MODEL.md §3`). Soft-delete columns (`deleted_at timestamp`) where §15 requires them.

**Acceptance criteria:**
1. `audit_log_events` is created with `PARTITION BY RANGE (occurred_at)` and three child partitions (`audit_log_events_2026_05`, `..._2026_06`, `..._2026_07` from the project clock — IC determines the dates from `Date.now()` at generate time).
2. If drizzle-kit cannot emit `PARTITION BY RANGE` cleanly, the partition DDL is hand-authored in the migration file (this risk is called out in the WBS) — IC documents the path it took in the commit body.
3. `secrets.ciphertext` is `bytea NOT NULL` (KMS-envelope blob).
4. `webhook_deliveries` has the cursor index from §11 on `(workspace_id, scheduled_at DESC)`.
5. Soft-delete columns (`deleted_at timestamp`) on tables that §15 requires (`secrets`, `webhooks`, `tools`, `kb_documents` — note: kb_documents lands in S1-01 with the soft-delete column; cross-check).
6. RLS policies are NOT created — the sprint-level gate explicitly verifies this.
7. Migration applies cleanly; smoke insert chain inserts one row into each cross-cutting table; partition routing for `audit_log_events` works (insert with current `occurred_at` lands in the current-month partition).

**Files expected to be created or modified:**
- `packages/db/src/schema/audit.ts` (new) — `audit_log_events` (parent + partition declarations)
- `packages/db/src/schema/billing.ts` (new) — `billing_subscriptions`, `usage_events`, `monthly_receipts`
- `packages/db/src/schema/compliance.ts` (new) — `workspace_compliance_posture`, `compliance_evaluations`, `guardrail_events`
- `packages/db/src/schema/secrets.ts` (new) — `secrets`
- `packages/db/src/schema/webhooks.ts` (new) — `webhooks`, `webhook_deliveries`
- `packages/db/src/schema/batches.ts` (new) — `batches`, `batch_recipients`
- `packages/db/src/schema/index.ts` — re-exports
- `packages/db/src/migrations/0005_*.sql` — partition DDL + remaining tables

**Test fixtures:** smoke partition routing script at `packages/db/scripts/smoke-audit-partition.ts`.

**Demo artifact:** `sprints/sprint-1/artifacts/S1-04-partitions.txt` — psql `\d+ audit_log_events` showing the partition layout.

### `S1-05` — oRPC router stubs + first hook (`useAgents`)

**Description:** One oRPC procedure per aggregate root. Each is a single `list` query returning `{ items: [], cursor: null }` typed against the matching Drizzle `$inferSelect`. Routers: `agents`, `conversations`, `channels`, `kb`, `tools`, `batches`, `webhooks`, `secrets`, `voices`, `compliance`, `receipts`. Mounted under the existing `appRouter` shape (group-named keys per `DATA_MODEL §18` step 18 alignment with WBS DoD). `apps/server/openapi.json` is regenerated and grows from 2 to ~12 route groups; the drift CI gate gates the commit. `packages/api-client/src/schema.d.ts` regenerates (it's emitted by S0's `bun -F @kuralle/api-client gen` chain). One mock-driven list (C1 agents list) is replaced with a real-but-empty `useAgents()` hook in `apps/web/src/hooks/api/agents.ts` — wraps `$api.agents.list.useQuery` per AMENDMENT-001. Hook is unit-tested via **MSW intercepting `/rpc/agents.list`** (per user decision; not the server-side memory adapter).

**Acceptance criteria:**
1. Eleven router groups exist; each exports exactly `list` returning `{ items: T[], cursor: string | null }` with explicit Zod input/output schemas (per the §131 risk note about widening the OpenAPI surface).
2. `apps/server/openapi.json` regenerated; drift gate (`bun -F server gen:openapi --check`) passes.
3. `packages/api-client/src/schema.d.ts` regenerated and committed (S0's `gen` chain still works).
4. `apps/web/src/hooks/api/agents.ts` exists and exports `useAgents`. C1 agents list (`apps/web/src/routes/agents/index.tsx` or wherever the C1 page lives — IC must grep `apps/web/src/lib/mocks/agents` to find the consumer) renders the empty state from the real endpoint, not from a mock.
5. The forbidden-mock-import lint rule from S0-05 does not fire.
6. `apps/web/src/hooks/api/agents.test.tsx` (peer to existing `health.test.tsx`) — MSW handler intercepts the oRPC `/rpc/agents.list` POST, returns `{ items: [], cursor: null }`; test asserts `useAgents()` returns `[]` after a single fetch. MSW setup mirrors the existing `health.test.tsx` pattern.
7. `bun run check-types`, `bun run lint`, `bun -F web test` green; OpenAPI drift gate green.

**Files expected to be created or modified:**
- `packages/api/src/routers/index.ts` — extend with all 11 groups (currently has `healthCheck` + `privateData`)
- `packages/api/src/routers/{agents,conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.ts` (new, 11 files) — one `list` procedure each
- `apps/server/openapi.json` — regenerated (do NOT hand-edit; manager rule)
- `packages/api-client/src/schema.d.ts` — regenerated
- `apps/web/src/hooks/api/agents.ts` (new) — `useAgents` wrapper
- `apps/web/src/hooks/api/agents.test.tsx` (new) — MSW-based unit test
- `apps/web/src/routes/.../agents-list-page.tsx` (path TBD by IC) — replace mock import with `useAgents()`
- `apps/web/src/lib/mocks/agents.ts` — IC may delete this file if it's the only consumer (the forbidden-mock-import rule should make this unambiguous); if other screens still mock-import it, leave the file and just stop importing from it on C1.

**Test fixtures:** MSW handler for `/rpc/agents.list` inside the test file.

**Demo artifact:** `sprints/sprint-1/artifacts/S1-05-openapi-diff.txt` — `git diff apps/server/openapi.json | head -40` showing the 11 new path entries; plus `sprints/sprint-1/artifacts/S1-05-c1-empty.png` if a screenshot is feasible (else a Playwright trace or DOM-snapshot file).

### `S1-06` — Calderon HVAC seed + personal-org databaseHook

**Description:** Two seeds in one story. (a) `databaseHooks.user.create.after` (already wired in S0 for personal org creation) extended to set `metadata: { personal: true }` if not already (verify). (b) A workspace-level seed script that creates the `Calderon HVAC` sample workspace with: 3 agents (HVAC dispatcher / appointment intake / Title-IX, each with one published `agent_versions` row), 1 voice `channel_connection` (mock Twilio), 1 phone-number `channel_endpoint`, 5 historical `conversations` with turns, 1 `kb_document`, 1 `webhook`. Seed runs via `bun -F @kuralle/db db:seed` (new script). After running, every existing UI screen (B1, C1, F1, /knowledge, /telephony, /phone-numbers) reads from Postgres via the S1-05 routers — no UI code changes.

**Acceptance criteria:**
1. `bun -F @kuralle/db db:seed` is idempotent — running it twice leaves the same row count (uses fixed UUIDs derived from a project namespace, or `ON CONFLICT DO NOTHING`).
2. Personal-org databaseHook still creates a personal organization on `user.created` (S0 behavior preserved); verified by re-running `bun -F @kuralle/auth smoke-local` post-S1.
3. After seeding, manually opening B1 / C1 / F1 / /knowledge / /telephony / /phone-numbers in the web app shows the seeded data (no UI code changes — proves the S1-05 hooks are wired through).
4. Seed data shape matches `apps/web/src/lib/mocks/{agents,conversations,knowledge}.ts` so the UI mocks can be deprecated symmetrically (this story does not delete the mocks; symmetric deletion is a backlog item).
5. The seed script is hosted in `packages/db/scripts/seed-calderon.ts` (per memory rule on no-root-dep-pollution).
6. `bun run check-types`, `bun run lint` green; manual smoke (running the seed → opening the web app → seeing data) is the demo artifact.

**Files expected to be created or modified:**
- `packages/db/scripts/seed-calderon.ts` (new) — workspace seed
- `packages/db/package.json` — add `db:seed` script
- `packages/auth/src/hooks.ts` (or wherever S0 wired the databaseHook) — verify `personal: true` metadata; minor edit only if missing
- (no UI changes — this is the proof)

**Test fixtures:** seed-idempotency test at `packages/db/scripts/smoke-seed-idempotent.ts` (run seed twice, assert row counts equal).

**Demo artifact:** `sprints/sprint-1/artifacts/S1-06-seed-screencast.mov` (or `.png` snapshots if mov is impractical) — three screens showing seeded data; plus `sprints/sprint-1/artifacts/S1-06-seed-counts.txt` from `bun -F @kuralle/db db:seed` output.

---

## 2. Universal DoD checklist (per story)

Copy this checklist into every story brief. The story is not closed until every box is ticked.

- [ ] Schema matches the cited `DATA_MODEL.md` section verbatim — no improvisation.
- [ ] `bun -F @kuralle/db db:migrate` applies cleanly against local Postgres (`postgres://kuralle:kuralle@localhost:5432/kuralle_dev`).
- [ ] `bun run check-types` (turbo) green; if turbo cache might hide errors per S0 trap, run with `--force`.
- [ ] `bun run lint` green (forbidden-mock-import + hexagonal-import + hook-wrapper rules — story-applicable subset).
- [ ] If story changed routers: `bun -F server gen:openapi --check` green and committed `openapi.json` diff is intentional.
- [ ] Demo artifact captured into `sprints/sprint-1/artifacts/S1-{nn}-*` and referenced in the commit body.
- [ ] Atomic commit with subject `[S1-{nn}] {short title}` — IC commits before exiting; manager owns `[S1-{nn}-fix]`.
- [ ] No `--no-verify`, no `@ts-ignore`, no `try/except: pass`, no shortcuts.
- [ ] Per-story gate (`pi/kimi-k2.6`) verdict captured in `sprints/sprint-1/gate-S1-{nn}.md`; manager fix-pass commit lands every Apply-now item.

---

## 3. Test plan

| Story | Layer | Test type | Fixtures |
|-------|-------|-----------|----------|
| S1-01 | migration | smoke (`db:migrate` + `\dt` snapshot) | local pg |
| S1-01 | constraint | smoke (insert bad enum value, expect CHECK error) | psql script |
| S1-02 | constraint | smoke (UPDATE on `agent_versions` raises trigger) | psql script |
| S1-03 | constraint | smoke (mismatched `channelKind` raises trigger) | psql script |
| S1-03 | uniqueness | smoke (two `conversation_turns` with same `(channelEndpointId, messageId)` raises) | psql script |
| S1-04 | partition | smoke (insert with current `occurred_at` lands in current-month partition; `\d+` shows three partitions) | psql script |
| S1-05 | router type | type-check on `appRouter` shape + drift gate green | tsc + `gen-openapi --check` |
| S1-05 | hook unit | MSW intercepts `/rpc/agents.list`; `useAgents()` returns empty list | MSW + happy-dom |
| S1-06 | idempotency | run seed twice, assert table row counts equal | `pg_dump --data-only` diff |
| S1-06 | UI proof (manual) | open B1/C1/F1/`/knowledge`/`/telephony`/`/phone-numbers`, see seeded data | manual screencast |

What we will NOT test in this sprint, and why each is safe:
- **No RLS policy tests.** RLS is deferred to S5 per `DATA_MODEL.md §3`. Workspace-scoped queries land in S2 via the repository pattern (`AgentRepository.withWorkspace`).
- **No oRPC end-to-end fetch tests in apps/web.** S1 ships ONE hook (`useAgents`); broader hook coverage lands in S2. The MSW unit test is the contract.
- **No production Workers / Neon-HTTP transport tests.** Codegen Gate-Partial from S0 stands; CF/Neon credentials still unprovisioned. Local Postgres is the test substrate for the entire sprint.
- **No async projection worker.** S1 lands the projection tables; the worker that writes them ships in S2.
- **No `agent_versions` repo-layer append-only guard.** S1 lands the Postgres trigger (defense in depth); the application-layer guard ships in S2 with the repository pattern.

---

## 4. Demo plan

**Demo:** A 60-second walkthrough recorded into `sprints/sprint-1/artifacts/sprint-1-demo.mov` (or per-story stills). Open drizzle-studio against local Postgres showing all ~50 tables across the sprint. Open `/api-reference/openapi.json` in Scalar showing 12 route groups (1 from S0 + 11 from S1-05). Open the web app at `localhost:3001` and click through B1 home → C1 agents list → F1 conversations → /knowledge → /telephony → /phone-numbers, demonstrating the seeded Calderon HVAC data flowing through S1-05 routers. Persona: **Workspace Admin** browsing a freshly seeded Calderon HVAC workspace, recognizing the data shape from the prior demo even though the agent doesn't actually run yet.

---

## 5. Risks specific to this sprint

| Risk | Detection signal | Mitigation |
|------|------------------|------------|
| Drizzle migration ordering for partitioned `audit_log_events` is fragile (per WBS §128). | S1-04 `db:migrate` fails on `PARTITION BY RANGE` emit. | Hand-author partition DDL in the migration file; document in commit body. |
| `pgvector` extension missing on local Postgres 15.12. | S1-01 `db:migrate` fails on `CREATE EXTENSION vector`. | Pre-flight: IC runs `psql -c "CREATE EXTENSION IF NOT EXISTS vector;"` before generating the migration; flag to user if pgvector is not installed. |
| Router stubs widen OpenAPI surface (per WBS §131). | r1 review notices oversize Zod-derived schemas in `openapi.json`. | Explicit Zod input/output schemas per procedure; keep `cursor` typed `string | null`, not `unknown`. |
| Append-only trigger on `agent_versions` blocks legitimate updates the WBS doesn't anticipate. | S1-02 smoke insert fails on a no-op `UPDATE`. | Trigger raises only on `BEFORE UPDATE`, not `BEFORE INSERT`; document in §5 the only legitimate update path is via `agents.activeVersionId` which lives on a different table. |
| Channel-polymorphic CHECK trigger interacts poorly with FK ON DELETE CASCADE. | S1-03 smoke chain fails on cascade delete. | Trigger fires `BEFORE INSERT OR UPDATE`, not on DELETE; cascade is unaffected. |
| Seed script row IDs collide with future test fixtures. | Random sprint failure when seed runs in CI. | Seed uses a fixed namespace UUID derived from `Calderon HVAC`; `ON CONFLICT DO NOTHING` everywhere. |
| Drift CI fails on S1-05 because of a sort-order divergence in regenerated `openapi.json`. | `bun -F server gen:openapi --check` red after IC commit. | The S0 generator already sorts keys; if drift, IC reads `apps/server/scripts/gen-openapi.ts` to verify the sort is stable across the new procedures. |

---

## 6. Open questions

Decided pre-sprint via AskUserQuestion (2026-05-07):
- BL-S0-02 (enum CHECKs): **fold into S1-01.**
- S1-05 hook test: **MSW intercepts oRPC HTTP layer.**
- BL-S0-04 (ESLint relaxations): **defer past S1.**

Still ambiguous (will resolve in-flight; flag to user if blocking):
- Exact Calderon HVAC mock shape — IC must grep `apps/web/src/lib/mocks/` first; if mocks are too sparse to seed faithfully, fall back to "shape matches §1280-§1291 of `DATA_MODEL.md`" and flag.
- Whether `agents.activeVersionId` should be `nullable` or `deferrable initially deferred` — the IC investigates which actually works against drizzle-kit's DDL emit and documents the decision.
