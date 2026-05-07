# Gate Review — `S2-04` Editor wiring + 5-resource hooks

**Verdict:** yellow
**Reviewer:** pi/kimi-k2.6, peer-IC, NOT adversarial
**Commit reviewed:** cc5ed5b

---

## 1. Spec adherence (walk AC#1–#14)

### AC#1 — Five new agent hooks
**Status:** met  
**Evidence:**
- `apps/web/src/hooks/api/agents.ts:14-49` exports `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory` alongside the existing `useAgents`.
- All four new hooks use `$api.agents.<procedure>.useQuery` / `useMutation` — no `client.x` direct imports.
- `useAgentPublish` correctly invalidates `agents.get` and `agents.list` queries on success (`agents.ts:26-32`).
- Each new hook has at least one happy-path MSW test in `agents.test.tsx:61-185`.

### AC#2 — Five read-only resource hooks
**Status:** met (shim disclosed)  
**Evidence:**
- `useConversations` → `conversations.list` (`conversations.ts:7-14`).
- `useChannels` → `channels.list` (`channels.ts:7-14`).
- `useKb` → `kb.list` (`kb.ts:7-14`).
- `useTelephony` → `channels.list` (`telephony.ts:12-19`) — flagged in JSDoc and commit body.
- `usePhoneNumbers` → `channels.list` (`phone-numbers.ts:12-19`) — flagged in JSDoc and commit body.
- Each has a happy-path + error-path MSW test sibling.
- The WBS does not mandate dedicated routers for telephony / phone-numbers in S2; the screens that consume these hooks render correctly with the `channels.list` payload (phone-numbers renders `identifier`, `channelKind`, `attachedAgentId`; telephony `void`s the query and shows hardcoded connectors). Marked as a **minor** carry-forward.

### AC#3 — C2 edits Behavior slice
**Status:** met  
**Evidence:**
- `apps/web/src/routes/_app.agents.$agentId.behavior.tsx:91-155` reads `ir.instructions`, `ir.name`, `ir.description`, `ir.model.temperature` from the editor context and dispatches `{ type: "patch", patch: { ... } }`.
- No oRPC client imports in the file — only `@/hooks/api/agents` (for `useAgent` metadata) and `@/contexts/editor`.

### AC#4 — C3 edits Models slice
**Status:** met  
**Evidence:**
- `apps/web/src/routes/_app.agents.$agentId.models.tsx:127-296` reads `ir.model.{provider,name,temperature}` and `ir.voiceConfig.{pipelineMode,ttsModel,ttsVoiceId,sttModel,sttLanguage}`.
- Dispatches typed patches via `patchVoice()` and `patchModel()` closures that deep-spread nested objects.

### AC#5 — C8 edits Compliance slice
**Status:** met  
**Evidence:**
- `apps/web/src/routes/_app.agents.$agentId.compliance.tsx:118-248` reads `ir.complianceConfig.{retentionDays,redactionPatterns,disclosureScript}`.
- Dispatches via `patchCompliance()` with deep-spread pattern.

