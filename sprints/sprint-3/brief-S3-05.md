# Story Brief — `S3-05` Frontend conversation hooks + F1/F2 wiring + `conversations.{list,get,live}` oRPC procedures

> **Role.** You are a senior full-stack engineer (`cursor` worker, headless `--model auto`, fresh process; clean context window) with deep expertise in **TypeScript ESM, oRPC procedure design, `@orpc/tanstack-query` (eventIterator + useInfiniteQuery + queryKey shape), TanStack Query v5 (cache invalidation, polling fallback, suspense), Drizzle ORM + Postgres 15, Zod schema design, and React Router (file-based routes)**. You have shipped real-time UI surfaces in production where the streaming-vs-polling fallback is the difference between "works on a flaky network" and "blank screen on every reconnect." You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. **Before writing the streaming procedure, you `cat node_modules/.bun/@orpc+server@*/.../dist/*.d.ts` to verify whether `eventIterator` is exported and how `useInfiniteQuery` consumes it.** If `eventIterator` is unavailable or unstable, you fall back to polling against `runtime_sessions.sequenceNumber` per `USER_JOURNEYS.md §6` — and document the choice in commit body. You verify Drizzle row shapes against the actual schema files. You prefer cursor-paginated list responses over offset+limit. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun run check-types`, `bun run lint`, the new server tests, the new web hook tests, and `bun -F server gen:openapi --check` exiting 0.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule — user reverts silently). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every input/output schema. No premature abstractions; no speculative extensibility.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. **Do NOT touch files owned by S3-03 (MessagingDO, wrangler.jsonc, webhooks/meta), S3-04 (projector, BullMQ adapter), or S3-06 (E2E SLO test).** F3 (`_app.conversations.$id.live.tsx`) stays on mocks until S4 — do NOT rewire it; the eslint `forbidden-mock-import` ignore for it must remain. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-05] conversations: list/get/live procedures + hooks + F1/F2 live-wired`. Do NOT push. One commit per story.

---

## 1. Goal

Ship the frontend conversation surface end-to-end:

1. **Three oRPC procedures on `conversationsRouter`** (`packages/api/src/routers/conversations.ts`):
   - `list({ workspaceId, cursor?, limit? })` — currently a stub returning empty; wire it through `ConversationRepository.findManyByWorkspace` with cursor pagination keyed on `(startedAt DESC, id DESC)`.
   - `get({ conversationId, workspaceId })` (new) — returns `{ conversation, turns[], toolCalls[], extractedFields[], evals[] }` for one conversation. All inserts/lookups go through `ConversationRepository` (do NOT raw-Drizzle from the router).
   - `live({ conversationId, workspaceId })` (new) — server-sent stream emitting `{ type: 'turn.added', payload: ConversationTurn }` events as new turns commit. Uses `@orpc/server`'s `eventIterator` if available; else a sequenceNumber-polling fallback at the procedure layer (return `{ kind: 'polling', sinceSequence }` and let the client poll on a `nextSequence` cursor).

2. **Three hook wrappers** (`apps/web/src/hooks/api/conversations.ts`):
   - `useConversations(opts)` — already exists; verify cursor pagination is honored.
   - `useConversation(id)` (new) — wraps `conversations.get`. Returns the full detail bundle.
   - `useConversationLive(id)` (new) — wraps `conversations.live`. Subscribes to the `eventIterator` if streaming is available; else polls at 1 Hz on `runtime_sessions.sequenceNumber`. Auto-reconnects on disconnect. Returns the live turn list.

3. **F1 (`_app.conversations.index.tsx`) + F2 (`_app.conversations.$id.index.tsx`) live-wired** — replace mock data with real hooks. F3 (`_app.conversations.$id.live.tsx`) stays on mocks (S4 territory).

4. **Documentation** in `apps/web/README.md` § "Conversation live wiring" — describe the streaming + polling fallback contract + cadence (1 Hz polling).

