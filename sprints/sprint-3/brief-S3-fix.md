# Story Brief — `[S3-fix]` apply kimi gate findings (3 blockers + 4 majors + minors)

> **Role.** You are a senior platform engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) with deep expertise in **TypeScript ESM, Drizzle ORM + Postgres 15, Cloudflare Workers + Durable Objects, the `@cloudflare/ai-chat`/`AIChatAgent` base class, the `@ariaflowagents/cf-agent` `AriaFlowAgent` subclass pattern, AriaFlow runtime semantics (`HarnessConfig`, `HarnessHooks`), and event-sourced projection patterns**. Sprint 3's kimi gate verdict was **RED with three blockers + four majors**. Your job is to apply ALL of them in a single atomic `[S3-fix]` commit. The manager has saved a new memory rule (`feedback_no_shell_implementations.md`) explicitly forbidding the "shell" patterns kimi caught — read it before starting.
>
> **Mindset.** You read the kimi gate report (`sprints/sprint-3/gate-sprint.md`) twice before opening an editor. You verify `@ariaflowagents/cf-agent`'s `AriaFlowAgent` API by `cat node_modules/.bun/@ariaflowagents+cf-agent@1.0.0*/node_modules/@ariaflowagents/cf-agent/dist/AriaFlowAgent.d.ts` — the contract is "subclass MUST implement `getAgents()`, `getDefaultAgentId()`, optionally `getRuntimeConfig()`. CF's `onChatMessage` is what runs the agent loop; do NOT override `fetch()` to fake it." You verify `HarnessConfig` shape from `@ariaflowagents/core`'s `.d.ts`. You verify Drizzle upsert semantics from `node_modules/.bun/drizzle-orm@*/dist/pg-core/*.d.ts`. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is per-package tsc clean for touched packages, all tests passing, the SLO test exercising the **real** pipeline (no DO stub), and the kimi gate's failure cases now passing.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule). Named exports only. `import type` for type-only imports. Zod `.strict()` on every input/output schema.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. Do NOT improvise.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-fix] kimi gate apply-now: real DO agent loop + turnId threading + caller turns + idempotency`. Do NOT push. **You MUST commit before exiting.**

---

## ⚠️ HARD-PROMPTS (the rules kimi caught us breaking)

**Read `~/.claude/projects/.../memory/feedback_no_shell_implementations.md` first.** Below is the rule applied to YOUR fix-pass, in §5-style "Do NOT" form. **Violating these is a bannable offence and will fail the next gate.**

- **Do NOT keep the `MessagingDO.fetch()` override that hard-codes `Received: ${envelope.text}`.** That is a SHELL. Replace with proper subclassing of `AriaFlowAgent` so CF's `onChatMessage` runs the real AriaFlow runtime.
- **Do NOT replace one shell with another shell.** If the AriaFlow runtime needs a real LLM client (model + API key) and you don't have one in the test environment, do NOT fake a model that always returns `"Hello, I am the assistant."`. Instead, use a **deterministic test model** — `@ai-sdk/provider`'s `MockLanguageModelV2` or AriaFlow's own test fixtures — that explicitly identifies as a test model, threaded only via test setup, never in production wiring.
- **Do NOT make the SLO test stub the DO.** The SLO test must exercise the REAL `MessagingDO` (via `wrangler unstable_dev` or in-process AIChatAgent instance with deterministic test model) so it catches future shell-style regressions. If `wrangler unstable_dev` is flaky in this environment, document why and pivot to in-process AIChatAgent instantiation; do NOT fall back to a stubbed DO.
- **Do NOT silently skip event branches.** S3-02's adapter only emitted `turn.end` for `assistant`. You ADD a `caller` branch (or a separate helper the DO calls). Document both in the commit body.
- **Do NOT improvise past contradictions.** If the AriaFlow runtime hooks don't expose `turnId` natively, thread it via the closure pattern in `buildHarnessHooks` (the manager already pre-edited `events.ts` to add `turnId` to `tool.call.payload`; complete the threading). If you discover the design is wrong, **stop and ask** — do not invent a different pattern.

---

## 1. The kimi gate findings (your contract)

**Read `sprints/sprint-3/gate-sprint.md` IN FULL** before touching code. The summary below is the hit-list, not a substitute for the report.

### Blockers (must fix)

