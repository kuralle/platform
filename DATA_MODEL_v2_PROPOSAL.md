# Kuralle · Data Model v2 — revision proposal

Status: **discussion draft** — supersedes nothing yet; intended to drive the
review with an external system architect (delegated to `pi`) before we redline
`DATA_MODEL.md`.

This document captures three structural shifts that the v1 IR does not yet
reflect, proposes concrete schema deltas, and lists the open questions worth a
senior eye.

---

## 0 · What changed in the brief

Three pieces of context arrived after `DATA_MODEL.md` was drafted:

1. **Runtime is AriaFlow.** Kuralle is the SaaS surface; the engine is
   `@ariaflowagents/*` (core + messaging + livekit-plugin family + rag +
   stores). The schema must serialise into AriaFlow primitives without a
   translation layer, and must persist exactly the state AriaFlow's
   `SessionStore` already understands (`agentStates`, `flowState`,
   `workingMemory`).
2. **Kuralle is a unified communication inbox, not a phone-only product.**
   v1 will ship voice/call agents **and** WhatsApp agents; chat widget,
   Messenger, Instagram, and other channels follow. Every "conversation"
   primitive in the schema needs to be channel-polymorphic from day one.
   AriaFlow already has `@ariaflowagents/messaging` with a `PlatformClient`
   interface (WhatsApp / Messenger / Instagram) and a default
   `SessionResolver` keyed `{platform}:{threadId}` — the schema has to back
   that mapping cleanly.
3. **Tool catalogues are MCP-bridged.** `tools.kind = 'direct'` is dropped
   (`system` is canonical for built-ins). MCP becomes the on-ramp for
   external catalogues — Composio, Pipedream, Arcade, etc. — so we need a
   first-class `tool_catalog_provider` concept that does not leak vendor
   specifics into the agent-tool surface.

The rest of `DATA_MODEL.md` stands. This proposal only touches what those
three shifts force.

---

## 1 · Shift A — Channels as a first-class primitive

### Problem with v1

`conversations` in v1 assumes phone:

```
direction       enum('inbound','outbound')
callerId        text                 -- E.164
phoneNumberId   text  references phone_numbers(id)
```

For WhatsApp, Messenger, Instagram, web chat widget: there is no `callerId`
in E.164, the relevant route key is a `threadId`, the 24-hour messaging
window matters (`@ariaflowagents/messaging.WindowTracker`), and turn
"speakers" are the same but the medium shapes everything else (recording,
transcript-vs-message, latency expectations, billing meter).

If we keep voice-shaped columns on `conversations` and bolt on
`whatsapp_thread_id`/etc., we end up with a wide nullable table that's
strictly worse than naming the abstraction.

### Proposal

Introduce **`channel_kind`** as a closed enum and split phone-only fields
into a separate `voice_calls` extension table. Keep `conversations` as the
*polymorphic* root — every channel records turns, evals, extracted fields,
and tool calls into the same downstream tables.

```
channel_kind enum:
  voice            -- PSTN/SIP/Twilio/SmartPBX, recorded
  whatsapp         -- Meta Cloud API
  messenger        -- Meta
  instagram        -- Meta
  web_chat         -- our embedded widget (AriaFlow chat router)
  sms              -- Twilio SMS (post-MVP, modeled now)
  -- voice_widget = browser-mic widget; treat as `voice` with channel_connection.kind=widget
```

#### `channel_connections`

Replaces / generalises `telephony_connectors`. One row per workspace × channel
provider configuration. WhatsApp Business Account, a Twilio account, a
Messenger Page, an Instagram IG Business account — all live here.

```ts
channel_connections {
  id              text       primary key  // ch_<nanoid>
  workspaceId     text       references organization(id) on delete cascade
  channelKind     channel_kind not null
  provider        text       not null
    // 'twilio-native' | 'twilio-byo' | 'sip' | 'smartpbx' |
    // 'meta-whatsapp-cloud' | 'meta-messenger' | 'meta-instagram' |
    // 'web-widget' | 'twilio-sms'
  displayName     text       not null     // "Calderon HVAC main line"
  status          enum('connected','available','coming-soon','error','degraded') not null
  credentialsSecretId text   references secrets(id)   // KMS-encrypted creds blob
  config          jsonb      not null     // provider-specific shape (see below)
  capabilities    text[]     default '{}' // ['voice','sms','media','templates','flows']
  createdAt       timestamp  default now()
  updatedAt       timestamp
  deletedAt       timestamp
}
indexes: (workspaceId, channelKind), (workspaceId, status)
```

