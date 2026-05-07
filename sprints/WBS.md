# Work Breakdown Structure — Kuralle

> **The build plan, sprint by sprint, end-to-end.** Spans the locked architecture artifacts: `DATA_MODEL.md` (schema with 86 council decisions), `HEXAGONAL_ARCHITECTURE.md` (8 ports + CF/Node/memory adapters), `INTERFACE_DESIGNS_RuntimeHost.md` (channel-typed RuntimeHost synthesis), `USER_JOURNEYS.md` (7 personas + cross-cutting SLOs), `CONVERSATION_BLUEPRINT.md` (call lifecycle + read paths), `scripts/sink-spike/FINDINGS.md` (empirical AriaFlow event volumes). Every sprint is an end-to-end demoable slice, not a horizontal slab. Cadence and engineering practice are the same across all sprints.

---

## 1. Cadence and engineering practice

### 1.1 Cadence
- **1w sprints.** Planning Mon AM, execution Mon–Thu, review + warm-down Fri.
- **One sprint goal**, expressed as a single sentence with a verifiable outcome.
- **2–6 stories per sprint.** Smaller is better. Each story ships independently.
- **No carry-over.** If a story slips, it goes back to the backlog, not the next sprint as-is. Rewrite the story.

### 1.2 Definition of Done (universal)
A sprint's stories are collectively Done when **all** of the following hold:

1. Every story commits atomically (`[S{N}-{nn}] {title}`) to `main` behind a green CI run on the project's supported runtimes (Cloudflare Workers + Node both compile every PR).
2. Unit tests written for every new exported function / class. **Coverage is not the metric**; *behavioral coverage* is — every public surface tested with at least one happy-path and one failure-path test. Domain tests use `@kuralle/platform-memory`, never CF bindings.
3. **Passes the four-role sprint-level review pipeline:** spec + code-quality gate by `pi`, manager critical r1 review, and (when source/test code shipped) adversarial r2 review by an independent `codex` worker.
4. **Public surfaces match the source RFC(s).** Diffs to `DATA_MODEL.md`, `HEXAGONAL_ARCHITECTURE.md`, or `INTERFACE_DESIGNS_RuntimeHost.md` require an explicit RFC amendment in the same sprint.
5. **OpenAPI contract is committed.** Any sprint that adds or modifies an oRPC router regenerates `apps/server/openapi.json` and commits it. CI fails if the committed spec drifts from what the live router emits.
6. **Frontend client discipline.** All new frontend data access in `apps/web` goes through typed hooks in `apps/web/src/hooks/api/<resource>.ts`. The wrapper is the contract — the underlying library is `@orpc/tanstack-query` (per AMENDMENT-001). Components never call the underlying client (`client.x.useQuery`, etc.) directly. ESLint rule forbids any oRPC client import outside `apps/web/src/hooks/api/**`.
7. **Hexagonal discipline (HEXAGONAL_ARCHITECTURE.md §6) holds.** No file in `core/`, `api/`, `db/`, or `runtime/` imports from `platform/cloudflare/` or `platform/node/`. ESLint enforced. Memory adapter exists for every port.
8. Telemetry / observability events match the project's documented event taxonomy (sink-spike findings + `usage_events` kinds enum). New events require an explicit doc amendment.
9. Docs updated: at minimum the package's README; at most an RFC delta.
10. Manual demo artifact captured per sprint, framed against one of the five personas in `USER_JOURNEYS.md §1`.
11. **No `--no-verify`, no type-suppression, no silent-catch shortcuts.** If you can't meet a check, change the design, not the gate.

### 1.3 Branching and commits
- Trunk-based. Cursor commits per-story atomic implementations directly. Manager commits the fix pass + closeout commits.
- Every commit message includes the story id (or `[S{N}-fix]` / `[S{N}-close]` for manager commits) and a body summarizing the diff.
- Demo artifact links live in the commit body.

### 1.4 The review loop (four roles, sprint-level cadence)

The review pipeline runs **once per sprint**, after every story is committed. Four roles, four workers, four distinct value adds:

1. **Phase A — IC implementation.** `cursor` is fired as a fresh process per story. Writes the diff against the brief, runs build/test, **commits atomically** before exiting. Each story = one fresh cursor invocation = one clean context window.
2. **Phase B begins — Spec + code-quality gate.** `pi` reads every story brief + the entire sprint diff. Verifies acceptance criteria, file-list adherence, wiring, test quality. **Same team as the IC; NOT adversarial.** Output: `sprints/sprint-N/gate-sprint.md` with verdict `green` / `yellow` / `red`.
3. **Manager critical review (r1).** Main session reads the gate report + the diff and writes `sprints/sprint-N/review-sprint-r1.md` using the sandwich method — strengths, critique with severity, constructive close. Manager owns the final diff.
4. **Adversarial second-opinion review (r2).** When the sprint includes source/test code, `codex` reads gate + r1 + diff and writes `sprints/sprint-N/review-sprint-r2.md`. Finds non-obvious bugs (race conditions, type holes, untested paths). Critiques r1 itself if wrong. **Skip rule:** if the sprint has zero source/test changes, r2 is skipped; document in the fix-pass commit body.
5. **Manager fix pass.** Apply every `Apply now` item from gate + r1 + r2. Commit `[S{N}-fix] {description}`. Sprint closes when WARMDOWN + HANDOFF + STATE-update commit lands.

### 1.5 Sprint warm-down (handoff to the next session)
Last hour of every sprint. Two artifacts:

1. `sprints/sprint-N/WARMDOWN.md` — what shipped, what's working, what's not, open issues, decisions made, RFC amendments this sprint.
2. `sprints/sprint-N/HANDOFF.md` — a one-page primer for the next session: read-me-first, current state of the world, sprint N+1 starting state.

The next session reads HANDOFF first, WARMDOWN if it needs depth.

---

## 2. The roadmap

