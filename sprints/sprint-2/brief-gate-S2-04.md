# Spec + Code-Quality Gate — `S2-04` Editor wiring + 5-resource hooks

> **Role.** You are the **spec-and-code-quality gate worker (`pi/kimi-k2.6`)** — a senior peer-IC reviewer with deep expertise in **React 19, TanStack Query, TanStack Router, Vitest + happy-dom + MSW, oRPC client wrappers, and AIDA-driven editor UX**. The IC for this story was `pi/deepseek-v4-pro`. You are **NOT adversarial** — you are the peer-IC keeping the team honest. Your output drives the manager's fix-pass.
>
> **Mindset.** You verify each of the four new agent hooks and five resource hooks lands the contract. You verify C2/C3/C8 components actually consume the IR reducer and dispatch typed slice patches. You verify the auto-save 30s debounce works (`vi.useFakeTimers`). You verify publish-confirmation modal copy matches `USER_JOURNEYS.md §4` verbatim. You verify the sticky bar transitions correctly through `Idle → Saving → Saved → Publishing → Live` (and the `Failed → Retry` error branch). You verify the forbidden-mock-import lint rule + the no-oRPC-client-bypass rule both still pass.
>
> **Output.** A markdown report at `sprints/sprint-2/gate-S2-04.md`. **Do NOT commit.** **Do NOT modify any source.**

---

## 1. Inputs

1. The story brief: `sprints/sprint-2/brief-S2-04.md`.
2. The sprint plan: `sprints/sprint-2/PLAN.md` § `S2-04`.
3. The IC's transcript: `.handoff/result-S2-04.txt`.
4. The diff: `git show cc5ed5b`.
5. **`USER_JOURNEYS.md §4`** — the publish-confirmation modal copy.
6. `USER_JOURNEYS.md §13` — C2/C3/C8 wiring spec.
7. `sprints/AMENDMENT-001.md` — frontend = `@orpc/tanstack-query`. Hooks must use `$api.x.useQuery/useMutation`, never `client.x.useQuery`.
8. `sprints/AMENDMENT-003.md` + `AMENDMENT-004.md` — IR shape includes optional scorer per-criterion fields and optional workflow nodes/edges. Editor must accept and pass these through.
9. `apps/web/src/hooks/api/agents.ts` (extended) — five hooks (one carryover + four new).
10. `apps/web/src/hooks/api/{conversations,channels,kb,telephony,phone-numbers}.ts` — five new files.
11. Per-hook test files: `*.test.tsx` siblings.
12. `apps/web/src/routes/_app.agents.$agentId.tsx` — IR reducer + sticky bar.
13. `apps/web/src/routes/_app.agents.$agentId.{behavior,models,compliance}.tsx` — C2/C3/C8 tabs.
14. `apps/web/src/routes/_app.{home,conversations.index,knowledge.index,telephony,phone-numbers}.tsx` — five replaced screens.
15. `apps/web/src/__tests__/editor-publish-flow.test.tsx` — click-through test.
16. `eslint.config.mjs` — verify the `no-restricted-imports` rules for `@kuralle/api-client` and `@/providers/api-provider` still fire on violations.

---

## 2. Your job — two halves

### 2.1 Spec adherence

Walk every acceptance criterion in `brief-S2-04.md §4` (1-14). For each:
- **Met / partial / missed.** Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose the miss?

Specific verifications you MUST perform:

1. **Five new agent hooks (AC#1):** `useAgents` (existing, unchanged shape), `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory`. Each uses `$api.agents.<procedure>.useQuery` / `useMutation`. Verify by reading `agents.ts`. Each hook has at least one MSW-based happy-path test.

2. **Five read-only resource hooks (AC#2):** `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers`. Each in its own file. The IC's commit body discloses that `useTelephony` and `usePhoneNumbers` both wrap `channels.list` because no dedicated routers exist — verify this is acceptable per the architecture (telephony / phone-numbers may filter `channels` by `channelKind='voice'` or look up `channel_endpoints`; the WBS doesn't mandate dedicated routers in S2). Mark as flag-to-user if the wrapping is not a faithful mapping.

3. **C2 edits Behavior slice (AC#3):** `_app.agents.$agentId.behavior.tsx` reads `ir.instructions` and dispatches patches via the parent reducer. **No `client.x.useQuery` direct imports** (ESLint rule enforces). Verify.

4. **C3 edits Models slice (AC#4):** reads `ir.model.{provider,name,temperature}` and `ir.voiceConfig`. Verify the dispatch paths.

5. **C8 edits Compliance slice (AC#5):** reads `ir.complianceConfig.{retentionDays, redactionPatterns, disclosureScript}`. Verify.

6. **Auto-save 30s debounce (AC#6):** `useEffect` + `setTimeout`, not a library. Cancellable on cleanup. Cancelled if a publish fires first. Verify the implementation.

7. **Publish confirmation modal (AC#7):** copy from `USER_JOURNEYS.md §4` verbatim. **You must read §4 yourself** and confirm the exact sentence in the modal matches. Modal has Confirm / Cancel; Esc dismisses; focus is trapped.

8. **Sticky bar transitions (AC#8):** reads from mutation `status`; transitions Idle → Saving → Saved (autosave) and Idle → Publishing → Live → Idle (publish). Error path: Failed with retry button. Verify all branches exist in code.

9. **Click-through test in Vitest + happy-dom + MSW (AC#9):** `apps/web/src/__tests__/editor-publish-flow.test.tsx`:
   - `vi.useFakeTimers()` mode.
   - MSW handlers for `agents.get`, `agents.list`, `agents.history`, `agents.autoSave`, `agents.publish`.
   - Renders the editor; types into Behavior tab; advances 30s; asserts autosave fires.
   - Clicks Publish; modal opens; clicks Confirm; assertion on `agents.publish` request.
   - Asserts sticky bar reads "Live" after the publish mutation succeeds.
   - The IC's commit body says 3 scenarios (happy, error+retry, cancel) — verify all three exist.
   - **NOT Playwright** — verify the file imports vitest + @testing-library/react + msw.

10. **Five mock-driven screens replaced (AC#10):** B1 home, F1 conversations, knowledge, telephony, phone-numbers. Each screen no longer imports from `@/mocks` (the forbidden-mock-import lint rule does not fire on these files).

11. **Hook-wrapper discipline (AC#11):** no `client.x.useQuery` or `$api.x.useQuery` imports outside `apps/web/src/hooks/api/**`. Verify the eslint config rules + check the production screens.

12. **Existing 38 tests still pass (AC#12):** the IC reports 38 existing + 17 new = 55 total. Verify by reading the count. Also verify `bun run check-types`, `bun run lint` are green.

13. **No shortcuts (AC#13):** grep diff for `--no-verify`, `@ts-ignore`, `// eslint-disable`, `as any`, `catch (e: any)`, `default export`, `as unknown as`. Each is a finding.

14. **Atomic commit (AC#14):** subject + body match brief's commit-policy.

### 2.2 Code quality

For every file the IC created or modified:

- **Naming.** Hooks are `useAgent`, `useAgentPublish`, etc. Resource hooks are `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers`. Match brief.
- **Type tightness.** Hooks have explicit return types from TanStack Query (`UseQueryResult<...>`, `UseMutationResult<...>`). No `any`.
- **Idiomatic patterns.** Named exports only. `import type` for type-only imports. JSDoc one-liner describing return shape.
- **Smells.** Dead branches, copy-paste between hook files, magic numbers (the 30s debounce should be a named constant), orphan imports.
- **Test quality.** Hook tests follow the existing `health.test.tsx` / `agents.test.tsx` pattern. Click-through test asserts visible UI text after each transition.

### 2.3 Project-specific gates (from kickoff prompt)

- **Hook-wrapper rule.** `no-restricted-imports` from `@/providers/api-provider` and `@kuralle/api-client` outside hooks/api/. Verify the rule fires on a deliberate violation (you can re-run lint after a throw-away edit then revert).
- **Forbidden-mock-import rule.** Mocks files exist (in `apps/web/src/lib/mocks/`) but production screens don't import from them.
- **OpenAPI is the contract.** N/A (no router changes).
- **Hexagonal-import rule.** N/A (no `core/api/db/runtime` changes).
- **AMENDMENT-003 / AMENDMENT-004 plumbing.** The editor's IR reducer state and the publish call MUST accept the optional per-criterion scorer fields and the optional workflow.nodes/edges. Verify the editor doesn't strip them silently before publishing. (You may need to grep for how the IR is constructed in C8 / a Workflow tab.)

### 2.4 Telephony + phone-numbers shim concern

The IC's commit body explicitly flags that `useTelephony` and `usePhoneNumbers` both wrap `channels.list`. Verify:
- Is this faithful to what those screens actually need? Read the screens' usage of the hook results — do they want all channels, or just voice channels, or specifically channel_endpoints?
- If the shim is a reasonable temporary mapping, mark as `minor` carry-forward.
- If the shim returns wrong data shape (e.g., the screen expects phoneNumber + areaCode but channels.list returns channelKind + provider), mark as `major`.

---

## 3. Output format

Same shape as gate-S2-01.md / gate-S2-02.md / gate-S2-03.md.

```markdown
# Gate Review — `S2-04` Editor wiring + 5-resource hooks

**Verdict:** {green | yellow | red}
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** cc5ed5b

## 1. Spec adherence (walk AC#1-#14)

## 2. Code quality

## 3. Findings
| ID | Severity | File:line | Description | Apply now? |

## 4. Recommendation to the manager
```

---

## 4. Hard constraints

- Do NOT edit any source.
- Do NOT commit.
- Do NOT generate code.
- Output is `sprints/sprint-2/gate-S2-04.md`.
- Cite file:line for every finding.
- Read `USER_JOURNEYS.md §4` directly to verify the modal copy is verbatim.
- The telephony/phone-numbers shim is acceptable IF the screens render correctly with the channels.list payload. Verify by reading the screen files; don't trust the IC's framing.
