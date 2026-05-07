# Project State

> **Single source of truth for "where are we right now."** Updated at the end of every sprint warm-down.

---

## Active sprint

**Sprint number:** `3`
**Sprint name:** First channel + first conversation
**Status:** `not-started`
**Goal:** A real WhatsApp inbound message is received, routed by E.164 to a workspace+agent, processed by an AriaFlow-backed MessagingDO via the runtime adapter, and persisted via Cloudflare Queue → projector worker into `conversations` + `conversation_turns` + `usage_events`; F1 list and F2 detail render the live conversation through generated hooks.
**WBS section:** [`sprints/WBS.md` § Sprint 3](./WBS.md)

## Load-bearing reading for sprint 3

The session running sprint 3 must read these in this order before delegating any story:

1. `sprints/WBS.md` § Sprint 3 (S3-01 .. S3-06) — full read; this is the plan.
2. `sprints/SESSION_KICKOFF_PROMPT.md` — the loop you are running.
3. `sprints/sprint-2/HANDOFF.md` — read-me-first; one page; the carry-overs and traps.
4. `sprints/sprint-2/WARMDOWN.md` — depth on what's working / not / decisions / metrics. Especially §4 (known issues), §5 (decisions made — three RFC amendments), §8 (backlog updates), §9 (retrospective + try-next).
5. `sprints/AMENDMENT-001.md` (frontend client) and `sprints/AMENDMENT-002.md` (apikey divergence) — both still in flight.
6. `sprints/AMENDMENT-003.md` (scorer per-criterion fields), `AMENDMENT-004.md` (workflow top-level key), `AMENDMENT-005.md` (`usage_events.payload jsonb` + `'slo_violation'` kind) — three amendments ratified in S2; AMENDMENT-005 is load-bearing for any S3 telemetry that writes `usage_events`.
7. **`DATA_MODEL.md §8`** — channels (S3-01 builds Meta WhatsApp connector wizard; the polymorphic CHECK trigger on `channel_endpoints.channelKind ↔ channel_connections.channelKind` is in §15).
8. **`DATA_MODEL.md §9`** — conversations + voice_calls + messaging_threads + conversation_turns (with `messageId` dedup unique index) + runtime_sessions + session_checkpoints + runtime_deployments. The conversation graph S3-04 lands.
9. `DATA_MODEL.md §13` — `usage_events` (post-AMENDMENT-005). S3 projector writes billing kinds; `payload` left NULL for those.
10. **`DATA_MODEL.md §14`** — sink architecture: 16 sharded Cloudflare Queues, projector worker draining them. S3-04 ships this.
11. `DATA_MODEL.md §15` — append-only enforcement scope. The DB trigger applies ONLY to `agent_versions`. Don't add UPDATE-blocking triggers to `conversation_turns`.
12. `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer; `runtime/adapter/` is reserved for the AriaFlow translation. S3-02 lands `AgentIR` → `AriaFlow.AgentConfig` mapping.
13. `INTERFACE_DESIGNS_RuntimeHost.md §5` (synthesis chosen for `RuntimeHost`); §C (DO hibernation contract). S3 ships the messaging half (`MessagingRuntimeHost`); voice is S4.
14. `USER_JOURNEYS.md §5 (3b)` (M5 connector wizard for WhatsApp) + `§9b` (the WhatsApp messager journey).
15. `scripts/sink-spike/FINDINGS.md` — empirical AriaFlow event volumes (~7 events/turn at message mode; ~9 hooks/turn). The S3-02 adapter pins to these.
16. `packages/core/src/repositories/conversation.ts` — read-only repository today; S3-04 expands it with the projector wiring. **The publish path in `packages/core/src/repositories/agent.ts:170-225` is the blueprint for the conversations projector**: open tx → insert → project → swap → commit → fire-and-forget cache invalidate.
17. `packages/runtime/src/projector/agent.ts` — current synchronous projector pattern; S3 builds an analogous `conversation` projector with idempotent `messageId` dedup.
18. `packages/runtime/src/instrumentation/slo.ts` — `recordSloViolation` + named threshold constants. S3 may instrument additional SLOs (queue backlog, projector lag).
19. `apps/server/openapi.json` — current canonical contract (17 ops); S3-01 grows it with channel procedures; S3-05 with conversation hooks.
20. `apps/web/src/hooks/api/conversations.ts` — currently `useConversations` query. S3-05 extends with `useConversation`, `useConversationLive` (streaming or polling fallback per `USER_JOURNEYS.md §6`).

## Last completed sprint

`2` — Editor IR pipeline.

## Last completed at

`2026-05-08` (single-session sprint; condensed from the WBS-default 1-week cadence).

## Sprint history

| Sprint | Status | Completed at | Warmdown |
|--------|--------|--------------|----------|
| 0 | complete | 2026-05-07 | [`sprint-0/WARMDOWN.md`](./sprint-0/WARMDOWN.md) |
| 1 | complete | 2026-05-07 | [`sprint-1/WARMDOWN.md`](./sprint-1/WARMDOWN.md) |
| 2 | complete | 2026-05-08 | [`sprint-2/WARMDOWN.md`](./sprint-2/WARMDOWN.md) |
| 3 | not-started | — | — |

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
