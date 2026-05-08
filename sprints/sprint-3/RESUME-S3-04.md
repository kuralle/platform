# Resume — Sprint 3, mid-S3-04 (manager salvage)

> **Read this first if you're picking up Sprint 3 after a session compact, MacBook restart, or new-session paste of `SESSION_KICKOFF_PROMPT.md`.**
> Snapshot taken 2026-05-08 ~16:00 PT, before user-initiated MacBook restart.

---

## State of the world

**Last clean commit on `main`:** `41b806f [S3-03] cf-agent: MessagingDO + wrangler.jsonc + Meta webhook handler`.

**S3-04 is mid-salvage.** The work is on disk uncommitted because cursor (`agent --model auto -w`) stalled mid-run after writing all the requested files. Manager (the AI in the prior session) verified most of the test chain green, then was interrupted by the user before committing.

### What's on disk for S3-04 (uncommitted)

Modified:
- `bun.lock` — bullmq + ioredis-mock pinned
- `packages/db/src/migrations/meta/_journal.json` — entry for migration `0014`
- `packages/db/src/schema/conversations.ts` — partial unique index declaration on `(conversation_id, message_id) WHERE message_id IS NOT NULL`
- `packages/platform/package.json` — `bullmq` + `ioredis-mock` deps
- `packages/platform/src/node/message-queue.ts` — full BullMQ adapter (replaces 9-line stub)
- `packages/runtime/src/index.ts` — projector re-exports
- `packages/runtime/src/instrumentation/slo.ts` — `SLO_PROJECTOR_LAG_*` constants

New (untracked):
- `packages/db/src/migrations/0014_s3_04_conversation_turns_message_id_uidx.sql` — partial unique index
- `packages/runtime/src/projector/conversation.ts` + `.test.ts` — `projectConversationEvent`
- `packages/runtime/src/projector/projector-worker.ts` + `.test.ts` — `runProjectorWorker`
- `packages/runtime/src/projector/__fixtures__/synthetic-events.ts` — fixture generator
- `packages/platform/src/node/message-queue.test.ts` — BullMQ adapter tests with `ioredis-mock`
- `packages/runtime/src/instrumentation/slo.test.ts` — projector lag SLO test
- `sprints/sprint-3/brief-S3-03.md` — planning artifact
- `sprints/sprint-3/brief-S3-04.md` — original brief (ran into schema blocker)
- `sprints/sprint-3/brief-S3-04-continuation.md` — continuation directive (option A: focused migration)

### What's verified (before the interrupted final commit)

- `bun -F @kuralle/core test` → **69/69** ✅
- `bun -F @kuralle/runtime test` → **55/55** ✅ (was 49 before S3-04; +6 new)
- `bun -F @kuralle/platform test` → **55/55** ✅ (BullMQ adapter tests pass against ioredis-mock)
- `bun -F server test` → **36/36** ✅ (transient failure on a parallel run resolved when run alone)
- `bun -F web test` → **60/60** ✅
- `bun -F server gen:openapi --check` → ✅
- `bun run check-types` → **NOT confirmed clean.** Last run was killed by my own zombie-cleanup. Must re-run before commit.
- `bun run lint` → **NOT yet run after S3-04 work.** Must run.

### What's NOT done

- **No `[S3-04]` commit landed.** The salvage commit is pending.
- The `S3-04-projector-throughput.txt` demo artifact at `sprints/sprint-3/artifacts/` was not produced.

---

## Resume sequence

When you pick this up:

### 1. Sanity check (1–2 min)

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle
git log --oneline -3      # Verify HEAD is still 41b806f [S3-03]
git status -s             # Verify the S3-04 files listed above are still on disk
pgrep -fl "agent -p|pi -p|tsc -b|vitest" | head  # Verify no leftover background processes
```

If HEAD has moved past `41b806f`, the salvage probably already happened in another session — read `git log -10` and reconcile.

### 2. Verify the build chain (per the new check-types memory rule)

**One foreground call at a time.** Never chain check-types with other commands. Never run two check-types in parallel.

```bash
bun run check-types --force      # 4-min timeout; foreground only
bun run lint                     # foreground; 1 pre-existing warning expected
bun -F @kuralle/runtime test     # 55 tests expected
bun -F @kuralle/platform test    # 55 tests expected
bun -F server test               # 36 tests expected
bun -F web test                  # 60 tests expected
bun -F @kuralle/core test        # 69 tests expected
bun -F server gen:openapi --check  # drift green
```

If `check-types` accumulates zombies (multiple `tsc -b` processes alive simultaneously), `kill -9` them and `find . -name '.tsbuildinfo' -delete` per `feedback_check_types_foreground_only.md`.

### 3. Capture demo artifact (~30s)

```bash
bun -F @kuralle/runtime test --reporter=verbose 2>&1 \
  | tee sprints/sprint-3/artifacts/S3-04-projector-throughput.txt | tail -20