`config` shape per provider (illustrative, NOT canonical):

| provider | config |
|---|---|
| `twilio-native` | `{ accountSid, recording, callerIdMode }` |
| `sip` | `{ host, port, transport, codecs[], srtp, authMode }` |
| `meta-whatsapp-cloud` | `{ phoneNumberId, businessAccountId, verifyToken, webhookUrl, displayPhoneNumber }` |
| `meta-messenger` | `{ pageId, verifyToken }` |
| `meta-instagram` | `{ igId, verifyToken }` |
| `web-widget` | `{ allowedOrigins[], requireSignedToken }` |

#### `channel_endpoints`

The *addressable identity* on a channel. Per provider:

- voice: a phone number
- whatsapp: a WhatsApp phone number ID + display E.164
- messenger: a page (one row per page)
- instagram: an IG Business account
- web_chat: an embed token (1:1 with `widgets.embedToken` — `widgets` becomes
  a *view* of `channel_endpoints` where `channelKind='web_chat'`)

```ts
channel_endpoints {
  id              text       primary key  // ce_<nanoid>
  workspaceId     text       references organization(id) on delete cascade
  connectionId    text       references channel_connections(id) on delete cascade
  channelKind     channel_kind not null
  identifier      text       not null
    // E.164 for voice/sms/whatsapp; pageId for messenger; igId for instagram;
    // widget embed token id for web_chat
  displayName     text                                  // "Main line" / "Calderon Sales"
  attachedAgentId text       references agents(id)      // default agent for inbound on this endpoint
  routingRulesId  text       references routing_rules(id) -- optional, for multi-agent routing
  metadata        jsonb                                  // recording, capabilities, etc
  createdAt       timestamp  default now()
  releasedAt      timestamp
  unique (channelKind, identifier)
}
indexes: (workspaceId, channelKind, attachedAgentId)
```

This subsumes:
- `phone_numbers` (voice/sms rows)
- The "WhatsApp number → agent" wiring
- The "embed token → agent" wiring (current `widgets.embedToken` becomes
  a generated row in `channel_endpoints` of kind `web_chat`)

`widgets` keeps its presentational config (accent colour, greeting, CTA,
variant payload) but its *identity* moves to `channel_endpoints`.

#### `conversations` (revised)

```ts
conversations {
  id                  text       primary key       // cv_<nanoid>
  workspaceId         text       references organization(id) on delete cascade
  agentId             text       references agents(id)
  agentRevisionId     text       references agent_revisions(id)
  channelKind         channel_kind not null
  channelEndpointId   text       references channel_endpoints(id)
  threadKey           text       not null
    -- canonical AriaFlow thread key: '{channelKind}:{threadId}'
    -- voice         -> 'voice:<call-sid>' or 'voice:<livekit-room>'
    -- whatsapp      -> 'whatsapp:<wa_id>'
    -- messenger     -> 'messenger:<psid>'
    -- instagram     -> 'instagram:<igsid>'
    -- web_chat      -> 'web:<browser-session>'
  direction           enum('inbound','outbound')
  participantId       text                              -- E.164 / WA id / PSID / etc
  participantName     text
  startedAt           timestamp  default now()
  endedAt             timestamp                         -- NULL = live (voice) or open (chat)
  durationSec         integer                           -- voice only
  outcome             enum('booked','qualified','missed','voicemail',
                          'abandoned','escalated','resolved','dropped')
  recordingStorageKey text                              -- voice only
  costUsd             real
  evalsPassed         integer    default 0
  evalsTotal          integer    default 0
  topics              text[]     default '{}'
  metadata            jsonb                              -- batch_id, dynamic vars, etc
  unique (workspaceId, threadKey, startedAt)            -- idempotent re-entry into same WA thread
}
indexes: (workspaceId, channelKind, startedAt desc),
         (workspaceId, endedAt) where endedAt is null,
         (agentId, startedAt desc),
         (workspaceId, threadKey)        -- AriaFlow SessionResolver lookup
```

