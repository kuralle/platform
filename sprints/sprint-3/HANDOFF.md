# Handoff — Sprint 3 → Sprint 4

> **One page. Read this before doing anything else.** Depth lives in [`WARMDOWN.md`](./WARMDOWN.md); this is the read-me-first.

---

## State of the world (one paragraph)

Sprint 3 (First channel + first conversation) is complete. WhatsApp inbound flows real-pipeline through the real `MessagingDO` (extending `@ariaflowagents/cf-agent` `AriaFlowAgent`, verified loadable + caller-emitting in workerd via `@cloudflare/vitest-pool-workers`) into `conversations + conversation_turns`; F2 polls and renders the caller's message at p95 = 70ms over 10 trials (4000ms threshold; 57× headroom). The kimi sprint-level gate found 3 blockers + 4 majors which all landed in `[S3-fix]`; codex r2 found 4 more majors which all landed in `[S3-fix-2]`. **Sprint 4 must read `WARMDOWN.md §4 KI-3-01` first** — `MessagingDO.processInbound` calls `super.onChatMessage` only when `runtimeAgents.length > 0`; production wiring of `loadAgentIr` + `resolveModel` deps (so assistant turns generate from inbound webhook events) is intentionally deferred to S4 voice as **BL-S3-01**, the natural fit because the voice runtime owns the same broader question (how does the agent loop fire from a channel event vs a WebSocket chat frame).

---

## Sprint 4 goal (verbatim from WBS)

