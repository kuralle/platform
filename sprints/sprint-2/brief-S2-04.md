# Story Brief — `S2-04` Editor wiring (C2/C3/C8 + sticky save bar) + 5-resource hooks

> **Role.** You are a senior frontend engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **React 19, TanStack Query, TanStack Router, Vitest + happy-dom + MSW, oRPC client wrappers, and AIDA-driven editor UX**. You have shipped editor SPAs in production where auto-save / publish / version-history are user-trusted, not "should work" features. You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. You verify TanStack Query mutation lifecycle hooks against the installed `@tanstack/react-query` `.d.ts` and `mcp__context7__query-docs` for `tanstack/query` before guessing — `useMutation` vs `$api.x.useMutation` from `@orpc/tanstack-query` differ in subtle ways. You prefer `vi.useFakeTimers()` + explicit `await waitFor(...)` over real timers in tests. You treat the hook-wrapper rule from the kickoff prompt as a load-bearing contract: every API call goes through `apps/web/src/hooks/api/<resource>.ts`, never through `client.x.useQuery` directly.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `any`. No `default export` for hooks. `import type` for type-only imports. **No oRPC client imports outside `apps/web/src/hooks/api/**`** — the ESLint rule from S0-05 enforces this. No premature abstractions; no `useGenericResource(resourceName: string)` cleverness. KISS.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S2-04] editor wiring + 5-resource hooks`. Do NOT push. One commit per story.

---

## 1. Goal

Two artifacts in this story:

**(A) Editor wiring for the agent detail page.** `apps/web/src/hooks/api/agents.ts` gains four new hooks (`useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory`). C2 (`_app.agents.$agentId.behavior.tsx`), C3 (`_app.agents.$agentId.models.tsx`), C8 (`_app.agents.$agentId.compliance.tsx`) replace mock data with real hooks. The agent detail layout (`_app.agents.$agentId.tsx`) holds **one `AgentIR` document** in client state via `useReducer` keyed by `agentId`; tabs edit slices. Auto-save fires every 30 s debounced when the IR diff is non-empty. Publish opens a confirmation modal with copy from `USER_JOURNEYS.md §4`, then fires the publish mutation; the sticky bar transitions `Idle → Publishing → Live`.

**(B) Five read-only hooks for other resources** (closes BL-S1-WIRE-REMAINING-HOOKS): `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers`. Each wraps the existing `<resource>.list` procedure from S1-05. The five corresponding screens replace mock imports with real hooks: home (`_app.home.tsx`), F1 (`_app.conversations.index.tsx`), `_app.knowledge.index.tsx`, `_app.telephony.tsx`, `_app.phone-numbers.tsx`. Mutations for these resources defer to their respective sprints (S3+).

A click-through test in **Vitest + happy-dom + MSW** (NOT Playwright — per user decision 2026-05-07) covers the edit → 30s timer → autosave fires → publish → modal confirm → sticky bar reads "Live" flow.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md` — confirms sprint 2.
2. `sprints/sprint-2/PLAN.md` — full sprint plan; story `S2-04` section is the spec. **Read the §6 open-questions section** — the test substrate decision and sticky bar component decisions from S2-04 PLAN are guidance, not yet resolved.
3. `sprints/sprint-2/brief-S2-03.md` — predecessor. The four new agent procedures (`get`, `publish`, `autoSave`, `history`) MUST be on disk and reflected in `apps/server/openapi.json` before you start.
4. `sprints/WBS.md` § Sprint 2 → row `S2-04` (around line 146).
5. `sprints/sprint-1/HANDOFF.md`:
   - **UI screens still mock-driven (except C1).** The 5 screens you wire here.
   - **Hooks-only frontend access** rule. ESLint rule from S0-05.