#### `voice_calls` (sidecar — voice only)

```ts
voice_calls {
  conversationId      text       primary key references conversations(id) on delete cascade
  callerId            text       not null     -- E.164
  twilioCallSid       text
  livekitRoom         text
  ringingTimeoutSec   integer    default 60
  voicemailDetected   boolean    default false
  warmTransferTo      text                     -- agent id or E.164
  hangupBy            enum('caller','agent','system','transfer')
}
indexes: (twilioCallSid), (livekitRoom)
```

#### `messaging_threads` (sidecar — messaging channels)

Tracks the rolling 24h / 7d window tracker that AriaFlow's `WindowTracker`
maintains in memory. We need it durable so that the worker process can
pick up any conversation at any time.

```ts
messaging_threads {
  workspaceId         text       references organization(id) on delete cascade
  threadKey           text       not null    -- '{channelKind}:{threadId}'
  channelEndpointId   text       references channel_endpoints(id)
  lastInboundAt       timestamp                -- starts/refreshes 24h window
  windowExpiresAt     timestamp                -- denormalised: lastInboundAt + 24h (or 7d for IG tag)
  lastTemplateAt      timestamp                -- when we last sent a template
  primary key (workspaceId, threadKey)
}
indexes: (workspaceId, windowExpiresAt)
```

#### `conversation_turns` (revised)

The decomposition stays — `speaker`, `text`, `ordinal`, `evalVerdict`,
`workflowNodeId`, `timestampSec` — but we add:

```ts
+ messageId         text                            -- platform message id (WA wamid, etc)
+ mediaPayload      jsonb                            -- media refs (image, audio, doc), null on voice
+ deliveryStatus    enum('sending','sent','delivered','read','failed')
+ statusUpdatedAt   timestamp
indexes (additional): (conversationId, messageId)    -- de-dup webhook replay
```

`timestampSec` stays meaningful for voice (offset from start) and is null/0
for messaging.

`mediaPayload` covers the WA/Messenger/IG media on inbound and outbound
turns. Storage keys go to S3/R2; the column holds refs + mime.

#### `runtime_sessions` (already there)

`runtime_sessions.conversationId` already covers all channels because it's
just FK'd to `conversations`. No change. The `threadKey` becomes the
SessionResolver key — `runtime_sessions` does **not** need its own
threadKey; the join through `conversations` is sufficient.

### What this kills

- `phone_numbers` — folded into `channel_endpoints`
- `telephony_connectors` — folded into `channel_connections`
- `widgets.embedToken` — moves to `channel_endpoints.identifier`
- `direction` semantics on voice-only no longer leak into `conversations`

### What this enables

- Switching channels stops being a schema event — adding `sms` post-MVP
  is "register a `channel_kind` enum value + write a `PlatformClient`."
- `usage_events` per channel becomes `where channelKind = 'whatsapp'` —
  no new table.
- AriaFlow's `SessionResolver` reads `(workspaceId, threadKey)` directly.
- `batches` can target *any* channel, not just voice — `batch_recipients`
  gets a `channelEndpointId` and the same shape works for outbound voice
  AND outbound WhatsApp templates.

---

## 2 · Shift B — Tools: drop `direct`, model MCP catalogues first-class

### Problem with v1

```
tools.kind enum('webhook','mcp','system','client','direct')
```

- `direct` was "TS function id, registered in code." That's just a system
  tool by another name — system tools are also TS functions registered in
  code. The split was redundant.
- `mcp.config = {serverUrl, allowedTools[]}` only models a *connection*. It
  doesn't model the *catalogue* — that a Composio account exposes 200
  toolkits and the user picked 12 of them, or that an Arcade catalogue is
  one auth boundary feeding many concrete tools.

### Proposal

