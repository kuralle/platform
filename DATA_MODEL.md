# Kuralle · Data Model (intermediate representation)

Status: **draft for review** — pre-Drizzle, pseudo-syntax, intended to be redlined
before any migrations are written.

---

## 0 · What this has to do

The schema must back every screen we built and every AriaFlow primitive we wrap.
Concretely:

- **Every screen → every column.** Every value the user sees or edits in the
  React app needs a home in the schema (or a clean derivation).
- **AriaFlow shape preserved.** The runtime imports `Agent`, `FlowAgent`,
  `FlowManager`, `Runtime`, `Tool`, `MemoryService`, `SessionStore`. The schema
  must serialise to those shapes without translation gymnastics.
- **Teams as MVP** (per [Bullet Train post] and [Blitz multi-tenancy guide]).
  Single users are a degenerate case of a workspace. Every domain row carries
  a `workspaceId`. Sharing, invites, and roles are present from day one — not
  bolted on at a later "Pro" plan boundary.
- **Audit-grade.** Compliance posture (HIPAA / FERPA / TCPA / EU AI Act) means
  every config change and every conversation event has to be reconstructible.
  Append-only audit log, soft-delete with retention windows.
- **Multi-region ready.** Workspace carries a `region` column from the start
  so we can route reads/writes to the right cluster later without a backfill.

What this doc deliberately does **not** decide:

- Physical sharding / read-replica placement
- Stripe price IDs / exact billing meters
- Concrete embedding model selection (we model the column, not the value)
- The hot-path for live conversation streaming (Cloudflare DO vs Postgres
  LISTEN/NOTIFY) — schema-agnostic

---

## 1 · Tenancy strategy

**Shared schema, `workspace_id` on every domain table.** Standard SaaS pattern,
plays nicely with Drizzle, and the only one with a sane story for cross-tenant
analytics later. Hard isolation (DB-per-tenant) is reserved for enterprise
escape hatches.

```
users ──┐
        ├── memberships (user × workspace + role)
        ├── invites (pending memberships)
workspaces ──┐
             ├── agents
             ├── kb_documents
             ├── conversations
             ├── batches
             ├── phone_numbers
             ├── tools
             ├── widgets
             ├── secrets
             ├── webhooks
             └── audit_log_events
```

### Roles

Strict ladder, four levels — each strictly contains the one below:

| Role     | Workspace settings | Billing | Invite | Edit agents/docs/workflows | Read |
|----------|--------------------|---------|--------|----------------------------|------|
| `owner`  | ✓ + delete         | ✓       | ✓      | ✓                          | ✓    |
| `admin`  | ✓                  |         | ✓      | ✓                          | ✓    |
| `member` |                    |         |        | ✓                          | ✓    |
| `viewer` |                    |         |        |                            | ✓    |

`viewer` is the slot for compliance reviewers, customer success, auditors —
people who must see the workspace but never mutate it. Single most common
post-MVP request from B2B customers; cheaper to ship now than later.

### Row-level enforcement

Two layers:

1. **Application-side guard.** A `withWorkspace(req)` middleware resolves the
   active workspace from the membership and scopes every query through a
   `db.workspaceQuery(wsId)` helper. No raw `db.select()` allowed in
   route handlers.
2. **Postgres RLS, optional.** Enable RLS policies on every workspace-scoped
   table that filter by a `current_setting('app.workspace_id')` GUC set inside
   each request transaction. Defence in depth — a missed app-side filter still
   can't leak cross-tenant.

(Drizzle has first-class RLS helpers in 0.39+.)

### Personal workspaces

Every user gets exactly one `personal: true` workspace on signup. It looks and
behaves identically to a team workspace; the user is the sole `owner`. This
means **there is no "user-only" code path** anywhere in the system — every
agent/doc/conversation already has a `workspaceId`. Critical Bullet Train
insight: bolting tenancy on later costs 10× more than designing it in.

---

## 2 · Domain map

```
                    ┌──────────┐     ┌────────────┐
                    │  users   │◄────│ memberships│────►┐
                    └──────────┘     └────────────┘     │
                                                        ▼
                                              ┌────────────────┐
                          ┌───────────────────│  workspaces    │
                          │                   └────────────────┘
                          │                          │
        ┌─────────────────┼──────────────────┬───────┴─────────┬───────────────┐
        ▼                 ▼                  ▼                 ▼               ▼
  ┌───────────┐   ┌────────────────┐  ┌──────────────┐ ┌──────────────┐ ┌──────────┐
  │  agents   │   │ kb_documents   │  │ conversations │ │   batches   │ │ widgets  │
  └───────────┘   └────────────────┘  └──────────────┘ └──────────────┘ └──────────┘
        │                │                  │                 │
        │                │                  │                 │
        ├─►agent_revisions             conversation_turns batch_recipients
        ├─►agent_kb_attachments─────────┘
        ├─►workflows                  conversation_tool_calls
        │     ├─►workflow_nodes       conversation_evals
        │     └─►workflow_edges       conversation_extracted_fields
        ├─►agent_tools (junction → tools)
        └─►agent_compliance
                                            │
                                            └─►runtime_sessions
                                                  └─►session_checkpoints

                Workspace-scoped supporting tables:
                  voices · tools · phone_numbers · telephony_connectors
                  secrets · webhooks · audit_log_events
                  billing_subscriptions · usage_events · monthly_receipts
```