6. `sprints/AMENDMENT-001.md` — frontend = `@orpc/tanstack-query`. Your hooks use `$api.x.useQuery` / `$api.x.useMutation`, not `client.x.useQuery`.
7. **`USER_JOURNEYS.md §4`** — Journey 2 (building/editing an agent). The publish-confirmation modal copy lives here. Quote it verbatim. Read the full section to understand the AIDA-curve the editor must support.
8. `USER_JOURNEYS.md §13` — C2/C3/C8 wiring spec. The exact slice each tab edits.
9. `apps/web/src/providers/api-provider.tsx` — the `$api` utility. Your hooks call `$api.<resource>.<procedure>.{queryOptions, mutationOptions}`.
10. `apps/web/src/hooks/api/health.ts` — precedent for a query hook.
11. `apps/web/src/hooks/api/agents.ts` — current `useAgents` (S1-05). Extend it; do NOT rewrite.
12. `apps/web/src/hooks/api/health.test.tsx` and `agents.test.tsx` — precedent for MSW-based unit tests. Mirror the shape exactly.
13. `apps/web/src/test/msw-server.ts` — MSW setup. Your tests reuse it.
14. `apps/web/src/routes/_app.agents.$agentId.tsx` — the **agent detail layout** that holds the `AgentIR` reducer state. Its child routes are the C2/C3/C8/C7/knowledge tabs. Read it carefully — sticky bar may already exist or may need to be scaffolded.
15. `apps/web/src/routes/_app.agents.$agentId.behavior.tsx` — C2 (Behavior tab). Read the current mock import.
16. `apps/web/src/routes/_app.agents.$agentId.models.tsx` — C3 (Models & Voice tab).
17. `apps/web/src/routes/_app.agents.$agentId.compliance.tsx` — C8 (Compliance tab).
18. `apps/web/src/routes/_app.agents.index.tsx` — C1 (already wired in S1-05; verify).
19. `apps/web/src/routes/_app.home.tsx` — B1 home (mock-driven; you wire it).
20. `apps/web/src/routes/_app.conversations.index.tsx` — F1 (mock-driven).
21. `apps/web/src/routes/_app.knowledge.index.tsx` — knowledge index (mock-driven).
22. `apps/web/src/routes/_app.telephony.tsx` — telephony (mock-driven).
23. `apps/web/src/routes/_app.phone-numbers.tsx` — phone numbers (mock-driven).
24. `apps/web/src/lib/mocks/{agents,conversations,kb,numbers}.ts` — current mocks. Leave the files; remove imports from production screens.
25. `packages/core/src/schemas/agent-ir.ts` (from S2-02) — `AgentIR` type. The reducer's state shape derives from it.
26. `apps/server/openapi.json` — confirm the 4 new agent operations exist (S2-03 must have committed first).
27. `eslint.config.mjs` — the forbidden-mock-import rule (S0-05) and forbidden-oRPC-client-bypass rule (S0-05).
28. `apps/web/vitest.config.ts` and `apps/web/src/test/setup.ts` (or similar) — vitest setup. Your click-through test reuses it.

When in doubt about TanStack Query mutation states or `vi.useFakeTimers()` + Promises composition, use `mcp__context7__query-docs` against `/tanstack/query` and `/vitest-dev/vitest`. Memory rule: verify before guessing.

---

## 3. Files you will create or modify

**Create:**
- `apps/web/src/hooks/api/conversations.ts` — `useConversations({ workspaceId, cursor?, limit? })`.
- `apps/web/src/hooks/api/conversations.test.tsx`
- `apps/web/src/hooks/api/channels.ts` — `useChannels({ workspaceId, ... })`.
- `apps/web/src/hooks/api/channels.test.tsx`
- `apps/web/src/hooks/api/kb.ts` — `useKb({ workspaceId, ... })`.
- `apps/web/src/hooks/api/kb.test.tsx`
- `apps/web/src/hooks/api/telephony.ts` — `useTelephony({ workspaceId, ... })`. (Note: telephony may map to channels with `channelKind='voice'` — verify against the S1-05 router stubs; the WBS specifies `useTelephony` as a separate hook.)
- `apps/web/src/hooks/api/telephony.test.tsx`
- `apps/web/src/hooks/api/phone-numbers.ts` — `usePhoneNumbers({ workspaceId, ... })`. Maps to `channels.endpoints.list` per `DATA_MODEL.md §8` — IC verifies against the actual router shape; if a dedicated `phoneNumbers` router is needed, that's a finding (flag).
- `apps/web/src/hooks/api/phone-numbers.test.tsx`
- `apps/web/src/__tests__/editor-publish-flow.test.tsx` — the click-through test.
- `apps/web/src/components/editor/sticky-save-bar.tsx` (or wherever the existing sticky bar component lives — IC greps; if the component already exists, modify it in place).
- `apps/web/src/components/editor/publish-confirmation-modal.tsx` (or wherever existing modals live; IC greps).