**Owner-Operator dials their assigned Twilio number, the agent answers within 3 s cold or 600 ms warm, transcript streams into F3 with ≤ 1.5 s lag (USER_JOURNEYS §2 SLO #3), and the full 5-min-to-first-call promise (SLO #1) holds end-to-end through a recorded demo.**

The full sprint section is at `sprints/WBS.md` § Sprint 4 (S4-01 .. S4-05).

---

## Read these first (in this order, before delegating any story)

1. `sprints/STATE.md` — confirms the active sprint and the load-bearing reading list.
2. `sprints/WBS.md` § Sprint 4 (S4-01 .. S4-05).
3. `sprints/sprint-3/WARMDOWN.md` §4 (Known issues — especially KI-3-01 onChatMessage gap as BL-S3-01) + §7 (Backlog — BL-S3-01..05) + §8 (retrospective — try-next pre-flighting workerd tests for DO code).
4. **`INTERFACE_DESIGNS_RuntimeHost.md §5`** — synthesis chosen for `RuntimeHost`; S4 ships the voice half. **§C** — DO hibernation contract (re-read; voice DO has same shape).
5. **`USER_JOURNEYS.md §3`** — Journey 1, the 5-min first-call promise (SLO #1). `§9a` — voice caller experience. `§10b` — cold-start mechanics + pre-warm cron.
6. `DATA_MODEL.md §9` — `runtime_deployments` lifecycle, `voice_calls` sidecar, `session_checkpoints`.
7. `apps/server/src/durable-objects/MessagingDO.ts` — read it FULLY. The S4 `WorkspaceVoiceDO` mirrors the same `AriaFlowAgent`-subclass shape but spawns/manages a Cloudflare Container (per `INTERFACE_DESIGNS_RuntimeHost.md §5`). The pattern, the dep-injection seam (`__messagingDODeps`), the `state.blockConcurrencyWhile`-gated DB restore, the `onChatMessage` invocation discipline — all reusable.
8. `apps/server/src/__tests__/slo-do-real-loop.test.ts` + `apps/server/vitest.slo.do.config.ts` — the workerd-backed test pattern. **S4-01 must use this from day one** — do not wait for a kimi gate to discover that plain Node vitest can't load CF-runtime types.
9. `~/.claude/projects/-Users-mithushancj-Documents-asyncdot-openscoped-voice-platform-kuralle/memory/MEMORY.md` — five new memory rules saved this sprint. Especially `feedback_no_shell_implementations.md` (paste the brief-snippet into every S4 brief), `feedback_targeted_type_check_only.md` (per-package tsc only — workspace hang carry-forward), `feedback_sequential_workers_only.md` (no parallel workers, no worktrees).

---

## Traps to know about

- **Workspace `bun run check-types --force` hangs.** 100% CPU on `apps/server` tsc -b for >60min. Per-package tsc works fine. Memory rule `feedback_targeted_type_check_only.md` enforces per-package only. RC investigation is BL-S3-02 (separate spike before S5). **Do not run workspace check-types** in any S4 verification chain.
- **`new_sqlite_classes` in `wrangler.jsonc` migrations** (added in `[S3-fix]`). The `WorkspaceVoiceDO` will follow the same pattern — declare it as `new_sqlite_classes` from day one if it extends an `AIChatAgent` base. Update the migration tag accordingly.
- **The `onChatMessage` invocation pattern in `MessagingDO.processInbound`** (lines 172-198 after `[S3-fix-2]`) — reusable for `WorkspaceVoiceDO` if it also needs to trigger the runtime from non-WebSocket events. Drain the SSE response, catch errors into `workingMemory.lastRuntimeError`, do not let runtime errors break the inbound flow.
- **Cursor's pattern of out-of-scope diagnostic experiments** — caught twice this sprint (commenting out production source, `git checkout` on prior commits). The brief-snippet from `feedback_no_shell_implementations.md` includes hard-prompts against this. Use it.
- **Per-package tsc tip**: `node_modules/.bin/tsc --noEmit -p packages/<pkg>/tsconfig.json` directly. The brief-snippet has a one-liner that auto-discovers touched packages from `git diff --name-only HEAD`.
- **Cursor `--model auto` is the default IC** (since mid-S3 — memory rule rewrite). Pi/deepseek-v4-pro is fallback only. Cursor's commit-on-exit semantics + multi-model routing are more reliable for IC work.
- **Adversarial r2 timing**: WARMDOWN's retrospective recommends running codex r2 **before** manager r1 in S4 (instead of after) so r1 can fold r2's findings into one sandwich + one fix-pass commit. Worth trying.
- **F3 (`_app.conversations.$id.live.tsx`)** still on mocks per S4-03's plan. Don't rewire it before S4-03 fires.
- **AriaFlowAgent's onChatMessage requires `getAgents()` to return at least one agent.** When test paths inject `__messagingDODeps` without a `loadAgentIr` callback, `runtimeAgents` stays `[]` and `onChatMessage` is intentionally skipped (the brief-S3-fix-2 commit body explains this). For production, S4-01 must wire a real `loadAgentIr` that loads the workspace's `agent_versions.snapshot` and runs it through `irToAgentConfig`.

---

## Open issues that block sprint 4

| Issue | Severity | Status |
|-------|----------|--------|
| BL-S3-02 workspace tsc hang | Major (workflow) | Mitigated by per-package memory rule; spike between S3 and S5. **Doesn't block S4 directly.** |
| BL-S3-01 production `loadAgentIr` + `resolveModel` deps wiring | Major | **Maps to S4-01** (`WorkspaceVoiceDO` will need the same dep-injection seam wired with production data sources for voice; the messaging side gets it free as a side-effect). |

S4 is unblocked. The `[S3-fix]` + `[S3-fix-2]` work is the foundation S4-01 builds on top of.

---

## Start by running

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle && \
  cat sprints/STATE.md && \
  bun install --frozen-lockfile 2>&1 | tail -3 && \
  bun run lint 2>&1 | tail -3 && \
  bun -F @kuralle/core test 2>&1 | tail -5 && \
  bun -F @kuralle/runtime test 2>&1 | tail -5 && \
  bun -F @kuralle/platform test 2>&1 | tail -5 && \
  bun -F server test 2>&1 | tail -5 && \
  bun -F web test 2>&1 | tail -5 && \
  bun -F server gen:openapi --check 2>&1 | tail -3 && \
  bun -F server test:slo 2>&1 | tail -5 && \
  bun -F server test:slo:do 2>&1 | tail -5 && \
  echo "✅ S3 baseline confirmed; S4 ready"
```

**Do NOT run `bun run check-types` or `bun -F server check-types`** — workspace hang carry-forward (per memory rule). Per-package tsc is the verification path.

Expect: 0 lint errors (1 pre-existing warning), 72 core, 59 runtime, 55 platform, 26 server, 63 web, OpenAPI drift green, test:slo 1+1 (skipped), test:slo:do 1/1.

If anything fails on first run: kill any leftover `tsc -b` processes (`pgrep -fl 'tsc -b' | xargs kill -9`), purge `.tsbuildinfo` (`find . -name '.tsbuildinfo' -delete`), retry once.

---

## When you're done

End the session after the warm-down. The next session pastes `sprints/SESSION_KICKOFF_PROMPT.md` and picks up from `sprints/STATE.md`.