---

## 3 · Identity, tenancy, auth

### `users`

Global identity. Not workspace-scoped.

```ts
users {
  id            text            primary key  // u_<nanoid>
  email         citext          unique not null
  emailVerified timestamp
  name          text
  avatarUrl     text
  systemRole    enum('user','staff','superadmin')  default 'user'
  createdAt     timestamp       default now()
  updatedAt     timestamp
  lastSeenAt    timestamp
}
indexes: (email), (lastSeenAt desc)
```

Used by: A1 sign-in (resolves to user), TopBar avatar, every audit row.

### `auth_sessions`

Login sessions (Better-Auth or hand-rolled — orthogonal). Distinct from
runtime sessions.

```ts
auth_sessions {
  id          text       primary key
  userId      text       references users(id) on delete cascade
  expiresAt   timestamp  not null
  ipAddress   inet
  userAgent   text
  createdAt   timestamp  default now()
}
indexes: (userId), (expiresAt)
```

### `workspaces`

The tenant. Mirrors `WorkspaceProvider` in the UI.

```ts
workspaces {
  id              text       primary key  // ws_<nanoid>
  slug            text       unique not null   // url-safe handle, eg "calderon-hvac"
  name            text       not null
  vertical        enum('home-services','appointment-services','education')
  environment     enum('production','staging','sandbox')  default 'production'
  region          enum('us-east-1','us-west-2','eu-west-1') default 'us-east-1'
  isPersonal      boolean    default false
  createdByUserId text       references users(id)
  createdAt       timestamp  default now()
  updatedAt       timestamp
  deletedAt       timestamp  // soft delete with 30-day window
}
indexes: (slug), (createdByUserId), (deletedAt) where deletedAt is null
```

Used by: every screen — every `useWorkspace()` call reads this.

### `memberships`

User × workspace junction, with role.

```ts
memberships {
  id            text       primary key
  userId        text       references users(id)        on delete cascade
  workspaceId   text       references workspaces(id)   on delete cascade
  role          enum('owner','admin','member','viewer')  not null
  invitedBy     text       references users(id)
  joinedAt      timestamp  default now()
  lastActiveAt  timestamp
  unique (userId, workspaceId)
}
indexes: (workspaceId, role), (userId)
```

Used by: workspace switcher, member-list screen (TBD), permission checks.

### `invites`

Pending memberships. Email-targeted; user account created on accept.

```ts
invites {
  id          text       primary key
  workspaceId text       references workspaces(id) on delete cascade
  email       citext     not null
  role        enum('owner','admin','member','viewer') not null
  invitedBy   text       references users(id)
  token       text       unique not null   // signed, single-use
  expiresAt   timestamp  not null          // 7-day default
  acceptedAt  timestamp
  createdAt   timestamp  default now()
  unique (workspaceId, email) where acceptedAt is null
}
indexes: (token), (workspaceId, expiresAt)
```

Used by: I1 settings → Members tab (post-MVP screen, but the table is here).

### `api_keys`

Workspace-scoped programmatic access, separate from user auth.

```ts
api_keys {
  id           text       primary key  // key_<nanoid>
  workspaceId  text       references workspaces(id) on delete cascade
  name         text       not null     // "production server", "ci pipeline"
  hashedKey    text       not null     // bcrypt of full key; we only show full key once
  keyPrefix    text       not null     // "kur_live_8a3c…" — shown in UI
  scopes       text[]     not null     // ['agents:read','conversations:write',...]
  lastUsedAt   timestamp
  expiresAt    timestamp
  revokedAt    timestamp
  createdByUserId text    references users(id)
  createdAt    timestamp  default now()
}
indexes: (workspaceId, revokedAt), (keyPrefix)
```

Used by: I1 settings → Security tab (the "kur_live_8a3c…f912" row).

---

## 4 · Knowledge base

### `kb_documents`

Workspace-shared documents. **Source of truth lives here**, agents only
reference it via `agent_kb_attachments`. Matches the workspace-level KB we
shipped in `_app.knowledge.index.tsx`.

```ts
kb_documents {
  id              text       primary key  // kb_<nanoid>
  workspaceId     text       references workspaces(id) on delete cascade
  folder          text                              // "Pricing" | "Operations" | …
  name            text       not null
  source          enum('file','url','text') not null
  sourceUrl       text                              // when source = 'url'
  storageKey      text                              // S3/R2 key when source = 'file'
  contentText     text                              // when source = 'text' or after extraction
  sizeBytes       integer    not null               // file size or char count
  status          enum('ready','indexing','needs_refresh','failed') default 'indexing'
  ragIndexed      boolean    default false
  embeddingModel  text                              // 'e5_mistral_7b_instruct' …
  autoSync        boolean    default false          // url docs only
  lastSyncedAt    timestamp
  createdByUserId text       references users(id)
  createdAt       timestamp  default now()
  updatedAt       timestamp
  deletedAt       timestamp
}
indexes: (workspaceId, deletedAt) where deletedAt is null,
         (workspaceId, folder),
         (workspaceId, status)
```

Used by: `/knowledge`, `/knowledge/$docId`, agent Knowledge tab.

### `kb_chunks`

RAG chunks. Owned by the engine, read by inference. `pgvector` extension.

