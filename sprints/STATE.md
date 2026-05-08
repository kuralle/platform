# Project State

> **Single source of truth for "where are we right now."** Updated at the end of every sprint warm-down.

---

## Active sprint

**Sprint number:** `4`
**Sprint name:** Voice + supervisor
**Status:** `not-started`
**Goal:** Owner-Operator dials their assigned Twilio number, the agent answers within 3 s cold or 600 ms warm, transcript streams into F3 with ≤ 1.5 s lag (USER_JOURNEYS §2 SLO #3), and the full 5-min-to-first-call promise (SLO #1) holds end-to-end through a recorded demo.
**WBS section:** [`sprints/WBS.md` § Sprint 4](./WBS.md)

## Load-bearing reading for sprint 4

The session running sprint 4 must read these in this order before delegating any story:

1. `sprints/WBS.md` § Sprint 4 (S4-01 .. S4-05) — full read; this is the plan.
2. `sprints/SESSION_KICKOFF_PROMPT.md` — the loop you are running.
3. `sprints/sprint-3/HANDOFF.md` — read-me-first; one page; the carry-overs and traps. Especially BL-S3-01 (production `loadAgentIr` deps maps directly to S4-01 design).
4. `sprints/sprint-3/WARMDOWN.md` — depth on what's working / not / decisions / metrics. Especially §4 (KI-3-01 onChatMessage gap maps to BL-S3-01), §6 (metrics), §7 (backlog BL-S3-01..05), §8 (retrospective; especially try-next about pre-flighting workerd tests for DO code).
5. `sprints/AMENDMENT-001.md` (frontend client = `@orpc/tanstack-query`) and `sprints/AMENDMENT-002.md` (apikey divergence) — still in flight.
6. `sprints/AMENDMENT-003.md` (scorer per-criterion fields), `AMENDMENT-004.md` (workflow top-level key), `AMENDMENT-005.md` (`usage_events.payload jsonb` + `'slo_violation'` kind) — load-bearing for S4-05 load test telemetry.
7. **`INTERFACE_DESIGNS_RuntimeHost.md §5`** — synthesis chosen for `RuntimeHost`; **S4 ships the voice half (`VoiceRuntimeHost`)** mirroring the messaging-half pattern from S3-03. **§C** — DO hibernation contract; same shape applies to `WorkspaceVoiceDO`.
8. **`USER_JOURNEYS.md §3`** — Journey 1 (the 5-min first-call promise; SLO #1). **`§9a`** — voice caller experience. **`§10b`** — cold-start mechanics + pre-warm cron.
9. `USER_JOURNEYS.md §6` — Journey 4 + F3 supervisor. F3 wiring lands in S4-03.
10. `USER_JOURNEYS.md §2` — SLOs #1 (5-min first-call) and #3 (≤ 1.5 s F3 lag). Both gated by S4 stories.
11. `DATA_MODEL.md §9` — `runtime_deployments` lifecycle (`provisioning → ready → draining → terminated`), `voice_calls` sidecar, `session_checkpoints`. S4-01 lands the runtime_deployments lifecycle DO management.
12. `HEXAGONAL_ARCHITECTURE.md §2.8` — `LlmGateway` per-workspace routing via Cloudflare AI Gateway. S4-02 wires this.
13. `scripts/sink-spike/FINDINGS.md` — voice extrapolation (~200-400 events per call at `eventMode='message'`; ~600 events/s/workspace at peak 40-concurrent target). S4-05 load test pins to these.
14. **`apps/server/src/durable-objects/MessagingDO.ts`** — read FULLY (post-`[S3-fix-2]` state). The `WorkspaceVoiceDO` mirrors the same `AriaFlowAgent` subclass + dep-injection (`__messagingDODeps`) + `state.blockConcurrencyWhile`-gated DB restore + `onChatMessage` invocation discipline. `processInbound` lines 172-198 are the reusable pattern for triggering the agent loop from a non-WebSocket event.
15. **`apps/server/src/__tests__/slo-do-real-loop.test.ts`** + **`apps/server/vitest.slo.do.config.ts`** — workerd-backed test pattern via `@cloudflare/vitest-pool-workers@0.16.3`. **S4-01 must use this from day one** — do not wait for a kimi gate to discover plain Node vitest can't load CF-runtime types.
16. `apps/server/wrangler.jsonc` — `new_sqlite_classes` migration pattern (changed from `new_classes` in `[S3-fix]`). S4's `WorkspaceVoiceDO` will follow the same pattern if it extends an `AIChatAgent` base.
17. `packages/runtime/src/adapter/hooks.ts` + `events.ts` — the AriaFlow adapter with turnId-threading. S4 voice events likely reuse the same `MessagingEvent` discriminated union; if voice needs additional variants (e.g., `audio.tap`, `barge.in`), extend the schema rather than duplicating.
18. `packages/runtime/src/projector/conversation.ts` — `ensureTurnRow` + turnId-keyed associations. Voice-side projection of `voice_calls` mirrors this pattern.
19. `packages/runtime/src/instrumentation/slo.ts` — existing `SLO_PUBLISH_*`, `SLO_PROJECTOR_LAG_*`, `SLO_WHATSAPP_E2E_*`. S4 adds `SLO_VOICE_FIRST_CALL_*` (5-min target) and `SLO_F3_LAG_*` (≤1.5s target).
20. `apps/server/openapi.json` — current canonical contract (23 ops post-S3); S4-02 grows it with Twilio webhook procedure(s); S4-03 with supervisor procedures.

## Last completed sprint

`3` — First channel + first conversation.

## Last completed at

`2026-05-08` (single-session sprint; condensed from the WBS-default 1-week cadence).

## Sprint history

| Sprint | Status | Completed at | Warmdown |
|--------|--------|--------------|----------|
| 0 | complete | 2026-05-07 | [`sprint-0/WARMDOWN.md`](./sprint-0/WARMDOWN.md) |
| 1 | complete | 2026-05-07 | [`sprint-1/WARMDOWN.md`](./sprint-1/WARMDOWN.md) |
| 2 | complete | 2026-05-08 | [`sprint-2/WARMDOWN.md`](./sprint-2/WARMDOWN.md) |
| 3 | complete | 2026-05-08 | [`sprint-3/WARMDOWN.md`](./sprint-3/WARMDOWN.md) |
| 4 | not-started | — | — |

When a sprint completes, append a row here from `WARMDOWN.md`.

## Backlog deltas this project life

- **BL-S0-01:** provision Neon DB + close Workers+Neon-HTTP runtime gate. Source: `sprints/sprint-0/GATE-PARTIAL.md`. Earliest landing: any sprint after credentials available.
- **BL-S0-02:** ~~enum CHECK constraints supplement migration.~~ **Closed** in S1-01-fix (`cc87911`).
- **BL-S0-03:** split `@kuralle/env` so `apps/web` doesn't traverse `cloudflare:workers` types. Source: S0 r1 m3 / r2 §3. Earliest landing: S2 architectural cleanup.
- **BL-S0-04:** replace 3 global ESLint relaxations with file-scoped overrides + clear the 6-file `ignores` list in `eslint.config.mjs`. Earliest landing: S2 cleanup.
- **BL-S0-05:** `apikey.revoked_at` supplement migration if/when distinct-from-`enabled`/`expiresAt` is needed. Earliest landing: post-MVP.
- **BL-S0-06:** ~~assign explicit completion sprint for stub routers.~~ **Closed** in S1-05 (all 11 router groups landed).
- **BL-S1-WIRE-REMAINING-HOOKS:** ~~wire 5 read-only hooks + replace mock imports.~~ **Closed** in S2-04 (`cc5ed5b`).
- **BL-S1-OPENAPI-ITEM-SCHEMAS:** ~~replace `z.array(z.unknown())` with full Zod row schemas across 11 routers.~~ **Closed** in S2-03 (`3b8ecd4`).
- **BL-S1-AUDIT-ROLLOVER:** add monthly cron OR quarterly migration cadence to keep `audit_log_events` partitions ahead of the project clock. Currently 14 months runway through 2027-06. Earliest landing: any sprint with ops-tooling work (likely S5).
- **BL-S1-VECTOR-ROUNDTRIP-TEST:** ~~vector `toDriver`/`fromDriver` round-trip test.~~ **Closed** in S2-01 (`d1aec2c`); KbDocumentRepository tests cover populated + null embeddings.
- **BL-S2-CURSOR-PAGINATION-OTHER-ROUTERS:** `agents.list/history` paginate; the other 10 list operations still ignore the cursor input. Source: `sprint-2/review-sprint-r2.md` R2-4 partial. Earliest landing: whichever sprint hits volume needing it (likely S3 conversations.list).
- **BL-S2-TELEPHONY-CHANNEL-FILTER:** `useTelephony` and `usePhoneNumbers` alias `channels.list` with no filter. Source: `sprint-2/WARMDOWN.md §4 KI-2-03`. Earliest landing: S3-01 (channel-by-kind filter or dedicated routers).
- **BL-S2-MUTATION-INVALIDATE-COVERAGE:** `useAgentPublish` invalidates `agents.list` queries; not `agents.get/history`. Hook-level invalidation needs a sweep. Earliest landing: future UX-polish sprint.
- **BL-S2-FORBIDDEN-MOCK-IGNORE-EXPIRY:** the 8 deferred screens in `eslint.config.mjs:75-87` `ignores` array have no expiry enforcement. Source: codex r2 nit. Earliest landing: a future ops/discipline sprint.
- **BL-S2-RAW-SQL-FIXTURE-CLEANUP:** runtime test setup uses raw `client.query("INSERT INTO agents/tools/kb_documents ...")` for fixture inserts. `test-utils.ts` is converted; runtime tests defer for volume. Source: manager finding (user-flagged). Earliest landing: any sprint with test-quality scope.
- **BL-S3-01:** wire production-grade `loadAgentIr` + `resolveModel` deps so `MessagingDO.processInbound` generates assistant turns from inbound webhook events. (Currently caller turn only.) Maps directly to S4-01 — voice runtime owns the broader runtime-invocation question. Source: `sprints/sprint-3/WARMDOWN.md §4 KI-3-01`.
- **BL-S3-02:** workspace `bun run check-types --force` RC investigation. Suspected `@ariaflowagents/cf-agent` deep type chain × drizzle partial-index inference. Mitigated by per-package memory rule. Earliest landing: standalone spike before S5.
- **BL-S3-03:** `packages/platform/src/node/message-queue.test.ts` ioredis-mock integration OR drop the dep. Earliest landing: any sprint with platform polish.
- **BL-S3-04:** extract `RuntimeTx` driver union (currently imports both `drizzle-orm/neon-http` and `drizzle-orm/node-postgres` directly in `packages/runtime/src/projector/conversation.ts`) to a shared internal types file. Earliest landing: any sprint with runtime polish.
- **BL-S3-05:** extend `slo-do-real-loop.test.ts` to 10-trial p95 once `onChatMessage` invocation is wired with deterministic test model + agent IR. Follow-up to BL-S3-01.
- **BL-S3-06:** ~~local `wrangler dev` fails because `apps/server/src/index.ts` uses `@neondatabase/serverless` (neon-http driver) under workerd but local `DATABASE_URL` is a plain Postgres TCP endpoint.~~ **Resolved 2026-05-09** by spinning up a Neon project (`kuralle-dev` / `silent-glade-76127740` / `aws-us-east-1`), applying all migrations, and pointing `apps/server/.env` `DATABASE_URL` at the Neon HTTP endpoint. F1 + F2 (read paths) verified end-to-end. Write-path transaction follow-up — see resolved BL-S3-08 below.
- **BL-S3-07:** F2 turn timestamps render as raw `MMMMMMMM:SS` (epoch-minutes:seconds, e.g. `29637777:26`) instead of relative or absolute time. Bug discovered during live verification 2026-05-09. Presentation-only; data is correct in DB. Earliest landing: any sprint with frontend polish.
- **BL-S3-08:** ~~`agents.publish` returns 500 against Neon HTTP — no transaction support in neon-http driver.~~ **Resolved 2026-05-09** by swapping `createDb()` from `drizzle-orm/neon-http` to `drizzle-orm/neon-serverless` (Pool, WebSocket) per Option A of `.handoff/proposal-neon-tx-fix.md`. Per-request Pool lifecycle via Hono middleware + `executionCtx.waitUntil(pool.end())` (canonical pattern from `rachhen/hono-drizzle-neon`). All six production transactional procedures (publishVersion, findOrCreateMessagingThread, connectWithCredentials, attachEndpoint, detachEndpoint, projector-worker) now run on the same driver. Live-verified end-to-end on Neon: `agents.publish` → 200 with versionId, atomic active-version pointer update, concurrent-publish race correctly emits CONFLICT (SQLSTATE 23505) on the loser → linear version graph preserved. Test suites green: core 72/72, runtime 59/59, server 26/26. Artifact: `sprints/sprint-3/artifacts/BL-S3-08-fix-verification.txt`. **Caveat:** apps/server per-package tsc was too slow to wait through (BL-S3-02 still open) — fix stands on test-suite + live-verification evidence above.
- **BL-S3-09 (cold-start agent creation has no UI):** the "New agent" button on `/agents` is hardcoded to navigate to `/agents/ag_a00/behavior` (`apps/web/src/routes/_app.agents.index.tsx:192`) — a fictional agent ID that does not exist in any workspace. The editor route then renders `Loading agent configuration…` indefinitely with no error UI when `agents.get` returns NOT_FOUND. There is also no `agents.create` procedure in `packages/api/src/routers/agents.ts` — only `agents.publish` (which requires a pre-existing agent shell). Net: an end user cannot create their first agent through the UI; agent rows must be inserted via SQL/seed. Earliest landing: any sprint that owns the agent onboarding flow.
- **BL-S3-10 (agents list hardcoded to `demo-workspace`):** `apps/web/src/routes/_app.agents.index.tsx:36` calls `useAgents({ workspaceId: "demo-workspace" })` — a hardcoded literal. The user's actual `activeOrganizationId` (from better-auth) is ignored. Result: even when `agents.list({ workspaceId: "ws_calderon_hvac" })` returns the seeded agent, the UI shows "No results" because it's querying the wrong workspace. Same hardcoding likely repeats across other resource lists. Earliest landing: a workspace-context wiring sprint (probably needs an `useActiveWorkspace()` hook plumbed through every page).

## Open RFC amendments

- `AMENDMENT-001.md` (accepted 2026-05-07, pre-Sprint-0) — Frontend client uses `@orpc/tanstack-query` instead of `openapi-fetch` + `openapi-react-query`. OpenAPI emission and drift CI unchanged.
- `AMENDMENT-002.md` (accepted 2026-05-07, during Sprint 0 closeout) — `apikey.organizationId` reduces to `referenceId`; `apikey.revokedAt` deferred.
- **`DATA_MODEL.md §15` append-only enforcement scope** (committed 2026-05-07 in `[S1-fix]` `f87e71b`) — DB-level UPDATE-blocking applies ONLY to `agent_versions`. Other "append-only" tables rely on app-layer + sink discipline. Inline amendment in `DATA_MODEL.md`; no separate AMENDMENT file.
- `AMENDMENT-003.md` (accepted 2026-05-07, during Sprint 2) — `scorerAttachments` IR shape extended with optional `name?`, `description?`, `kind?`, `rubric?` per-criterion fields so `agent_eval_criteria` projection rows hold editor-authored content.
- `AMENDMENT-004.md` (accepted 2026-05-07, during Sprint 2) — optional `workflow: { nodes, edges }?` top-level key on `agent_versions.snapshot` formalizes the §6 projection-table feed inside the §5 snapshot.
- `AMENDMENT-005.md` (accepted 2026-05-08, during Sprint 2) — `usage_events.payload jsonb` column + `'slo_violation'` `kind` CHECK extension. Forward-compatible with billing rows.

---

## How to use this file

- A new session reads this file **first** to know which sprint is active and which sections of which docs are load-bearing right now.
- The session running a sprint **does not edit this file mid-sprint**. Updates land at warm-down.
- At warm-down, the session updates: active sprint pointer, load-bearing reading for the next sprint, last-completed fields, sprint history table, backlog deltas, and any open RFC amendments.
