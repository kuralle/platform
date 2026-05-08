# Story Brief — `S3-06` End-to-end SLO test: WhatsApp inbound → F2 visible in ≤ 4 s

> **Role.** You are a senior SRE / runtime engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) with deep expertise in **end-to-end latency budgeting, miniflare-based local CF dev, deterministic synthetic-test harnesses, vitest with timing assertions, and HMAC-signed webhook simulation**. You have shipped SLO tests in production where flakiness comes from clock drift, single-shot timing measurements, or shared state across runs; you understand p95-over-N as the only honest latency metric. You write tests other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. **Before writing the test, you trace the inbound→F2 latency budget end-to-end** — webhook receipt → HMAC verify → messaging_threads upsert → DO `idFromName` lookup → DO spawn (cold) or wake (warm) → adapter event emission → queue publish → projector consume → `conversation_turns` insert → `conversations.live` polling tick → web `useConversationLive` cache update. Each segment has a budget; if the test fails, the per-segment trace tells you which one regressed. You verify the existing `unstable_dev` from `wrangler` is wired (S3-03 left a `test:wrangler` script). You measure p95 over **10 trials** minimum, not single-shot. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun -F server test:slo` exiting 0 with the captured artifact showing p95 ≤ 4000 ms.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every schema. No premature abstractions; no speculative extensibility. The test must be deterministic enough to run 10× in a row without flakiness.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. **Do NOT modify any production code paths** owned by S3-03/04/05 (DO, webhook, projector, hooks, routes). Your job is to add a NEW test that exercises the full pipeline end-to-end. If you find a real bug en-route (e.g., a path that takes 10s instead of 1s), surface it as a flag — do NOT silently patch the production path.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-06] runtime/slo: WhatsApp inbound → F2 visible E2E SLO test (≤ 4s p95)`. Do NOT push. One commit per story.

---

## 1. Goal

Wire the full pipeline end-to-end and assert the 4-second SLO:

**Path:** synthetic Meta-shaped inbound webhook (HMAC-signed) → S3-03 `apps/server/src/webhooks/meta.ts` → MessagingDO spawn → S3-02 adapter emits events → S3-04 projector consumes → DB `conversation_turns` row materializes → `conversations.get` returns it.

**Measurement:**
- p95 over 10 trials of (T0 = webhook POST → T1 = `conversations.get` returns the new turn).
- SLO threshold: 4000 ms.
- Per-segment latency captured in the artifact log so a regression points at the slow layer.

**Test substrate:** `wrangler unstable_dev` (miniflare) for the DO + Queue path, local Postgres for the DB, in-process oRPC client for `conversations.get`. **No real Meta API call.** No real CF preview. The synthetic webhook + miniflare DO + local projector cover the contract.

**Optional real-Meta variant (gated by env):** if `KURALLE_SLO_REAL_META=1` AND `META_PHONE_NUMBER_ID` is populated, the test ALSO sends a real WhatsApp message via the Meta Cloud API and measures the round-trip. Default test mode is synthetic (zero external dependencies for CI).

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — confirms sprint 3 is active.
2. `sprints/sprint-3/PLAN.md` — full sprint plan; story `S3-06` section is the spec; **§0 locks the AriaFlow + Meta + Cloudflare decisions** (wrangler dev, no real CF).
3. `sprints/WBS.md` § Sprint 3 → row `S3-06`.
4. `sprints/sprint-2/HANDOFF.md` — read-me-first traps. Especially the "S3-03 needs CF preview OR wrangler dev" note — `wrangler dev` is what we use.
5. **`USER_JOURNEYS.md §2`** — SLO budgets. Find the 4-second target's source (likely §2 SLO #4 or the F1/F2 update budget). Cite the exact line.
6. `USER_JOURNEYS.md §6` — F1/F2 list-and-detail flow + polling cadence (1 Hz).
7. `USER_JOURNEYS.md §9b` — WhatsApp messager journey end-to-end shape.
8. `scripts/sink-spike/FINDINGS.md` — event volumes per turn.
9. **`apps/server/src/webhooks/meta.ts`** (S3-03) — the webhook entry. Read every line. Your test POSTs synthetic Meta-shaped envelopes here. The HMAC verify uses `META_APP_SECRET`.
10. `apps/server/src/durable-objects/MessagingDO.ts` (S3-03) — DO behavior. Your test asserts the DO emits events that the projector picks up.
11. `apps/server/src/durable-objects/shard.ts` (S3-03) — shard math. Your test uses the same function to know which queue to wait on.
12. **`apps/server/wrangler.jsonc`** (S3-03) — verify the test substrate. Your test launches `unstable_dev` against this.
13. `apps/server/src/__tests__/webhook-meta-hmac.test.ts` (S3-03) — example HMAC-signed payload generation; mirror.
14. `apps/server/src/__tests__/__fixtures__/meta-webhook-inbound.json` (S3-03 — verify it exists; if not, generate one). Synthetic Meta webhook envelope.
15. **`packages/runtime/src/projector/projector-worker.ts`** (S3-04) — consumer side. Your test ensures the projector is running while the webhook is being POSTed; otherwise the `conversation_turns` row never materializes.
16. `packages/runtime/src/projector/conversation.ts` (S3-04) — `projectConversationEvent`.
17. `packages/runtime/src/instrumentation/slo.ts` — existing `SLO_PUBLISH_*` and `SLO_PROJECTOR_LAG_*` constants. **You ADD `SLO_WHATSAPP_E2E_THRESHOLD_MS = 4000` and `SLO_WHATSAPP_E2E_NAME = "whatsapp.e2e.p95"`.**
18. `packages/api/src/routers/conversations.ts` (S3-05) — `conversations.get`. Your test polls this until the turn appears OR the timeout fires.
19. `apps/server/src/__tests__/agents.publish.slo.test.ts` (S2-05) — example p95-over-N SLO test pattern with vitest. Mirror the `Date.now()` measurement + percentile computation.
20. `packages/core/src/test-utils.ts` — `seedWorkspace`, `createTestDb`, `releaseTestDb`. Use these.
21. `apps/server/package.json` — verify `wrangler` is a dep (S3-03 added it). Verify a `test:slo` script doesn't already exist; you ADD it.

