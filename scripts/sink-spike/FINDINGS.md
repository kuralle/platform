# Sink spike — what AriaFlow actually emits

**Goal:** before deciding write paths in `DATA_MODEL.md`, see exactly what events
the AriaFlow runtime produces for one realistic conversation, in JSONL, with
nothing fabricated.

**Setup:** small flow agent (`kuralle-sink-spike`) — two nodes (`greet` →
`book`), three tools (`lookup_customer`, `continue_to_booking`,
`book_appointment`), extraction schema (`customerName`, `appointmentDate`).
Three user turns: "Hi, I'd like to book", "My name is Sarah", "Next Tuesday at
10am". Two parallel sinks:

- `stream.jsonl` — `StreamCallbackSink` with `eventMode: 'all'` +
  `emitTextDeltas: true`. Every `HarnessStreamPart` the runtime fires.
- `hooks.jsonl` — `HarnessHooks` (onStart / onEnd / onStepStart / onStepEnd /
  onToolCall / onToolResult / onTokensUpdate / onAgentStart / onAgentEnd).
  Captures lifecycle + telemetry the stream doesn't carry.

Source: `scripts/sink-spike/run.ts` (run from inside the aria-flow workspace
because of dep resolution; the artifact copies back here).

---

## Volume

| Surface | Events | Per turn | Notes |
|---|---:|---:|---|
| `stream.jsonl` (eventMode='all', deltas on) | 130 | ~43 | Dominated by 60× `text-delta` and 16× `custom` (framework-internal observability) |
| `stream.jsonl` (eventMode='message') | ~20 | ~7 | Production default. Drops text-deltas, drops custom, keeps lifecycle + tools + transitions |
| `hooks.jsonl` (the hooks I registered) | 27 | ~9 | Lifecycle + per-turn token usage + tool call/result |

Extrapolating to voice (5–10 min, 30–60 user turns, barge-in events, partial
re-tries):

- Stream firehose at `eventMode='message'`: ~200–400 events per call.
- Hooks at the same scope: ~150–250 per call.
- At Kuralle's voice load target (40 concurrent calls/workspace): peak ingest
  is ≤ 600 events/sec/workspace from the call path alone. A Cloudflare Queue
  consumer can absorb that without thinking. Postgres direct-write would too,
  but at the cost of inline latency to every LLM turn.

---

## What the stream firehose carries (`stream.jsonl`)

Event types observed, ranked by volume:

| Count | Type | Maps to data-model artefact |
|---:|---|---|
| 60 | `text-delta` | **Do not persist as rows.** Snapshot from `done`/`turn-end` `fullText` to `conversation_turns.text` |
| 16 | `custom` | Framework-internal observability (e.g. `flow.transition.duration`). Forward to OTel/metrics, not Postgres |
| 8 | `turn-end` | Closes a logical agent turn → finalises `conversation_turns` row |
| 4 | `node-enter` | Updates `runtime_sessions.flowStateByAgent` (current node) |
| 4 | `tool-call` | One row in `conversation_tool_calls` (input only) |
| 4 | `tool-result` | Updates the same `conversation_tool_calls` row (output, durationMs) **AND** carries inline flow-extraction payload |
| 3 | `input` | User-side `conversation_turns` row (`speaker='caller'`) |
| 3 | `agent-start` / `agent-end` | Pair around a logical agent execution; we don't need rows for these — annotate session metadata only |
| 3 | `step-start` / `step-end` | Step within an agent. v1: do not persist; v2: optional `agent_steps` table for replay |
| 3 | `done` | Per-turn final marker with accumulated `fullText`; this is the trigger for closing the assistant turn row |
| 2 | `node-exit` / `flow-transition` | Pair fires together; one row in a future `flow_transition_events` table OR a single `runtime_sessions.flowStateByAgent` patch |

**Notable absences in this run** (would surface with richer scenarios):
`handoff`, `tripwire`, `flow-end`, `interrupted`, `tool-error`, knowledge
events (`knowledge-cache-hit`, `knowledge-search`, `knowledge-quality-check`,
`knowledge-reformulation`), `context-compacted`, `result-evicted`,
`suggested-questions`. All have type definitions; we just didn't trigger them.
The schema needs a story for each — `guardrail_events` covers tripwire,
`session_checkpoints` covers flow-end / interrupted, `usage_events` covers
knowledge-search latency, etc.

### One genuinely surprising shape

`tool-result` carries the extraction payload **inline**, not as a separate
event:

```json
{
  "type": "tool-result",
  "toolCallId": "call_ITY...",
  "toolName": "continue_to_booking",
  "result": {
    "__flow_transition": true,
    "targetNode": "book",
    "data": { "customerName": "Sarah", "appointmentDate": "Next Tuesday at 10am" }
  }
}
```

