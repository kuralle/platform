# Handoff — Sprint 2 → Sprint 3

> **One page. Read this before doing anything else.** Depth lives in [`WARMDOWN.md`](./WARMDOWN.md); this is the read-me-first.

---

## State of the world (one paragraph)

Sprint 2 (Editor IR pipeline) is complete. **Owner-Operator can edit and publish an agent through C2/C3/C8** — auto-save fires every 30 s debounced via `agents.autoSave`; publish opens the §4 confirmation modal, then runs a Drizzle transaction that derives `parentVersionId` + `versionNumber` via uncached SELECTs inside the transaction (codex r2 R2-2 fix), inserts `agent_versions` with `versionKind='publish'`, runs `projectAgent(tx, ...)` to write 6 projection tables in deterministic order, swaps `agents.activeVersionId`, commits, then invalidates the identity-map cache. Sticky bar transitions Idle → Saving → Saved → Publishing → Live. Sub-second SLO holds at p95 = 2.3 ms (1000 ms threshold; 434× headroom). `@kuralle/core` and `@kuralle/runtime` are new packages; 9 frontend hooks ship (4 agent + 5 read-only resource); 5 mock-driven screens unwired; OpenAPI grew 13 → 17 operations + 11 list-router row schemas; three RFC amendments ratified (AMENDMENT-003 scorer fields, AMENDMENT-004 workflow key, AMENDMENT-005 `usage_events.payload`).

---

## Sprint 3 goal (verbatim from WBS)

> **A real WhatsApp inbound message is received, routed by E.164 to a workspace+agent, processed by an AriaFlow-backed MessagingDO via the runtime adapter, and persisted via Cloudflare Queue → projector worker into `conversations` + `conversation_turns` + `usage_events`; F1 list and F2 detail render the live conversation through generated hooks.**

The full sprint section is at `sprints/WBS.md` § Sprint 3 (stories S3-01 through S3-06).

---

## Read these first (in this order, before delegating any story)

1. `sprints/STATE.md` — confirms the active sprint and the load-bearing reading list.
2. `sprints/WBS.md` § Sprint 3 (S3-01 .. S3-06).
3. `sprints/sprint-2/WARMDOWN.md` — depth on what shipped + carry-forwards (especially §4 known issues, §8 backlog updates, §9 retrospective).
4. `sprints/AMENDMENT-003.md`, `AMENDMENT-004.md`, `AMENDMENT-005.md` — the three S2 amendments. Plus `AMENDMENT-001.md` (frontend client) and `AMENDMENT-002.md` (apikey) still in flight.
5. `DATA_MODEL.md §8` — channels (S3-01 builds Meta WhatsApp connector wizard); §9 (conversations + voice_calls + messaging_threads + conversation_turns + runtime_sessions + session_checkpoints + runtime_deployments — the conversation graph S3-04 lands); §14 (sink architecture — 16 sharded queues for the projector worker).
6. `INTERFACE_DESIGNS_RuntimeHost.md §5` — the synthesis chosen for `RuntimeHost`. S3 ships the messaging half (`MessagingRuntimeHost`); S4 ships voice. §C describes DO hibernation.
7. `USER_JOURNEYS.md §5 (3b)` — the M5 connector wizard for WhatsApp; `§9b` (the WhatsApp messager journey).
8. `scripts/sink-spike/FINDINGS.md` — empirical AriaFlow event volumes (~7 events/turn at message mode; ~9 hooks/turn). The S3-02 adapter brief pins to these.
9. `packages/core/src/repositories/agent.ts` — verify the publishVersion → projectAgent → activeVersionId swap pattern; the S3 conversation projector mirrors the same shape (open tx → insert → project → commit → invalidate).
10. `packages/core/src/repositories/conversation.ts` — read-only repository today; S3-04 expands it with the projector wiring.
11. `apps/server/openapi.json` — current canonical contract from S2 (17 operations). S3-01 adds 5 channel procedures (`channels.connect`, `channels.endpoints.list/attach/detach`, `channels.list` exists). S3-05 adds `conversations.list/get/live` (3 procedures).
12. `apps/web/src/hooks/api/conversations.ts` — currently a `useConversations` query wrapper around `conversations.list`. S3-05 extends with `useConversation(id)` (detail) and `useConversationLive(id)` (streaming/polling fallback).

---

## Traps to know about

