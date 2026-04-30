# Kuralle · Conversation Pipeline Blueprint

How a call lives, where its data lands, who reads it, and when it dies.

Companion to `DATA_MODEL.md` — that doc is the schema; this one is the flow.

---

## 1 · The whole picture, one diagram

```
                   PHONE NETWORK
                        │
                        ▼
       ┌────────────────────────────────────┐
       │      Telephony adapter             │ ← Twilio / SIP / BYO
       │      (Cloudflare Worker)           │
       └────────────────────────────────────┘
                        │
                        │ creates conversations row
                        │ status=live, endedAt=NULL
                        ▼
   ┌──────────────────────────────────────────────────┐
   │       Cloudflare DURABLE OBJECT (one per call)   │
   │  ┌────────────────────────────────────────────┐  │
   │  │   AriaFlow Runtime                         │  │
   │  │   ├─ Agent / FlowAgent                     │  │
   │  │   ├─ SessionStore  ──────► runtime_sessions│ ─┼──► Postgres
   │  │   ├─ Sinks ────► turn writer ──► turns     │ ─┼──► Postgres
   │  │   │            ► webhook fanout            │ ─┼──► webhook_deliveries
   │  │   │            ► metrics emitter           │ ─┼──► OTel
   │  │   └─ Hooks: onSessionEnd ──┐               │  │
   │  └────────────────────────────┼───────────────┘  │
   │                               │                  │
   │   WebSocket fanout ◄──────────┴── live broadcast │
   └──────────────────┬───────────────────────────────┘
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
       F3 supervisors      F2 viewers (poll on close)
       (multiple)          (refresh on websocket close event)


  POST-CALL (onSessionEnd, fired once)
  ────────────────────────────────────
  finalize conversations row  (endedAt, durationSec, outcome, costUsd)
              │
              ├─► pg-boss queue ──► summary job        ──► conversations.summary
              │                  ├► eval job           ──► conversation_evals
              │                  ├► extraction job     ──► conversation_extracted_fields
              │                  ├► webhook delivery   ──► webhook_deliveries
              │                  ├► usage rollup       ──► usage_events sums
              │                  └► recording upload   ──► R2: conversations.recordingStorageKey
              │
              └─► audit log row (event=conversation.completed)
```

---

## 2 · Components & ownership

| Component                          | Owns                                                                 | Lifetime               |
|------------------------------------|----------------------------------------------------------------------|------------------------|
| **Telephony adapter**              | Phone-network handshake, conversation row creation, audio framing    | Per-call               |
| **Cloudflare Durable Object**      | One AriaFlow `Runtime` instance + WebSocket fanout to F3 viewers     | Per-call               |
| **`SessionStore` (Postgres)**      | Authoritative runtime state for resume / replay                      | Per-call → archived    |
| **Sinks (function → Postgres)**    | Streaming external observability (turns / tool calls / metrics)      | Per-call → archived    |
| **`onSessionEnd` hook**            | Finalisation + async fan-out                                         | Once at call end       |
| **pg-boss job queue**              | Summary, eval, extraction, webhook delivery, usage rollup            | Per job (retried)      |
| **R2 / S3 object storage**         | Audio recording (one MP3 per call), generated PDFs                   | Per-agent retention    |
| **Postgres LISTEN/NOTIFY** *(opt)* | Optional fallback live channel if no DO available                    | Per-subscription       |
| **Nightly retention worker**       | Hard-delete past `agents.retentionDays`; S3 lifecycle mirrors        | Daily cron             |

---

## 3 · Hot path vs cold path

| Path     | Latency target | Backed by                           | Reads                               |
|----------|----------------|-------------------------------------|-------------------------------------|
| **Hot**  | < 100 ms       | DO in-memory + WebSocket fanout     | F3 live supervisor                  |
| **Warm** | < 1 s          | Postgres `conversations` + `_turns` | F2 detail, F1 list, recent-calls    |
| **Cold** | < 5 s          | R2 audio + L5 receipts              | Audio playback, monthly receipts    |
| **Glacier** | seconds → minutes | S3 Glacier audit archive       | HIPAA / FERPA compliance pull       |