#### Step 1 — flatten `tools.kind`

```
tools.kind enum: webhook | mcp | client | system
```

`system` is the canonical home for built-ins. We seed `tools` with rows for
the in-built catalogue (`end_call`, `language_detection`, `agent_transfer`,
`transfer_to_number`, `skip_turn`, `play_dtmf`, `voicemail_detection`, plus
messaging-channel built-ins like `send_template`, `mark_as_read`,
`react_with_emoji`). These rows live in the global catalogue
(`workspaceId IS NULL`) — same trick we use for stock voices.

#### Step 2 — introduce `tool_catalog_providers`

A *catalogue* is an authenticated boundary that exposes many concrete tools
through MCP. Composio is the lead use case; the same shape covers Arcade,
Pipedream, custom MCP servers, internal company MCP gateways.

```ts
tool_catalog_providers {
  id              text       primary key  // tcp_<nanoid>
  workspaceId     text       references organization(id) on delete cascade
  kind            enum('composio','arcade','pipedream','mcp-custom','mcp-self-hosted')
  displayName     text       not null     // "Composio (sales workspace)"
  mcpServerUrl    text       not null
  authMode        enum('oauth','api-key','none')
  credentialsSecretId text   references secrets(id)
  status          enum('connected','degraded','error','disabled') default 'connected'
  lastSyncedAt    timestamp                -- last time we re-pulled tool list
  toolsetIds      text[]     default '{}'  -- composio toolset ids the workspace selected
  metadata        jsonb
  createdAt       timestamp  default now()
}
indexes: (workspaceId, kind)
```

#### Step 3 — link tools to providers

```ts
tools {
  ...
  catalogProviderId text     references tool_catalog_providers(id)   -- nullable; null = first-party
  externalToolKey   text                                              -- 'gmail.send_email' for composio
  ...
}
indexes (additional): (catalogProviderId, externalToolKey)
```

When a user installs the Composio Gmail toolkit:
1. Workspace has one `tool_catalog_providers` row of `kind='composio'`.
2. Per concrete tool exposed (e.g. `gmail.send_email`,
   `gmail.list_threads`), one `tools` row of `kind='mcp'` with
   `catalogProviderId` set.
3. Agents reference those `tools.id` values via `agents.toolIds[]` like
   any other tool.

This means: **the agent never sees provider specifics.** The `Tool` shape
that AriaFlow's runtime materialises is identical whether the tool came
from Composio, an internal webhook, or an MCP gateway. The catalogue
provider only matters at *resolution time* (auth + endpoint discovery).

#### Step 4 — `agents.toolIds[]` revisited

OQ #6 in v1 picked the array column for read-path simplicity. With a
provider catalogue this becomes mildly worse — when a Composio token is
revoked, every agent's `toolIds[]` may carry refs to tools that are about
to be invalidated. Two options:

- **A.** Keep the array; let `tools.deletedAt` tombstone propagate; runtime
  filters out tombstoned IDs at hydration.
- **B.** Move to a junction `agent_tools (agentId, toolId, addedAt,
  addedByUserId)`. Cheap to query in both directions, gives us the audit
  trail "who added Gmail to which agent" for free.

I lean **B** now that we have catalogues — the audit story is more
valuable than saving one join per agent load. Worth specifically
challenging `pi` on this.

---

## 3 · Shift C — Mirror AriaFlow primitives more honestly

The v1 mapping table at §16 is correct in spirit but two places leak.

### `runtime_sessions.workingMemory` (single jsonb)

AriaFlow's `SessionWorkingMemory` is a structured object: per-agent state,
flow snapshot per agent, routing state, plus collected fields. v1
collapses three of these into separate jsonb columns
(`workingMemory`, `flowStateByAgent`, `routingState`). That's fine for now,
but we should make the shapes match AriaFlow's TypeScript types verbatim
so the runtime adapter is `JSON.parse` not `mapKeys`. Action: lock the
column shape against `@ariaflowagents/core`'s `SessionWorkingMemory` /
`SessionFlowState` types when we generate Drizzle, and add a Zod runtime
guard at the adapter boundary.