- **Append-only DB enforcement scope** (carried from S1's amendment) — the trigger applies ONLY to `agent_versions`. `conversation_turns` is "append-only by app-layer + sink discipline", not DB-enforced. **Don't add UPDATE-blocking triggers to it in S3** — the projector legitimately re-reads + updates eval verdicts on completed turns.
- **The publish handler's transactional pattern is the conversation projector's blueprint.** `agents.publish` opens a tx, inserts a version, runs a projector, swaps a pointer, commits, invalidates. The S3-04 `conversations` projector mirrors the same shape: insert turn rows in deterministic order, never bypass the `(channel_endpoint_id, message_id)` dedup unique index, fire-and-forget cache invalidation after commit.
- **Hooks-only frontend access** rule (S0-05 + S2-04 reinforcement). The forbidden-mock-import ESLint rule now actually exists; F1/F2 wiring in S3-05 must drop `@/mocks` imports from production screens. The 8 still-deferred screens listed in `eslint.config.mjs` `ignores` will need cleanup as their respective sprints land.
- **OpenAPI is the contract.** `bun -F server gen:openapi --check` is wired; any router PR regenerates `apps/server/openapi.json` and CI gates the drift. **S3 grows OpenAPI by ~8 operations** (5 channel procs + 3 conversation procs).
- **Per-story-kimi-gate flow is the default** (per `feedback_per_story_kimi_review.md`). Each IC commit gets a kimi gate review, manager fix-pass, THEN next IC fires. The user can override to "batch gates after the last IC" if time pressure justifies it (per `feedback_batch_gates_when_speed_matters.md`).
- **Cursor pagination is implemented for `agents.list/history` only**. The 10 other list operations still ignore the cursor input. `BL-S2-CURSOR-PAGINATION-OTHER-ROUTERS` tracks. S3 should NOT add new unimplemented cursor parameters; either implement or remove from input.
- **`useTelephony` and `usePhoneNumbers` aliases `channels.list`** with no filtering. S3-01 should ship dedicated channel-by-kind filter or rewrite the hooks.
- **Pre-existing `client.query()` raw SQL fixture inserts** in runtime tests (`packages/runtime/src/projector/agent.test.ts:53,70,83,513,632`). S3 conversation tests should follow the new `seedWorkspace(db, opts)` pattern from `packages/core/src/test-utils.ts`. Tracked as `BL-S2-RAW-SQL-FIXTURE-CLEANUP`.
- **Migration discipline going forward**: drizzle-kit-generate for typed schema diffs, hand-authored `_meta.sql` / `_fix.sql` siblings for CHECK / triggers / partitions / RLS. S3 ships several runtime sidecar tables that drizzle-kit can emit; the polymorphic CHECK trigger on `channel_endpoints.channelKind ↔ channel_connections.channelKind` (DATA_MODEL §15) is hand-authored.
- **AMENDMENT-005 (`usage_events.payload`)** is forward-compatible with billing rows. S3's projector will write `usage_events` for billing kinds (`llm_input_tokens`, `tts_seconds`, etc.) — those leave `payload` NULL. The S5-04 monthly-receipt cron should filter by kind.

---

## Open issues that block sprint 3

| Issue | Severity | Status |
|-------|----------|--------|
| (none) | — | S3 is unblocked. The repository layer + projector pattern + transactional publish are all proven; conversation work is incremental. |

The Codegen Gate-Partial (`sprints/sprint-0/GATE-PARTIAL.md`) does NOT block S3. S3 builds against local Postgres + memory adapters; Workers + Cloudflare Queues + Durable Objects integration tests need the `BL-S0-01` Neon credentials before they can run end-to-end. **S3-03 specifically (Cloudflare adapter for `MessagingRuntimeHost`)** will need either CF preview credentials or a `wrangler dev` setup — surface this in S3 planning.

---

## Start by running

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle && \
  cat sprints/STATE.md && \
  bun install --frozen-lockfile 2>&1 | tail -3 && \
  bun run check-types --force 2>&1 | tail -3 && \
  bun run lint 2>&1 | tail -3 && \
  bun -F @kuralle/core test 2>&1 | tail -5 && \
  bun -F @kuralle/runtime test 2>&1 | tail -5 && \
  bun -F server test 2>&1 | tail -5 && \
  bun -F web test 2>&1 | tail -5 && \
  bun -F server gen:openapi --check 2>&1 | tail -3 && \
  echo "✅ S2 baseline confirmed; S3 ready"
```

Expect: 8/8 check-types, 0 lint errors (1 pre-existing warning), 58/58 core, 6/6 runtime, 16/16 server, 55/55 web, OpenAPI drift green.

If the runtime test flakes once on first run (rare PK-collision in fast-check), re-run — `[S2-fix]` switched to `crypto.randomUUID` but the property test's worst-case scheduling can still be unlucky. Tracked as `BL-S2-FASTCHECK-ID-FLAKE` (closed but watch).

---

## When you're done

End the session after the warm-down. The next session pastes `sprints/SESSION_KICKOFF_PROMPT.md` and picks up from `sprints/STATE.md`.
