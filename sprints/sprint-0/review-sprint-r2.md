# Review (r2, second opinion) — Sprint 0 Foundations

> Reviewer: codex (GPT-5) · 2026-05-07  
> Scope: `git diff e152186..HEAD`, all Sprint 0 inputs in brief order.

## 1. What r1 got right, and what it missed

r1 correctly identified the global lint relaxations and the `@cloudflare/workers-types` architectural smell. I disagree with r1’s “Approve with minor fixes” verdict because it missed two blocking contract/architecture violations and one high-risk runtime bug path.

### Missed blocker A — Hook-wrapper gate is bypassable today (major)
- Evidence:
  - [`apps/web/src/providers/api-provider.tsx`] defines and exports a concrete `$api` client singleton.
  - [`apps/web/src/hooks/api/health.ts`] imports `$api` from provider, but nothing prevents any component from doing the same.
  - [`eslint.config.mjs`] only restricts `@kuralle/api-client` imports; it does **not** restrict importing `@/providers/api-provider`.
- Why this is a violation:
  - `brief-S0-05` requires “components never call the underlying client directly” and lint-enforced hook-wrapper purity.
  - `AMENDMENT-001` keeps the same rule.
- Impact:
  - A component can bypass hooks with `import { $api } from '@/providers/api-provider'` and call `$api.*` directly while passing lint.
- r1 miss:
  - r1 validated the restricted import rule, but not this alternate path.

### Missed blocker B — Hexagonal rule 1 is still unenforced for memory adapter (major)
- Evidence:
  - [`eslint.config.mjs`] blocks `@kuralle/platform/cloudflare` and `@kuralle/platform/node` only.
  - It allows `@kuralle/platform/memory` everywhere, including production source under `packages/{core,api,db,runtime}/**`.
- Why this is a violation:
  - `HEXAGONAL_ARCHITECTURE.md §6 rule 1` is explicit: domain layers may import only `platform/interface.ts`.
- Impact:
  - Production code can silently bind to memory behavior and pass tests, then diverge in real CF/Node runtime.
- r1 miss:
  - r1 labeled this minor; per the architecture rule text, this is major.

### Missed high-risk runtime bug — MessageQueue ambiguous ack/nack + stop-mid-drain edge behavior (major)
- Evidence in [`packages/platform/src/memory/message-queue.ts`]:
  - If handler calls both `ack()` and `nack({ requeue: true })`, message is requeued even though acked (nack path pushes immediately).
  - `stop()` removes `consumerList[consumerList.length - 1]` at stop-time, not the specific registered consumer; wrong consumer can be removed when multiple consumers exist.
  - `drain()` snapshots `consumerList`; if all consumers are removed during drain, indexing can hit `undefined` path and repeatedly requeue.
- Why this matters:
  - `HEXAGONAL §6 rule 3` requires the memory adapter as the honest domain-test seam. Queue semantics bugs in the seam can mask or invent failures.
- r1 miss:
  - r1 only states race fixed; these edge transitions were not evaluated.

### Additional misses (non-blocking)
- `apps/web/src/hooks/api/health.test.tsx` only verifies hook state transitions with mocked `queryOptions`; it does not verify B1 render-path behavior in [`apps/web/src/routes/_app.home.tsx`] (the brief asked for the visible indicator behavior).
- `packages/platform/src/memory/contract.test.ts` does not exercise `voice.openSupervisorTap()` behavior beyond existence, despite RuntimePlatform synthesis obligations in `INTERFACE_DESIGNS_RuntimeHost.md §5`.
- `sprints/sprint-0/artifacts/S0-04-drift-ci.txt` is partly narrative/placeholder text (`// ...`, inferred diff text), not a strict raw transcript. This weakens artifact authenticity.

## 2. Apply-now items before sprint closeout

1. Close the hook-wrapper bypass:
   - Stop exporting `$api` from provider, or
   - Add lint rules that forbid importing `@/providers/api-provider` outside `hooks/api/**` (and provider root itself).
2. Enforce `HEXAGONAL §6 rule 1` literally:
   - Forbid `@kuralle/platform/memory` imports in production source under `packages/{core,api,db,runtime}/**`.
   - Allow only test-file exceptions.
3. Harden `MemoryMessageQueue` semantics:
   - Define and enforce ack/nack mutual exclusivity.
   - Fix `stop()` to remove the exact registered consumer.
   - Make drain behavior robust when consumer set mutates during iteration.
   - Add tests for: ack+nack same message, neither ack/nack, stop mid-drain with multiple consumers.
4. Replace narrative artifact lines in `S0-04-drift-ci.txt` with literal command outputs.

## 3. Carry-forwards

1. Add an integration-style UI test for the B1 health pill state mapping (`loading/down/live`) instead of hook-only tests.
2. Extend `packages/platform/src/memory/contract.test.ts` to cover supervisor tap and diagnostics behavior more concretely.
3. Keep r1’s lint-scope carry-forward (global relaxations -> file-scoped overrides).

## 4. Verdict

**Override r1.** r1 under-classified two architecture/contract violations as minor or missed them (hook-wrapper bypass, memory-adapter import leakage) and missed major queue edge-case behavior in the memory seam. Sprint 0 should not close until the Apply-now set above is resolved.