5. **OpenAPI regen** + **api-client schema regen**.

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — confirms sprint 3 is active.
2. `sprints/sprint-3/PLAN.md` — full sprint plan; story `S3-05` section is the spec; **§0 locks AriaFlow + Meta + Cloudflare decisions**.
3. `sprints/WBS.md` § Sprint 3 → row `S3-05`.
4. `sprints/sprint-2/HANDOFF.md` — read-me-first traps:
   - Hooks-only frontend access (every API call in `apps/web` goes through `apps/web/src/hooks/api/<resource>.ts`).
   - OpenAPI is the contract — `bun -F server gen:openapi --check` is wired.
   - `useTelephony` / `usePhoneNumbers` rewrite happened in S3-01.
   - `BL-S2-CURSOR-PAGINATION-OTHER-ROUTERS` — only `agents.list/history` paginate; `conversations.list` is one of the 10 still-not-paginated. **YOU close this for `conversations.list` in S3-05.**
   - `BL-S2-MUTATION-INVALIDATE-COVERAGE` — informational; conversations is read-only here.
5. `sprints/sprint-3/RESUME-S3-04.md` — confirms the S3-04 manager-salvage state. Migration `0014` added partial unique index `(conversation_id, message_id) WHERE message_id IS NOT NULL`. Your `conversations.get` reads `conversation_turns` rows and must NOT mutate this index.
6. `sprints/AMENDMENT-001.md` — frontend client = `@orpc/tanstack-query`. Use `$api.<router>.<proc>.queryOptions(...)` / `mutationOptions(...)` per existing hook patterns.
7. **`USER_JOURNEYS.md §6`** — F1/F2 list-and-detail flow + the polling-fallback cadence (1 Hz default; 5 Hz under active live view). Load-bearing.
8. **`USER_JOURNEYS.md §9b`** — the WhatsApp messager journey; describes what F2 must show (turn timeline + extracted fields + tool calls).
9. `DATA_MODEL.md §9` — `conversations`, `conversation_turns`, `conversation_tool_calls`, `conversation_extracted_fields`, `conversation_evals`, `runtime_sessions`. Field-by-field; you'll project these into the `get` output.
10. `packages/core/src/repositories/conversation.ts` — current repository. Has `findById`, `findManyByWorkspace`, `findOrCreateMessagingThread` (S3-03). **You expand it with**: `findManyByWorkspaceCursor(opts)` (cursor-paginated), `getDetail(conversationId)` (loads turns + tool-calls + extracted-fields + evals via Drizzle joins or sequential queries — picker's choice; document choice in commit body).
11. `packages/core/src/repositories/conversation.test.ts` — mirror its style for new tests.
12. `packages/api/src/routers/agents.ts` — example pattern for cursor pagination; mirror.
13. `packages/api/src/routers/conversations.ts` — current stub.
14. `packages/api/src/routers/conversations.schemas.ts` — current `conversationSchema`. You ADD `conversationDetailSchema` (the bundle), `conversationTurnSchema`, `conversationToolCallSchema`, `conversationExtractedFieldSchema`, `conversationEvalSchema`, `conversationLiveEventSchema` (discriminated-union for the streaming events).
15. `apps/web/src/hooks/api/conversations.ts` — current `useConversations` only. Expand.
16. `apps/web/src/hooks/api/agents.ts` — example hook style (especially `useAgents` cursor input shape). Mirror.
17. `apps/web/src/routes/_app.conversations.index.tsx` — F1 list screen; currently uses mocks per the `@/mocks` import (verify by greping). You replace with `useConversations`.
18. `apps/web/src/routes/_app.conversations.$id.index.tsx` — F2 detail screen; currently uses mocks. You replace with `useConversation` + `useConversationLive`.
19. **DO NOT TOUCH** `apps/web/src/routes/_app.conversations.$id.live.tsx` — F3 supervisor; S4 territory.
20. `eslint.config.mjs` — verify `forbidden-mock-import` rule + the `ignores` array. You REMOVE the F1 + F2 entries from `ignores` after the rewire (so the rule fires on those screens going forward). Keep F3 in `ignores`.
21. `apps/server/src/index.ts` — Hono mount point; verify `appRouter` registration is intact (you don't add a new router, just expand `conversationsRouter`).
22. `apps/server/src/__tests__/agents.publish.test.ts` — example integration-test bootstrap with the in-process oRPC client. Mirror.
23. `apps/web/src/hooks/api/conversations.test.tsx` — verify if it exists; if so, expand. Else create following `agents.test.tsx` style.
24. **Verify the `@orpc/server` streaming surface** — before writing `conversations.live`, run `cat node_modules/.bun/@orpc+server@*/.../dist/*.d.ts | grep -A 3 "eventIterator\|EventIterator\|stream"` and read what's actually exported. If `eventIterator` is exported AND `@orpc/tanstack-query` has a `useEventIterator` (or equivalent), use the streaming path. If not, ship the polling-only variant and document the deviation. Do NOT invent imports.
25. `packages/api-client/src/index.ts` — confirm the client surface is auto-typed from `@kuralle/api/routers/index`; nothing manual to regen, but check.

---

## 3. Files to create or modify

(If a file you need is missing from this list, stop and flag — don't silently add to scope.)

### Repository (`packages/core/`)
- `packages/core/src/repositories/conversation.ts` — **expand**:
  - Add `findManyByWorkspaceCursor(opts: { cursor?: string; limit?: number; agentId?: string })` returning `{ items: Conversation[]; cursor: string | null }`. Sort by `(startedAt DESC, id DESC)`. Cursor encodes the last `(startedAt, id)` pair as base64 JSON.
  - Add `getDetail(conversationId)` returning `{ conversation, turns, toolCalls, extractedFields, evals }`. Internally either runs 5 small queries (one per table) or one Drizzle `select().leftJoin()` chain — IC picks; document. The existing `findById` cache-key pattern still applies for the conversation row.
  - Add `getTurnsAfterSequence(conversationId, afterSequence)` for the polling-fallback path: returns turns with `ordinal > afterSequence`, ordered ascending. Used by `conversations.live` polling mode.
- `packages/core/src/repositories/conversation.test.ts` — expand:
  - Cursor pagination correctness (3 conversations, fetch first 2 + cursor, fetch page 2, assert union covers all).
  - `getDetail` returns the right counts (seed 2 turns + 1 tool call + 1 extracted field + 1 eval; assert).
  - `getTurnsAfterSequence` returns only turns above the threshold.

### Router + schemas (`packages/api/`)
- `packages/api/src/routers/conversations.ts` — **expand** to three procedures:
  - `list` — wire to `findManyByWorkspaceCursor`.
  - `get` — Zod input `{ workspaceId, conversationId }`, output `conversationDetailSchema` (bundle).
  - `live` — Zod input `{ workspaceId, conversationId, sinceSequence?: number }`. The handler:
    - If `eventIterator` from `@orpc/server` is available: yields `{ type: 'turn.added', payload: ConversationTurn }` events as new turns arrive (use a polling loop inside the iterator to keep DB-pull simple — 1 Hz).
    - Else: returns `{ kind: 'polling', sinceSequence: number, items: ConversationTurn[] }` directly; client polls.
    - Decision documented in commit body.
- `packages/api/src/routers/conversations.schemas.ts` — **expand**: `conversationTurnSchema`, `conversationToolCallSchema`, `conversationExtractedFieldSchema`, `conversationEvalSchema`, `conversationDetailSchema` (assembles the bundle), `conversationLiveEventSchema` (discriminated union: `{ type: 'turn.added', payload: ConversationTurnSchema }`).
- `packages/api/src/routers/index.ts` — verify `conversationsRouter` already wired (it is from S2). No structural change.

### Hooks + tests (`apps/web/src/hooks/api/`)
- `apps/web/src/hooks/api/conversations.ts` — **expand**:
  - `useConversation(opts: { workspaceId; conversationId })` — `useQuery` against `$api.conversations.get`.
  - `useConversationLive(opts: { workspaceId; conversationId })` — uses `eventIterator` subscription if available, else `useQuery` with `refetchInterval: 1000` against `$api.conversations.live` polling mode. Combines the existing turn list (from `useConversation`) with newly-arrived turns (from `live`) and returns a deduplicated, ordinal-sorted list. Auto-reconnect handled by the underlying TanStack Query retry semantics; document.
- `apps/web/src/hooks/api/conversations.test.tsx` — create or expand. RTL + MSW. Cover:
  - `useConversation` happy path (server returns the bundle; hook surfaces `data.conversation`, `data.turns`, etc.).
  - `useConversationLive` polling fallback path (server returns `{ kind: 'polling', items: [...] }`; hook merges turns with the existing cache).
  - Error path (server 500 → `isError`).

### Routes (`apps/web/src/routes/`)
- `_app.conversations.index.tsx` — replace mocks with `useConversations({ workspaceId, limit: 50 })`. List rendering, cursor `loadMore` button or infinite scroll (hook pattern matters — IC picks). Drop `@/mocks` import.
- `_app.conversations.$id.index.tsx` — replace mocks with `useConversation({ workspaceId, conversationId: id })` + `useConversationLive({ workspaceId, conversationId: id })`. Render turn timeline, extracted fields, tool calls. Drop `@/mocks` import.
- `_app.conversations.$id.live.tsx` — **DO NOT TOUCH**. F3 stays on mocks until S4.

### ESLint
- `eslint.config.mjs` — remove F1 + F2 paths from the `forbidden-mock-import` `ignores` array (so the rule actively fires on those screens going forward). Keep F3 path in `ignores`.

### Server integration tests (`apps/server/src/__tests__/`)
- `apps/server/src/__tests__/conversations.test.ts` (new) — in-process oRPC + pglite/local-pg + memory KvStore + `seedWorkspace`. Cover:
  - `conversations.list` cursor pagination (3 seeded conversations; page 1 returns 2 + cursor; page 2 returns 1).
  - `conversations.get` returns the right bundle counts.
  - `conversations.live` polling-fallback path: seed 2 turns, call with `sinceSequence: 0` → returns 2 items; call with `sinceSequence: <highest ordinal>` → returns 0 items.
  - If `eventIterator` is wired: a streaming test that subscribes, inserts a turn via repo, asserts the iterator yields the turn within 2 s.

### OpenAPI + api-client
- `apps/server/openapi.json` — regenerated; do NOT hand-edit. Run `bun -F server gen:openapi`.
- `packages/api-client/src/schema.d.ts` — regenerated if the project has that file (per S3-01 finding it does not; verify).

### Documentation
- `apps/web/README.md` — add a "Conversation live wiring" section describing:
  - Two paths: `eventIterator` streaming (preferred) and `runtime_sessions.sequenceNumber` polling (fallback at 1 Hz).
  - When each engages.
  - How to debug a stuck stream (check `useConversationLive` state via React DevTools).

### What you do NOT touch
- `packages/runtime/**` — S3-02/04 territory.
- `apps/server/src/durable-objects/**`, `apps/server/src/webhooks/**`, `apps/server/wrangler.jsonc` — S3-03 territory.
- `apps/server/src/__tests__/slo-*` — S3-06 territory.
- `_app.conversations.$id.live.tsx` — F3, S4 territory.
- `apps/server/openapi.json` — regenerate, don't hand-edit.
- Root `package.json` (memory rule).

---

## 4. Acceptance criteria (numbered, in priority order)

1. `conversations.list` honors cursor pagination — closes `BL-S2-CURSOR-PAGINATION-OTHER-ROUTERS` for conversations. Test asserts page 1 + cursor → page 2 covers all rows.
2. `conversations.get` returns the full bundle with all five sub-arrays (`turns`, `toolCalls`, `extractedFields`, `evals`, plus the `conversation` row). Bundle counts match seeded fixtures.
3. `conversations.live` ships at least the polling-fallback path. The streaming path is included if `@orpc/server` exports `eventIterator`; otherwise polling-only is acceptable with deviation documented.
4. **Three hooks exist** in `apps/web/src/hooks/api/conversations.ts`: `useConversations`, `useConversation`, `useConversationLive`. Each is the only call-site for `$api.conversations.*` per the hooks-only frontend rule.
5. **F1 + F2 live-wired** — both screens drop `@/mocks` imports for conversations data. ESLint `forbidden-mock-import` no longer fires on them. F3 stays in `ignores`.
6. **Streaming/polling fallback documented** in `apps/web/README.md` § "Conversation live wiring" with the cadence + when each engages.
7. **OpenAPI drift gate green** — `bun -F server gen:openapi --check` exit 0. `apps/server/openapi.json` shows the new ops with full row-shape outputs (no `{}` or `unknown`).
8. **Hooks-only discipline:** ESLint forbidden-import rule does NOT fire on F1/F2 (proves they're using the hook wrappers). Verify with `bun run lint`.
9. **Tests green:** `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test`, `bun -F server test`, `bun -F web test`, `bun -F server gen:openapi --check` all exit 0.
10. **Demo artifact:** `sprints/sprint-3/artifacts/S3-05-f1-f2-live.txt` — vitest verbose output of `conversations.test.ts` + the new web hook tests showing the bundle assertion + cursor pagination + polling-fallback. (If a screen recording is feasible, add `.gif`/`.mp4` too; not required.)

---

## 5. What NOT to do (anti-scope to prevent drift)

- Do **not** modify F3 (`_app.conversations.$id.live.tsx`) — S4 territory.
- Do **not** touch the ESLint `ignores` for F3 paths.
- Do **not** ship the projector worker or DO/webhook code. Those are S3-03/04 (already shipped).
- Do **not** ship the SLO test. S3-06.
- Do **not** rewire `useTelephony` / `usePhoneNumbers` (S3-01 territory).
- Do **not** raw-`client.query()`-INSERT fixtures. Use `seedWorkspace`.
- Do **not** invent `eventIterator` API names — use whatever `@orpc/server`'s `.d.ts` actually exposes; if not exposed, ship polling-only and document.
- Do **not** add deps to root `package.json` (memory rule).
- Do **not** push to remote.

---

## 6. Test plan (you author)

- **Repo unit (`conversation.test.ts`):**
  - `findManyByWorkspaceCursor` — pagination correctness across 3 seeded rows.
  - `getDetail` — returns the right counts.
  - `getTurnsAfterSequence` — returns only turns above the threshold.
- **Router integration (`apps/server/src/__tests__/conversations.test.ts`):**
  - `list` cursor pagination.
  - `get` bundle.
  - `live` polling fallback.
  - Streaming test if `eventIterator` is wired.
- **Hook unit (`apps/web/src/hooks/api/conversations.test.tsx`):**
  - `useConversation` happy + error.
  - `useConversationLive` polling fallback merges new turns into the cache.

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
bun -F server gen:openapi --check
```

All exit 0. Then `git add` every file in §3 and:
```
git commit -m "[S3-05] conversations: list/get/live procedures + hooks + F1/F2 live-wired"
```

Commit body must include:
- Whether `eventIterator` from `@orpc/server` is wired or polling-only (verbatim from the `.d.ts` check).
- Cursor encoding choice (base64 JSON of `(startedAt, id)` is the default; if you used something else, justify).
- Whether `getDetail` is one big join or 5 small queries; rationale.
- One bullet per acceptance criterion confirming met / partial / missed.
- Any anti-scope items you nearly drifted into and stopped.

If any acceptance criterion is unmet at the end, **do not commit a partial story**. Stop, name what's blocking, and ask. Manager will salvage if needed.