1. **S3-03 MessagingDO is a shell** (`apps/server/src/durable-objects/MessagingDO.ts:67`). `processInbound` overrides `fetch` to manually call three `HarnessHooks` methods with hard-coded payloads. Never calls `irToAgentConfig`. Never runs AriaFlow runtime. Hard-codes `fullText: \`Received: \${envelope.text}\``. **Fix:** rewrite as a proper `AriaFlowAgent<Env>` subclass implementing `getAgents()`, `getDefaultAgentId()`, `getRuntimeConfig()`. Let CF's `onChatMessage` run the real runtime; hooks fire organically.

2. **S3-04 projector attaches tool calls to wrong turn** (`packages/runtime/src/projector/conversation.ts:55`). `tool.call` arrives BEFORE `turn.end` in real event order; the `latestTurn` lookup (`desc(ordinal) limit 1`) returns the PREVIOUS turn. **Fix:** thread `turnId: string` through `tool.call`/`tool.result`/`tokens.updated`/`turn.end` event payloads (manager pre-edited `events.ts` to add `turnId` to `toolCallPayloadSchema` — complete the rest). Projector uses `event.payload.turnId` directly. Use Drizzle `INSERT ... ON CONFLICT DO NOTHING` to upsert `conversation_turns` row at the FIRST turn-scoped event (helper `ensureTurnRow`); `turn.end` UPDATEs final text + messageId + speaker via `onConflictDoUpdate` (Drizzle pg-core supports it; verify against `.d.ts`).

3. **S3-02 adapter never emits caller turns** (`packages/runtime/src/adapter/hooks.ts:218`). Only emits `turn.end` for `assistant` role. **Fix:** add a `caller` branch in `onMessage` (if `role === "user"`) OR a new exported helper `emitCallerTurn({ queue, conversationId, turnId, messageId, fullText, occurredAt })` that the DO calls when injecting an inbound user message. The new MessagingDO calls this BEFORE feeding the user message to the runtime so the projector writes a `speaker: "caller"` turn.

### Majors

4. **DO `blockConcurrencyWhile` restores from `state.storage` only** (`MessagingDO.ts:54`). DB (`runtime_sessions.workingMemory`) is documented source-of-truth. **Fix:** in the new MessagingDO, override the agent's session-restore path so DB load happens INSIDE `state.blockConcurrencyWhile`. Cache to `state.storage` AFTER successful DB load.

5. **Tool-call idempotency key collides across turns** (`projector/conversation.ts:56`). `tool_${conversationId}_${toolCallId}` repeats if the same toolCallId is reused. **Fix:** include `turnId` in the row id: `tool_${turnId}_${toolCallId}`. Since `turnId` is unique per turn, the composite is collision-free.

6. **SLO test stubs the DO** (`apps/server/src/__tests__/slo-whatsapp-e2e.test.ts`). The 211ms p95 was measured against a stub bypassing MessagingDO, irToAgentConfig, and the agent loop. **Fix:** rewrite the SLO test to exercise the REAL pipeline. Two acceptable approaches:
   - (a) `wrangler unstable_dev` integration: spin up the real DO in miniflare; webhook POST → real DO → real adapter → real queue → real projector → DB.
   - (b) In-process: instantiate the real `MessagingDO` against a test-model-backed AriaFlow runtime. Use `@ai-sdk/provider`'s `MockLanguageModelV2` (or equivalent — verify against `.d.ts`) that returns a deterministic short response. The DO does run the real agent loop with this model.
   - Pick (a) if `wrangler unstable_dev` is reliable; pivot to (b) if not. Document choice in commit body. **Do NOT pivot to "stub the DO again."**

7. **Per-segment trace clock-units bug** (`whatsapp-e2e.log`). `projector_first_to_tx_commit=19800001` etc. — sentinel values from segments that weren't recorded. Total latency is correct. **Fix:** correctly capture `firstProjectorConsumeAtMs` and `txCommitAtMs` in the test harness via instrumentation hooks on the projector worker (or by sampling timestamps inside the projector function during the SLO run; the projector's existing SLO-violation-write path is a candidate hook). Per-trial trace must show real values, not sentinels.

### Minors (apply if scope allows; defer to backlog if not)