---

## 3. Files to create or modify

(If a file you need is missing from this list, stop and flag — don't silently add to scope.)

### SLO test (`apps/server/src/__tests__/`)
- `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` (new) — the full pipeline test.
  - Test setup:
    - `seedWorkspace` + a seeded agent.
    - Set up channel_connections + channel_endpoints (whatsapp kind, identifier = a sandbox phone number ID). Per-workspace meta secret stored.
    - Start the projector worker against the test DB + memory MessageQueue.
    - Either start `wrangler unstable_dev` (preferred — full pipeline including DO) OR mount the webhook handler against an in-process Hono test instance with a stub DO (faster + deterministic). IC picks; documents the choice. **Default to in-process unless wrangler-dev demonstrably works in this env.**
  - Test body (10 trials):
    - For trial N:
      - Generate a Meta-shaped webhook payload with a unique `messageId` and the seeded `phoneNumberId`.
      - Compute HMAC over the raw body with the test secret.
      - Record `T0 = Date.now()`.
      - POST `/webhooks/meta` with the signed body.
      - Assert immediate `200 OK` (HMAC accepted).
      - Poll `conversations.get({ workspaceId, conversationId: <thread's conversationId> })` at 200 ms intervals up to a 5-second cap.
      - When the new turn (matching `messageId`) appears: record `T1 = Date.now()`. Compute `latency = T1 - T0`.
      - If 5 s elapses without the turn appearing: record latency = -1 (timeout marker) and continue.
    - After 10 trials: compute p95. Assert `p95 ≤ SLO_WHATSAPP_E2E_THRESHOLD_MS` (4000 ms). Print all 10 latencies + the p95 in test output.
  - Test teardown: stop the projector, close the DB, release fixtures.
  - Per-segment instrumentation: log `T0 → webhook 200 OK → first projector consume → tx commit → conversations.get success` so a failure surfaces the slow layer.
- `apps/server/src/__tests__/__fixtures__/meta-webhook-slo-inbound.ts` (new — TS, not JSON, because each trial needs a unique messageId) — `buildSloWebhookEnvelope({ messageId, phoneNumberId, waId })` returns `{ rawBody, signature }`.

### Real-Meta variant (gated)
- The same test file has an `it.skipIf(!process.env.KURALLE_SLO_REAL_META)` variant that, when env-gated, additionally sends a REAL WhatsApp message via the Meta Cloud API to `META_PHONE_NUMBER_ID`. Reuses the synthetic test setup but the inbound is Meta's real callback. Default CI mode skips this.

### Instrumentation
- `packages/runtime/src/instrumentation/slo.ts` — add:
  - `export const SLO_WHATSAPP_E2E_THRESHOLD_MS = 4000;`
  - `export const SLO_WHATSAPP_E2E_NAME = "whatsapp.e2e.p95" as const;`
  - Re-export from `packages/runtime/src/index.ts`.

### Server scripts
- `apps/server/package.json` — add `"test:slo": "vitest run --config vitest.slo.config.ts"` script. SLO tests are gated behind their own script so they don't run on every `bun -F server test`.
- `apps/server/vitest.slo.config.ts` (new) — extends the regular config but only matches `slo-*.test.ts` files. Increases `testTimeout` to 60s.

### Demo artifact
- `sprints/sprint-3/artifacts/whatsapp-e2e.log` (new — produced by the test) — full per-trial latency log + p95 + per-segment trace.
- (Optional: `whatsapp-e2e.mp4` if a screen-cap is feasible. If not, log + a Playwright still-frame are acceptable per the brief.)

### What you do NOT touch
- Production code paths in `apps/server/src/webhooks/meta.ts`, `apps/server/src/durable-objects/MessagingDO.ts`, `packages/runtime/src/projector/**`, `apps/web/src/hooks/api/conversations.ts`, F1/F2 routes — all read-only for this story.
- `packages/api/src/routers/conversations.ts` — read-only; the test polls `conversations.get` (the procedure already exists from S3-05).
- `apps/server/openapi.json` — SLO test is internal; no router change.
- Root `package.json` (memory rule).

---

## 4. Acceptance criteria (numbered, in priority order)

1. `apps/server/src/__tests__/slo-whatsapp-e2e.test.ts` exists; runs 10 synthetic trials end-to-end.
2. **SLO threshold** `SLO_WHATSAPP_E2E_THRESHOLD_MS = 4000` defined in `packages/runtime/src/instrumentation/slo.ts`. Re-exported.
3. **p95 over 10 trials ≤ 4000 ms.** Captured in the artifact log alongside all 10 latencies.
4. **Per-segment trace** in the artifact (T0 → webhook 200 → first event observed by projector → tx commit → conversations.get returns turn).
5. **Real-Meta variant** is `it.skipIf(!process.env.KURALLE_SLO_REAL_META)`-gated. Default test runs without external dependencies.
6. **`bun -F server test:slo`** is a new script; the default `bun -F server test` does NOT run SLO tests (they're behind `vitest.slo.config.ts`).
7. **Tests green:** `bun -F server test:slo` exits 0 at least once. Default test chain (`check-types`, `lint`, `core test`, `runtime test`, `server test`, `web test`, `gen:openapi --check`) all exit 0 — adding SLO test must NOT break the default chain.
8. **Demo artifact** at `sprints/sprint-3/artifacts/whatsapp-e2e.log` with the per-trial table + p95 line + per-segment trace.

---

## 5. What NOT to do (anti-scope to prevent drift)

- Do **not** modify production code paths (DO, webhook handler, projector, hooks, routes).
- Do **not** require real CF account or real Meta sandbox for the default test mode.
- Do **not** put the SLO test in the default `server test` script — it has its own `test:slo` runner.
- Do **not** ship a single-shot timing assertion. p95 over N is the contract.
- Do **not** add deps to root `package.json` (memory rule).
- Do **not** raw-`client.query()`-INSERT fixtures. Use `seedWorkspace`.
- Do **not** invent CF or Meta API method names — read `node_modules/.bun/.../*.d.ts` first.
- Do **not** push to remote.

---

## 6. Test plan (you author)

- **Synthetic (default):** 10 trials, in-process Hono + stubbed DO + local Postgres + memory MessageQueue + projector running. p95 measured.
- **Wrangler-dev (optional, may skip if flaky in env):** same synthetic envelope, but POSTs to a real `wrangler unstable_dev` instance with the real DO + real local queues. Documented in commit body whether you used this path.
- **Real-Meta (gated):** 1 trial against a real Meta sandbox number. `it.skipIf(...)`-guarded.

---

## 7. When you're done

```bash
bun install --frozen-lockfile && \
bun run check-types --force && \
bun run lint && \
bun -F @kuralle/core test && \
bun -F @kuralle/runtime test && \
bun -F server test && \
bun -F web test && \
bun -F server gen:openapi --check && \
bun -F server test:slo
```

All exit 0. (If `bun run check-types` hangs at workspace level, you may run per-package tsc directly OR document the hang as a known issue carrying forward from S3-04 — do not silently skip.) Then `git add` every file in §3 and:
```
git commit -m "[S3-06] runtime/slo: WhatsApp inbound → F2 visible E2E SLO test (≤ 4s p95)"
```

Commit body must include:
- The 10 trial latencies (or a summary: min / median / p95 / max).
- Per-segment latency breakdown for trial 1 (which layer is slowest).
- Whether you used `wrangler unstable_dev` or in-process Hono — and why.
- Whether the real-Meta gate fires in this environment (`KURALLE_SLO_REAL_META=1`?).
- One bullet per acceptance criterion confirming met / partial / missed.

If the SLO fails (p95 > 4000 ms), **do not commit a passing-on-paper claim.** Report the actual p95, identify which layer is slowest from the per-segment trace, and either (a) propose a fix scope or (b) flag the regression and ask manager to investigate. The honest "p95 = 5800ms; bottleneck is projector consume → tx commit at 3.2s; suspect partial-unique-index lookup cost" is far more valuable than a green test that hides reality.
