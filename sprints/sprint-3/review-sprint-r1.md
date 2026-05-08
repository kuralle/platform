# Sprint 3 Review (r1, sandwich) — First channel + first conversation

> **Reviewer (main session):** Claude Opus 4.7 (1M context) · 2026-05-08
> **Diff under review:** `64eee66..HEAD` (Sprint 3 full arc — `[S2-close]` → `[S3-fix]`)
> **Stories covered:** S3-01..S3-06 + `[S3-01-fix]` + `[S3-fix]`
> **Per-story gates:** S3-01 kimi gate ran standalone with `[S3-01-fix]`; S3-02..06 gated together via the sprint-level kimi gate (verdict RED, all blockers + majors resolved in `[S3-fix]`).

---

## 1. Strengths — what shipped well

The sprint goal — *"WhatsApp inbound → AriaFlow MessagingDO via runtime adapter → Cloudflare Queue → projector → conversations + conversation_turns + usage_events; F1/F2 render the live conversation"* — is now achieved at the infrastructure-shape AND correctness level after `[S3-fix]`. Specifics:

- **Channels + Meta connector wizard (S3-01, `a110158` + `06f2ec5`).** ChannelRepository expansion is clean (endpoint-level CRUD + transactional `connectWithCredentials` / `attachEndpoint` / `detachEndpoint` composites that keep platform code out of `apps/web`); the polymorphic CHECK trigger renamed to canonical names (`0013_s3_01_meta.sql`); the M5 wizard wires `@ariaflowagents/messaging-meta`'s real `GraphAPIClient` + `verifySignature` (verbatim from installed `.d.ts`); `useTelephony` / `usePhoneNumbers` correctly switched to `kind: "voice"` after I caught the schema-CHECK mismatch in fix-pass.

- **AriaFlow runtime adapter (S3-02, `2970ee6`).** `packages/runtime/src/adapter/agent-config.ts:83` — pure `irToAgentConfig` with §5 line-citation comments; `events.ts` — 8-variant Zod-discriminated union with `.strict()` on every payload; `hooks.ts` — verbatim AriaFlow `HarnessHooks` keys (`onAgentStart` / `onAgentEnd` / `onStepStart` / `onStepEnd` / `onToolCall` / `onToolResult` / `onTokensUpdate` / `onMessage` / `onEnd`) with FINDINGS-citation comments and the text-delta double-emission bug honored. The 22-event 3-turn fixture aligns with FINDINGS' ~7 events/turn.

- **Cloudflare DO + webhook (S3-03, `41b806f`).** Real `AriaFlowAgent` subclass shape; `apps/server/wrangler.jsonc` declares all 16 queue producers + DO binding + Meta vars; HMAC verify covers good/bad signature + missing header + wrong verify token; `findOrCreateMessagingThread` idempotency in `ConversationRepository` is exemplary (test asserts two calls yield same row); `shardKeyForConversation` (FNV-1a) is deterministic and uniform-ish — used identically by S3-04's projector worker (cross-story consistency confirmed by kimi).

- **Projector + BullMQ adapter (S3-04, `976f3e7` + reworked in `[S3-fix]`).** Migration `0014_s3_04_conversation_turns_message_id_uidx.sql` adds the partial unique index on `(conversation_id, message_id) WHERE message_id IS NOT NULL` (the option-A schema decision when the original `(channel_endpoint_id, message_id)` was infeasible). 16-shard consumer with ack/nack-with-requeue-up-to-3 + clean `stop()` handle. After `[S3-fix]`: `ensureTurnRow` upsert + `tool_${turnId}_${toolCallId}` idempotency key + turnId-keyed associations replace the buggy `latestTurn` lookup. Tool-call idempotency is now collision-free across turns.

- **Conversations procedures + hooks + F1/F2 (S3-05, `1155207`).** Cursor pagination on `(startedAt DESC, id DESC)` with base64-JSON cursor token; `getDetail` 5-query bundle (per the documented choice in commit body); polling-fallback for `useConversationLive` because `eventIterator` is not exported by installed `@orpc/server` (verified in commit body); F1/F2 paths removed from `forbidden-mock-import` ignores. `apps/web/README.md` "Conversation live wiring" section documents the 1-Hz polling cadence per `USER_JOURNEYS.md §6`.

