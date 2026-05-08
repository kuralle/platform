# Story Brief — `S3-02` AriaFlow runtime adapter (`packages/runtime/src/adapter/`)

> **Role.** You are a senior runtime engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **TypeScript ESM, discriminated-union event modelling, Zod schema design, hexagonal architecture, and conversational-AI runtimes (AriaFlow / Mastra / Vercel AI SDK)**. You have shipped event-sourced systems where one bad event shape collapses the whole pipeline two months later; you understand "the type system is the gatekeeper" as an operating principle. You write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. **Before writing the adapter, you `cat node_modules/@ariaflowagents/core/dist/*.d.ts` and read the actual `AgentConfig` shape exposed by the package** — what's in `scripts/sink-spike/FINDINGS.md` is empirical and load-bearing, but the type contract is what the type system enforces. You verify `HarnessHooks` field names by reading the installed types, not by intuition. You prefer discriminated unions with `kind` discriminators over open shape-shifting; you never use `any`. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun run check-types`, `bun run lint`, `bun -F @kuralle/runtime test` exiting 0 + the demo trace showing the documented event count.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every schema. No premature abstractions; no speculative extensibility.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over. **No platform imports** (`platform/cloudflare`, `platform/node`, `hono`, `apps/server`) in `packages/runtime/src/adapter/**` — the adapter is platform-neutral. ESLint hexagonal-import rule will reject violations.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-02] runtime/adapter: AgentIR→AriaFlow.AgentConfig + HarnessHooks → MessagingEvent`. Do NOT push.

---

## 1. Goal

Build the Anti-Corruption Layer that translates Kuralle's `AgentIR` (from `@kuralle/core/schemas/agent-ir`) into `@ariaflowagents/core`'s `AgentConfig`, and the inverse direction (`HarnessHooks → MessagingEvent`) used at runtime when the AriaFlow agent loop fires events. Three artifacts:

1. **`irToAgentConfig(ir, opts): AgentConfig`** — pure function. Translates the IR field-for-field. The `opts` argument carries any context the AriaFlow `AgentConfig` requires that the IR doesn't carry directly (e.g., a `(toolId) => ToolDefinition` resolver, a model-provider routing function — IC discovers what's needed by reading the `.d.ts` and citing each parameter).
2. **`buildHarnessHooks({ queue, conversationId }): HarnessHooks`** — factory that returns an AriaFlow-compatible `HarnessHooks` object. Each hook serializes its event into a `MessagingEvent` and pushes to the `MessageQueue` port. Per FINDINGS, the production sink runs at `eventMode='message'` (drops text-deltas + customs); these hooks are the durable surface, not the stream.
3. **`MessagingEvent`** — Zod-validated discriminated union covering at minimum: `agent.start`, `agent.end`, `step.start`, `step.end`, `tool.call`, `tool.result`, `tokens.updated`, `turn.end`. Each variant carries `{ kind, conversationId, sequenceNumber, occurredAt, payload }`. The projector worker (S3-04) reads these and writes DB rows.