```ts
kb_chunks {
  id          text       primary key
  documentId  text       references kb_documents(id) on delete cascade
  ordinal     integer    not null
  content     text       not null
  embedding   vector(1024)                            // dim depends on embedding model
  tokenCount  integer
  createdAt   timestamp  default now()
}
indexes: (documentId, ordinal),
         using ivfflat (embedding vector_cosine_ops) with (lists = 100)
```

Engine-managed; not exposed in any UI.

### `agent_kb_attachments`

Junction. Tracks which documents are attached to which agents — this is the
"shared across multiple agents" link that justified moving KB to workspace
level.

```ts
agent_kb_attachments {
  agentId         text       references agents(id) on delete cascade
  documentId      text       references kb_documents(id) on delete cascade
  attachedAt      timestamp  default now()
  attachedByUserId text      references users(id)
  primary key (agentId, documentId)
}
indexes: (documentId)  // for "which agents use this doc"
```

Used by: agent Knowledge tab; KB doc detail "Used by agents" panel.

---

## 5 · Agents

### `agents`

The current published config. Mirrors the `Agent` interface in
`apps/web/src/types/domain.ts` plus the AriaFlow `AgentConfig` shape.

```ts
agents {
  id                 text       primary key  // ag_<nanoid>
  workspaceId        text       references workspaces(id) on delete cascade
  name               text       not null
  description        text                              // for asTool() consumption
  status             enum('live','paused','draft','archived') default 'draft'

  // Behavior
  firstMessage       text       not null
  systemPrompt       text       not null
  temperature        real       default 0.4    // 0..1
  maxSteps           integer    default 6      // AriaFlow Agent.maxSteps

  // Pipeline mode + Models
  pipelineMode       enum('stt-llm-tts','realtime') default 'stt-llm-tts'
  reasoningEffort    enum('low','medium','high')   default 'low'

  // STT-LLM-TTS legs (nullable when pipelineMode='realtime')
  llmProvider        enum('openai','anthropic','google')
  llmModel           text                              // 'claude-sonnet-4-6' …
  ttsModel           text                              // 'cartesia-sonic-3' …
  ttsVoiceId         text       references voices(id)
  ttsVoiceLanguage   text                              // 'en-US' …
  sttModel           text                              // 'deepgram-nova-3-monolingual'
  sttLanguage        text       default 'en'

  // Realtime leg
  realtimeModel      text                              // 'openai-realtime-2026-04' …
  realtimeVoiceId    text       references voices(id)

  // Audio pipeline
  noiseCancellation  text       default 'None'
  backgroundAudio    text       default 'None'

  // Compliance
  complianceMode     enum('none','hipaa','ferpa','tcpa') default 'none'
  retentionDays      integer    default 90
  redactionPatterns  text[]     default '{}'           // ['DOB','SSN','Card #']
  disclosureScript   text
  disclosureMode     enum('verbal','written','both','off') default 'verbal'
  disclosureAutoInject boolean  default true

  // Routing (AriaFlow canHandoffTo)
  canHandoffTo       text[]     default '{}'           // agent IDs in same workspace

  // Stats (denormalised for the agents-list table; refreshed by a worker)
  calls7d            integer    default 0
  bookingRate7d      real       default 0
  costPerCallUsd     real       default 0

  createdByUserId    text       references users(id)
  createdAt          timestamp  default now()
  updatedAt          timestamp
  deletedAt          timestamp
}
indexes: (workspaceId, deletedAt) where deletedAt is null,
         (workspaceId, status),
         (workspaceId, updatedAt desc)
```

Used by: C1 list, C2 Behavior, C3 Models & Voice, C8 Compliance, every
conversation/batch/workflow that references an agent.

### `agent_revisions`

Append-only snapshot history. Every "Save changes" writes a new row with the
full agent JSON. Enables rollback + audit.

```ts
agent_revisions {
  id              text       primary key
  agentId         text       references agents(id) on delete cascade
  revisionNumber  integer    not null      // monotonic per agent
  snapshot        jsonb      not null      // full Agent row + workflow + attachments
  changeSummary   text                     // "swapped LLM, added 2 KB docs"
  publishedByUserId text     references users(id)
  publishedAt     timestamp  default now()
  unique (agentId, revisionNumber)
}
indexes: (agentId, publishedAt desc)
```

Used by: post-MVP "history" drawer; immediate need for compliance audit trail.

### `voices`

Workspace voice library. Includes both stock voices (workspace_id NULL =
global catalog) and cloned voices (workspace_id set).

```ts
voices {
  id           text       primary key
  workspaceId  text       references workspaces(id) on delete cascade   // NULL = stock
  externalId   text                                  // provider's voice id
  provider     enum('elevenlabs','cartesia','openai','google')
  name         text       not null
  language     text       not null     // 'en-US'
  style        text                    // 'Calm dispatcher'
  isCloned     boolean    default false
  previewUrl   text
  createdAt    timestamp  default now()
}
indexes: (workspaceId), (provider, externalId)
```

Used by: Models & Voice tab voice picker, voice library cards.

---

## 6 · Workflows (AriaFlow `FlowConfig`)

Per-agent. Normalised — node and edge are first-class rows so we can query
("which agents transition to a transfer-number node?") and so the UI can
patch a single field without rewriting the whole graph.

### `workflows`