Hot path never reads Postgres. Postgres is the durable replica of what the DO already holds in memory.

---

## 4 · Live supervisor (F3) — sequence

```
F3 client                DO (call-owner)             Postgres
    │                          │                        │
    │── GET /conv/cv_X/live ─►│                        │
    │                          │── upgrade WS ─────────►│ (no read)
    │◄── replay buffer ────────│
    │   (last 50 turns)        │
    │                          │                        │
    │       …caller talks…     │                        │
    │                          │── runtime emits turn ─►│ INSERT turn
    │◄── push: turn ───────────│                        │
    │                          │                        │
    │── operator: panic ──────►│                        │
    │                          │── injectAgent("hold") ►│ INSERT system turn
    │                          │── audit row ──────────►│ INSERT audit_log
    │◄── push: system turn ────│                        │
    │                          │                        │
    │       …call ends…        │                        │
    │                          │── onSessionEnd ───────►│ UPDATE conversations.endedAt
    │◄── push: closed ─────────│── checkpoint ─────────►│ INSERT session_checkpoint
    │                          │── enqueue jobs ───────►│ pg-boss tables
    │── reconnect to F2 ──────►│                        │
```

---

## 5 · What writes when

| Trigger                                        | Writes to                                       |
|------------------------------------------------|-------------------------------------------------|
| Phone connects                                 | `conversations` (status=live)                   |
| Each agent / caller turn                       | `conversation_turns` (incremental sink)         |
| Tool call resolves                             | `conversation_tool_calls`                       |
| Flow transition / handoff                      | `session_checkpoints` (durability snapshot)     |
| Operator intervention                          | `conversation_turns` (system) + `audit_log_events` |
| Extraction node satisfies its schema           | `conversation_extracted_fields`                 |
| Eval scenario fires (per-turn or at end)       | `conversation_evals`                            |
| Call ends (onSessionEnd)                       | `conversations` (endedAt, outcome) + audit row + pg-boss jobs |
| Recording uploaded (post-call worker)          | `conversations.recordingStorageKey`             |
| Summary worker completes                       | `conversations.summary` (column to add)         |
| Webhook worker delivers                        | `webhook_deliveries`                            |
| Nightly aggregator                             | `usage_events` rollup → `monthly_receipts`      |
| Retention worker                               | DELETE `conversations` (cascades) + audit tombstone |

Sinks ≠ store. Sinks stream events for observability. Store is the runtime's authoritative state for resume.

---

## 6 · Three sinks, three concerns

```ts
streamCallback: {
  sinks: [
    // 1. Postgres turn writer — feeds F2/F3
    createFunctionStreamSink(async ev => {
      if (ev.event === 'turn-end')   await db.insert(conversationTurns).values(...);
      if (ev.event === 'tool-result') await db.insert(conversationToolCalls).values(...);
      if (ev.event === 'flow-transition') await db.insert(sessionCheckpoints).values(...);
    }, 'pg-turns'),

    // 2. OTel exporter — feeds metrics dashboards (Grafana / Datadog)
    createFunctionStreamSink(async ev => {
      meter.recordEvent(ev);
    }, 'otel-metrics'),

    // 3. Webhook fanout — fires per-event to subscribed customer endpoints
    createFunctionStreamSink(async ev => {
      const hooks = await listActiveWebhooks(workspaceId, ev.event);
      for (const h of hooks) await enqueueDelivery(h.id, ev);
    }, 'webhook-fanout'),
  ],
  eventMode: 'message',
  emitToolEvents: true,
  emitTransitionEvents: true,
  emitTextDeltas: false,    // never write per-token to PG
  emitFinalText: true,
  flushOnEnd: false,
}
```

Each sink fails independently. A slow webhook can't back-pressure the turn writer.

---

## 7 · Retention timeline