The adapter is **platform-neutral** — no Cloudflare, no Hono, no Node. Only `@ariaflowagents/core`, `@kuralle/core`, `@kuralle/platform/interface` (for `MessageQueue` port), `zod`. The S3-03 DO will instantiate this adapter; S3-04 will consume what it produces.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md`.
2. `sprints/sprint-3/PLAN.md` — **§0** (locked decisions: `@ariaflowagents/*@1.0.0` four packages); story `S3-02` section is the spec.
3. `sprints/WBS.md` § Sprint 3 → row `S3-02`.
4. `sprints/sprint-2/HANDOFF.md` — hexagonal discipline + no-platform-imports trap.
5. **`scripts/sink-spike/FINDINGS.md` — the entire document.** Especially:
   - Volume table (~7 events/turn at message mode + ~9 hooks/turn).
   - Event-types-by-volume table; which events map to which DB rows.
   - The `tool-result` extraction payload (rides on `__flow_transition === true`).
   - The text-delta double-emission bug (NEVER accumulate from stream-side text-deltas; read from hook or session at `turn-end`).
   - The `onTokensUpdate` payload shape (it's the exact shape `usage_events` rows derive from).
6. `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer; `runtime/adapter/` is reserved for this exact concern.
7. `DATA_MODEL.md §9` — `conversation_turns`, `conversation_tool_calls`, `conversation_extracted_fields`, `runtime_sessions` (you need to know what the projector will read from your events; the event shape must be sufficient).
8. `DATA_MODEL.md §13` — `usage_events` (post-AMENDMENT-005 → `payload jsonb`). `onTokensUpdate` events become `usage_events` rows; billing kinds leave `payload` NULL, the `slo_violation` kind populates payload.
9. `packages/core/src/schemas/agent-ir.ts` — the source IR schema. Every field has a `// §5:NNN` line citation; use those when writing your mapping comments.
10. `packages/core/src/schemas/agent-ir.test.ts` — examples of valid IR shapes; reuse fixture patterns.
11. `packages/runtime/src/projector/agent.ts` — existing synchronous projector (the publish path). Mirror the structural style.
12. `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json` — known-good `AgentIR` fixture from S2-02. Your unit test loads this.
13. `packages/runtime/src/instrumentation/slo.ts` — existing `recordSloViolation`. The adapter does NOT call this; the projector does.
14. `packages/platform/src/memory/message-queue.ts` — memory adapter for the `MessageQueue` port. Your tests use this.
15. `packages/platform/src/interface.ts` — the `MessageQueue` port shape. (Verify the actual surface; don't intuit.)
16. **`node_modules/@ariaflowagents/core/dist/index.d.ts`** (and adjacent `.d.ts` files) — the *ground truth* for `AgentConfig` and `HarnessHooks`. **Read this BEFORE writing one line of adapter code.** Every field name you put in `irToAgentConfig`'s output must trace back to a name in this `.d.ts`.
17. `node_modules/@ariaflowagents/core/dist/index.js` (or whatever the resolved entrypoint is) — sanity-check that the `.d.ts` you read matches the runtime exports. Use `bun pm view @ariaflowagents/core 2>&1 | head -30` to confirm version `1.0.0` is installed.
18. **If `@ariaflowagents/core` is NOT yet installed** when you start (S3-01 should land it in `packages/runtime/package.json`, but verify): run `bun install` and confirm. If still missing, add it to `packages/runtime/package.json` at `1.0.0` per the PLAN §0 decision and proceed.

---

## 3. Files to create or modify

### Adapter (`packages/runtime/src/adapter/`)
- `packages/runtime/src/adapter/agent-config.ts` (new) — exports:
  - `irToAgentConfig(ir: AgentIR, opts: AgentConfigOpts): AgentConfig`.
  - `AgentConfigOpts` interface — typed parameters the AriaFlow `AgentConfig` needs that the IR doesn't carry (e.g., `toolResolver: (toolId: string) => Promise<ToolDefinition>`). IC determines the exact set by reading the `.d.ts`.
  - The function is **pure** — no I/O, no globals, no side effects.
  - Each major mapping step has a `// §5:NNN` line-citation comment showing which IR field maps where.
  - If a field exists in IR but not in `AgentConfig` (or vice versa), document the gap inline; do NOT silently drop or fabricate.
- `packages/runtime/src/adapter/agent-config.test.ts` (new) — loads `__fixtures__/calderon-dispatcher-ir.json`, calls `irToAgentConfig` with a stubbed `toolResolver`, asserts:
  - All required `AgentConfig` keys present.
  - Node count matches `ir.workflow.nodes.length` (when present).
  - Edge count matches.
  - Tool count matches `Object.keys(ir.toolAttachments).length`.
  - Guardrail node count matches `ir.guardrailGraph.nodes.length`.
  - Eval-criterion count matches `Object.keys(ir.scorerAttachments).length`.

### Hooks (`packages/runtime/src/adapter/hooks.ts`)
- `packages/runtime/src/adapter/hooks.ts` (new) — exports:
  - `buildHarnessHooks(deps: { queue: MessageQueue; conversationId: string; clock?: () => Date }): HarnessHooks`. Returns an object whose key names match AriaFlow's `HarnessHooks` interface verbatim (read from `.d.ts`).
  - Each hook serializes its inbound payload into a `MessagingEvent` and `await queue.publish(shardKey(conversationId), event)` — `shardKey` is from S3-04's queue-sharding contract; for now, the adapter publishes to a single virtual key `messaging-events` and lets the caller (S3-03 DO) provide a sharding wrapper. **Document this seam in the commit body; do NOT prematurely import S3-04 code.**
  - `sequenceNumber` is monotonic per `conversationId`. Source it from a small in-process counter the factory closure owns (`let seq = 0; return { ... seq: ++seq }`). The DO's single-writer guarantee in S3-03 makes this safe; document the assumption.
  - `clock` defaults to `() => new Date()`; tests override for deterministic timestamps.
  - Each hook has a `// FINDINGS:` comment citing which line in `scripts/sink-spike/FINDINGS.md` justifies the event mapping.
- `packages/runtime/src/adapter/hooks.test.ts` (new) — builds hooks against a memory `MessageQueue`, fires each hook with a synthetic AriaFlow payload, asserts:
  - `onAgentStart` → 1 `agent.start` event.
  - `onAgentEnd` → 1 `agent.end` event.
  - `onStepStart` → 1 `step.start` event.
  - `onStepEnd` → 1 `step.end` event.
  - `onToolCall` → 1 `tool.call` event.
  - `onToolResult` → 1 `tool.result` event (if `result.__flow_transition === true`, the event carries the unpacked extraction payload; the test asserts both shapes).
  - `onTokensUpdate` → 1 `tokens.updated` event with the FINDINGS-shape payload.
  - 3-turn fixture (~9 hook calls × 3 turns = ~27 invocations) emits ~27 events, matching FINDINGS' "hooks per turn ~9".
  - `sequenceNumber` strictly increasing.

### Events schema (`packages/runtime/src/adapter/events.ts`)
- `packages/runtime/src/adapter/events.ts` (new) — exports:
  - `messagingEventSchema: z.ZodDiscriminatedUnion<'kind', [...]>` — covers the 8 variants minimum (`agent.start`, `agent.end`, `step.start`, `step.end`, `tool.call`, `tool.result`, `tokens.updated`, `turn.end`).
  - `MessagingEvent = z.infer<typeof messagingEventSchema>`.
  - Per-variant payload sub-schemas, each `.strict()`. `tool.result.payload` includes `extraction?: { targetNode: string; data: Record<string, unknown> }` (per FINDINGS' `__flow_transition` pattern). `tokens.updated.payload` mirrors the FINDINGS sample shape (`inputTokens`, `outputTokens`, `totalTokens`, `cacheReadTokens`, `model`, `latencyMs`, `cumulativeInputTokens`, `cumulativeOutputTokens`, `cumulativeTotalTokens`, `contextUtilization`). `turn.end.payload` includes `messageId: string` (for projector dedup) + `fullText: string` + `speaker: 'caller' | 'assistant'`.
  - Common header on every variant: `{ kind, conversationId, sequenceNumber: number, occurredAt: Date }`.
- `packages/runtime/src/adapter/events.test.ts` (new) — schema parse/reject tests:
  - Valid events for each variant parse cleanly.
  - Unknown `kind` rejects.
  - Missing required fields reject.
  - Extra fields rejected (`.strict()`).

### Index + re-exports
- `packages/runtime/src/adapter/index.ts` (new) — public re-exports.
- `packages/runtime/src/index.ts` — re-export `adapter/`.

### Fixture
- `packages/runtime/src/adapter/__fixtures__/aria-flow-events-3-turn.json` (new) — synthetic AriaFlow hook payloads for a 3-turn fixture (greeting → name → date), derived from FINDINGS counts. Each entry has `{ hook: 'onAgentStart' | ..., payload: { ... } }`. Used by `hooks.test.ts`.

### Dep
- `packages/runtime/package.json` — verify `@ariaflowagents/core@1.0.0` pinned (S3-01 may have already added it via the messaging-meta install). If missing, add it explicitly.

---

## 4. Acceptance criteria (numbered, in priority order)

1. `irToAgentConfig` is a pure function; types align with the **actual** `@ariaflowagents/core` `.d.ts`. Every IR field used appears with a `// §5:NNN` comment.
2. `buildHarnessHooks` returns an object whose key names match AriaFlow's `HarnessHooks` verbatim (no renaming). Each hook fires exactly one `MessagingEvent` (or zero if observational; IC justifies in commit body).
3. `MessagingEvent` is a Zod-discriminated union covering at minimum the 8 listed variants. `messagingEventSchema.parse(...)` accepts every event your `buildHarnessHooks` emits.
4. **Sequence numbering:** `sequenceNumber` is monotonic per-`conversationId`, starts at `1`, and is strictly increasing. The hooks closure owns the counter.
5. **`tool-result` extraction:** when `result.__flow_transition === true`, the emitted `tool.result` event carries `payload.extraction = { targetNode, data }`. When not present, `payload.extraction` is omitted (not `null`). Test covers both branches.
6. **Text from hook, not stream:** `turn.end.payload.fullText` is sourced from the hook payload (`onAgentEnd` or `done` per FINDINGS), NOT from accumulated text-deltas. Document this in `hooks.ts` with a `// FINDINGS: text-delta double-emission bug` comment.
7. **`onTokensUpdate` payload shape** matches FINDINGS sample byte-for-byte (`inputTokens`, `outputTokens`, ..., `contextUtilization`). The Zod schema rejects payloads missing required fields.
8. **Hexagonal discipline:** ESLint `no-restricted-imports` rule (S0-06 + extended in S2) verifies no `platform/cloudflare`, `platform/node`, `hono`, or `apps/server` imports in `packages/runtime/src/adapter/**`. Run `bun run lint` to confirm.
9. **Tests green:** `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test` all exit 0. Hook test with the 3-turn fixture asserts exactly 27 events emitted (or whatever the actual FINDINGS-aligned count is — IC computes from the fixture).
10. **Demo artifact:** `sprints/sprint-3/artifacts/S3-02-adapter-event-trace.txt` — `bun -F @kuralle/runtime test --reporter verbose` showing the 27-event emission for the 3-turn fixture aligned with FINDINGS counts.
11. **AriaFlow shape verified:** commit body lists each `AgentConfig` field name actually consumed by `irToAgentConfig` (verbatim from `.d.ts`), each `HarnessHooks` field name actually wired (verbatim), and any IR field that does NOT map to AriaFlow (with reason).

---

## 5. What NOT to do

- Do **not** ship the `MessagingDO` or any Cloudflare-Worker code. S3-03.
- Do **not** ship the projector worker. S3-04.
- Do **not** import from `apps/server`, `packages/platform/cloudflare`, `packages/platform/node`, `hono`. The adapter is platform-neutral.
- Do **not** invent `AgentConfig` or `HarnessHooks` field names. Read the installed `.d.ts` first.
- Do **not** persist text-deltas. Use the hook-side `fullText` per FINDINGS.
- Do **not** include `text-delta` or `custom` in `MessagingEvent`. Production runs at `eventMode='message'` which drops them.
- Do **not** drop `tokens.updated` payload fields. The projector relies on the FINDINGS-shape for `usage_events` row derivation.
- Do **not** raw-`client.query()`-INSERT fixtures. Adapter tests don't touch the DB anyway, but if any helper does, use `seedWorkspace`.
- Do **not** add deps to root `package.json` (memory rule).
- Do **not** push to remote.

---

## 6. Test plan (you author)

- **Unit (`agent-config.test.ts`):** load fixture IR → `irToAgentConfig` → assert structural counts as listed in §3.
- **Unit (`hooks.test.ts`):** memory queue, fire each hook with synthetic payload, assert event count + shape + sequenceNumber + extraction-payload branch.
- **Unit (`events.test.ts`):** schema parse/reject for each variant; reject unknown `kind`; reject extras (`.strict()`).
- **Integration:** none in this story (S3-03/S3-04 cover end-to-end).

---

## 7. When you're done

```bash
bun install --frozen-lockfile && \
bun run check-types --force && \
bun run lint && \
bun -F @kuralle/core test && \
bun -F @kuralle/runtime test
```
All exit 0. Then `git add` every file in §3 and:
```
git commit -m "[S3-02] runtime/adapter: AgentIR→AriaFlow.AgentConfig + HarnessHooks → MessagingEvent"
```
Commit body must include:
- The exact `@ariaflowagents/core` `AgentConfig` field names you mapped to (verbatim from `.d.ts`).
- The exact `HarnessHooks` field names you wired.
- Any IR field that does not map (and why — e.g., "voiceConfig is voice-only; messaging path doesn't consume it").
- The 3-turn fixture event count + how it lines up with FINDINGS.
- One bullet per acceptance criterion confirming it landed.

Stop and ask if any AriaFlow shape divergence forces an RFC amendment.
