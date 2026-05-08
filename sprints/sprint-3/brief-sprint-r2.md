# Sprint-Level Adversarial Review (r2) — Sprint 3

> **Role.** You are the **adversarial second-opinion reviewer (`codex/gpt-5.3-codex`)** — the strongest correctness + edge-case + hidden-coupling lens we have. The IC team (cursor + manager-salvage) shipped Phase A. The peer-IC kimi gate (`pi/kimi-k2.6`) found 3 blockers + 4 majors, all addressed in the manager's `[S3-fix]` (`963b162`). Manager r1 (Claude Opus 4.7) sandwich-reviewed the sprint and flagged a remaining major: `MessagingDO.processInbound` does not explicitly invoke `AriaFlowAgent.onChatMessage`, so caller turns flow but assistant turns don't generate.
>
> **Your job:** find what r1 + kimi missed. Race conditions, security holes, hidden coupling, latency cliffs, data-corruption risks, type-safety holes, dishonest hedging, false-done claims, untested code paths. You are deliberately NOT on the team — you are the friction that catches what the team rationalized away.

---

## 1. Inputs (read every one in full)

1. **The full sprint diff:** `git log --oneline 64eee66..HEAD` (10 commits) + `git show <sha>` for each.
2. **Story briefs** at `sprints/sprint-3/brief-S3-{01..06}.md` + `brief-S3-04-continuation.md` + `brief-S3-05-continuation.md` + `brief-S3-fix.md` + `brief-S3-fix-continuation.md`.
3. **Kimi sprint-level gate report** at `sprints/sprint-3/gate-sprint.md` (RED verdict; 3 blockers + 4 majors + 9 minors/nits).
4. **Manager r1 review** at `sprints/sprint-3/review-sprint-r1.md` (the sandwich; identifies the `onChatMessage`-invocation gap as the remaining major).
5. **`[S3-fix]` commit body** (`git show 963b162`) — the manager's accounting of which findings are met / partial / deferred.
6. **Source RFC sections cited by the briefs:** `DATA_MODEL.md §8 / §9 / §13 / §14 / §15`, `INTERFACE_DESIGNS_RuntimeHost.md §5 / §C`, `USER_JOURNEYS.md §2 / §5(3b) / §6 / §9b`, `HEXAGONAL_ARCHITECTURE.md §1 / §5`, `scripts/sink-spike/FINDINGS.md`.
7. **Memory rules in effect for this sprint** (in `~/.claude/projects/.../memory/`):
   - `feedback_no_shell_implementations.md` (no shells, no production stubs).
   - `feedback_targeted_type_check_only.md` (per-package tsc only).
   - `feedback_sequential_workers_only.md` (no parallel workers).
   - `feedback_check_types_foreground_only.md`.
   - `feedback_pi_is_default_ic.md` (cursor `--model auto` is default IC; pi is fallback).

---

## 2. Project-specific adversarial focus areas

The kimi gate + r1 already covered: per-story spec adherence, cross-story consistency, code quality, hexagonal discipline. **Your value-add is what they missed.** Specifically:

### Race conditions / concurrency