**Modify:**
- `apps/web/src/hooks/api/agents.ts` — extend with `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory`. Keep `useAgents` as-is. Each new hook has a JSDoc one-liner describing its return shape.
- `apps/web/src/hooks/api/agents.test.tsx` — extend with happy-path test for each new hook.
- `apps/web/src/routes/_app.agents.$agentId.tsx` — host the `AgentIR` reducer; render sticky bar; coordinate auto-save + publish.
- `apps/web/src/routes/_app.agents.$agentId.behavior.tsx` (C2) — read+write `ir.instructions`, `ir.firstMessage` (or whatever the §13 spec calls "Behavior" slice). No direct `client.x` use.
- `apps/web/src/routes/_app.agents.$agentId.models.tsx` (C3) — read+write `ir.model`, `ir.voiceConfig`.
- `apps/web/src/routes/_app.agents.$agentId.compliance.tsx` (C8) — read+write `ir.complianceConfig`.
- `apps/web/src/routes/_app.home.tsx` (B1) — replace mock imports with `useConversations`, `useAgents` (read-only summary).
- `apps/web/src/routes/_app.conversations.index.tsx` (F1) — replace mock with `useConversations`.
- `apps/web/src/routes/_app.knowledge.index.tsx` — replace mock with `useKb`.
- `apps/web/src/routes/_app.telephony.tsx` — replace mock with `useTelephony`.
- `apps/web/src/routes/_app.phone-numbers.tsx` — replace mock with `usePhoneNumbers`.

**Do not touch:**
- `apps/web/src/lib/mocks/*.ts` — leave files in place; just remove imports from production screens.
- `apps/server/**` — backend is S2-03's.
- `packages/api-client/**` — generated; only `bun -F @kuralle/api-client gen` writes it.
- `apps/web/src/components/**` outside the editor-specific files above (sticky bar, publish modal). The rest of `components/` is shared chrome — leave alone.
- C1 (`_app.agents.index.tsx`) — already wired in S1-05; verify it still works after your edits, do not rewrite.
- C7 workflow tab (`_app.agents.$agentId.workflow.tsx`) — out of S2 scope (workflow editing is post-MVP). Leave the existing mock-driven implementation.
- C2/C3/C8/C7's child knowledge tab (`_app.agents.$agentId.knowledge.tsx`) — leave alone unless §13 specifies it as part of the Compliance/Behavior slice.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **Five new hooks for agents** at `apps/web/src/hooks/api/agents.ts`. Names + signatures:
   - `useAgent({ workspaceId, agentId })` — wraps `$api.agents.get.useQuery`.
   - `useAgentPublish()` — wraps `$api.agents.publish.useMutation`. Returns the standard TanStack Query `mutation` object.
   - `useAgentAutoSave()` — wraps `$api.agents.autoSave.useMutation`.
   - `useAgentHistory({ workspaceId, agentId, cursor?, limit? })` — wraps `$api.agents.history.useQuery`.
   Each new hook has at least one MSW-based happy-path test in `agents.test.tsx`.

2. **Five read-only hooks for other resources** at `apps/web/src/hooks/api/{conversations,channels,kb,telephony,phone-numbers}.ts`. Each exports a `useResourceList()` query wrapper around its `list` procedure. Each has a happy-path MSW test in its `.test.tsx` sibling.

3. **C2 edits the IR's Behavior slice.** The component reads `ir.instructions` (and `ir.firstMessage` if §13 lists it under Behavior) from the parent reducer; on user input, dispatches `{ type: 'patch', slice: 'behavior', ... }` to update the IR. **No oRPC client imports** in the component file.

4. **C3 edits the Models slice.** Reads `ir.model.provider`, `ir.model.name`, `ir.model.temperature`, etc., and `ir.voiceConfig`. Dispatches patches.

5. **C8 edits the Compliance slice.** Reads `ir.complianceConfig.{retentionDays, redactionPatterns, disclosureScript, ...}`. Dispatches patches.

6. **Auto-save fires on 30s debounce.** `useEffect` watches the IR; when changes accumulate, a 30s timeout fires `useAgentAutoSave().mutate({ workspaceId, agentId, ir })`. The timeout is reset on each new edit. The timeout is canceled if a `publish` fires first. **Implementation:** straightforward `useEffect` + `setTimeout` + cleanup; no need for a debounce library. Document the choice (no library) in the component file.

7. **Publish confirmation modal.** A "Publish" CTA in the sticky bar opens `<PublishConfirmationModal />`. Modal body uses copy from `USER_JOURNEYS.md §4` verbatim — IC reads §4 and pastes the relevant sentence. Confirm button fires `useAgentPublish().mutate({ workspaceId, agentId, ir })`. Cancel button closes the modal without mutation. The modal traps focus and is keyboard-dismissable (Esc).

8. **Sticky bar transitions reflect mutation state.** The bar reads from the publish mutation's `status` field:
   - `idle` (or no recent mutation) → "Saved" or "Idle" depending on autosave state.
   - `pending` → "Publishing".
   - `success` → "Live" (briefly, then `idle`).
   - `error` → "Failed" with retry button.
   - Auto-save state: when an autosave mutation is `pending`, sticky bar shows "Saving…"; when `success`, shows "Saved".
   The text must transition correctly under both `Idle → Publishing → Live` and `Idle → Saving… → Saved` paths.