```

### 4. Manager-salvage commit

Stage every uncommitted file. Suggested final commit message + body draft below — adapt to whatever you actually verified.

```
[S3-04] runtime/projector: 16-shard consumer + Node BullMQ adapter + idempotent conversation projection

Manager-salvage commit. Cursor (`agent --model auto`) wrote the full S3-04
spec (migration 0014, projector function + worker, BullMQ Node adapter +
ioredis-mock tests, projector lag SLO constants + test, schema partial unique
index declaration) then stalled mid-run waiting on a model API response —
45 minutes idle, 0% CPU, no subprocess activity. Manager killed cursor and
verified the chain by hand:

- core 69/69, runtime 55/55, platform 55/55, server 36/36, web 60/60
- bun run check-types green (verified after killing leftover tsc -b zombies +
  purging .tsbuildinfo)
- bun -F server gen:openapi --check green
- bun run lint green (1 pre-existing warning in packages/env/src/web.ts)

Schema decision (per brief-S3-04-continuation.md option A): the original brief's
`(channel_endpoint_id, message_id)` unique index was infeasible because
`channel_endpoint_id` is not a column on `conversation_turns`. Replaced with a
partial unique index on `(conversation_id, message_id) WHERE message_id IS NOT
NULL`. Functionally equivalent for webhook-replay correctness because
channel_endpoint_id is derivable from conversation_id via messaging_threads.
Migration 0014_s3_04_conversation_turns_message_id_uidx.sql.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 5. Continue Sprint 3 Phase A

After `[S3-04]` lands:

- **S3-05** — frontend conversation hooks (`apps/web/src/hooks/api/conversations.ts` + F1/F2 wiring + the `conversations.{list,get,live}` oRPC procedures). Cursor `--model auto` IC. Brief NOT yet written.
- **S3-06** — end-to-end SLO test (4-second WhatsApp inbound → F2 visible). Cursor `--model auto` IC. Brief NOT yet written.

### 6. Phase B — batched gates (5-way parallel)

After S3-05 + S3-06 commit, fire **5 kimi gates in parallel** (one per story commit sha): S3-02, S3-03, S3-04, S3-05, S3-06. (S3-01 already had its standalone kimi gate + `[S3-01-fix]`.)

```bash
# For each {nn} in 02..06:
{
  cat .handoff/references/ship-it.md
  printf '\n\n<task>\n'
  cat sprints/sprint-3/brief-gate-S3-{nn}.md  # NEED TO WRITE these gate briefs
  printf '\n</task>\n'
} > .handoff/prompt-gate-S3-{nn}.md

pi -p --provider opencode-go --model kimi-k2.6 \
  "@.handoff/prompt-gate-S3-{nn}.md" \
  < /dev/null > .handoff/result-gate-S3-{nn}.txt 2>&1 &
```

Manager reads all 5 gate reports, applies all Apply-now items in a single `[S3-fix]` commit.

### 7. Sprint Phase B sandwich

- Manager r1 sprint-level review at `sprints/sprint-3/review-sprint-r1.md`.
- Codex r2 adversarial review at `sprints/sprint-3/review-sprint-r2.md`.
- Sprint-level fix-pass `[S3-fix]` for any r1/r2 findings.
- Closeout: `WARMDOWN.md`, `HANDOFF.md`, `STATE.md` pointing at sprint 4. Atomic `[S3-close]`.

---

## Standing rules in effect (saved memory — verify they're loaded)

1. **`feedback_pi_is_default_ic.md`** — cursor `--model auto` is default IC; pi/deepseek-v4-pro is fallback; pi/kimi-k2.6 is gate; codex/gpt-5.3-codex is r2.
2. **`feedback_check_types_foreground_only.md`** — `bun run check-types` foreground only, 4-min timeout, kill any concurrent `tsc -b` zombies on sight, purge `.tsbuildinfo` if stuck.
3. **`feedback_batch_gates_when_speed_matters.md`** — gates batched after Phase A this sprint (already invoked).
4. **`feedback_workers_in_background.md`** — every IC/gate/r2 invocation `run_in_background: true`.
5. **`feedback_strong_role_prompting.md`** — every brief opens with rich persona (identity + expertise + mindset + standards + boundaries).
6. **`feedback_no_root_dep_pollution.md`** — no deps in root `package.json`.

---

## Two prompts you can paste to resume

**(A) After session compact (same session, same MacBook session):**
```
Resume Sprint 3. Read sprints/sprint-3/RESUME-S3-04.md first — it documents the in-flight S3-04 manager salvage. Pick up at the "Resume sequence" section and continue from step 1.
```

**(B) Fresh new session (after MacBook restart, new Claude Code session):**
```
Paste the contents of sprints/SESSION_KICKOFF_PROMPT.md as usual. Once oriented, also read sprints/sprint-3/RESUME-S3-04.md before doing anything else — it documents the in-flight S3-04 manager-salvage state that the kickoff prompt's normal Step 0 reading (STATE.md, HANDOFF, WBS) doesn't cover. STATE.md still says sprint 3 is active. The S3-04 work is on disk uncommitted; finish that salvage commit before moving to S3-05.
```