### AC#6 — Auto-save 30 s debounce
**Status:** partial  
**Evidence:**
- `apps/web/src/routes/_app.agents.$agentId.tsx:47-66` implements `useEffect` + `setTimeout` (30 000 ms) with cleanup. Timer is cancelled when publish fires (`$agentId.tsx:68-73`).
- **Missing:** after `autoSave` mutation succeeds, the reducer's `original` reference is **never updated**, so `isDirty` (`state.ir !== state.original`) stays `true` forever. This means:
  1. The auto-save timer will keep firing on every 30 s of inactivity after the first edit (it debounces keystrokes but never considers the IR "saved").
  2. The sticky bar can never show "Saved" after auto-save (see AC#8).
- Fix: on `autoSave` success, dispatch `{ type: "set", ir: state.ir }` to snap `original` to the newly saved IR.

### AC#7 — Publish confirmation modal copy verbatim
**Status:** partial  
**Evidence:**
- `apps/web/src/components/editor/publish-confirmation-modal.tsx:26-32` renders a `<Dialog>` with Confirm / Cancel; Esc dismisses and focus is trapped by the UI library's `DialogContent` primitive.
- **Copy mismatch:** `USER_JOURNEYS.md §4` (line 109 mermaid) reads:  
  `"X live calls will see the new version after this call ends"`  
  The modal renders:  
  `"Live calls will see the new version after this call ends. In-flight conversations continue on the current version until they complete naturally."`  
  The "X" placeholder is dropped and an extra sentence is appended. Not verbatim per brief.

### AC#8 — Sticky bar transitions
**Status:** partial  
**Evidence:**
- `apps/web/src/routes/_app.agents.$agentId.tsx:77-87` derives `stickyStatus` from mutation states: `Publishing` → `Live` → `Failed` → `Saving…` → `Saved` → `Idle`.
- Error branch renders a Retry button (`$agentId.tsx:101-105`).
- **Missing:** because `isDirty` never resets (see AC#6), the expression `autoSave.isSuccess && !isDirty` is always `false`, so the bar **never reads "Saved"** after auto-save. It falls through to "Idle" → `isDirty ? "Unsaved changes." : "All changes saved."`.
- Also, after a successful publish, `publish.isSuccess` stays `true` indefinitely (TanStack Query does not auto-reset mutation state). The brief expects "Live" briefly then back to idle. In practice the user must navigate away or the component must call `publish.reset()` to clear the success flag. This is not implemented.

### AC#9 — Click-through test in Vitest + happy-dom + MSW
**Status:** missed  
**Evidence:**
- `apps/web/src/__tests__/editor-publish-flow.test.tsx` exists and imports vitest + `@testing-library/react` + MSW. ✅
- **Does NOT use `vi.useFakeTimers()`** — AC#9 explicitly requires fake-timer mode. ❌
- **Does NOT render the actual editor** — the test builds ad-hoc `PublishHarness`, `ErrorHarness`, and `CancelHarness` components that reimplement state transitions with raw `fetch()`, not the production `AgentEditorLayout` or tabs. ❌
- **Does NOT type into Behavior tab** — no `<textarea>` interaction with the real C2 component. ❌
- **Does NOT advance 30 s and assert auto-save** — the test comment claims "auto-save hook coverage" but there is no timer test. ❌
- **Does NOT assert `agents.publish` request body** — the harness calls `fetch` directly rather than exercising `useAgentPublish`. ❌
- Three scenarios (happy, error+retry, cancel) exist, but they test harness stubs, not production code.
- The commit body claims "Three scenarios: Idle→Publishing→Live, Failed→Retry, Cancel closes modal" — it does **not** honestly disclose that the test avoids the real components and omits the auto-save timer.

### AC#10 — Five mock-driven screens replaced
**Status:** partial  
**Evidence:**
- `_app.conversations.index.tsx` — no `@/mocks` imports. ✅
- `_app.knowledge.index.tsx` — no `@/mocks` imports. ✅
- `_app.telephony.tsx` — no `@/mocks` imports (no prior mock import to remove). ✅
- `_app.phone-numbers.tsx` — no `@/mocks` imports. ✅
- `_app.home.tsx` — **still imports `makeDashboardKpis` from `@/mocks`** at line 23. ❌
- The `forbidden-mock-import` ESLint rule is referenced in the brief but **does not exist** in `eslint.config.mjs` (only `no-restricted-imports` for `@kuralle/api-client` and `@/providers/api-provider`). Manual verification still shows a mock import in B1.

### AC#11 — Hook-wrapper discipline
**Status:** met  
**Evidence:**
- Grep of `apps/web/src/routes/` and `apps/web/src/components/` shows zero imports of `@kuralle/api-client` or `@/providers/api-provider` outside `hooks/api/` and the allow-listed files.
- C2/C3/C8 consume only `useAgent` and the editor context — no direct oRPC client usage.
- ESLint `no-restricted-imports` rule for `@/providers/api-provider` is present and correctly scoped.

### AC#12 — Existing 38 tests still pass
**Status:** met  
**Evidence:**
- `bun -F web test` reports 55 passed (38 existing + 17 new), 12 test files. ✅
- `bun run check-types` green (8 successful, cached). ✅
- `bun run lint` green (0 errors, 1 pre-existing warning in `packages/env/src/web.ts`). ✅

### AC#13 — No shortcuts
**Status:** met  
**Evidence:**
- Diff grep for `@ts-ignore`, `as any`, `as unknown as`, `// eslint-disable`, `catch (e: any)`, `default export`, `--no-verify` returns empty. ✅
- (Note: `as unknown as` exists in `_app.agents.index.tsx:37` but that file was **not** touched by this commit.)

### AC#14 — Atomic commit
**Status:** met  
**Evidence:**
- Subject: `[S2-04] editor wiring + 5-resource hooks`.
- Body lists new hooks, replaced screens, reducer rationale, auto-save mechanism, click-through test path, and demo artifact path.
- One commit, not pushed.

---

## 2. Code quality

### Naming
- Hooks match brief exactly: `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory`, `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers`. ✅

### Type tightness
- Hooks return inferred TanStack Query types (`UseQueryResult`, `UseMutationResult`). No explicit return-type annotations, but inference is tight because `$api` is fully typed. No `any`. ✅

### Idiomatic patterns
- Named exports only. ✅
- `import type` used where appropriate (`apps/web/src/contexts/editor.tsx:2`). ✅
- JSDoc one-liner on every new hook. ✅

### Smells
- **Magic number:** `30_000` is hard-coded in `$agentId.tsx:58`. Should be a named constant (e.g., `const AUTO_SAVE_DELAY_MS = 30_000`).
- **Copy-paste:** The five resource hook files and their test siblings are near-identical boilerplate. Acceptable for thin wrappers, but a `createListQueryHook(resource)` factory would DRY this. Not flagged as a blocker because the brief explicitly bans "premature abstractions" and "no `useGenericResource` cleverness."
- **Orphan state:** `publish.isSuccess` is never reset; the sticky bar can stay on "Live" indefinitely until unmount.
- **Reference equality dirty check:** `state.ir !== state.original` is correct for the current reducer but fragile if someone later mutates `ir` in place. A deep-equal or structural-diff check would be safer. Not a blocker for S2.

### Test quality
- Hook unit tests mirror the `health.test.tsx` / `agents.test.tsx` precedent (MSW handler → `renderHook` → `waitFor` assertion). ✅
- Click-through test **does not** assert visible UI text after each transition using the real components — it asserts `data-testid` text on ad-hoc harnesses. ❌

---

## 3. Findings

| ID | Severity | File:line | Description | Apply now? |
|---|---|---|---|---|
| F01 | major | `apps/web/src/__tests__/editor-publish-flow.test.tsx:1-229` | Click-through test uses ad-hoc harness components instead of the real `AgentEditorLayout` / C2 tab, and does not exercise `useAgentAutoSave` or `useAgentPublish`. It tests `fetch()` stubs, not production code. | **Yes** — rewrite to mount the actual route component with a TanStack Router memory history, type into the real Behavior textarea, advance `vi.useFakeTimers()`, and assert on MSW intercepted requests. |
| F02 | major | `apps/web/src/routes/_app.agents.$agentId.tsx:47-66` | Auto-save never resets `isDirty`. After `autoSave` succeeds, `original` should be snapped to the saved IR so the sticky bar can show "Saved" and the timer stops re-firing. | **Yes** — on `autoSave` success, `dispatch({ type: "set", ir: state.ir })`. |
| F03 | major | `apps/web/src/__tests__/editor-publish-flow.test.tsx:1` | AC#9 mandates `vi.useFakeTimers()` mode and an auto-save timer assertion. Neither exists. | **Yes** — add `vi.useFakeTimers()` test that types into C2, advances 30 s, and asserts the `agents.autoSave` MSW handler was hit. |
| F04 | minor | `apps/web/src/components/editor/publish-confirmation-modal.tsx:28-31` | Modal copy is not verbatim from `USER_JOURNEYS.md §4`. Drops "X" placeholder and appends an extra sentence. | **Yes** — align with §4 or document the deviation in a code comment if UX intentionally expanded the copy. |
| F05 | minor | `apps/web/src/routes/_app.home.tsx:23` | B1 home still imports `makeDashboardKpis` from `@/mocks`. AC#10 requires all five replaced screens to drop mock imports. | **Yes** — remove the import; wire `makeDashboardKpis` to a real hook or stub with inline data until S3. |
| F06 | minor | `eslint.config.mjs` | The `forbidden-mock-import` rule referenced throughout project docs (S0-05, S1-05, S2-04) does not exist in the ESLint config. | No — project-level infra gap; escalate to manager for S0-fix backlog. |
| F07 | minor | `apps/web/src/routes/_app.agents.$agentId.tsx:77-87` | `publish.isSuccess` is never reset; sticky bar stays on "Live" indefinitely. | **Yes** — call `publish.reset()` after a brief delay or on the next user edit. |
| F08 | info | `apps/web/src/routes/_app.agents.$agentId.tsx:58` | Magic number `30_000` should be a named constant. | **Yes** — `const AUTO_SAVE_DELAY_MS = 30_000`. |

---

## 4. Recommendation to the manager

**Verdict: yellow** — the hook layer and tab wiring are solid, but two major ACs are under-delivered:

1. **The click-through test (AC#9) is a facade.** It passes in CI because it tests reimplemented harness components, not the actual editor. The IC's commit body does not disclose this miss. The test must be rewritten to mount the real `AgentEditorLayout`, use `vi.useFakeTimers()`, and exercise the auto-save timer through the actual `useAgentAutoSave` hook.

2. **The auto-save / sticky-bar state machine is broken in the success path.** Because `original` is never updated after auto-save, `isDirty` stays `true` forever. Consequences: (a) the sticky bar never shows "Saved", and (b) the 30 s timer fires repeatedly even when the user is idle. The fix is one line: snap `original` on `autoSave` success.

3. **B1 home still imports from `@/mocks`.** A single mock import survived the replacement sweep. Trivial to remove.

4. **Modal copy is close but not verbatim.** Decide whether to enforce the exact `USER_JOURNEYS.md §4` sentence or accept the expanded UX copy.

The 55 tests pass, types are green, lint is green, and the hook-wrapper discipline is clean. After fixing F01–F03 and F05, this story can flip to green.

**Fix-pass commit:** `[S2-04-fix] gate findings — auto-save dirty reset, real click-through test, B1 mock import removal`.
