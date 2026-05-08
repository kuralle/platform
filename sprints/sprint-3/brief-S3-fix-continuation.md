# Story Brief — `[S3-fix]` continuation: finish Major #6 (real-DO SLO test) and commit

> **Role.** You are the same senior platform engineer (`cursor` worker, headless `--model auto`, fresh process) that did the bulk of the `[S3-fix]` work in the prior session. You correctly stopped before committing because Major #6 (SLO test exercising real `MessagingDO`) was unmet. The manager has approved finishing it now. **All other work is intact in the working tree** — verify with `git status` first; do NOT redo it.
>
> **Hard-prompts unchanged from `brief-S3-fix.md`:** no shells, no stubs replacing the SUT, no improvising past contradictions, no debugging the workspace tsc hang, no manipulating git history. Read `~/.claude/projects/.../memory/feedback_no_shell_implementations.md` once more.
>
> **Atomic-commit policy.** When done, stage every uncommitted change and commit atomically with `[S3-fix] kimi gate apply-now: real DO agent loop + turnId threading + caller turns + idempotency`. Do NOT push. **You MUST commit before exiting.**

---

## 1. State of the world

Run `git status` to confirm. Expected uncommitted state:

- ✅ **Done & verified by you in prior session:**
  - `packages/runtime/src/adapter/events.ts` — turnId added to all turn-scoped variants.
  - `packages/runtime/src/adapter/hooks.ts` — currentTurnId tracking + caller-turn helper.
  - `packages/runtime/src/adapter/index.ts` — exports updated.
  - `packages/runtime/src/index.ts` — exports updated.
  - `packages/runtime/src/projector/conversation.ts` — `ensureTurnRow` + turnId-based associations + `tool_${turnId}_${toolCallId}` idempotency key.
  - `packages/runtime/src/projector/__fixtures__/synthetic-events.ts` — turnId added.
  - `packages/runtime/src/adapter/__fixtures__/aria-flow-events-3-turn.json` — DELETED (dead).
  - `packages/runtime/src/adapter/events.test.ts`, `hooks.test.ts` — updated.
  - `apps/server/src/durable-objects/MessagingDO.ts` — rewritten as proper `AriaFlowAgent` subclass.
  - `apps/server/src/durable-objects/MessagingDO.test.ts` — updated.
  - `apps/server/src/webhooks/meta.ts`, `meta.test.ts` — fallback + assertion added.
  - `apps/web/src/hooks/api/conversations.ts` — `useMemo` for `turns`.
  - `packages/api/src/routers/conversations.schemas.ts` — dead `conversationLiveEventSchema` removed.
- ❌ **Still gapped (this session's job):**
  - `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` — still stubs the DO. Needs to exercise REAL `MessagingDO` with a deterministic test model. **This is Major #6.**

If `git status` shows anything beyond the list above (or significantly less), STOP and ask the manager — the working tree may have drifted.

---

## 2. The remaining task — Major #6 (real-DO SLO test)

The brief in `sprints/sprint-3/brief-S3-fix.md §3 SLO test` and §5 hard-prompts both forbid stubbing the DO again. Two acceptable approaches:

**Approach A — `wrangler unstable_dev` (preferred if reliable):**
- Spin up the real `MessagingDO` via miniflare in `unstable_dev`.
- Webhook POST → real DO → real adapter hooks → real queue → real projector → DB → `conversations.get`.
- Requires `wrangler.jsonc` + a way to inject `MockLanguageModelV2` as the agent's model.

**Approach B — In-process `AriaFlowAgent` instantiation (fallback):**
- Instantiate `MessagingDO` directly in the test (no miniflare).
- Provide a stub `DurableObjectState` (the prior shell test had one — adapt or write fresh).
- Override the agent's `model` resolver in `getRuntimeConfig()` to return a `MockLanguageModelV2` that emits a deterministic short response (e.g., `"Test response: confirmed"`).
- Drive the inbound flow by calling `do.fetch(...)` (or whatever the post-rewrite entrypoint is) with a webhook-like envelope.

**Decision criterion:** if `wrangler unstable_dev` was already wired and works in this env (check `apps/server/package.json` for a `dev:wrangler` or `test:wrangler` script — verify it actually starts), use Approach A. If it's flaky or absent, pivot to Approach B. Document choice in commit body.

**`MockLanguageModelV2` lookup:** `cat node_modules/.bun/@ai-sdk+provider*/.../dist/*.d.ts | grep -A 5 "MockLanguageModelV2\|class.*LanguageModelV2"` to confirm the exact import path. The `ai` SDK exports test models — verify the actual export name from the installed `.d.ts`. **Do NOT invent a class name.** If `MockLanguageModelV2` doesn't exist as that exact name, the SDK has another test-model utility — find it. If neither exists, fall back to writing a tiny `LanguageModelV2`-conforming class in the test file with a deterministic response (still not a "shell" because it's clearly identified as a test model in test code, not production wiring).

**Per-segment trace (Major #7):** capture real `firstProjectorConsumeAtMs` and `txCommitAtMs` in the new test. The projector worker can be instrumented by passing a `clock` or `onConsume`/`onCommit` callback. If the projector function has no such hook, add a minimal one (commit body documents) — but keep production-path-neutral.

---

## 3. Acceptance criteria for this continuation

1. `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` exercises the **real** `MessagingDO` (no `MESSAGING_DO` mock binding). Either via `unstable_dev` (Approach A) or in-process instantiation (Approach B). Document choice + reason in commit body.
2. The agent's model is a deterministic test model (`MockLanguageModelV2` from `@ai-sdk/provider` or equivalent — verify the actual installed export name). Test responses are short, predictable, and clearly identified as test fixtures in test code only.
3. p95 over 10 trials still ≤ 4000ms (likely will be larger than the prior 211ms because real model + queue + projector are now in the loop — document the new realistic p95).
4. Per-segment trace shows REAL `firstProjectorConsumeAtMs` and `txCommitAtMs` (no sentinel `19800001` values).
5. `bun -F server test:slo` exits 0.
6. All other test suites + lint + per-package tsc still pass (no regressions from the prior session).
7. Atomic `[S3-fix]` commit with body listing every blocker + major + minor + nit and confirmed status.

---

## 4. When you're done

Run the full chain (per-package tsc, NOT workspace check-types):

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

All exit 0 (the `@kuralle/runtime` test fast-check property-test failure is pre-existing and acceptable per prior gates — note in commit body if it surfaces).

```bash
git add -A    # all your fix-pass changes
git status -s   # verify the diff is sensible
git commit -m "[S3-fix] kimi gate apply-now: real DO agent loop + turnId threading + caller turns + idempotency"
```

Commit body must include:
- Status of each blocker (1, 2, 3): met / partial / deferred-with-reason.
- Status of each major (4, 5, 6, 7): same.
- Status of minors (8–14) + nits (15–16): brief one-liner each.
- New realistic SLO p95 with real DO + test model (replacing the stubbed 211ms).
- Approach A or B for the SLO test, with rationale.
- Acknowledgement that workspace tsc hang is still a deferred carry-forward (separate RC).

If you hit ANOTHER blocker (some incompatibility with `wrangler unstable_dev`, missing test-model export, etc.), STOP and ask. Do NOT regress to a stubbed DO.