```ts
workflows {
  id                  text       primary key  // wf_<nanoid>
  agentId             text       references agents(id) on delete cascade  unique
  globalPrompt        text                              // FlowMeta.globalPrompt
  mode                enum('strict','flexible') default 'strict'
  initialNodeId       text                              // references workflow_nodes(id) lazily
  createdAt           timestamp  default now()
  updatedAt           timestamp
}
indexes: (agentId)
```

`agentId` is unique → 0-or-1 workflow per agent (matches the empty-state CTA
we shipped).

### `workflow_nodes`

```ts
workflow_nodes {
  id                  text       primary key  // wfn_<nanoid>
  workflowId          text       references workflows(id) on delete cascade
  kind                enum('subagent','extraction','dispatch',
                           'transfer-agent','transfer-number','end')
  title               text       not null
  description         text
  positionX           integer    not null     // canvas coords
  positionY           integer    not null

  // Common to subagent + extraction
  prompt              text
  llmOverride         text
  contextStrategy     enum('append','reset','reset_with_summary') default 'append'
  summaryPrompt       text
  addGlobalPrompt     boolean    default true

  // Subagent only
  toolIds             text[]     default '{}'  // references tools(id)

  // Extraction only — fields live in workflow_extraction_fields below
  extractionMaxTurns  integer
  extractionPromptMode enum('llm','deterministic')
  extractionCompleteTransition text  // node id

  // Dispatch only
  dispatchToolId      text       references tools(id)

  // Transfer-* only
  transferTo          text                     // agent id or phone number, by kind

  // End only
  endReason           text

  createdAt           timestamp  default now()
  updatedAt           timestamp
}
indexes: (workflowId), (workflowId, kind)
```

### `workflow_extraction_fields`

The form-builder rows on extraction nodes. Ordered list.

```ts
workflow_extraction_fields {
  id          text       primary key  // f_<nanoid>
  nodeId      text       references workflow_nodes(id) on delete cascade
  ordinal     integer    not null
  name        text       not null     // 'name' | 'phone' …
  type        enum('text','number','boolean','email','phone','date','text_array','number_array')
  required    boolean    default true
  description text
  unique (nodeId, name)
  unique (nodeId, ordinal)
}
indexes: (nodeId, ordinal)
```

Zod schema is **derived** from these rows by the engine — never persisted
(drops the user-facing preview pre-save and avoids drift).

### `workflow_edges`

```ts
workflow_edges {
  id            text       primary key  // wfe_<nanoid>
  workflowId    text       references workflows(id) on delete cascade
  sourceNodeId  text       references workflow_nodes(id) on delete cascade
  targetNodeId  text       references workflow_nodes(id) on delete cascade
  conditionType enum('llm','expression','none') default 'none'
  conditionLabel text                          // human label or expression source
  createdAt     timestamp  default now()
}
indexes: (workflowId), (sourceNodeId), (targetNodeId)
```

---

## 7 · Tools (AriaFlow `Tool`)

Workspace-scoped. The runtime reads the `kind` and `config` to materialise the
appropriate AriaFlow tool factory (`createTool` / `createHttpTool` / MCP
client).

```ts
tools {
  id           text       primary key  // tool_<nanoid>
  workspaceId  text       references workspaces(id) on delete cascade
  name         text       not null     // 'service_titan.search_techs'
  displayName  text
  description  text
  kind         enum('webhook','mcp','system','client','direct')
  inputSchema  jsonb                   // Zod-as-JSON
  outputSchema jsonb
  config       jsonb      not null     // varies by kind:
                                       //   webhook: {url, method, auth, headers}
                                       //   mcp:     {serverUrl, allowedTools[]}
                                       //   system:  {systemToolId}
                                       //   client:  (engine reads via SDK; only metadata stored)
                                       //   direct:  (TS function id, registered in code)
  createdAt    timestamp  default now()
  updatedAt    timestamp
  deletedAt    timestamp
  unique (workspaceId, name)
}
indexes: (workspaceId, kind)
```

`agent_tools` and `node_tools` are NOT separate junctions — we use the
`agents.toolIds[]` and `workflow_nodes.toolIds[]` array columns. Cheaper for
read (the agent editor renders the chip list in one query) and we never need
to query "all agents using tool X" in the user-facing UI (only audit; OK to
unnest the array in that one query).

---

## 8 · Conversations & runtime sessions

### `conversations`

Call log. `isLive` rows live here too — F3 reads the same table, just filtered
to `endedAt is null`.

```ts
conversations {
  id            text       primary key  // cv_<nanoid>
  workspaceId   text       references workspaces(id) on delete cascade
  agentId       text       references agents(id)
  agentRevisionId text     references agent_revisions(id)   // pinned at call start
  direction     enum('inbound','outbound')
  callerId      text                                    // E.164
  callerName    text
  phoneNumberId text       references phone_numbers(id)
  startedAt     timestamp  default now()
  endedAt       timestamp                               // NULL = live
  durationSec   integer                                 // computed at end
  outcome       enum('booked','qualified','missed','voicemail','abandoned','escalated')
  recordingStorageKey text                              // S3 key, null if recording disabled
  costUsd       real
  evalsPassed   integer    default 0
  evalsTotal    integer    default 0
  topics        text[]     default '{}'
  metadata      jsonb                                   // batch_id, dynamic vars, etc
}
indexes: (workspaceId, startedAt desc),
         (workspaceId, endedAt) where endedAt is null,        -- live
         (agentId, startedAt desc),
         (callerId, startedAt desc)
```