So the writer for `conversation_extracted_fields` is **a consumer of
`tool-result` events** that filters on `result.__flow_transition === true`
and unpacks `result.data`. There is no separate `extraction-update` event in
the public stream — only in `TraceStreamEvent` (Studio-only). This is a
schema-affecting fact: the proposal v2 had me thinking extraction lived on
extraction nodes; in practice it rides on the tool-result of the transition
tool.

### Bug seen — text-delta double-emission

`fullText` on `done`/`turn-end` came back as
`"SureSure!! Can Can you you please please tell tell me me…"` — every word
doubled. Repeatable. The runtime emits the same `text-delta` twice when
`eventMode='all'`. **Implication for Kuralle:** never accumulate
`conversation_turns.text` from stream-side text-deltas. Either:

- snapshot from the `onMessage` hook (assistant message at finish), or
- read from `RunContext.session.messages` at `turn-end` / `done`.

The hook is the durable surface; the stream is for live UI.

---

## What the hooks carry (`hooks.jsonl`) — the bits the stream misses

The single most important hook for the data model is **`onTokensUpdate`**.
Sample payload:

```json
{
  "event": "onTokensUpdate",
  "payload": {
    "sessionId": "1ac774…",
    "turn": 1,
    "nodeId": "greet",
    "inputTokens": 565,
    "outputTokens": 23,
    "totalTokens": 588,
    "cacheReadTokens": 0,
    "model": "gpt-4o-mini",
    "latencyMs": 1220,
    "cumulativeInputTokens": 565,
    "cumulativeOutputTokens": 23,
    "cumulativeTotalTokens": 588,
    "contextUtilization": 0.0044140625
  }
}
```

This is the **exact** shape `usage_events` rows are derived from. One
`onTokensUpdate` per LLM call →

- one `usage_events` row of `kind='llm_input_tokens'`, quantity = `inputTokens`,
- one of `kind='llm_output_tokens'`, quantity = `outputTokens`,
- the `latencyMs` lands on the `conversation_turns` row that owns this turn,
- `contextUtilization` is the signal for the F2 detail screen's "context
  budget" indicator,
- `model` becomes part of the cost calculation (model rate × quantity).

Everything else the v1 IR needed for cost analytics (`cacheReadTokens`,
`cumulativeTotalTokens`, `nodeId` so we can roll up per-flow-node cost) is
already in this single event. **No additional instrumentation is needed.**

`onStepEnd` carries `finishReason` (`'flow'` / `'stop'` / `'tool-calls'`) and
`tokensUsed` (sometimes 0 when the step was a flow-driven tool execution
without an LLM call). This is the right place to recognise a "flow-only
step" that costs nothing — important for the cost screen's "calls-with-zero-LLM"
edge case.

`onToolResult` carries `durationMs` per tool call — that lands on
`conversation_tool_calls.durationMs` directly.

---

## Mapping to the proposed schema

| Source event | Table & column | Notes |
|---|---|---|
| `input` (stream) | `conversation_turns` row, `speaker='caller'`, `text=part.text` | One row per user input |
| `onMessage` role='assistant' | `conversation_turns` row, `speaker='agent'`, `text=message.content` | Snapshot from hooks, not text-delta accumulator |
| `tool-call` (stream) + `onToolCall` | `conversation_tool_calls` insert | Stream gives args, hook gives same — pick hook for durability |
| `tool-result` (stream) + `onToolResult` | `conversation_tool_calls` update with `output`, `durationMs` | If `result.__flow_transition`, also writes `conversation_extracted_fields` |
| `tool-error` (not seen — type exists) | `conversation_tool_calls.errorMessage` + `guardrail_events` if guard-triggered | |
| `tripwire` (not seen — type exists) | `guardrail_events` row | Phase = input/output, processorId = guardrail name |
| `flow-transition` (stream) | `runtime_sessions.flowStateByAgent` patch + optional `flow_transition_events` row | The supervisor screen consumes this in real time |
| `node-enter` / `node-exit` (stream) | `conversation_turns.workflowNodeId` on subsequent turns | Tags which node was active |
| `handoff` (not seen) | `runtime_sessions.routingState` + `audit_log_events` | |
| `onTokensUpdate` (hook) | 2× `usage_events` (input + output) + `conversation_turns.tokens` | Plus `latencyMs` to the turn row |
| `onStepEnd.finishReason='flow'` (hook) | No usage row (flow-only step) | Cost screen edge case |
| `onSessionEnd` (hook, not fired in this run — happens on closeSession) | `conversations.endedAt`, `durationSec`, `outcome` | Plus final `runtime_sessions` snapshot |
| `done` (stream, with `fullText`) | Closes the turn; trigger to finalise the assistant `conversation_turns` row | Stream-side completion signal for UI |
| `custom` (stream, e.g. `flow.transition.duration`) | OTel / metrics — not Postgres | Forward to observability sink |
| `interrupted` (not seen — voice/realtime feature) | `runtime_sessions` checkpoint + `voice_calls.hangupBy='caller'` | Voice-only |
| `knowledge-*` (not seen — needs CAG agent) | `usage_events` (kind='rag_query'), latency on `conversation_turns`, quality scores to debug logs | |