9. **Click-through test in Vitest + happy-dom + MSW.** `apps/web/src/__tests__/editor-publish-flow.test.tsx`:
   - `vi.useFakeTimers()` mode.
   - MSW handlers for `agents.get`, `agents.list`, `agents.history`, `agents.autoSave`, `agents.publish`.
   - Render `<App />` (or `<AgentDetailPage />` with the right TanStack Router context — IC determines what's mountable). Navigate to `/agents/<seeded-id>/behavior`.
   - Type a new prompt into the Behavior textarea.
   - `vi.advanceTimersByTime(30_000)`; `await waitFor` autosave request was made.
   - Click the Publish button; modal opens.
   - Click Confirm; assert `agents.publish` request fired.
   - Resolve the publish mutation (MSW returns `{ versionId, versionNumber, activeVersionId }`); `await waitFor` sticky bar reads "Live".
   - Test header has a comment explaining why this is Vitest+happy-dom (per user decision 2026-05-07: Playwright would be a sprint-sized infra investment; happy-dom covers the contract; r1/r2 review is the safety net for real-browser-only quirks).

10. **Five mock-driven screens replace imports.** B1 / F1 / knowledge / telephony / phone-numbers each remove their `from '@/mocks/...'` imports. The forbidden-mock-import lint rule does not fire on the modified screens (it may still fire on screens you don't touch — that's expected).

11. **Hook-wrapper discipline.** No oRPC client imports outside `apps/web/src/hooks/api/**`. ESLint passes. The C2/C3/C8 components consume `useAgent`, `useAgentPublish`, `useAgentAutoSave` only.

12. **`bun run check-types`, `bun run lint`, `bun -F web test` green.** The existing 38 web tests still pass. Your new tests cover at least 11 hooks (5 new agent + 5 read-only + 1 click-through flow).

13. **No `--no-verify`, `@ts-ignore`, `any`, `as unknown as` casts, root devDep additions, default exports.**

14. **Atomic commit `[S2-04] editor wiring + 5-resource hooks`.** Body includes:
    - The list of new hooks.
    - The list of replaced mock imports (one bullet per screen).
    - The reducer-vs-Zustand-vs-Jotai decision (default: `useReducer` colocated with the layout) with rationale.
    - The auto-save debounce mechanism (default: `useEffect` + `setTimeout`).
    - Path to the click-through test artifact.
    - Path to demo artifact: `sprints/sprint-2/artifacts/S2-04-editor-flow.txt`.

---

## 5. Demo artifact

`sprints/sprint-2/artifacts/S2-04-editor-flow.txt` — `bun -F web test --reporter verbose 2>&1 | tail -60` showing:
- All new hook tests passing.
- The click-through test exercising the `Idle → Saving… → Saved → Publishing → Live` transition.

If a screencast is feasible (probably not in this loop), drop it next to the .txt.

---

## 6. Anti-scope (what NOT to do)

- **Do not** add Playwright (per user decision 2026-05-07). Use Vitest + happy-dom + MSW.
- **Do not** wire C7 (Workflow tab) — out of scope; deferred until workflow editing lands post-MVP.
- **Do not** introduce a new state-management library (Zustand, Jotai, Redux). `useReducer` colocated with the layout is sufficient for one editor session.
- **Do not** introduce a new debounce library (`use-debounce`, `lodash.debounce`). `useEffect` + `setTimeout` is fine.
- **Do not** add mutations for the 5 read-only resources. Queries only; mutations defer to S3+.
- **Do not** delete files in `apps/web/src/lib/mocks/**`. Just remove imports from production screens.
- **Do not** edit the C1 page if it's already working from S1-05 — only verify.
- **Do not** add deps to the workspace-root `package.json` (memory rule).
- **Do not** call `client.x.useQuery` directly in components. The hook-wrapper rule is the contract.
- **Do not** import anything from `@/mocks/` in production screens after your edits. The forbidden-mock-import rule is the gate.
- **Do not** speculate on real-time updates / WebSocket fanout / supervisor-mode wiring (that's S3 / S4).

---

## 7. Verification before you commit

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle
bun install --frozen-lockfile 2>&1 | tail -3
bun run check-types 2>&1 | tail -5
bun run lint 2>&1 | tail -5
bun -F web test 2>&1 | tail -30
```

All four must be green. The `[S2-01]`, `[S2-02]`, `[S2-03]` commits must be on disk before you start.

If you cannot make a SLO / criterion above hold, **stop and flag** rather than skip a test.