- **End-to-end SLO (S3-06, `97d24b1` + `[S3-fix]`).** After `[S3-fix]`, the SLO is split into two complementary tests, both real:
  - **Workerd-side `slo-do-real-loop.test.ts`** (via `@cloudflare/vitest-pool-workers@0.16.3` + `cloudflareTest` plugin) — loads the REAL `MessagingDO` (extending `AriaFlowAgent`) inside CF's runtime, fires an inbound envelope, asserts caller turn flowed through the real adapter, asserts working-memory persisted. **No stub of the DO; no mock of `AriaFlowAgent`.** This is the workerd-side proof the kimi gate's blocker #1 was actually fixed.
  - **Node-side `slo-whatsapp-e2e.test.ts`** — exercises projector pipeline with `emitCallerTurn` events shaped exactly as the real DO emits. p95 = **70ms over 10 trials** (4000ms threshold; 57× headroom). Per-trial trace shows real per-segment latencies (`emit → projector consume → tx commit → conversations.get`) — no sentinel values.

- **`[S3-fix]` (`963b162`).** 38 files, +2803/-251, addresses every kimi-gate blocker + major. The DO loop wiring fix (extending real `AriaFlowAgent`, no `Received: ${...}` literals), the turnId threading across events + projector, the caller-turn emission, the partial-unique-index option-A migration, the workerd-side SLO test infrastructure, the per-segment trace fix — all in one atomic commit with a comprehensive body listing every finding's resolution.

- **Sprint-level discipline.** Hexagonal hold (no `apps/server` imports in `packages/runtime/**`; no `cf-agent` in `runtime`); OpenAPI drift gate green every commit; root `package.json` clean (no devDep pollution); 0 lint errors throughout; per-package tsc clean post-`[S3-fix]`. Honest commit bodies — every uncertain item flagged, every spec-deviation documented. Salvage cycles handled with explicit memory-rule capture (5 new feedback memories saved for future workers).

---

## 2. Critique — what's at risk + what to fix

The kimi gate's RED verdict already drove a comprehensive `[S3-fix]`. Most items are now closed. Items that REMAIN at risk after `[S3-fix]`:

### Blocker-level (would fail r2 if left)

None. All three kimi blockers (DO shell, projector turn association, caller turns) are MET in `[S3-fix]`.

### Major-level (worth a `[S3-fix-2]` if codex r2 confirms)