---

## What this changes in the data model

1. **The write path splits cleanly.** Hooks → durable sink (Cloudflare Queues
   → projector worker → Postgres). Stream → live UI (WebSocket / DO push to
   the F3 supervisor screen). Same data, two consumers, two latency budgets.

2. **`conversation_turns.text` should be sourced from `onMessage` (hook), not
   from accumulated text-deltas.** The double-emit bug makes this a
   correctness issue, not just a preference.

3. **`conversation_extracted_fields` writer is a consumer of `tool-result`
   events with `result.__flow_transition === true`.** The proposal had me
   modelling it as a side-effect of extraction nodes; in practice it's a tool
   side-effect. The schema doesn't change but the writer wiring does.

4. **`usage_events` is fed entirely by `onTokensUpdate`.** One event in,
   exactly two rows out (input + output tokens). `model`, `latencyMs`,
   `nodeId`, `contextUtilization` all available per turn. We don't need to
   instrument the LLM call path — the harness already does.

5. **`runtime_sessions.flowStateByAgent`** is updated by a stream consumer
   on `node-enter` / `flow-transition`. This is the live supervisor's
   "which node is the agent in?" signal. Latency-sensitive — argues for the
   supervisor reading from a DO / WebSocket fanout, not polling Postgres.

6. **Step-level events (`step-start`, `step-end`) probably do not need their
   own table.** They're a debugging tool. Persist the `finishReason` +
   `tokensUsed` summary to `conversation_turns` and forward the rest to OTel.
   We can add `agent_steps` later if replay debugging becomes a product
   feature.

7. **`custom` events go to OTel, not Postgres.** Same rule applies to the
   `knowledge-*` family — they're observability, not durable record.

---

## Concrete recommendations for the data model write path

| Stream class | Tables | Write path |
|---|---|---|
| **Hot append-only** (event-sourced) | `conversation_turns`, `conversation_tool_calls`, `conversation_extracted_fields`, `usage_events`, `guardrail_events`, `audit_log_events`, `webhook_deliveries`, `session_checkpoints` | Cloudflare Queue → projector worker → Postgres. Source = `HarnessHooks`. |
| **Live state** (single-writer, mutable) | `runtime_sessions` (workingMemory, flowStateByAgent, routingState, sequenceNumber) | Direct Postgres write from the runtime worker (or DO holding the live session, snapshotting at checkpoints). Source = `HarnessHooks` + stream `flow-transition` / `handoff`. |
| **Live UI fanout** (read-only) | F3 supervisor screen consumes `conversation_turns`, current node, tool calls in flight | Stream sink → WebSocket / DO push. NOT Postgres LISTEN/NOTIFY (too coarse). |
| **Slow-mutating config** | `agents`, `agent_revisions`, `tools`, `kb_documents`, `channel_endpoints`, `channel_connections`, `widgets`, etc. | Direct synchronous Postgres writes. Read-after-write matters. |
| **Aggregates** | `monthly_receipts`, `workspace_compliance_posture` | Async worker, computed from `usage_events` + `conversation_evals` + `audit_log_events`. |
| **Observability** | (no Postgres tables) | `custom` events, `knowledge-*` events, span data → OTel / Datadog / equivalent. |

This is the answer to "are we doing direct sync writes or a sink?" The honest
answer is **both, by table class**:

- Direct sync for config + live state (low write rate, read-after-write
  matters).
- Event sink for append-only streams (high write rate, eventual consistency
  acceptable, replay valuable).
- Push fanout for live UI (latency budget tighter than Postgres can deliver).

The proposal `DATA_MODEL_v2_PROPOSAL.md` should grow a §7 "Write paths and
event sinks" chapter with this table.

---

## Artifacts

- `scripts/sink-spike/run.ts` — the spike script
- `scripts/sink-spike/stream.jsonl` — 130 events, full firehose
- `scripts/sink-spike/hooks.jsonl` — 27 events, durable surface

Reproduce: `cd /aria-flow/packages/ariaflow-core && npx tsx
examples/flows/kuralle-sink-spike.ts`

---

## What we did NOT exercise

- Voice transport (LiveKit plugin) — would surface `voice` payloads,
  barge-in events, partial-audio events
- Handoff between agents — `handoff` event, `routingState` updates
- Guardrails — `tripwire` events
- Knowledge retrieval — 7 different `knowledge-*` event types
- Context compaction — fires only after 50+ messages (text) / 20+ (voice)
- Tool errors — would have if I'd actually triggered the lookup_customer
  error path
- Session ending with `closeSession` — would fire `onSessionEnd` with
  `SessionEndMetadata`

Each of these has a distinct event shape that the writer wiring needs to
handle. None of them require schema changes — they slot into the same five
table classes — but they do change which hook a particular row is sourced
from. Worth a follow-up spike before the projector worker is written.