8. `hooks.ts:211` — `onMessage` casts `ModelMessage` shape; dedup uses `Date.now()` fallback. Tighten the type cast or drop the fallback (require stable id).
9. `hooks.ts:227` — `onEnd` may emit a second `agent.end` after `onAgentEnd` already emitted one. Guard with a flag.
10. `useConversationLive` builds `turns` without `useMemo` (`apps/web/src/hooks/api/conversations.ts:40`). Wrap in `useMemo`.
11. `projector/conversation.ts` imports `drizzle-orm/neon-http` and `drizzle-orm/node-postgres` directly. Driver-specific leak. Mitigation: extract `RuntimeTx` type alias to a shared internal types file or accept the leak with a documenting comment.
12. `packages/platform/src/node/message-queue.test.ts` mocks `bullmq` instead of using pinned `ioredis-mock`. Either drop `ioredis-mock` from deps OR write a real `ioredis-mock`-based integration test.
13. `meta.test.ts` doesn't assert `messaging_threads` row state on POST happy path. Add the assertion.
14. `projector-worker.test.ts` per-conversation ordering test sorts ordinals before asserting, masking real ordering. Drop the `.sort()` and assert on insertion order.

### Nits (cleanup if quick)

15. Delete unused `aria-flow-events-3-turn.json` fixture or wire it into `hooks.test.ts`.
16. Delete dead `conversationLiveEventSchema` (streaming variant — polling-only is shipped).

---

## 2. Required reading (in this order)

1. `sprints/sprint-3/gate-sprint.md` — **the kimi gate report. Read every line.**
2. `sprints/sprint-3/PLAN.md` — sprint plan + §0 locked decisions.
3. `~/.claude/projects/.../memory/feedback_no_shell_implementations.md` — the new manager-mandated rule. Verify your fix doesn't introduce a new shell.
4. `~/.claude/projects/.../memory/feedback_targeted_type_check_only.md` — type-check verification rule (per-package only, never workspace-wide).
5. `~/.claude/projects/.../memory/feedback_check_types_foreground_only.md` — and the foreground-only rule.
6. **`node_modules/.bun/@ariaflowagents+cf-agent@1.0.0*/node_modules/@ariaflowagents/cf-agent/dist/AriaFlowAgent.d.ts`** — the API you must subclass. Note: `getAgents()`, `getDefaultAgentId()`, `getRuntimeConfig()`, `getStreamConfig()` are the override points. CF's `onChatMessage(onFinish, options)` runs the agent — do NOT override it.
7. `node_modules/.bun/@ariaflowagents+cf-agent@1.0.0*/node_modules/@ariaflowagents/cf-agent/dist/types.d.ts` — `StreamAdapterConfig`, etc.
8. `node_modules/.bun/@ariaflowagents+core@1.0.0*/node_modules/@ariaflowagents/core/dist/index.d.ts` — `HarnessConfig` shape; `HarnessHooks` shape.
9. **`packages/runtime/src/adapter/events.ts`** — schema. Manager pre-added `turnId` to `toolCallPayloadSchema`. You add `turnId` to `toolResultPayloadSchema`, `tokensUpdatedPayloadSchema`, `turnEndPayloadSchema`. All Zod `.strict()`.
10. `packages/runtime/src/adapter/hooks.ts` — adapter hooks. Track `currentTurnId` per agent run. Add caller-turn emission helper.
11. `packages/runtime/src/projector/conversation.ts` — projector. Replace `latestTurn` lookup with `event.payload.turnId`. Add `ensureTurnRow` upsert helper.
12. `packages/runtime/src/projector/conversation.test.ts` — expand tests for the new turnId-threading + caller-turn paths.
13. `apps/server/src/durable-objects/MessagingDO.ts` — current shell. Rewrite as a proper `AriaFlowAgent` subclass.
14. `apps/server/src/durable-objects/MessagingDO.test.ts` — current tests. Update to test the real subclass behavior.
15. `apps/server/src/webhooks/meta.ts` — webhook handler. Decide if it still uses `stub.fetch(...)` or routes via `AIChatAgent`'s WebSocket/HTTP layer. The webhook needs to translate Meta envelope → AIChatAgent message format. Verify the right `AIChatAgent` HTTP/WS endpoint from its `.d.ts`.
16. `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` — current stub-DO test. Rewrite per fix #6.
17. `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts.fixtures` (or wherever it builds fixtures) — adapt for real DO.

---

## 3. Files to create or modify

### Adapter (`packages/runtime/src/adapter/`)
- `events.ts` — add `turnId: z.string()` to `toolResultPayloadSchema`, `tokensUpdatedPayloadSchema`, `turnEndPayloadSchema`. (Manager pre-added to `toolCallPayloadSchema`.)
- `hooks.ts` — track `currentTurnId` (set in `onAgentStart`, used in all turn-scoped emits, finalized in `onMessage` for assistant turns). Add `emitCallerTurn` exported helper for DO use. Apply minor fixes 8 + 9.
- `events.test.ts` — expand for new turnId requirement.
- `hooks.test.ts` — expand for caller-turn emission + turnId threading.