### Hooks, guards, tool enforcement — code-only is correct

Confirming v1's call: these stay code-only. No table.

### `agent_revisions` — still flat, still snapshot-only

ElevenLabs ships branches/drafts/deployments. AriaFlow ships **packs**
(`extends`, layered config). For Kuralle v1, snapshotting the merged
"published" agent JSON is sufficient. Pack inheritance, if we expose it,
becomes a `templates` concept *upstream* of `agents`, not a versioning
construct. Defer.

### Eval criteria definitions — newly modeled

ElevenLabs' "Success Evaluation" + "Data Collection" are first-class agent
config. v1 only has output (`conversation_evals`, `conversation_extracted_fields`).
Add:

```ts
agent_eval_criteria {
  id              text       primary key
  agentId         text       references agents(id) on delete cascade
  name            text       not null      -- "Booking confirmed"
  description     text
  kind            enum('success','data','safety')
  rubric          text       not null      -- LLM rubric prompt or DSL
  weight          real       default 1
  ordinal         integer    not null
  unique (agentId, name)
}
indexes: (agentId, kind, ordinal)
```

Then `conversation_evals.criterionId` FK's into this. Currently
`conversation_evals.scenarioId` is a free-text field; tighten to
`criterionId references agent_eval_criteria(id)` once this lands.

### Guardrails — newly modeled

ElevenLabs ships per-direction guardrails (`input` vs `output`) with a
separate evaluation model. AriaFlow has guards as code-only today, but if
Kuralle wants product-level "click to add a guardrail" we need state.

```ts
agent_guardrails {
  id              text       primary key
  agentId         text       references agents(id) on delete cascade
  name            text       not null
  direction       enum('input','output','both')
  evaluationModel text       not null       -- 'gemini-2.5-flash-lite' | 'gemini-2.0-flash' | …
  prompt          text       not null       -- the rule, ≤ 10000 chars
  onTrigger       enum('block','redact','flag','escalate') default 'block'
  enabled         boolean    default true
  ordinal         integer    not null
  createdAt       timestamp  default now()
}
indexes: (agentId, direction, ordinal)
```

Plus an event row each time a guardrail fires:

```ts
guardrail_events {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade
  turnId          text       references conversation_turns(id)
  guardrailId     text       references agent_guardrails(id)
  triggeredAt     timestamp  default now()
  matchedText     text                       -- redacted in long-term store
  action          enum('blocked','redacted','flagged','escalated')
}
indexes: (conversationId, triggeredAt)
```

This subsumes the "redaction patterns" array on `agents` for compliance
events — those are a special case of `direction='output'` guardrails with
`onTrigger='redact'`.

---

## 4 · Smaller deltas (worth flagging, not central)

- **`webhooks` → split delivery types.** v1 has a single `webhooks` table
  with an `events[]` array. EL splits transcription / audio / init-failure
  to allow per-type retry policy. Keep one config row but add
  `delivery_kind` on `webhook_deliveries` so we can apply retry policy by
  type ("transcription retries 5×, audio fire-and-forget").
- **`audit_log_events` partition strategy.** v1 says "partition by month."
  Worth confirming Postgres native partitioning vs Citus vs nothing-yet.
  At Kuralle's projected scale (per-workspace audit volume), monthly
  declarative partitions in vanilla Postgres are sufficient through the
  first 18 months. Lock that in or push back.
- **`monthly_receipts.perAgent` jsonb.** OK at v1 scale; will hurt when a
  workspace has 200 agents and we want to query "average ROI for HVAC
  agents across all workspaces." Split to `monthly_receipt_per_agent`
  rows when we ship the aggregate analytics dashboard. Defer.
- **Multi-region `organization.region`.** Keep, but make the routing
  middleware *read-only against this column* — never let an app handler
  write a workspace into a different region without going through the
  explicit data-export pipeline. Worth an ADR before any of this is
  written.

---

## 5 · Open questions for the architect

The list `pi` should specifically pressure-test (system-design lens):