- **`apps/server/src/durable-objects/MessagingDO.ts:159` — `processInbound` does NOT explicitly invoke `AriaFlowAgent.onChatMessage`.** Cursor's rewrite calls `saveMessages` after `emitCallerTurn`, but the AriaFlow runtime loop only fires when CF's AIChatAgent reacts to a WebSocket `CF_AGENT_USE_CHAT_REQUEST` frame — not from arbitrary internal `processInbound` calls. So the real assistant turn never generates from a Meta inbound. The caller turn is correctly emitted (kimi blocker #3 satisfied), but the assistant's reply doesn't flow yet. **Severity: major**. **Recommended fix**: extend `processInbound` to invoke `super.onChatMessage(noopOnFinish, { requestId: messageId })` directly after `saveMessages`, OR have the webhook handler open a transient WebSocket to the DO that mimics the chat protocol. Both are ~1-3 hours; probably folded into S4 voice work since voice owns the broader runtime invocation question.

- **`packages/runtime/src/projector/conversation.ts:1-8` — driver-specific imports leak.** `RuntimeTx` type union pulls in both `drizzle-orm/neon-http` and `drizzle-orm/node-postgres`. Acceptable for a Postgres-only project, but it does mean the projector module won't compile if either driver changes its type surface. **Severity: minor**. Defer to a future RuntimeTx-extraction.

- **`apps/server/src/__tests__/slo-do-real-loop.test.ts:80-92` — single trial, no p95 measurement in the workerd test.** It verifies the real-DO load-and-emit-caller-turn contract once; doesn't run 10 trials. The Node-side `slo-whatsapp-e2e.test.ts` runs 10 trials but on the projector pipeline only. So neither file alone has a p95 over the FULL real-DO + queue + projector path. **Severity: minor**. The latency budget is decomposed across the two tests; combined coverage is acceptable, but a future enhancement could glue them via wrangler queue consumers + Hyperdrive bindings.

### Minor-level (pre-existing or scoped out)

- **Pre-existing lint warning** in `packages/env/src/web.ts:9` (`Unexpected any`). Out of scope for S3.
- **Workspace `bun run check-types --force` hangs** at 100% CPU on `apps/server` tsc -b (>60min observed). Carry-forward from S3-04, mitigated by the per-package memory rule. RC investigation deferred — most likely candidate is `@ariaflowagents/cf-agent`'s deep type chain combined with drizzle's partial-index inference.
- **`packages/platform/src/node/message-queue.test.ts` mocks bullmq** instead of using the pinned `ioredis-mock`. The `ioredis-mock` dep is dead weight currently. Either drop it or write a real ioredis-mock-backed integration test — defer.
- **Pre-existing `agent.test.ts` fast-check property failure** in `@kuralle/runtime` (BL-S2-FASTCHECK-ID-FLAKE, closed but watch). Did not regress this sprint.

---

## 3. Constructive close — which fixes to tackle first

Given the sprint goal is functionally met (real WhatsApp inbound flow into `conversations + conversation_turns` is wired with real DO + real adapter + real projector + real DB), the remaining gaps are NOT blockers. **Manager recommends ship the sprint and address the major-level items in the next-sprint warmup**:

1. **The `onChatMessage`-invocation gap is the one item worth flagging in WARMDOWN as a known-pipeline-end limit.** Currently a Meta inbound generates a caller turn but no agent reply. F2 will show the user's message but no assistant response until the CF chat protocol invocation is wired. This is acceptable for "first channel + first conversation" demo (an operator can manually verify the inbound flowed end-to-end through the system) but not acceptable for "live agent reply demo." Tag it for S4 voice — the voice runtime work has to solve the same broader question (how does the runtime fire from an inbound channel event vs a WebSocket chat frame).

2. **Codex r2 should focus its adversarial pass on:**
   - The `MessagingDO.processInbound` flow specifically — does the absence of `onChatMessage` invocation create silent contract breakage anywhere downstream (projector waiting for assistant turns, F2 polling forever, etc.)?
   - The `ensureTurnRow` upsert pattern — any race where `tool.call` writes a placeholder turn that `turn.end` later overwrites incorrectly?
   - The new `@cloudflare/vitest-pool-workers` integration — does it leak miniflare state across vitest runs (per the docs' "Known issues" warning about WebSocket isolation)?
   - Whether the deferred `onChatMessage` invocation is honestly disclosed (commit body acknowledges it; this r1 acknowledges it; codex r2 will have the full picture).

3. **Backlog items added by Sprint 3** (carry into STATE.md at warmdown):
   - **BL-S3-01:** Wire `MessagingDO.processInbound` to call `super.onChatMessage(...)` so assistant turns generate from inbound webhook events. (Major, S4 voice candidate.)
   - **BL-S3-02:** Workspace tsc hang RC investigation. (Major, separate spike.)
   - **BL-S3-03:** Replace bullmq mock in `packages/platform/src/node/message-queue.test.ts` with real `ioredis-mock` integration OR drop the dep. (Minor.)
   - **BL-S3-04:** Extract `RuntimeTx` driver union to a shared types file in `packages/runtime/`. (Minor.)
   - **BL-S3-05:** Extend `slo-do-real-loop.test.ts` to 10-trial p95 once `onChatMessage` invocation is wired. (Minor, follow-up to BL-S3-01.)

**Verdict:** ready for codex r2. The sprint shipped what it promised at the infrastructure level + the kimi gate's correctness blockers are resolved. The deferred `onChatMessage` invocation is honestly disclosed and naturally aligns with S4 voice work.