Used by: F1 list, F2 detail, F3 live, B1 home recent calls, L5 receipt.

### `conversation_turns`

Append-only transcript rows. Written incrementally during the call so the
live supervisor can read them in real time.

```ts
conversation_turns {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade
  ordinal         integer    not null
  speaker         enum('agent','caller','system')
  text            text       not null
  timestampSec    integer    not null     // offset from conversation start
  evalVerdict     enum('passed','failed','warning')
  workflowNodeId  text       references workflow_nodes(id)   // which node was active
  createdAt       timestamp  default now()
  unique (conversationId, ordinal)
}
indexes: (conversationId, ordinal)
```

### `conversation_tool_calls`

Per-turn tool calls (matches the F2 collapsible blocks).

```ts
conversation_tool_calls {
  id              text       primary key
  turnId          text       references conversation_turns(id) on delete cascade
  toolId          text       references tools(id)
  toolName        text       not null     // denormalised at call time
  input           jsonb
  output          jsonb
  durationMs      integer
  errorMessage    text
  createdAt       timestamp  default now()
}
indexes: (turnId)
```

### `conversation_extracted_fields`

The "Extracted fields" card on F2.

```ts
conversation_extracted_fields {
  conversationId  text       references conversations(id) on delete cascade
  label           text       not null
  value           text
  primary key (conversationId, label)
}
```

### `conversation_evals`

Eval scoring (AriaFlow `EvalRunner` output).

```ts
conversation_evals {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade
  scenarioId      text                                    // which baked eval ran
  score           real                                    // 0..1
  passed          boolean
  details         jsonb
  scoredAt        timestamp  default now()
}
indexes: (conversationId)
```

### `runtime_sessions`

AriaFlow `SessionStore` rows. One per live conversation; mostly
engine-internal but exposed for "resume" semantics.

```ts
runtime_sessions {
  id              text       primary key
  conversationId  text       references conversations(id) on delete cascade  unique
  agentId         text       references agents(id)
  workingMemory   jsonb                                   // SessionWorkingMemory
  flowStateByAgent jsonb                                  // flowSnapshot per agent
  routingState    jsonb                                   // current handoff target
  lastCheckpointAt timestamp
  createdAt       timestamp  default now()
}
indexes: (conversationId)
```

### `session_checkpoints`

Append-only durability log (per AriaFlow's "Runtime durability defaults" —
checkpoints on tool-result, tool-error, flow-transition, handoff).

```ts
session_checkpoints {
  id          text       primary key
  sessionId   text       references runtime_sessions(id) on delete cascade
  trigger     enum('tool-result','tool-error','flow-transition','handoff','manual')
  state       jsonb      not null     // SessionWorkingMemory snapshot
  createdAt   timestamp  default now()
}
indexes: (sessionId, createdAt desc)
```

---

## 9 · Outbound batches

### `batches`

```ts
batches {
  id                  text       primary key  // batch_<nanoid>
  workspaceId         text       references workspaces(id) on delete cascade
  name                text       not null
  agentId             text       references agents(id)
  phoneNumberId       text       references phone_numbers(id)
  vertical            enum('home-services','appointment-services','education')
  status              enum('draft','scheduled','running','paused','completed','failed')
  scheduledFor        timestamp
  concurrency         integer    default 8
  totalRecipients     integer    not null
  completed           integer    default 0
  booked              integer    default 0
  failed              integer    default 0
  costUsd             real       default 0
  recoveredRevenueUsd real       default 0
  createdByUserId     text       references users(id)
  createdAt           timestamp  default now()
  updatedAt           timestamp
}
indexes: (workspaceId, status), (workspaceId, scheduledFor)
```

### `batch_recipients`

```ts
batch_recipients {
  id              text       primary key
  batchId         text       references batches(id) on delete cascade
  phoneE164       text       not null
  dynamicVariables jsonb                              // template tokens
  status          enum('pending','vetting','dnc','queued','dialing','completed','failed','deferred')
  conversationId  text       references conversations(id)
  attemptCount    integer    default 0
  scheduledFor    timestamp                          // for tz-deferred rows
  lastAttemptAt   timestamp
  errorMessage    text
}
indexes: (batchId, status), (conversationId)
```

---

## 10 · Telephony

### `telephony_connectors`

```ts
telephony_connectors {
  id           text       primary key
  workspaceId  text       references workspaces(id) on delete cascade
  kind         enum('twilio-native','twilio-byo','sip')
  status       enum('connected','available','coming-soon','error')
  credentials  jsonb                                   // KMS-encrypted
  config       jsonb
  createdAt    timestamp  default now()
  updatedAt    timestamp
}
indexes: (workspaceId, kind)
```

### `phone_numbers`

```ts
phone_numbers {
  id              text       primary key  // pn_<nanoid>
  workspaceId     text       references workspaces(id) on delete cascade
  connectorId     text       references telephony_connectors(id)
  e164            text       not null
  region          text                                // 'US-WA'
  attachedAgentId text       references agents(id)
  recording       boolean    default false
  capabilities    text[]                              // ['voice','sms']
  createdAt       timestamp  default now()
  releasedAt      timestamp
  unique (e164)
}
indexes: (workspaceId, attachedAgentId)
```

---

## 11 · Widget & distribution

### `widgets`