1. **Channel polymorphism — root + sidecar vs one-table-per-channel?**
   I chose `conversations` as polymorphic root + `voice_calls` /
   `messaging_threads` sidecars. Alternatives: (a) one fat conversations
   table with all nullable columns, (b) STI per channel, (c) discriminator
   in jsonb. Trade-offs: write amplification, query plans for
   "all conversations across channels for this workspace today,"
   index strategy.
2. **`threadKey` as composite vs separate `channelKind + threadId`
   columns.** AriaFlow's `SessionResolver` keys on the composite. Storing
   it composite saves a concat at every lookup but couples the schema to
   AriaFlow's exact format. Worth picking a side and documenting.
3. **`runtime_sessions` and live-stream hot path.** Per-turn writes to
   `conversation_turns` + `runtime_sessions.workingMemory` updates during
   a 5-min voice call land at ~20–60 writes/min/call. At 40 concurrent
   calls × workspace × ... what's the right hot-path? Postgres LISTEN/
   NOTIFY for the supervisor screen, Cloudflare Durable Objects for the
   session itself, both, or neither?
4. **Tool catalogue freshness.** Composio toolkits change. What's the
   cadence and contract for `tool_catalog_providers.lastSyncedAt`? Pull
   on every agent edit? Webhook from Composio? Nightly job? Each has
   different semantic guarantees for the agent editor's tool picker.
5. **Junction vs array for `agent_tools`.** Now that catalogues exist, is
   the audit case (`who added what tool to which agent`) compelling
   enough to flip from array to junction?
6. **Guardrails — per-agent vs per-workspace policy.** v1 puts them per-
   agent. A compliance officer in a regulated workspace probably wants
   *workspace-level* guardrails inherited by every agent. Two-tier model
   (`workspace_guardrails` + `agent_guardrails`, the latter overrides)
   is feasible but doubles the surface. Worth opinion.
7. **Eval criteria — definition vs runtime divergence.** When the rubric
   on `agent_eval_criteria` changes, do already-scored conversations
   keep their old verdict (snapshot semantics) or get re-scored against
   the new rubric (live semantics)? Affects `agent_revisions`
   relationship — should `agent_eval_criteria` be snapshotted into
   revisions too?
8. **Channel endpoint reuse across agents.** A WhatsApp number can serve
   one agent at a time. A web widget *can't* — multiple agents on one
   page is real (e.g., a sales widget + a support widget on different
   routes). Does `channel_endpoints.attachedAgentId` need to become
   nullable + a routing rule?
9. **Better-auth + the new tables.** Every new table here scopes to
   `organization.id`. Confirm the RLS GUC pattern (`current_setting('app.workspace_id')`)
   composes cleanly with better-auth's session token, and decide whether
   `channel_connections.credentialsSecretId` should be RLS-protected with
   a *stricter* policy than the rest of the workspace tables (only
   `owner` + `admin` can read).
10. **Append-only data growth & cold storage.** `conversation_turns`,
    `usage_events`, `audit_log_events`, `session_checkpoints`,
    `webhook_deliveries`, `guardrail_events` — five+ append-only streams.
    Confirm the cold-archive pipeline target (S3 Glacier vs Iceberg vs
    don't-decide-yet) and whether any of them need to support
    **point-in-time replay** (audit's answer is yes; the others
    probably not).

---

## 6 · Migration plan if this is approved

1. Re-issue `DATA_MODEL.md` with §10–11 collapsed into a single
   `Channels & connections` chapter; §3 unchanged (better-auth still
   owns identity); add `Tools & catalogues` chapter; add
   `Guardrails & evals` chapter.
2. Delete `phone_numbers` and `telephony_connectors` tables from the IR;
   document that `widgets` becomes a view.
3. Add the architect's verdict from `pi` (in
   `DATA_MODEL_v2_ARCHITECT_REVIEW.md`) inline with each affected
   section as call-outs, before Drizzle codegen.
4. Generate Drizzle, generate better-auth, write the migration. No
   compatibility shim — the v1 IR was never executed against a database.

---

*End of proposal. Architect's review will land alongside this file as
`DATA_MODEL_v2_ARCHITECT_REVIEW.md`.*