### Projector (`packages/runtime/src/projector/`)
- `conversation.ts` — replace `latestTurn` lookup with `event.payload.turnId`. Add `ensureTurnRow(tx, turnId, conversationId, ordinal, occurredAt)` upsert helper used at first turn-scoped event. Use Drizzle `onConflictDoUpdate` for `turn.end` upsert (verify API from `.d.ts`). Update tool-call row id to `tool_${turnId}_${toolCallId}` for fix #5.
- `conversation.test.ts` — expand: caller turn, tool-call before turn-end ordering, idempotency key uniqueness across turns.
- `projector-worker.test.ts` — drop `.sort()` from ordering assertion (fix #14).

### MessagingDO (`apps/server/src/durable-objects/`)
- `MessagingDO.ts` — **rewrite**:
  - Subclass `AriaFlowAgent<Env, State>`.
  - Implement `getAgents()` returning `HarnessConfig['agents']` from the workspace's IR via `irToAgentConfig`.
  - Implement `getDefaultAgentId()`.
  - Implement `getRuntimeConfig()` wiring `buildHarnessHooks({ queue, conversationId })` as the hooks. Use the real CF `state.storage` AND DB `runtime_sessions.workingMemory` for orchestration state.
  - Override the working-memory restore path so DB load happens INSIDE `state.blockConcurrencyWhile` (fix #4).
  - Provide a thin entrypoint method (or HTTP endpoint) the webhook handler can call to inject inbound user messages. Translate to AIChatAgent's expected message format. Before forwarding, call `emitCallerTurn` so the projector writes the caller turn.
  - Do NOT override `fetch()` with hard-coded responses.
- `MessagingDO.test.ts` — rewrite to test the subclass behavior. Use a deterministic test model (e.g., `MockLanguageModelV2` from `@ai-sdk/provider` — verify against `.d.ts`) to make the agent run reproducible. Test:
  - `getAgents()` returns valid config from a seeded IR.
  - Inbound message flow (webhook → DO → real adapter hooks → queue) emits the right `MessagingEvent`s in order.
  - Hibernation cold-start restores `workingMemory` from DB inside `blockConcurrencyWhile`, then caches to `state.storage`.

### Webhook (`apps/server/src/webhooks/meta.ts`)
- Update to route inbound messages via the new MessagingDO entrypoint (NOT a fake `stub.fetch(...)` if that pattern was a shell-feeder).
- Add a `messaging_threads` row state assertion in `meta.test.ts` (fix #13).

### SLO test (`apps/server/src/__tests__/`)
- `slo-whatsapp-e2e.test.ts` — **rewrite per fix #6**. Use real DO via `wrangler unstable_dev` OR in-process `AriaFlowAgent` with `MockLanguageModelV2` (deterministic short response). Capture real `firstProjectorConsumeAtMs` and `txCommitAtMs` (fix #7) — instrument by patching the projector function or by sampling inside the worker. p95 ≤ 4000ms still required; the test will be slower than 211ms now because real model inference + queue round-trip is included. Document new realistic p95 in commit body.
- `__fixtures__/meta-webhook-slo-inbound.ts` — adapt as needed for the real-DO flow.

### Frontend hook (`apps/web/src/hooks/api/`)
- `conversations.ts` — wrap `useConversationLive`'s `turns` array in `useMemo` (fix #10).

### Cleanup
- Delete `packages/runtime/src/adapter/__fixtures__/aria-flow-events-3-turn.json` if confirmed unused (fix #15) OR wire it into `hooks.test.ts`.
- Delete `conversationLiveEventSchema` from `packages/api/src/routers/conversations.schemas.ts` if confirmed dead (fix #16).

### Type-check verification (REQUIRED — read carefully)

**DO NOT run `bun run check-types`, `bun run check-types --force`, or `bun -F server check-types`.** All hang on apps/server tsc -b (carry-forward from S3-04, deferred to RC investigation).

**Per-package tsc on packages YOU touched:**
```bash
TSC=/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/node_modules/.bin/tsc
for pkg in packages/runtime apps/web; do
  echo "=== $pkg ==="
  $TSC --noEmit -p "$pkg/tsconfig.json"
done
```

For `apps/server` specifically: do NOT run direct tsc -b on it (the hang). Verify your apps/server changes by running the test suites instead — vitest's esbuild transform catches the same surface.

### What you do NOT touch
- Anything in `packages/db/src/schema/**` or migrations — schema is locked.
- `packages/core/src/repositories/**` — repository layer is locked.
- `packages/api/src/routers/**` — except `conversations.schemas.ts` for the dead-schema cleanup.
- `apps/web/src/routes/**` — F1/F2 are wired correctly.
- Root `package.json` (memory rule).

---

## 4. Acceptance criteria

1. **Blocker #1 cleared.** `MessagingDO.ts` no longer hard-codes responses. It properly extends `AriaFlowAgent`, implements `getAgents()`/`getDefaultAgentId()`/`getRuntimeConfig()`, and CF's `onChatMessage` runs the real runtime. No `Received: ${...}` literals.
2. **Blocker #2 cleared.** Projector uses `event.payload.turnId` directly. No `latestTurn` lookup. Tool calls correctly associate with the in-flight turn even when `tool.call` arrives before `turn.end`. New test asserts this.
3. **Blocker #3 cleared.** Caller turns ARE emitted (`speaker: "caller"`). New test asserts both caller + assistant turns appear in `conversation_turns`.
4. **Major #4 cleared.** DB working-memory restore happens inside `state.blockConcurrencyWhile`. New test asserts this with a synthetic two-turn-with-hibernate cycle.
5. **Major #5 cleared.** Tool-call row id includes `turnId`; cross-turn collision impossible. New test asserts.
6. **Major #6 cleared.** SLO test exercises real `MessagingDO` via either `wrangler unstable_dev` or in-process `MockLanguageModelV2`. The 211ms p95 is replaced with a real measurement; document it.
7. **Major #7 cleared.** Per-segment trace shows real `firstProjectorConsumeAtMs` and `txCommitAtMs`, not sentinel values.
8. **Minors 8–14 applied** (or explicitly deferred with rationale in commit body).
9. **Nits 15–16 applied** (or deferred).
10. **Per-package tsc clean** for `packages/runtime` and `apps/web`. apps/server tsc -b NOT run (carry-forward).
11. **Tests:** `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test`, `bun -F @kuralle/platform test`, `bun -F server test`, `bun -F web test`, `bun -F server gen:openapi --check`, `bun -F server test:slo` all exit 0.
12. **Atomic `[S3-fix]` commit** with body listing each blocker/major/minor/nit and its status (met / partial / deferred + reason).

---

## 5. What NOT to do (HARD-PROMPTS — these are bannable per memory rule)

- **Do NOT replace one shell with another shell.** If the test environment lacks a real LLM, use `MockLanguageModelV2` (or equivalent) — explicitly identified as a test model — NOT a hard-coded `"Hello"` response.
- **Do NOT keep `MessagingDO.fetch()` overriding with hard-coded responses.** This was the original blocker.
- **Do NOT make the SLO test stub the DO again.** The whole point of fix #6 is that the SLO test exercises real behavior.
- **Do NOT drop event branches.** All AriaFlow events that have a documented `MessagingEvent` variant must be emitted; caller turns are explicitly required.
- **Do NOT debug the workspace-wide tsc hang.** Per-package tsc only. The hang is a deferred carry-forward.
- **Do NOT manipulate git history** (`checkout`, `reset`, `revert`, `cherry-pick`). Manager owns git operations.
- **Do NOT comment out production source as a "diagnosis."** If something is broken, fix it; if you don't know how, stop and ask.
- **Do NOT push to remote.**

---

## 6. When you're done

```bash
TSC=/Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle/node_modules/.bin/tsc
$TSC --noEmit -p packages/runtime/tsconfig.json && \
$TSC --noEmit -p apps/web/tsconfig.json && \
bun run lint && \
bun -F @kuralle/core test && \
bun -F @kuralle/runtime test && \
bun -F @kuralle/platform test && \
bun -F server test && \
bun -F web test && \
bun -F server gen:openapi --check && \
bun -F server test:slo
```

All exit 0. Then `git add` every file in §3 and:
```
git commit -m "[S3-fix] kimi gate apply-now: real DO agent loop + turnId threading + caller turns + idempotency"
```

Commit body must include:
- Status of each blocker (1, 2, 3): met / partial / deferred-with-reason.
- Status of each major (4–7): same.
- Status of each minor + nit: brief one-liner each.
- Real SLO p95 with the new pipeline (replacing the 211ms stub measurement).
- Whether you used `wrangler unstable_dev` or in-process `MockLanguageModelV2` for the SLO test, and why.
- Acknowledgement that workspace tsc hang is still a carry-forward (separate RC investigation).

If any blocker or major is unmet, do NOT commit a partial fix-pass claiming green. Stop, name what's blocking, and ask the manager.