```
Day 0           Day N (agent.retentionDays)        Day N + 90
  │                       │                              │
  ├── conversations row  ─┼── retention worker deletes ─►│  audit tombstone
  ├── conversation_turns ─┘   (cascade)                  │  (workspace_id +
  ├── session_checkpoints ────────────────────────────── │   conversation_id +
  ├── R2 audio ─────────► S3 lifecycle rule mirrors TTL  │   deletedAt)
  └── usage_events ──────► aggregated into monthly_receipts before delete
                                                         │
audit_log_events  (never deleted, partition-archived after 90 days to Glacier)
                                                         │
                                                         ▼
                                            Compliance retrieval window
                                            (HIPAA: 6 yrs · FERPA: 5 yrs)
```

**HIPAA-mode workspaces** flip an extra switch: the agent's `retentionDays` defaults to 0 (transcript text deleted on `endedAt`), recording is opt-in only, and the LLM provider runs in zero-retention mode. Audit log + tombstone still persist for 6 yrs to prove handling.

---

## 8 · Reads — every screen, every query

| Screen                         | Query                                                           | Index hit                          |
|--------------------------------|-----------------------------------------------------------------|------------------------------------|
| F1 conversations list          | `SELECT … FROM conversations WHERE workspaceId=$1 ORDER BY startedAt DESC LIMIT 50` | `(workspace_id, started_at desc)`  |
| F1 with filters                | + `WHERE outcome IN $2 AND agentName IN $3 AND endedAt IS NULL` | partial index on `endedAt is null` |
| F1 search                      | + `WHERE to_tsvector(text) @@ plainto_tsquery($4)` against `conversation_turns` | `gin(text_tsv)`                    |
| F2 detail                      | one tRPC call → 5 SELECTs (`conversations`, `_turns`, `_tool_calls`, `_extracted_fields`, `_evals`) | all on `conversation_id`           |
| F2 audio playback              | signed R2 URL from `conversations.recordingStorageKey`          | n/a                                |
| F3 live (subscribe)            | WebSocket to DO; replay buffer of last 50 turns from in-memory  | n/a                                |
| F3 fallback if DO unreachable  | `SELECT … FROM conversation_turns WHERE conversation_id = $1 ORDER BY ordinal` + LISTEN | `(conversation_id, ordinal)`       |
| Home recent calls              | F1 query with LIMIT 6                                           | same                               |
| L5 monthly receipt             | one SELECT on `monthly_receipts WHERE workspace_id=$1 AND month=$2` | `(workspace_id, month desc)`       |

---

## 9 · Two schema additions (from yesterday's review)

Add to `conversations`:

```ts
workerId   text                                  // DO id that currently owns this live call
                                                  // null when call is over; non-null is "live"
summary    text                                  // populated by summary worker post-call
```

Add to `conversation_turns`:

```ts
intervenedByUserId text references users(id)     // distinguishes operator-injected turns
                                                  // from agent turns in the audit trail
```

`workerId` lets multiple DOs across regions claim live calls cleanly (UPSERT with conflict-on-claim) and tells the F3 router which DO to subscribe to without a separate lookup. `summary` and `intervenedByUserId` close audit-trail gaps surfaced in the §15 cross-cutting review.

---

## 10 · MVP cut vs full build

If you ship the smallest thing that proves the loop:

**Ship now**
- Postgres `SessionStore` (replace MemoryStore)
- One sink (Postgres turn writer)
- `onSessionEnd` → finalises `conversations` + posts to webhook synchronously
- F1 + F2 read straight from Postgres
- F3 via Postgres LISTEN/NOTIFY (no DO yet)
- Audio: write off entirely (record at telephony layer, attach later)

**Ship after**
- Cloudflare DO for live runtime + WebSocket fanout (replaces LISTEN/NOTIFY)
- pg-boss + summary / eval / extraction workers
- R2 recording upload
- Multi-region DO routing
- Glacier audit archive

The MVP cut covers F1 / F2 fully and F3 in its degraded-but-functional shape. Every later upgrade is additive, no breaking changes to the schema.