One per agent. (Could be per workspace; the current screen is per-agent
implicitly.)

```ts
widgets {
  id              text       primary key  // wgt_<nanoid>
  workspaceId     text       references workspaces(id) on delete cascade
  agentId         text       references agents(id)  unique
  modality        enum('voice','chat','both')
  accentColor     text                                // '#0EA5A6'
  greeting        text
  ctaLabel        text
  showFeedback    boolean    default true
  variantConfig   jsonb                               // tabs payload (theme, strings, etc)
  embedToken      text       not null                 // signed; rotated on revoke
  createdAt       timestamp  default now()
  updatedAt       timestamp
}
indexes: (agentId), (embedToken)
```

---

## 12 · Settings, secrets, webhooks

### `secrets`

KMS-envelope encryption — DB stores ciphertext + KMS key id; KMS holds the
data key.

```ts
secrets {
  id           text       primary key
  workspaceId  text       references workspaces(id) on delete cascade
  name         text       not null     // 'XAI_API_KEY'
  ciphertext   bytea      not null
  kmsKeyId     text       not null
  scope        enum('workspace','agent') default 'workspace'
  agentId      text       references agents(id)        // nullable
  lastUsedAt   timestamp
  createdByUserId text    references users(id)
  createdAt    timestamp  default now()
  rotatedAt    timestamp
  unique (workspaceId, agentId, name)
}
indexes: (workspaceId, name)
```

Used by: I1 Security tab, the Models & Voice BYOK callout points here.

### `webhooks`

```ts
webhooks {
  id           text       primary key
  workspaceId  text       references workspaces(id) on delete cascade
  url          text       not null
  events       text[]     not null     // ['conversation.completed','batch.completed', …]
  signingSecret text      not null     // returned once on create
  active       boolean    default true
  createdAt    timestamp  default now()
}
indexes: (workspaceId, active)
```

### `webhook_deliveries`

Outbound delivery log (post-call webhook history).

```ts
webhook_deliveries {
  id              text       primary key
  webhookId       text       references webhooks(id) on delete cascade
  conversationId  text       references conversations(id)
  payload         jsonb
  responseStatus  integer
  responseBody    text
  attemptCount    integer    default 1
  deliveredAt     timestamp
  createdAt       timestamp  default now()
}
indexes: (webhookId, createdAt desc), (conversationId)
```

### `audit_log_events`

Append-only. Every workspace event lands here — config edits, doc uploads,
sign-ins, role changes, secret rotations, deletions.

```ts
audit_log_events {
  id           text       primary key
  workspaceId  text       references workspaces(id) on delete cascade
  actorUserId  text       references users(id)
  actorKind    enum('user','api_key','system')
  apiKeyId     text       references api_keys(id)
  event        text       not null     // 'agent.published' | 'kb.document.deleted' …
  resourceKind text                     // 'agent' | 'kb_document' …
  resourceId   text
  diff         jsonb                    // before / after for config events
  ipAddress    inet
  userAgent    text
  createdAt    timestamp  default now()
}
indexes: (workspaceId, createdAt desc),
         (workspaceId, event, createdAt desc),
         (resourceKind, resourceId, createdAt desc)
```

Retention: never deleted (compliance — HIPAA wants ≥ 6 yrs, FERPA ≥ 5 yrs).
Partition by month for query performance once it grows.

---

## 13 · Compliance state

The per-workspace posture surfaced on `/workspace/compliance` and the home
posture card. State derives from a worker that polls per agent + per batch
config every 15 min.

### `workspace_compliance_posture`

```ts
workspace_compliance_posture {
  workspaceId   text       references workspaces(id) on delete cascade  primary key
  hipaa         enum('active','action-required','violation','inactive')
  ferpa         enum('active','action-required','violation','inactive')
  tcpa          enum('active','action-required','violation','inactive')
  euAiAct       enum('active','action-required','violation','inactive')
  evaluatedAt   timestamp
  details       jsonb           // per-requirement boolean map for the cards
}
```

### `compliance_evaluations`

Append-only trail of the worker's evaluation runs.

```ts
compliance_evaluations {
  id           text       primary key
  workspaceId  text       references workspaces(id) on delete cascade
  regulation   enum('hipaa','ferpa','tcpa','eu-ai-act')
  passed       boolean
  failures     jsonb
  evaluatedAt  timestamp  default now()
}
indexes: (workspaceId, regulation, evaluatedAt desc)
```

---

## 14 · Billing & ROI receipt

### `billing_subscriptions`

```ts
billing_subscriptions {
  workspaceId       text       references workspaces(id) on delete cascade  primary key
  stripeCustomerId  text       unique
  stripeSubscriptionId text    unique
  plan              enum('free','starter','pro','business','enterprise')
  status            enum('trialing','active','past_due','canceled')
  trialEndsAt       timestamp
  currentPeriodEnd  timestamp
  hipaaAddon        boolean    default false
  ferpaAddon        boolean    default false
}
```

### `usage_events`

Every billable event. Append-only; aggregated nightly into `monthly_receipts`.

```ts
usage_events {
  id              text       primary key
  workspaceId     text       references workspaces(id) on delete cascade
  agentId         text       references agents(id)
  conversationId  text       references conversations(id)
  kind            enum('llm_input_tokens','llm_output_tokens','tts_seconds',
                       'stt_seconds','minutes','tool_call','rag_query','seat')
  quantity        real       not null
  unitCostUsd     real
  totalCostUsd    real
  occurredAt      timestamp  default now()
}
indexes: (workspaceId, occurredAt),
         (workspaceId, kind, occurredAt),
         (conversationId)
```

