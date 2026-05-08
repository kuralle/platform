# Story Brief — `S3-05` continuation (resume from worker collision)

> **Role.** You are the same senior full-stack engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) that flagged the file-reversion blocker on the original S3-05 brief. You stopped before completing per the safety rule. The manager has resolved the collision (a parallel pi-glm diagnostic was running concurrently and its bisect mutations cascaded into your view; pi-glm has been killed; tree is now clean and stable). Resume from where you stopped, adopt the resolution below, and finish the story.
>
> **Mindset + standards + boundaries:** unchanged from `sprints/sprint-3/brief-S3-05.md`. Read that brief in full before continuing.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-05] conversations: list/get/live procedures + hooks + F1/F2 live-wired`. Do NOT push. **You MUST commit before exiting** — the original brief's commit policy still applies.

---

## 1. The blocker you flagged

Your transcript:

> While validating S3-05, I observed unexpected file reversion: `packages/core/src/repositories/conversation.ts` reverted to its pre-change state (missing `findManyByWorkspaceCursor`, `getDetail`, `getTurnsAfterSequence`) after I had already patched it and started wiring `conversations.{list,get,live}`. That created follow-on failures during server tests.

You were right to stop. The cause: a parallel `pi-glm` diagnostic worker was running concurrently. Its brief permitted it to do "temporary bisect reverts" of `packages/db/src/schema/conversations.ts` (the partial-index `.where()` clause), and during the window where its mutations were live, your edits to `packages/core/src/repositories/conversation.ts` were affected (likely a Drizzle row-type invalidation or a session-state interaction). The pi-glm worker has been killed. The tree is verified clean. You are now the **only** worker against this tree. No further collisions will happen during this run.

---

## 2. State of the world right now

**Last commit on `main`:** `976f3e7 [S3-04]`. No new commits since the collision.

**Already on disk from your prior run (uncommitted, salvaged):**

- `packages/api/src/routers/conversations.ts` — modified. Imports `conversationDetailSchema`, `conversationLivePollingSchema` from `./conversations.schemas`. Wires `list/get/live` procedures to repo methods `findManyByWorkspaceCursor`, `getDetail`, `getTurnsAfterSequence`. **These repo methods don't exist yet** — your job to write them.
- `apps/server/src/__tests__/conversations.test.ts` — new (218 lines). The integration test you wrote first (TDD-style). Exercises the procedures.

**Verified clean:**
- `apps/server/tsconfig.json` — bytewise identical to its `.bak` backup pi-glm made; restored cleanly. `.bak` and `.diag.json` leftovers were deleted by the manager.
- `packages/db/src/schema/conversations.ts` — partial-index `.where(sql\`message_id IS NOT NULL\`)` declaration intact. Pi-glm restored on its own way out.
- `packages/core/src/repositories/conversation.ts` — at S3-04 state. Missing the three new methods you intended to add (`findManyByWorkspaceCursor`, `getDetail`, `getTurnsAfterSequence`). YOU re-add them.
- `packages/api/src/routers/conversations.schemas.ts` — at S3-04 state. Missing the new schemas your router imports. YOU re-add them.
- `apps/web/src/hooks/api/conversations.ts` — at S3-04 state (only `useConversations`). YOU expand.
- F1/F2 routes — at S3-04 state (still using mocks). YOU rewire.
- `apps/web/README.md` — no "Conversation live wiring" section yet. YOU add.
- `apps/server/openapi.json` — needs regen after schema/router changes.
- `eslint.config.mjs` `forbidden-mock-import` `ignores` array — F1 + F2 paths still listed (so the rule doesn't fire). YOU remove F1/F2 from `ignores` after rewire.

**Pi-glm produced no diagnostic report** — its result file is 0 bytes. The check-types hang is a known carry-forward; the kimi gates will surface it; manager will address in `[S3-fix]`. **You do NOT need to debug check-types** as part of S3-05. If your story-level `check-types` run hangs at workspace level, run per-package tsc directly (e.g., `node /path/to/node_modules/.bin/tsc --noEmit -p packages/runtime/tsconfig.json`) to verify your own changes compile, document the workspace-level hang in the commit body, and proceed.

---

## 3. What you must complete

The full §3 of `sprints/sprint-3/brief-S3-05.md` stands as the contract. The CRITICAL items missing right now:

1. **`packages/core/src/repositories/conversation.ts`** — add three methods:
   - `findManyByWorkspaceCursor(opts: { cursor?: string | null; limit?: number; agentId?: string })` returning `{ items: Conversation[]; cursor: string | null }`. Sort by `(startedAt DESC, id DESC)`. Cursor encodes the last `(startedAt, id)` pair as base64 JSON.
   - `getDetail(conversationId: string)` returning `{ conversation, turns, toolCalls, extractedFields, evals }`. Internal: 5 small queries OR 1 join — IC picks; document.
   - `getTurnsAfterSequence(conversationId: string, afterSequence: number)` returning turns with `ordinal > afterSequence`, ascending.

2. **`packages/core/src/repositories/conversation.test.ts`** — expand:
   - cursor-pagination correctness across 3 seeded rows.
   - getDetail returns the right counts.
   - getTurnsAfterSequence threshold filter.

3. **`packages/api/src/routers/conversations.schemas.ts`** — add:
   - `conversationTurnSchema`, `conversationToolCallSchema`, `conversationExtractedFieldSchema`, `conversationEvalSchema`.
   - `conversationDetailSchema` (the bundle).
   - `conversationLivePollingSchema` (`{ kind: 'polling', sinceSequence, items: ConversationTurn[] }`).
   - If you use eventIterator streaming, add `conversationLiveEventSchema` (discriminated union).

4. **Verify your existing router edits at `packages/api/src/routers/conversations.ts`** still compile against the new schemas + repo methods. If they need adjustment (e.g., the schema export names you imported don't quite match what you write now), re-edit.

5. **`apps/web/src/hooks/api/conversations.ts`** — expand:
   - `useConversation({ workspaceId, conversationId })`.
   - `useConversationLive({ workspaceId, conversationId })` with polling fallback at 1Hz (or eventIterator if @orpc supports it — verify against installed `.d.ts` per original brief §2.24).

6. **`apps/web/src/hooks/api/conversations.test.tsx`** — expand or create. RTL + MSW. Cover both new hooks.

7. **F1 (`_app.conversations.index.tsx`)** — replace mocks with `useConversations`.

8. **F2 (`_app.conversations.$id.index.tsx`)** — replace mocks with `useConversation` + `useConversationLive`.

9. **`apps/web/README.md`** — add "Conversation live wiring" section.

10. **`eslint.config.mjs`** — remove F1 + F2 paths from `forbidden-mock-import` `ignores`. Keep F3 path.

11. **OpenAPI** — `bun -F server gen:openapi` and commit the diff.

12. **Demo artifact** — `sprints/sprint-3/artifacts/S3-05-f1-f2-live.txt` with vitest output.

13. **Stay AWAY from F3** (`_app.conversations.$id.live.tsx`) — S4 territory.

---

## 4. When you're done

```bash
bun install --frozen-lockfile && \
bun run lint && \
bun -F @kuralle/core test && \
bun -F @kuralle/runtime test && \
bun -F server test && \
bun -F web test && \
bun -F server gen:openapi --check
```

(If `bun run check-types --force` hangs at workspace level — the known carry-forward — run per-package tsc instead and document in commit body. Do not silently skip; name the carry-forward.)

All tests + lint exit 0. Then `git add` every file in §3 and:
```
git commit -m "[S3-05] conversations: list/get/live procedures + hooks + F1/F2 live-wired"
```

Commit body must include:
- Whether `eventIterator` from `@orpc/server` is wired or polling-only (verbatim from the `.d.ts` check).
- Cursor encoding choice (base64 JSON of `(startedAt, id)`).
- Whether `getDetail` is one big join or 5 small queries; rationale.
- Acknowledgement that the workspace-level `check-types` hang is a known carry-forward from S3-04 and you verified your changes compile via per-package tsc instead.
- One bullet per acceptance criterion (from `brief-S3-05.md §4`) confirming met / partial / missed.

If you hit ANOTHER blocker, **stop and ask** — do NOT improvise past contradictions. The S3-04 schema-blocker precedent showed the right behavior. The S3-05 file-reversion stop was also the right behavior. Keep doing that.
