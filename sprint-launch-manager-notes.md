# Sprint L — Manager Notes (ready-to-launch execution, 2026-06-10)

Goal: kuralle-platform from "UI + unplugged backend" to **ready to launch** (chat-first,
WhatsApp deploy, CF default). Plan: `SPRINT_LAUNCH_WBS.md`. All chunks delegated with
ship-it/autonomous contracts, proof-gated, diff-reviewed, and re-verified by the manager.

## Chunks

| Chunk | What | Worker | Status |
|---|---|---|---|
| L0-1 | @kuralle-agents 0.5.0 → 0.8.5 → **0.9.0**; `agents@^0.15.0` latent-crash fix | cursor (partial, killed in error) + manager | ✅ committed |
| L1-1 | **Keystone**: deps inside the DO, `loadAgentIr`/`loadAgentGraph` (multi-agent), `resolveModel` (secrets + env) | cursor (killed in error — work survived) + manager (FK cleanup fix) | ✅ workerd-proven |
| L1-2 | DB tool resolvers + IR guardrail evaluators (block/redact/flag/escalate→validate) | cursor (partial) + claude (wiring) | ✅ 162/162 |
| L1-3 | **Reply path**: outbound-delivery on 0.9.0 primitives, DO WindowStore, per-tenant creds, delivery events | cursor | ✅ workerd full-loop |
| L2-1 | Onboarding (workspace ctx + create flow) — found already wired; MSW test added | cursor | ✅ |
| L2-2 | `agents.testTurn` + C10 drawer (draft IRs, shared resolvers) | cursor | ✅ 2/2 re-verified |
| L3-1 | Deploy surface: bindAgent/status/webhookInfo + phone-numbers UI | cursor | ✅ 6/6 re-verified |
| L3-2 | RBAC (Better-Auth-native member.role via packages/core auth-guard) + pagination | cursor | ✅ 4/4 re-verified |
| L4-1 | Launch-gate E2E + BL-S3-07 timestamps | cursor | 🔄 in flight |

## Manager review fixes (changes after worker delivery)
- slo-do-assistant-turn: FK cleanup order (detach activeVersionId before deleting versions).
- agents@0.11.9 stale lockfile violating cf-agent's >=0.14 peer → explicit ^0.15.0.
- Removed worker scratch tsconfigs; stale runtime dist rebuild (1 phantom test failure).
- aria-flow side (separate repo, commit 75700c5 + v0.9.0 release): safeDeliver rejection
  guard in the coalescer; `code_method` grep-obfuscation revert; renderChoices relocation.

## Worker-ops lessons (persisted to memory)
- cursor agent CLI buffers ALL stdout to the end → 0-byte result files mean nothing;
  liveness = PID + file mtimes. Three healthy workers were killed before learning this;
  their in-tree work was correct and was completed/recovered.
- Monitors: sentinel + blocked-file + PID only (delegate-skill pattern); on
  exit-without-sentinel, inspect the tree before re-firing.
- codex daily usage cap (resets ~8:23AM); pi stalled on this repo's large prompts once.

## Verification (manager-run, not worker-claimed)
- workerd SLO suite: assistant-turn (single + 2-agent handoff) 3/3; outbound full-loop +
  window-defer green. runtime 162/162; api suite incl. rbac-matrix 2/2 + pagination 2/2;
  channels.deploy 6/6; testTurn 2/2; server 29/29; web suites green per proofs.

## Architecture decisions recorded
- Deployment = config-as-data: publish flips `activeVersionId`; endpoint binding makes it
  live; per-conversation DOs; nothing deploys. Mid-conversation publishes: latest-active
  wins (named product decision).
- Multi-agent: `loadAgentGraph` resolves subagent attachments (workspace-scoped, cycle
  guard, depth 5) — one deployable, handoffs inside the DO.
- RBAC: linear role hierarchy read from Better-Auth org `member` rows through ONE guard
  (`packages/core/src/auth-guard.ts`); migrate to ac/hasPermission statements there if
  per-resource permissions ever diverge from the linear model.
- 24h window derives from last inbound (not status-webhook conversation objects) — Graph
  v24-proof.

## Residuals (post-launch backlog)
- Template recovery for closed-window sends: typed `templateStrategy` seam exists,
  no strategist shipped (engagement-layer strategist is available when needed).
- Drawer test sessions are ephemeral (worker-instance lifetime) — documented behavior.
- Voice track (S4-01..03) and Stripe billing: explicitly out of launch scope.
- L1-2 soft spots flagged for L4 review: guardrail-evaluator fail-open + MCP "honest
  error" paths not explicitly re-verified line-by-line.
- BL-S3-02 (slow workspace-level tsc -b) unresolved; per-package checks are the workaround.