### `monthly_receipts`

The L5 ROI receipt is rendered straight from this table.

```ts
monthly_receipts {
  id                       text       primary key
  workspaceId              text       references workspaces(id) on delete cascade
  month                    text       not null   // 'YYYY-MM'
  recoveredRevenueUsd      real       not null
  costUsd                  real       not null
  roiMultiplier            real       not null
  comparisonDeltaPct       real
  perAgent                 jsonb      not null   // [{agentId, agentName, recovered, calls}…]
  publishedAt              timestamp  default now()
  pdfStorageKey            text                  // generated artefact
  unique (workspaceId, month)
}
indexes: (workspaceId, month desc)
```

---

## 15 · Cross-cutting decisions

### IDs

Prefixed nanoids (matches the mocks): `<prefix>_<nanoid(10)>`. Globally unique
within the prefix, sortable by creation only roughly — sortable IDs would be
ULIDs but those are 26 chars and ugly in URLs. nanoid wins on UX.

```
ws_   workspaces
u_    users
ag_   agents
kb_   kb_documents
cv_   conversations
batch_ batches
pn_   phone_numbers
wgt_  widgets
tool_ tools
wf_   workflows
wfn_  workflow_nodes
wfe_  workflow_edges
key_  api_keys
```

### Timestamps

Every table: `createdAt` (default `now()`), `updatedAt` (Drizzle trigger).

### Soft delete

Tables: `agents`, `kb_documents`, `tools`, `workspaces`. Column: `deletedAt`.
Default reads exclude rows where `deletedAt is not null`. Nightly job hard-
deletes after 30 days.

Append-only tables (`*_revisions`, `audit_log_events`, `usage_events`,
`session_checkpoints`, `webhook_deliveries`, `conversation_turns`) are never
deleted — TTL-archived to cold storage instead.

### Encryption

- **At rest:** every column is encrypted by default (Postgres native or RDS
  KMS). No application-level work.
- **Sensitive payloads:** `secrets.ciphertext` uses envelope encryption with
  KMS-stored data keys. The DB never sees the plaintext. Rotated on a 90-day
  default.
- **Transcript redaction:** `conversation_turns.text` is post-processed by the
  redactor (per `agents.redactionPatterns`) before persistence. Original audio
  in object storage stays untouched but is gated behind `viewer`+ role.

### Multi-region

`workspaces.region` is the routing key. Application-side data-locality
middleware reads the workspace's region cookie/JWT claim and routes to the
correct cluster. Tables don't move; instead the workspace's row in every
table lives in the cluster matching its region. Migration when a workspace
changes region is an explicit data-export job, not an automatic move.

### Indexing rules

- Every workspace-scoped table has a leading `(workspaceId, …)` index on its
  hot path.
- Foreign keys are indexed.
- "Live" rows (`endedAt is null`, `deletedAt is null`) get partial indexes.

---

## 16 · AriaFlow primitive ↔ table mapping

| AriaFlow primitive          | Table(s)                                        |
|-----------------------------|-------------------------------------------------|
| `Agent` / `LLMAgent`        | `agents`                                        |
| `FlowAgent`                 | `agents` + `workflows`                          |
| `TriageAgent`               | `agents` (with `canHandoffTo` populated)        |
| `CompositeAgent`            | (composition is in app code — `agent_tools` references) |
| `FlowConfig` / `FlowGraph`  | `workflows`                                     |
| `FlowNode` (subagent)       | `workflow_nodes` (kind=subagent)                |
| `ExtractionNodeConfig`      | `workflow_nodes` (kind=extraction) + `workflow_extraction_fields` |
| `Tool` (createTool)         | `tools` (kind=direct or webhook or mcp)         |
| `createHandoffTool`         | derived at runtime from `canHandoffTo`          |
| `createHttpTool`            | `tools` (kind=webhook)                          |
| `MemoryService` (interface) | `runtime_sessions.workingMemory`                |
| `SessionStore`              | `runtime_sessions` + `session_checkpoints`      |
| `EvalRunner`                | `conversation_evals`                            |
| `Hooks`                     | code-only (no schema)                           |
| `Guards / ToolEnforcer`     | code-only                                       |
| `InjectionQueue`            | `agents.systemPrompt` already; per-agent only   |

---

## 17 · Screen ↔ table coverage check