- **`MessagingDO`'s `restorePromise` cache** (`apps/server/src/durable-objects/MessagingDO.ts:79`) — single-flight pattern. What happens if `processInbound` runs before `ensureRestored()` completes? Is `state.blockConcurrencyWhile` actually scoped tightly enough?
- **Projector worker `runProjectorWorker`** subscribes to all 16 shards in parallel. Each shard's per-conversation FIFO is preserved by the queue layer. But what if a single `conversationId` happens to hash to a different shard mid-conversation (e.g., if shard math changes)? The DO ensures the same shard for a given conversationId, but the projector trusts that invariant — codify it with an assertion or document the assumption.
- **`ensureTurnRow` upsert vs `turn.end` upsert** — `tool.call` arrives first and inserts a placeholder row with `text=""`. `turn.end` arrives later and updates with `fullText`. If `turn.end` arrives BEFORE its corresponding `tool.call` (out-of-order from a different shard with same conversationId — shouldn't happen but verify), does the projector misorder? Trace through the upsert semantics carefully.

### Idempotency holes

- **Tool-call row id is now `tool_${turnId}_${toolCallId}`.** Are `toolCallId`s actually unique within a turn from AriaFlow's runtime? Check `@ariaflowagents/core/dist/types/telemetry.d.ts` for any guidance. If two parallel tool calls share a toolCallId (unlikely but possible in some agent designs), the second insert silently UPDATEs the first.
- **`messaging_threads` has `(workspace_id, thread_key)` PK.** If two webhook deliveries for the same `wa_id` race (Meta retries during outage), `findOrCreateMessagingThread` SHOULD handle it via `ON CONFLICT DO UPDATE`/`SELECT FOR UPDATE`. Verify the actual implementation.
- **`emitCallerTurn`'s sequenceNumber.** The DO maintains `this.sequenceNumber` in memory + `state.storage`. If the DO crashes between the in-memory increment and the storage write, a sequence number could be reused. Trace.

### Security

- **HMAC verify happens BEFORE body parse** in the webhook handler (`apps/server/src/webhooks/meta.ts`). Verify the rawBody is the EXACT bytes Meta signed. Any prior middleware that modifies `c.req.text()` (logger, tracer) breaks the verify silently.
- **`META_VERIFY_TOKEN`** is in `wrangler.jsonc`'s `vars` block (plaintext). Manager's r1 implicitly accepts this; flag if you think it should be a secret.
- **`apps/server/src/env.ts` `getEnvSync`** returns empty strings for missing META vars. The router checks for empty strings and throws ORPCError. Does the DO check too, or does it pass empty `appSecret` through and fail later?

### Type-safety holes

- **`MessagingDO`'s `__messagingDODeps` cast** (`MessagingDO.ts:46`) — `MessagingDoEnv` has `__messagingDODeps?: MessagingDoDeps`. Production wiring of these deps isn't in this commit (deferred). Verify the DO degrades gracefully when `__messagingDODeps` is undefined (no crash; just reduced functionality).
- **`MessagingEvent` discriminated union** — Zod's discriminated-union narrowing should ensure no variant access outside its kind. Spot-check any `as MessagingEvent["payload"]` casts.

### Hidden coupling

- **`shardKeyForConversation` is imported by both the DO** (producer) **and the projector worker** (consumer). They MUST be byte-identical. Verify both import the same module (no copy in `packages/runtime/`).
- **`emitCallerTurn`'s queue param** — the DO wraps the queue with shard routing; the projector consumes from sharded keys. If the DO emits to one virtual key (`messaging-events`) and the projector subscribes to 16, events get dropped. Trace both paths.
- **The webhook handler's `findOrCreateMessagingThread` insert in `apps/server/src/webhooks/meta.ts`** — the manager's `[S3-fix]` SLO test seeds this row directly (the test bypasses the webhook). Verify the production webhook path actually creates the row before the DO is invoked.

### The `onChatMessage` gap (r1 already flagged this; verify the impact)

- **Production end-state:** caller turn flows through projector → `conversation_turns`. F2 polls `conversations.get` and sees the user's message. Then... nothing? No assistant turn, no agent reply.
- **Verify:** does the DO's CF base persist the user message via `saveMessages`? When does CF call `onChatMessage`? Is there ANY trigger from `processInbound` that wakes the runtime, or is it strictly WebSocket-driven?
- **Document honestly:** what is the actual end-state visible in F2 today? "Message visible, no reply" or "fully working"? The commit bodies + r1 say the former; verify.

### `@cloudflare/vitest-pool-workers` integration

- **`vitest.slo.do.config.ts`** — uses `cloudflareTest` plugin pointing at `wrangler.jsonc`. Is that the canonical integration, or should we use `defineWorkersConfig` from a different subpath? Check the package's actual `index.d.mts` exports.
- **`new_sqlite_classes` migration** changed from `new_classes`. If a previous run had a non-SQLite DO instance, the migration would fail in production. Verify only test environments have ever loaded the DO (no pre-existing CF deploy).
- **The workerd-side test sets `(env as unknown as MessagingDoEnvShape).__messagingDODeps = {...}`.** Does pool-workers serialize env across test runs? Could one test's deps leak into another's assertions? `singleWorker: true, isolatedStorage: false` was set — verify those propagate in the new config (they were dropped in the simplified config that uses `cloudflareTest`).

### SLO test honesty

- **Node-side `slo-whatsapp-e2e.test.ts`** explicitly seeds the conversation + messaging_thread rows directly. The webhook handler is NOT invoked. Is this an SLO of "projector pipeline" or "WhatsApp inbound to F2"? r1 acknowledges the split; verify the artifact log + commit body don't overclaim.
- **Workerd-side `slo-do-real-loop.test.ts`** asserts caller-turn shape but doesn't run a p95 over 10 trials. The 4-second SLO is enforced only in the Node-side test. Is that misleading?
- **Commit body of `[S3-06]`** (`97d24b1`) says "p95: 209ms" — but that was the stub-DO measurement, BEFORE `[S3-fix]`. The post-`[S3-fix]` p95 is 70ms (Node-side) but THAT measures emit→DB only, not webhook→F2. Two different measurements; verify the commit history is honest about which is which.

---

## 3. Output

Write `sprints/sprint-3/review-sprint-r2.md`. Verdict at the top:

- **Endorse r1** — no significant adversarial findings beyond r1's flagged majors.
- **Strengthen r1** — agree with r1 + add findings r1 missed.
- **Override r1** — disagree with r1's recommendation; propose different action.

Then for each finding:

- `file:line` — severity (`blocker` / `major` / `minor` / `nit`) — [axis: race / security / type-safety / coupling / honesty / etc.] — description — concrete recommended fix.

End with the **honest verdict** about whether Sprint 3 is shippable (with the deferred `onChatMessage` gap documented) or whether something must land in `[S3-fix-2]` before close.

---

## 4. What NOT to do

- Do NOT modify any source.
- Do NOT commit.
- Do NOT re-litigate findings r1 already made — endorse / strengthen them with cross-cutting evidence the per-story view missed.
- Do NOT speculate without grep-confirming. "I think this might race" is not a finding; "I traced the call chain at file:line and verified the race" is.
- Do NOT ignore the kimi gate — it found 3 real blockers. Your job is to find what kimi + r1 still missed.
- Do NOT use `bun run check-types` or `bun -F server check-types` — workspace hang carry-forward; per-package only per memory rule.