| Sprint | Phase | Goal (one sentence) |
|--------|-------|---------------------|
| 0 | Foundations | Ship Postgres-backed auth, an OpenAPI 3 contract emitted by oRPC and committed as the canonical public spec, a thin `@orpc/tanstack-query` client package consumed by `apps/web` behind hook wrappers, and the eight platform ports + memory adapter — proving the hexagonal seam and the API contract before any domain code lands. |
| 1 | Schema | Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally. |
| 2 | Editor IR pipeline | Owner-Operator can edit and publish an agent through C2/C3/C8, which writes a real `agent_versions.snapshot`, runs the synchronous projection worker, swaps `agents.activeVersionId`, and shows "Saved → Publishing → Live" in the sticky bar — sub-second from click to live (USER_JOURNEYS §2 SLO #2). |
| 3 | First channel + first conversation | A real WhatsApp inbound message is received, routed by E.164 to a workspace+agent, processed by an AriaFlow-backed MessagingDO via the runtime adapter, and persisted via Cloudflare Queue → projector worker into `conversations` + `conversation_turns` + `usage_events`; F1 list and F2 detail render the live conversation through generated hooks. |
| 4 | Voice + supervisor | Owner-Operator dials their assigned Twilio number, the agent answers within 3s cold or 600ms warm, transcript streams into F3 with ≤1.5s lag (USER_JOURNEYS §2 SLO #3), and the full 5-min-to-first-call promise (SLO #1) holds end-to-end through a recorded demo. |
| 5 | Polish + 1.0 | Lock discipline gates, complete the Node platform adapter so both-adapters CI is meaningful, ship RLS + compliance evaluator + monthly receipts + cold archive, publish the OpenAPI spec at `/docs` via Scalar, and prove the failure-mode user stories from USER_JOURNEYS.md §12. |

The phases above map to the source RFC(s) as follows:

- **Sprint 0** implements `DATA_MODEL.md §3` (auth tables via better-auth CLI) + `HEXAGONAL_ARCHITECTURE.md §2` (the eight ports as TypeScript interfaces) + `HEXAGONAL_ARCHITECTURE.md §3` (memory adapter for every port) + the OpenAPI-emission + `@orpc/tanstack-query`-behind-hook-wrappers constraint added in this sprint plan and refined by `AMENDMENT-001.md`.
- **Sprint 1** implements `DATA_MODEL.md §4–§13` (every domain table) and `DATA_MODEL.md §18` (the codegen sequence), one PR per aggregate root.
- **Sprint 2** implements `DATA_MODEL.md §5` (two-row agent split + projection tables), `HEXAGONAL_ARCHITECTURE.md §1` (Anti-Corruption Layer in `runtime/adapter/`), `USER_JOURNEYS.md §4` (Journey 2 — building/editing an agent), and the C2/C3/C8 wiring promised in `USER_JOURNEYS.md §13`.
- **Sprint 3** implements `DATA_MODEL.md §8` (channels), `DATA_MODEL.md §9` (conversations + runtime sessions), `DATA_MODEL.md §14` (sink architecture), `INTERFACE_DESIGNS_RuntimeHost.md §5` (synthesis — `MessagingRuntimeHost` half), and `USER_JOURNEYS.md §9b` (WhatsApp messager journey).
- **Sprint 4** implements `INTERFACE_DESIGNS_RuntimeHost.md §5` (the `VoiceRuntimeHost` half + diagnostics), `DATA_MODEL.md §9` (`runtime_deployments` lifecycle), `USER_JOURNEYS.md §3` (Journey 1 first-run onboarding), `USER_JOURNEYS.md §6` (Journey 4 live operations + F3), and `USER_JOURNEYS.md §9a` (the voice caller experience).
- **Sprint 5** implements `HEXAGONAL_ARCHITECTURE.md §6 rule 2` (Node adapter compiling in CI), `DATA_MODEL.md §3` (RLS deferred policy), `DATA_MODEL.md §11` (audit-log archive), `DATA_MODEL.md §12` (compliance evaluator), `DATA_MODEL.md §13` (monthly receipts), `USER_JOURNEYS.md §8` (Journey 6 compliance review), `USER_JOURNEYS.md §11` (the day-30 ROI moment), and `USER_JOURNEYS.md §12` (the failure-mode user stories).

---

## 3. Sprint detail

The format below repeats per sprint. Stories use the id pattern `S{N}-{nn}` (e.g. `S0-01`).

### Sprint 0 — Foundations

**Goal:** Ship Postgres-backed auth, an OpenAPI 3 contract emitted by oRPC and committed as the canonical public spec, a thin `@orpc/tanstack-query` client package consumed by `apps/web` behind hook wrappers, and the eight platform ports + memory adapter — proving the hexagonal seam and the API contract before any domain code lands.

| Story | Description | DoD |
|-------|-------------|------|
| S0-01 | Swap `packages/db` from D1/SQLite to Neon serverless Postgres. Replace `drizzle-orm/d1` with `drizzle-orm/neon-http`, dialect `sqlite` → `postgresql`, install `@neondatabase/serverless`. Update `apps/server/.env` (`DATABASE_URL`), `infra/alchemy.run.ts` (drop `D1Database`, bind `DATABASE_URL` as a secret), and `packages/db/drizzle.config.ts`. Add `docker-compose.dev.yml` at repo root for a local Postgres against which migrations run. | `bun run check-types` green workspace-wide. `drizzle-kit migrate` runs against a Neon branch and a local Postgres; both targets show identical schemas. README updated with the new local-dev recipe. |
| S0-02 | Configure better-auth with `organization` + `apiKey` plugins per the Hono-on-Cloudflare recipe. Switch adapter to `provider: 'pg'`. Add `additionalFields` for the `+ext` columns specified in `DATA_MODEL.md §3` (user.systemRole/lastSeenAt; organization.vertical/environment/region/isPersonal/createdByUserId/complianceMode; member.invitedBy/lastActiveAt; apikey.organizationId/revokedAt). Configure `access()` for the four-role ladder (owner/admin/member/viewer). Auto-create personal `organization` on `user.created` per `DATA_MODEL.md §3`. | `packages/auth/src/index.ts` exports a configured better-auth instance. `bun run check-types` green. The four roles are usable via `auth.api.organization.access()`. |
| S0-03 | Delete `packages/db/src/schema/auth.ts` (hand-authored) and regenerate via `npx @better-auth/cli@latest generate --config ./better-auth.config.ts --output packages/db/src/schema/auth.ts`. Run `drizzle-kit generate` to produce the initial migration. Apply via `drizzle-kit migrate` against the local Postgres. Verify `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey` exist with the `+ext` columns. | All eight tables exist in Postgres. Migration is committed. Sign-up via the existing A1 sign-in flow on `apps/web` succeeds end-to-end against `wrangler dev` of `apps/server`: user row created, personal organization auto-created, member row links the user as `owner`, `session.activeOrganizationId` is set. Recording attached to the closeout commit. |
| S0-04 | Lock OpenAPI emission. The existing `apps/server/src/index.ts` already mounts `@orpc/openapi/fetch` — confirm it serves the spec at `/api-reference/openapi.json` and add a build script (`bun -F server gen:openapi`) that fetches the spec from a local `wrangler dev` and writes `apps/server/openapi.json`. Add a CI step that re-runs the script and `git diff --exit-code apps/server/openapi.json`; fail on drift. Document in `apps/server/README.md` the rule: every PR that adds or changes a router commits the regenerated spec. | `apps/server/openapi.json` is committed and matches what the running server emits. CI fails if a router change isn't reflected in the committed spec (verified by deliberately editing a router in a throw-away branch). |
| S0-05 | Scaffold `packages/api-client` as a thin wrapper over `@orpc/tanstack-query` (per AMENDMENT-001). Import `AppRouter` from `@kuralle/api/routers/index`; export a typed `client` built from `RouterClient<typeof appRouter>` plus the `$api` utils factory from `@orpc/tanstack-query`. In `apps/web`, add an `<ApiProvider>` at the root initializing the TanStack Query client + base URL + auth credentials. Add `apps/web/src/hooks/api/health.ts` exporting `useHealthCheck()` wrapping `$api.healthCheck.queryOptions()`, and replace one mock-driven status indicator on B1 home with the live hook. Add ESLint rule (`no-restricted-imports`) forbidding any `@kuralle/api-client` import outside `apps/web/src/hooks/api/**` — components consume hooks, never the underlying client. | Types flow end-to-end from the router to the hook (Zod refinements preserved; verified by deliberately breaking a Zod refinement and seeing the hook type-check fail). B1 health indicator updates from the real server. The forbidden-import rule fails CI when violated (verified). Hook-wrapper pattern documented in `apps/web/README.md` with one good and one rejected example. |
| S0-06 | Define `packages/platform/interface.ts` with all eight ports verbatim from `HEXAGONAL_ARCHITECTURE.md §2`: `KvStore`, `BlobStore`, `MessageQueue`, `RuntimeHost` (the `RuntimePlatform = voice + messaging + diagnostics` synthesis from `INTERFACE_DESIGNS_RuntimeHost.md §5`), `SessionStore` (re-export from `@ariaflowagents/core`), `AuthAdapter`, `ActorHost`, `LlmGateway`. Build `packages/platform/memory/` Map-backed implementations of every port. Reference the in-memory `RuntimeHost` from `INTERFACE_DESIGNS_RuntimeHost.md §A.2(d)` (~28 LOC) for the messaging half. Stub `packages/platform/cloudflare/` and `packages/platform/node/` packages so each exports `createCloudflareBindings()` / `createNodeBindings()` returning all eight ports — implementations may throw `not-implemented` in S0; types must be honest. Add CI: `bun run check-types` runs against all four packages (memory, cloudflare, node, interface). Add ESLint rule forbidding `core/`, `api/`, `db/`, `runtime/` from importing from `platform/cloudflare/` or `platform/node/` (only `platform/interface.ts` allowed). | All four platform packages compile. Memory adapter has a one-shot test exercising every port through its public contract — passes. The forbid-platform-import rule fires in CI on a deliberate violation in a throw-away branch (recording attached). |

**Demo:** A short screen recording: sign up via A1 against `wrangler dev`, the personal organization auto-creates, B1 home shows the live `useHealthCheck()` hook ticking, `apps/server/openapi.json` is open in a side pane, the four `packages/platform/*` packages compile in `bun run check-types`, and the deliberate ESLint violation fails CI. Persona: **Workspace Admin** — trust moment "the foundation is real, not vaporware."

**Dependencies:** none.

**Source RFC §:** `DATA_MODEL.md §3` (auth/tenancy via better-auth), `HEXAGONAL_ARCHITECTURE.md §2` (the eight ports), `HEXAGONAL_ARCHITECTURE.md §6` (discipline rules), `INTERFACE_DESIGNS_RuntimeHost.md §5` (the synthesis chosen for `RuntimeHost`), and the OpenAPI-emission + `@orpc/tanstack-query`-behind-hook-wrappers constraint refined in `AMENDMENT-001.md`.

**Sprint-specific risks:**
- Better-auth + Workers + Neon HTTP combination has subtle issues (cookie attributes, `crossSubDomainCookies`, `node_compat`) → detection: S0-03 sign-up test; mitigation: the Hono recipe explicitly covers it; if it fails, see Risk #1 below.
- ESLint platform-import rule may not catch every path (`@kuralle/platform-cloudflare` imported via package alias) → detection: deliberate violation test; mitigation: rule pattern reviewed in r1.
- `@orpc/tanstack-query` version drift between server (`@orpc/server`) and client could break type inference → detection: type-check on S0-05; mitigation: pin both packages to matching versions, bump together, document in `packages/api-client/README.md`.

**Exit criteria:** all stories Done; WARMDOWN written; HANDOFF prepared.

---

### Sprint 1 — Schema

**Goal:** Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally.

| Story | Description | DoD |
|-------|-------------|------|
| S1-01 | Knowledge + tools + voices families. Drizzle files: `kb_documents`, `kb_chunks` (with `pgvector` extension + `vector(1024)` + ivfflat index), `voices` (with stock catalog seed), `tools`, `tool_catalog_providers`. One PR. | `pgvector` extension created in migration. Tables exist in Postgres. Stock voice catalog seeded (matches `apps/web` voice mocks). All FKs and indexes from `DATA_MODEL.md §4 §5 §7` present. |
| S1-02 | Agents two-row split + projections. `agents` (thin), `agent_versions` (fat snapshot jsonb), `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection`. Includes `versionKind` + `parentVersionId` per `DATA_MODEL.md §5`. | Schema matches §5 verbatim — no improvisation. Constraint: `agent.activeVersionId` FK to `agent_versions.id`. Append-only behavior for `agent_versions` enforced by trigger or repo-layer guard. |
| S1-03 | Channels + conversations + runtime sidecars. `channel_connections`, `channel_endpoints` (with check constraint on `attachedAgentId OR routingRulesId`), `routing_rules`, `conversations`, `voice_calls`, `messaging_threads`, `conversation_turns` (with `messageId` dedup index), `conversation_tool_calls`, `conversation_extracted_fields`, `conversation_evals` (non-nullable `rubricSnapshot`), `runtime_sessions`, `session_checkpoints`, `runtime_deployments`. | Channel-polymorphic enum in place. The CHECK trigger from `DATA_MODEL.md §15` on `channel_endpoints.channelKind ↔ channel_connections.channelKind` exists. Indexes match §9 / §15. |
| S1-04 | Cross-cutting tables: `secrets` (with KMS-envelope `ciphertext bytea`), `webhooks`, `webhook_deliveries`, `audit_log_events` (monthly partitioned from day one per §11), `workspace_compliance_posture`, `compliance_evaluations`, `guardrail_events`, `billing_subscriptions`, `usage_events`, `monthly_receipts`, `batches`, `batch_recipients`. | Monthly partition created for the next 3 months in the migration. Soft-delete columns where §15 requires them. RLS policies are NOT created in this sprint (deferred to S5 per `DATA_MODEL.md §3`). |
| S1-05 | One oRPC router stub per aggregate root: `agents`, `conversations`, `channels`, `kb`, `tools`, `batches`, `webhooks`, `secrets`, `voices`, `compliance`, `receipts`. Each exports a single `list` query returning `{ items: [], cursor: null }` typed against the matching Drizzle row type. The `apps/server/openapi.json` regenerates and grows from one route to ~12 route groups. Generate fresh `packages/api-client/src/schema.d.ts` and replace one mock-driven list (C1 agents list) with a real-but-empty `useAgents()` hook in `apps/web/src/hooks/api/agents.ts`. | OpenAPI spec growth visible in diff. C1 list renders empty state from real endpoint. The forbidden-mock-import lint rule (added S0-05) does not fire. Hook is unit-tested via the memory adapter wired through MSW or equivalent. |
| S1-06 | Seed script: on `user.created`, better-auth's organization-plugin hook creates a `personal: true` organization. Plus a "Calderon HVAC" sample workspace with seed data matching `apps/web` mocks: 3 agents (HVAC dispatcher / appointment intake / Title-IX), 1 voice channel connection (mock Twilio), 1 phone number `channel_endpoint`, 5 historical `conversations` with turns, 1 KB document, 1 webhook. | After running the seed, the existing UI screens render the seeded data without code changes. B1 home, C1 agents list, F1 conversations, /knowledge, /telephony, /phone-numbers all show the seeded fixtures via the empty-but-wired routers from S1-05. |

**Demo:** drizzle-studio open showing all ~50 tables; `/api-reference/openapi.json` rendered in Scalar showing 12 route groups; `apps/web` running against real-but-mostly-empty endpoints — every screen reads from Postgres. Persona: **Workspace Admin** browsing a freshly seeded Calderon HVAC workspace, recognizing the data shape from the prior demo even though the agent doesn't actually run yet.

**Dependencies:** Sprint 0.

**Source RFC §:** `DATA_MODEL.md §4–§13` (every aggregate root), `DATA_MODEL.md §18` (codegen sequence steps 1-18).

**Sprint-specific risks:**
- Drizzle migration ordering for partitioned `audit_log_events` is fragile → detection: clean migrate test in S1-04; mitigation: partition statements split into a follow-up migration if Drizzle can't emit `PARTITION BY RANGE` cleanly.
- `pgvector` ivfflat index requires non-empty data to be truly useful, but we seed only a few rows → detection: noted in WARMDOWN; mitigation: deferred until S5 perf check.
- The router stubs may unintentionally widen the OpenAPI surface (e.g., expose internal Drizzle types) → detection: r1 review; mitigation: explicit Zod input/output schemas per procedure.

**Exit criteria:** all stories Done; WARMDOWN written; HANDOFF prepared.

---

### Sprint 2 — Editor IR pipeline

**Goal:** Owner-Operator can edit and publish an agent through C2/C3/C8, which writes a real `agent_versions.snapshot`, runs the synchronous projection worker, swaps `agents.activeVersionId`, and shows "Saved → Publishing → Live" in the sticky bar — sub-second from click to live (USER_JOURNEYS §2 SLO #2).

| Story | Description | DoD |
|-------|-------------|------|
| S2-01 | Repository pattern in `packages/core/repositories/`. `AgentRepository`, `AgentVersionRepository`, `KbDocumentRepository`, `ToolRepository`, `ChannelRepository`, `ConversationRepository`. Each scopes queries through a `withWorkspace(workspaceId)` factory; raw `db.select()` is forbidden in routers (lint rule). Repositories accept the `KvStore` port for an identity-map cache per `HEXAGONAL_ARCHITECTURE.md §5` (Fowler PoEAA). | All repositories tested against the memory adapter from S0-06. Lint rule fires on direct `db.*` use in `packages/api/`. |
| S2-02 | `AgentIR` Zod schema in `packages/core/schemas/agent-ir.ts` matching the snapshot shape locked in `DATA_MODEL.md §5`. Synchronous projection worker in `packages/runtime/projector/` that, given an `agent_versions` row, writes `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection` in a single transaction with the version insert. | Round-trip property test: any valid `AgentIR` → snapshot insert → projection rows → reconstruct IR from projections + snapshot, equal to original. Projection latency p95 ≤ 200 ms in the memory adapter and ≤ 100 ms in Postgres. |
| S2-03 | `agents.publish`, `agents.autoSave`, `agents.list`, `agents.get`, `agents.history` oRPC procedures wired through `AgentRepository` + projector. `publish` accepts an `AgentIR`, validates with Zod, inserts a new `agent_versions` row with `versionKind='publish'`, runs projector synchronously, swaps `agents.activeVersionId` — all in one transaction. `autoSave` writes `versionKind='auto_save'` without projection or pointer swap. Regenerate `apps/server/openapi.json`; regenerate client types. | OpenAPI spec captures all five procedures with full Zod-derived schemas. Type-check green. Integration test: publish → list → get returns the new version. |
| S2-04 | `apps/web/src/hooks/api/agents.ts` exporting `useAgents`, `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory` wrapping `$api.useQuery` / `$api.useMutation`. Replace mock data in C1 (agents list), C2 (Behavior tab), C3 (Models & Voice tab), C8 (Compliance tab), and the sticky save bar. Editor holds one `AgentIR` document; tabs edit slices of it; auto-save fires every 30 s debounced; publish opens the confirmation modal with "X live calls will see the new version after this call ends" copy from `USER_JOURNEYS.md §4`. | Click-through test in Playwright: edit C2 prompt → 30 s pass → auto-save row exists; click Publish → confirmation → projector fires → C1 list shows new version number. No oRPC client imports in `apps/web`. |
| S2-05 | SLO test for sub-second publish (USER_JOURNEYS.md §2 SLO #2): integration test that POSTs an `AgentIR` to `agents.publish` and asserts the round-trip from request to `activeVersionId` swap completes ≤ 1 s p95 over 100 iterations against Postgres. Captured into `sprints/sprint-2/artifacts/publish-slo.txt`. | SLO holds. Failure mode (publish takes > 1 s) wired to alert in `usage_events` for future ops. |

**Demo:** A 90-second screen recording — workspace admin opens C2, edits the first message, the sticky bar transitions Saved → Publishing → Live in under a second, the C1 list version number ticks up, and the publish confirmation copy is visible. Persona: **Workspace Admin** — trust moment "I changed something and shipped it without paging an engineer."

**Dependencies:** Sprint 1.

**Source RFC §:** `DATA_MODEL.md §5` (two-row split + snapshot + projections), `DATA_MODEL.md §17` (screen→table mapping for C1/C2/C3/C8), `HEXAGONAL_ARCHITECTURE.md §1` (ACL between editor and AriaFlow), `USER_JOURNEYS.md §4` (Journey 2), `USER_JOURNEYS.md §2` SLO #2.

**Sprint-specific risks:**
- Synchronous projection in the same transaction as `agent_versions` insert may exceed 200 ms when guardrail+workflow lists grow → detection: S2-05 SLO test against a 50-tool / 20-node IR; mitigation: schema already accommodates async via `agent_versions.projectionsReady` boolean (deferred to v2).
- `AgentIR` Zod schema diverging from `DATA_MODEL.md §5` JSON shape → detection: round-trip property test in S2-02; mitigation: the schema file cites `DATA_MODEL.md §5` line-by-line.
- `apps/web` regression in unrelated screens when mocks are partially replaced → detection: existing 34 tests must stay green; mitigation: replace mocks only where the hook exists; leave the rest alone (HEXAGONAL §6 surgical-changes spirit).

**Exit criteria:** all stories Done; WARMDOWN written; HANDOFF prepared.

---

### Sprint 3 — First channel + first conversation

**Goal:** A real WhatsApp inbound message is received, routed by E.164 to a workspace+agent, processed by an AriaFlow-backed MessagingDO via the runtime adapter, and persisted via Cloudflare Queue → projector worker into `conversations` + `conversation_turns` + `usage_events`; F1 list and F2 detail render the live conversation through generated hooks.

| Story | Description | DoD |
|-------|-------------|------|
| S3-01 | `ChannelRepository`. oRPC procedures: `channels.connect`, `channels.list`, `channels.endpoints.list`, `channels.endpoints.attach`, `channels.endpoints.detach`. M5 connector wizard wired for the WhatsApp half: Meta OAuth via Embedded Signup → callback → `channel_connections` row (provider `meta-whatsapp-cloud`) → list available numbers → user picks → `channel_endpoints` row + auto-register webhook URL = `publicWebhookUrl` per `USER_JOURNEYS.md §5 (3b)`. | OpenAPI spec includes the new procedures. M5 wizard completes against a sandbox Meta app; webhook URL is registered; `channel_endpoints.identifier` = phoneNumberId. |
| S3-02 | AriaFlow runtime adapter in `packages/runtime/adapter/`. Translates `AgentIR` → `AriaFlow.AgentConfig` (the Anti-Corruption Layer per `HEXAGONAL_ARCHITECTURE.md §1`). Wires `HarnessHooks` per `scripts/sink-spike/FINDINGS.md` taxonomy: `onStepStart/onStepEnd/onToolCall/onToolResult/onTokensUpdate/onAgentStart/onAgentEnd` emit to `MessageQueue` (the port). Stream sink at `eventMode='message'` (production default per FINDINGS volume table). Text-deltas NOT persisted; snapshot from `done`/`turn-end` `fullText` per FINDINGS. | A unit test runs the adapter against the memory `MessageQueue` and asserts the emitted event shape matches FINDINGS for the 3-turn fixture (~7 events/turn at message mode + ~9 hooks/turn). |
| S3-03 | Cloudflare adapter for `MessagingRuntimeHost`: `MessagingDO` per conversation, hibernating between messages per `INTERFACE_DESIGNS_RuntimeHost.md §C` and `USER_JOURNEYS.md §9b`. WhatsApp webhook handler at `apps/server` resolves `threadKey = 'whatsapp:<wa_id>'` → `messaging_threads` lookup → `channel_endpoints` → workspace + agent → DO via `idFromName(threadKey)`. HMAC verify on inbound. | Sandbox Meta test message arrives; DO spawns; agent replies via Cloud API; second message wakes hibernated DO; `runtime_sessions.workingMemory` persists across hibernation. |
| S3-04 | Projector worker draining 16 sharded Cloudflare Queues per `DATA_MODEL.md §14`. Writes `conversation_turns` with `messageId` dedup, `conversation_tool_calls`, `conversation_extracted_fields`, `usage_events`, `guardrail_events`, `audit_log_events`. Idempotent on `messageId` so webhook replays don't duplicate. Add Node-adapter shim in `packages/platform/node/message-queue.ts` (BullMQ) that the projector also runs against in CI integration test (memory adapter for unit tests). | The integration test publishes 100 events to memory queue, projector consumes, asserts 100 rows in Postgres. Replay test: re-publishing same `messageId` yields no second row. Node-adapter version of the same test is green in CI. |
| S3-05 | `apps/web/src/hooks/api/conversations.ts` with `useConversations` (paginated cursor list), `useConversation` (detail with turns + tool-calls + evals + extracted-fields), `useConversationLive` (subscribes to a stream of new turns — uses `@orpc/tanstack-query`'s `eventIterator` / `useInfiniteQuery` against an oRPC streaming procedure if available, else polls `runtime_sessions.sequenceNumber` per `USER_JOURNEYS.md §6`). Replace mock data on F1, F2. F3 stays on mocks until S4. | F1 paginates over real data. F2 detail renders the seeded WhatsApp test conversation. The websocket / polling fallback contract is documented in `apps/web/README.md`. |
| S3-06 | SLO test: WhatsApp inbound → first reply visible in F2 within 4 seconds end-to-end (intermediate target before the SLOs in S4). Captured into `sprints/sprint-3/artifacts/whatsapp-e2e.mp4` + a duration log. | SLO holds against the sandbox Meta + Workers preview. |

**Demo:** Live demo where the user sends a WhatsApp message to the configured number from their phone, F1 gets a new row within 1-2 s, F2 shows the agent's reply within 4 s, working-memory pane updates with extracted fields. Persona: **Operations Lead** — trust moment "I can see what's happening on the platform, in real time."

**Dependencies:** Sprint 2.

**Source RFC §:** `DATA_MODEL.md §8` (channels), `DATA_MODEL.md §9` (conversations + runtime), `DATA_MODEL.md §14` (sink architecture), `INTERFACE_DESIGNS_RuntimeHost.md §5` (`MessagingRuntimeHost`), `USER_JOURNEYS.md §5 (3b)` + `§9b`, `scripts/sink-spike/FINDINGS.md` (event taxonomy).

**Sprint-specific risks:**
- DO hibernation may lose part of `workingMemory` if not blockConcurrencyWhile-d → detection: S3-03 hibernation test; mitigation: explicit `state.blockConcurrencyWhile` per `INTERFACE_DESIGNS_RuntimeHost.md §C`.
- Meta sandbox rate limits during testing → detection: 429 surfaces in `webhook_deliveries`; mitigation: documented backoff; second sandbox app for CI if needed.
- Projector worker can't keep up if it drains all 16 queues serially → detection: load test at 100 events/s; mitigation: per-queue consumer concurrency (already in `MessageQueue` port shape).
- AriaFlow API churn between sink-spike and now → detection: type-check on import; mitigation: ACL in `runtime/adapter/` shields domain code.

**Exit criteria:** all stories Done; WARMDOWN written; HANDOFF prepared.

---

### Sprint 4 — Voice + supervisor

**Goal:** Owner-Operator dials their assigned Twilio number, the agent answers within 3 s cold or 600 ms warm, transcript streams into F3 with ≤ 1.5 s lag (USER_JOURNEYS §2 SLO #3), and the full 5-min-to-first-call promise (SLO #1) holds end-to-end through a recorded demo.

| Story | Description | DoD |
|-------|-------------|------|
| S4-01 | `WorkspaceVoiceDO` (per workspace; spawns/manages a Container) + voice container at `deployments/cloudflare/voice-container/`: `Dockerfile` (Bun + AriaFlow + livekit-plugin-transport-ws) and `server.mjs` ported from aria-flow's `fly-voice-agent`. `runtime_deployments` lifecycle managed by the DO: `provisioning → ready → draining → terminated`, heartbeat write every 5 s, idle-timeout 5-min default / 30-sec for HIPAA workspaces per `USER_JOURNEYS.md §4 compliance carve-out`. | Container builds in CI. Cold-spawn from DO measured ≤ 3 s p95; warm reuse ≤ 50 ms. `runtime_deployments` row goes through the full lifecycle in the test. |
| S4-02 | Twilio integration in M5 (voice half) + D2 / M7 (number import). Webhook handler resolves `channel_endpoints` by E.164 → workspace + agent → returns TwiML `<Connect><Stream url=publicStreamUrl>`. Twilio opens WSS to `publicStreamUrl`; Worker proxies into `WorkspaceVoiceDO`; DO ensures Container is alive; Container speaks AriaFlow. `LlmGateway` wired through Cloudflare AI Gateway with per-workspace routing per `HEXAGONAL_ARCHITECTURE.md §2.8`. Per-call `voice_calls` row, recording uploaded to R2 via `BlobStore` port. | A sandbox Twilio number rings through; agent's TTS audible within 3 s cold / 600 ms warm. Recording lands in R2; `voice_calls.recordingStorageKey` set; transcript captured in `conversation_turns`. |
| S4-03 | F3 supervisor live wiring. `RuntimePlatformDiagnostics.attachSupervisor()` returns a WebSocket from the DO that fans audio-tap + turn events. `apps/web/src/hooks/api/supervisor.ts` exports `useLiveConversation(conversationId)` and `useSupervisorActions(conversationId)` (`nudge`, `takeOver`, `endCall`). Polling fallback on `runtime_sessions.sequenceNumber` per `USER_JOURNEYS.md §6` activates on WebSocket drop. Each operator action writes `audit_log_events`. | Lag from spoken word to F3 transcript ≤ 1.5 s p95 over a 60-second test call. Nudge round-trip (operator types → next agent turn embeds the nudge) ≤ 4 s. Disconnect/reconnect of the WebSocket recovers within 2 s; missed turns backfill via sequenceNumber polling. |
| S4-04 | First-call onboarding wired end-to-end (Journey 1 from `USER_JOURNEYS.md §3`). A1 sign-in → A3 onboarding (vertical / region / environment) → A4 templates (filtered by vertical, seeded from S1-06) → editor opens with auto-published draft → M5 Twilio half (claim or BYOC) → D2 attaches number → A5/B1 home → owner dials own number → first call card on B1. Auto-claim Twilio number on workspace creation when feasible (else inline buy-flow). | A fresh sign-up reaches first answered call in ≤ 5 min median over 5 trial runs (SLO #1). Recording attached. |
| S4-05 | Load test: 40 concurrent calls per workspace (per `scripts/sink-spike/FINDINGS.md` peak target). Hits `MessageQueue` at ~600 events/s/workspace. Asserts: no projector backlog > 1 s p95, no DO heartbeat gap > 10 s, no Container OOM, F3 lag SLO holds under load. Captured into `sprints/sprint-4/artifacts/load-40-concurrent.txt`. | All four assertions hold. Backlog graphs and percentiles attached. |

**Demo:** Recorded 5-minute screen + audio: fresh sign-up → template → number attached → dial own number → F3 supervisor open in another tab showing live transcript + working memory + active node. Then a second tab with 40 simulated callers in parallel (load harness) confirming the metrics. Persona: **Owner-Operator + End-User Caller** — trust moment "It actually answered, and it sounded like a person who could help."

**Dependencies:** Sprint 3.

**Source RFC §:** `INTERFACE_DESIGNS_RuntimeHost.md §5` (the `VoiceRuntimeHost` half + diagnostics), `DATA_MODEL.md §9` (`runtime_deployments` lifecycle, `voice_calls` sidecar), `USER_JOURNEYS.md §3` (Journey 1), `USER_JOURNEYS.md §6` (Journey 4 + F3), `USER_JOURNEYS.md §9a` (the voice caller experience), `USER_JOURNEYS.md §10b` (cold-start mechanics), `USER_JOURNEYS.md §2` SLOs #1 + #3.

**Sprint-specific risks:**
- CF Container cold-start exceeds 3 s under real load → detection: S4-01 timing + S4-05 load test; mitigation: pre-warm cron based on observed call patterns per `USER_JOURNEYS.md §10b`.
- Twilio Media Streams WSS protocol drift since aria-flow's last integration → detection: S4-02 integration test against sandbox Twilio; mitigation: pin Twilio SDK and document the WSS frame format inline.
- F3 WebSocket fanout backpressure under burst → detection: S4-05 load test; mitigation: drop-oldest policy on the diagnostics tap; document in `RuntimePlatformDiagnostics` interface.
- AI Gateway rate limits on per-workspace routing → detection: 429 surfaces in `usage_events.errorMessage`; mitigation: `LlmGateway.checkQuota` already in the port shape from S0.

**Exit criteria:** all stories Done; WARMDOWN written; HANDOFF prepared.

---

### Sprint 5 — Polish + 1.0

**Goal:** Lock discipline gates, complete the Node platform adapter so both-adapters CI is meaningful, ship RLS + compliance evaluator + monthly receipts + cold archive, publish the OpenAPI spec at `/docs` via Scalar, and prove the failure-mode user stories from `USER_JOURNEYS.md §12`.

| Story | Description | DoD |
|-------|-------------|------|
| S5-01 | Node platform adapter implementations for all 8 ports (`packages/platform/node/`). KvStore = ioredis. BlobStore = `@aws-sdk/client-s3` against R2 or S3. MessageQueue = BullMQ on Redis. RuntimeHost (messaging) = pooled Bun service with consistent-hash routing. RuntimeHost (voice) = Fly Machines API + scheduler. ActorHost = pooled Bun + Redis. AuthAdapter = better-auth's Node binding. LlmGateway = AI Gateway URL (works from anywhere). Run the same one-shot port-contract test that the memory adapter passes. | All 8 Node implementations pass the same contract test as memory (port equivalence, per `HEXAGONAL_ARCHITECTURE.md §6 rule 4`). The "both adapters compile every PR" CI gate becomes meaningful — a deliberate Node-only break fails CI. |
| S5-02 | RLS via `CREATE POLICY` per `DATA_MODEL.md §3`. Two GUCs: `app.workspace_id`, `app.workspace_role`. Stricter policy on `secrets` and `channel_connections.credentialsSecretId` (owner+admin only). Smoke test that proves cross-workspace `SELECT` on `agents` returns 0 rows when the GUC is set to a different workspace. | RLS enabled in production migration. The smoke test catches a deliberate cross-workspace leak. `withWorkspace()` middleware sets the GUCs at the start of every request. |
| S5-03 | Compliance evaluator cron — refresh `workspace_compliance_posture` every 15 min per `DATA_MODEL.md §12`. Reads `audit_log_events` + `agent_guardrails` + `agent_versions.snapshot.complianceConfig` + `secrets.rotatedAt`. Writes `compliance_evaluations` (append-only). Audit-log monthly partitioning automation: cron creates next month's partition on the 25th of every month. Cold-archive worker per `DATA_MODEL.md §11`: 90-day-old partitions archive to S3 Glacier IR with `audit_log_events_archive_index` for per-event lookup. | Posture refreshes visible in I4 within 15 min of a triggering event. Cold-archive lookup completes < 5 s for any single event per `USER_JOURNEYS.md §8`. |
| S5-04 | Monthly receipts cron per `DATA_MODEL.md §13`. Aggregates `usage_events` + `conversation_evals` + per-agent breakdown into `monthly_receipts.perAgent` jsonb. Generates PDF, uploads to R2 at `monthly_receipts.pdfStorageKey`. L5 ROI receipt page wired via `apps/web/src/hooks/api/receipts.ts`: `useMonthlyReceipt(month)` + `useReceiptPdfUrl(month)` (signed URL via `BlobStore.signedUrl`). | A real receipt for a seeded month renders at `/revenue/receipt/2026-04` matching the existing A4-artboard mock. PDF downloads. Recovered-revenue + ROI-multiplier numbers tie out to the `usage_events` math. |
| S5-05 | Production OpenAPI hosted at `/docs` via Scalar reference UI. Public docs deploy on push to `main`. `@kuralle/api-client` published at v1.0.0 (private registry; semver baseline established). RFC amendment log review: every WBS-vs-source-doc divergence accumulated across S0–S4 either lands as an explicit amendment or is reverted. | `/docs` renders the live spec. Client semver baseline documented in `packages/api-client/CHANGELOG.md`. Amendment log empty after closeout (or explicitly accepted by the user). |
| S5-06 | Failure-mode E2E tests from `USER_JOURNEYS.md §12`. (a) Publish bad version → one-click rollback in < 30 s. (b) Container crash mid-call → caller hears recovery phrase; old `conversations` row preserved with `outcome='dropped'`; new row continues from last `session_checkpoints`. (c) Auditor query path: cross-reference `audit_log_events` × `agent_versions.complianceMode` × `conversations.agentVersionId` to prove no PHI leaked outside HIPAA mode. (d) Caller-disputed-charge flow: F1 filter to caller's number → F2 transcript + recording + `usage_events` aggregate. | All four scenarios pass automated E2E tests; recordings attached to the closeout commit. |

**Demo:** Three-part recording. (1) `/docs` rendering the live OpenAPI in Scalar with a live "Try it" call against the sandbox. (2) The L5 ROI receipt for one seeded month with the PDF download. (3) The four failure-mode E2E tests running green in CI alongside both-adapters compile + RLS smoke. Persona: **Compliance Officer** + **Owner-Operator on day 30** — trust moment "I have evidence, not promises."

**Dependencies:** Sprint 4.

**Source RFC §:** `HEXAGONAL_ARCHITECTURE.md §6 rule 2` (both adapters in CI), `DATA_MODEL.md §3` (RLS deferred), `DATA_MODEL.md §11` (audit-log archive), `DATA_MODEL.md §12` (compliance evaluator), `DATA_MODEL.md §13` (receipts), `USER_JOURNEYS.md §8` (Journey 6 compliance), `USER_JOURNEYS.md §11` (Day-30 ROI), `USER_JOURNEYS.md §12` (failure-mode user stories).

**Sprint-specific risks:**
- Node adapter parity is harder than expected (e.g., DO-style hibernation has no clean Node analog) → detection: S5-01 contract test; mitigation: documented "approximate parity" caveat in `RuntimeHost` shape if needed; sprint extends ≤ 1 day rather than carrying.
- RLS policies subtly conflict with better-auth's queries (it owns its own connection) → detection: S5-02 smoke test plus auth flows; mitigation: better-auth runs on a non-RLS-bound role, documented exemption.
- Cold-archive lookup latency exceeds the 5 s target → detection: S5-03 lookup test; mitigation: hot-cache the `audit_log_events_archive_index` lookup column.
- PDF generation fragile on Workers runtime → detection: S5-04 unit test; mitigation: PDF generation runs on Node adapter via a queue job; CF only triggers it.

**Exit criteria:** all stories Done; WARMDOWN written; HANDOFF prepared. **Project ships 1.0** at the end of this sprint — STATE.md is updated to "post-1.0 maintenance" rather than pointing at sprint 6.

---

## 4. Backlog (deferred to v1.x or v2)

| ID | Item | Earliest | Source RFC § |
|----|------|----------|--------------|
| BL-01 | `prompt_blocks` + `prompt_block_versions` for reusable instruction fragments | v2 | DATA_MODEL.md §18 (Defer) |
| BL-02 | `workspace_policies` two-tier guardrail inheritance | v2 | DATA_MODEL.md §18 (Defer) |
| BL-03 | Conditional variants in `agent_versions.snapshot` jsonb | v2 | DATA_MODEL.md §18 (Defer) |
| BL-04 | `agent_versions.projectionsReady` async projection worker | v1.1 (when publish p95 > 200 ms) | DATA_MODEL.md §5 |
| BL-05 | Codegen bundle worker (compile `agent_versions` to a Worker bundle) | v1.x | DATA_MODEL.md §5 (columns already nullable) |
| BL-06 | Multi-region sharding (per-region clusters; data-locality middleware) | v2 | DATA_MODEL.md §15 |
| BL-07 | Vectorize migration for `kb_chunks` | trigger when chunks > 10M rows OR ivfflat p95 > 50 ms | DATA_MODEL.md §4 |
| BL-08 | CRDT layer for multi-author live editing of agents | v2 | INTERFACE_DESIGNS_RuntimeHost.md §D footnote |
| BL-09 | Native mobile app for operators | out of scope v1 | USER_JOURNEYS.md §14 |
| BL-10 | API-first developer-customer journey + public SDK (consumes the committed `openapi.json` via `openapi-typescript`; the frontend's `@orpc/tanstack-query` choice does not constrain external consumers — see AMENDMENT-001) | v1.x | USER_JOURNEYS.md §14 |
| BL-11 | SMS channel via Twilio (modeled in §8 already) | v1.1 | DATA_MODEL.md §8 |
| BL-12 | Messenger + Instagram channels | v1.1 | DATA_MODEL.md §8 |
| BL-13 | LiveKit voice fallback | v2 | DATA_MODEL.md §9 |
| BL-14 | k8s `RuntimeHost` adapter for enterprise on-prem | v2, on enterprise demand | INTERFACE_DESIGNS_RuntimeHost.md §5 |
| BL-15 | Hyperdrive in front of Neon for projector hot path | trigger when projector backlog p95 > 1 s | this WBS S0 decision note |
| BL-16 | In-product self-serve plan upgrade carousel | post-MVP | USER_JOURNEYS.md §14 |
| BL-17 | Native AriaFlow `Hooks` interception (custom event taxonomy expansion) | v1.x | scripts/sink-spike/FINDINGS.md (notable absences) |

---

## 5. Risks tracked across sprints

| Risk | Sprint(s) it materializes | Owner | Mitigation |
|------|---------------------------|-------|------------|
| Better-auth + Workers + Neon HTTP combination subtly broken (cookies, `crossSubDomainCookies`, `node_compat`) | S0 | manager | S0-03 sign-up E2E test is the gate; if it fails, replan §3 — swap auth lib or wait on better-auth's Workers adapter. Per DATA_MODEL.md §19 step 1, codegen is paused until this clears. |
| OpenAPI drift between live router and committed spec | S0 onward | manager | CI step in S0-04 fails on drift. Every router PR regenerates the spec. Lint forbids out-of-band edits to `openapi.json`. |
| Hexagonal discipline drifts (CF-isms leak into `core/`) | S0 onward | r1 / r2 reviewers | ESLint rule from S0-06 + r1/r2 review of every PR catches imports. CI fails if Node adapter doesn't compile. |
| AriaFlow API churn between sink-spike and runtime adapter | S2 / S3 | manager | ACL in `runtime/adapter/` insulates domain. Pin AriaFlow version; track upstream changelog in WARMDOWN. |
| Synchronous projection latency exceeds 200 ms p95 | S2 | manager | Schema accommodates async via `projectionsReady` (BL-04). S2-05 is the SLO test. |
| `pgvector` ivfflat p95 > 50 ms | S5 / post-MVP | manager | Migration plan to Vectorize is documented (BL-07). |
| CF Container cold-start > 3 s under load | S4 | manager | Pre-warm cron; load test in S4-05; document in `USER_JOURNEYS.md §10b`. |
| Twilio Media Streams protocol drift | S4 | manager | Pin Twilio SDK; integration test in S4-02. |
| RLS policies conflict with better-auth queries | S5 | manager | Better-auth runs on a non-RLS role; documented exemption tested in S5-02. |
| Node adapter parity gaps (no clean DO-hibernation analog) | S5 | manager | Documented "approximate parity" in `RuntimeHost`; sprint extends ≤ 1 day rather than carrying. |
| Manager fix passes accumulate undocumented drift from RFC | S0 onward | manager | Amendment log review is a story in S5 (S5-05). Every WARMDOWN names amendments explicitly. |
| Frontend hook-wrapper rule violated by ad-hoc client use | S0 onward | r1 reviewers | ESLint rule from S0-05 forbids `@kuralle/api-client` imports outside `apps/web/src/hooks/api/**`; r1 enforces no-bypass in PRs. |

---

## 6. The role of this document

This WBS is the *plan*, not the *prompt*. The prompt that any new session uses to advance the project one sprint lives at [`./SESSION_KICKOFF_PROMPT.md`](./SESSION_KICKOFF_PROMPT.md). The current sprint pointer lives at [`./STATE.md`](./STATE.md). Templates for the per-sprint artifacts live under [`./templates/`](./templates/).

When this WBS conflicts with the source RFC(s), **the RFC(s) win** — amend this document in the same PR.