| Screen                              | Reads                                                          | Writes                                  |
|-------------------------------------|----------------------------------------------------------------|-----------------------------------------|
| A1 sign-in                          | `users`, `auth_sessions`                                       | `auth_sessions`, `audit_log_events`     |
| A3 onboarding                       | —                                                              | `workspaces`, `memberships`             |
| A4 templates                        | (template catalogue, code)                                     | `agents`                                |
| A5 / B1 home                        | `agents`, `conversations`, `usage_events`, `workspace_compliance_posture` | —                          |
| C1 agents list                      | `agents`, `voices`                                             | —                                       |
| C2 Behavior                         | `agents`                                                       | `agents`, `agent_revisions`             |
| C3 Models & Voice                   | `agents`, `voices`, `secrets`                                  | `agents`, `agent_revisions`             |
| C8 Compliance                       | `agents`                                                       | `agents`, `agent_revisions`             |
| Knowledge tab                       | `agent_kb_attachments`, `kb_documents`                         | `agent_kb_attachments`                  |
| Workflow tab                        | `workflows`, `workflow_nodes`, `workflow_edges`, `workflow_extraction_fields`, `tools` | all of the above |
| C10 test drawer                     | `agents`, `tools`, `runtime_sessions`                          | `runtime_sessions`, `session_checkpoints` |
| `/knowledge` list                   | `kb_documents`, `agent_kb_attachments`                         | `kb_documents`                          |
| `/knowledge/$docId`                 | `kb_documents`, `agent_kb_attachments` (for "used by")          | `kb_documents`                          |
| F1 conversations list               | `conversations`                                                | —                                       |
| F2 conversation detail              | `conversations`, `conversation_turns`, `conversation_tool_calls`, `conversation_evals`, `conversation_extracted_fields` | — |
| F3 live supervisor                  | `conversations`, `conversation_turns` (live), `runtime_sessions`, `session_checkpoints` | `conversation_turns` (operator inject) |
| G1 batches                          | `batches`                                                      | —                                       |
| G2 batch wizard                     | `agents`, `phone_numbers`                                      | `batches`, `batch_recipients`           |
| D1 telephony                        | `telephony_connectors`                                         | `telephony_connectors`                  |
| D2 phone numbers                    | `phone_numbers`, `agents`                                      | `phone_numbers`                         |
| H1 widget                           | `widgets`, `agents`                                            | `widgets`                               |
| I1 workspace settings               | `workspaces`, `api_keys`, `webhooks`, `secrets`, `billing_subscriptions` | all of the above              |
| I4 workspace compliance             | `workspace_compliance_posture`, `compliance_evaluations`, `audit_log_events` | —                          |
| L5 monthly ROI receipt              | `monthly_receipts`                                             | —                                       |

Every screen has a write home or an explicit read path. No orphans.

---

## 18 · Open questions for review

1. **Workflow JSON vs normalised.** I went normalised (separate `workflow_nodes`
   / `workflow_edges` / `workflow_extraction_fields`). Trade-off: editor saves
   are multi-row, but cross-agent queries become trivial ("which agents
   transition to a number?"). Switch to JSON if you'd rather one table.
2. **Agent versioning depth.** `agent_revisions` snapshots the full agent
   JSON on every save. Cheap, easy rollback. ElevenLabs goes further with
   git-style branches (`POST /agents/:id/branches`); I'd defer that to v2.
   OK?
3. **Vector store location.** Same Postgres + `pgvector`. Fine to ~10 M chunks.
   Above that, move to Pinecone / Turbopuffer / Weaviate. Defer the
   abstraction — schema can stay as-is when we move; chunks just live
   elsewhere.
4. **Personal workspaces are a real workspace row.** Pro: unified code path,
   easy "promote to team" upgrade. Con: noisier workspace switcher. I think
   pro wins; acknowledged.
5. **Soft delete window.** 30 days everywhere. Long enough to recover from a
   mistake, short enough to honour GDPR right-to-be-forgotten requests
   without ceremony. Negotiable.
6. **`agents.toolIds[]` array vs junction.** Array column for read-path
   simplicity. Loses referential integrity on tool deletion — we'd handle
   that with a "soft delete with tombstone" pattern on `tools`. OK with that
   trade?
7. **Monthly receipts cached vs computed.** Cached row + nightly worker.
   Means receipts are stable artefacts (the L5 PDF doesn't drift after
   month-close) and the receipt screen is a single SELECT. ✓
8. **Roles.** Four roles (owner/admin/member/viewer). Bullet Train post argues
   for *no* viewer at MVP — fewer permission edge cases. I'd disagree:
   compliance / customer-success use cases for viewer surface fast in B2B.
   Worth the upfront ceremony. Push back if you see it differently.
9. **Audit log retention.** Compliance regulations differ; 6 years is the HIPAA
   ceiling. Plan: hot in Postgres for 90 days, then partition-archive to S3
   Glacier with a per-event lookup index in Postgres. OK to defer the archive
   pipeline; just keep `audit_log_events` partitioned by month from day one.
10. **Embed token rotation for widgets.** When a widget token leaks, we need
    to revoke it without breaking every page that embeds it. Open: do we
    issue short-lived JWTs (rotate transparently) or long-lived API tokens
    (force a re-embed)? I'd start with long-lived + a revoke button; revisit
    if we ship a widget marketplace.

---

## 19 · What's next after sign-off

Once this is green-lit:

1. Translate to actual Drizzle schema files in `packages/db/src/schema/`,
   one file per domain group (auth, agents, conversations, etc).
2. Generate initial migration; commit.
3. Wire the seed script that creates a personal workspace on signup, plus a
   sample workspace ("Calderon HVAC") with the same mock fixtures the UI
   currently shows so dev parity is preserved.
4. Add the `withWorkspace` middleware + the RLS policies in parallel.
5. Stand up the AriaFlow runtime adapter that hydrates `Agent` / `FlowAgent`
   / `Tool` from the schema rows.

[Bullet Train post]: https://blog.bullettrain.co/teams-should-be-an-mvp-feature/
[Blitz multi-tenancy guide]: https://blitzjs.com/docs/multitenancy
