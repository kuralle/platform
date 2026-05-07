# Data Model v2 — Architect's Review

## 1. Channel polymorphism

**Verdict:** recommend

**Reasoning:** The proposal's polymorphic-root `conversations` with `voice_calls` / `messaging_threads` sidecars is the correct choice among the three alternatives. Here is why the others fail at Kuralle's stated scale.

**Alternative (a) — one fat conversations table with all-nullable channel-specific columns.** 40 concurrent voice calls plus N messaging threads means `recordingStorageKey` (voice-only), `windowExpiresAt` (messaging-only), `twilioCallSid` (voice-only), and per-channel media columns all live on the same wide row. The result: partial indexes proliferate (`WHERE recordingStorageKey IS NOT NULL`, `WHERE windowExpiresAt IS NOT NULL`), every channel query scans irrelevant columns, and adding `sms` means an ALTER TABLE on the single hottest table in the database. This is the worst option and the proposal correctly dismisses it.

**Alternative (b) — STI per channel (separate `voice_conversations`, `whatsapp_conversations`).** The downstream tables (`conversation_turns`, `conversation_evals`, `conversation_tool_calls`, `conversation_extracted_fields`) all require a `conversationId` FK. If conversations are split into N tables, those downstream tables now FK into N different parents, or more realistically, into a `conversation_base` table — which is exactly the polymorphic-root pattern the proposal already chose. STI without a root table also makes "show me all conversations for this workspace today" (F1 screen, home recent-calls card) a UNION of N tables, each with different column shapes. At 40 concurrent calls plus messaging traffic, UNION queries across 6+ channel tables for a cross-channel view are a performance write-off. The proposal avoids this.

**Alternative (c) — jsonb discriminator.** Storing channel-specific fields in a single `channel_payload jsonb` column on `conversations` gives up queryability on every channel-specific field. You cannot index `voice_calls.twilioCallSid` inside jsonb efficiently for the webhook de-dup lookup. You cannot index `messaging_threads.windowExpiresAt` inside jsonb for the WindowTracker sweep query. Every index becomes a GIN index on the entire blob, and GIN indexes write-amplify at 3–5× the row size. This is the wrong trade for a write-hot table.

The proposal's choice — slim `conversations` root carrying only channel-independent columns (`direction`, `participantId`, `outcome`, `costUsd`, `topics`) plus sidecar tables for voice and messaging — gives clean index strategies for each access pattern:

- F1 "all conversations today" → index on `(workspaceId, startedAt desc)` on the root, no join needed.
- WhatsApp webhook de-dup → `conversations.unique(workspaceId, threadKey, startedAt)` covers idempotent re-entry (proposal §1, `conversations` revised DDL).
- WindowTracker sweep → `messaging_threads.(workspaceId, windowExpiresAt)` partial index, no voice pollution.
- Twilio webhook → `voice_calls.(twilioCallSid)` index, fast single-row lookup.

One gap worth flagging: the `messaging_threads` table (proposal §1) is keyed by `(workspaceId, threadKey)` but has no `conversationId` column. A single WhatsApp thread can spawn multiple `conversations` rows over time (different sessions, different agents, return visits). When the WindowTracker fires an expiry and the runtime needs to find the *current open* conversation for that thread, the join path is `messaging_threads.threadKey → conversations.threadKey WHERE endedAt IS NULL`. This works but requires a non-partial-index scan of `conversations` on every window-expiry check. A nullable `messaging_threads.lastConversationId` denormalised to the most recent open conversation row would turn that into a single FK lookup. Not urgent for v1, but worth a comment on the DDL.

**Concrete delta:** Add `messaging_threads.lastConversationId text references conversations(id)` — nullable, updated when a new conversation opens for that thread, set to NULL when the conversation ends. Saves a join on the WindowTracker sweep hot path.

---

## 2. threadKey composite vs split

**Verdict:** conditional

**Reasoning:** The proposal stores `'{channelKind}:{threadId}'` as a single `text` column. AriaFlow's `SessionResolver` signature (from `@ariaflowagents/messaging` README) confirms the default key is `{platform}:{threadId}` — the composite is already the runtime contract. Storing it as one column eliminates a concat on every session lookup, which matters because session resolution runs on every inbound message.

The counterargument — coupling the schema to AriaFlow's format — is weak. The `threadKey` is a *domain concept*, not an AriaFlow implementation detail. Whether AriaFlow uses colons or dashes or underscores to join the two parts, the concept ("a unique conversation key within a channel") is stable. If AriaFlow changes its format, a migration that splits the column is one ALTER + one UPDATE, not a schema replumb.

The condition: **document the format contract explicitly.** Add a comment on the `conversations.threadKey` column: `-- Format: '{channelKind}:{threadId}'. channelKind matches channel_kind enum. threadId is the platform's native thread identifier (WA wa_id, Messenger PSID, Instagram IGSID, voice LiveKit room SID, web browser-session).` This comment is the contract. If the format ever changes, the migration surface is bounded.

If the team ever needs to query by `channelKind` independently (e.g., "all WhatsApp conversations"), the `conversations.channelKind` column already exists and is indexed. No need to split `threadKey` for that.

**Verdict stands.** Use the composite. Document the format. Move on.

---

## 3. Hot path for live voice supervisor

**Verdict:** conditional

**Reasoning:** At 40 concurrent calls × 60 writes/min/call = 2400 writes/min/workspace, Postgres can handle the write volume comfortably. A moderately-sized RDS instance (db.r6g.xlarge) handles 50,000+ writes/sec on indexed tables; 40 writes/sec is 0.08% of that. The bottleneck is not writes — it is the F3 supervisor screen's *read fanout* for real-time updates.

The proposal asks about three options:

- **Postgres LISTEN/NOTIFY**. Works at this scale. Each supervisor screen subscribes to a channel (e.g., `workspace:<wsId>:conversation_turns`). The application issues `NOTIFY` after each turn insert inside the same transaction. For single-digit concurrent supervisors, this is sufficient. A managed Postgres instance (Neon, RDS, Supabase) supports ~8,000 concurrent listeners. The failure mode: if the supervisor misses a notification (browser reconnect, network blip), it must fall back to polling.

- **Cloudflare Durable Objects**. Holds the live session state in memory, snapshots to Postgres at checkpoints (tool-result, tool-error, flow-transition, handoff). This is architecturally cleaner — the DO is the single-writer for a session, eliminating write conflicts on `runtime_sessions.workingMemory` (two workers updating the same jsonb blob). However, this couples the deployment to Cloudflare Workers and introduces a dual-write path (DO memory + Postgres snapshot) that needs reconciliation on DO eviction. Premature at v1.

- **Both**. The DO manages the live session; Postgres is the durable snapshot store; LISTEN/NOTIFY fans out from the DO, not from Postgres. This is the eventual architecture for high scale (hundreds of concurrent calls per workspace), but it's over-engineered for v1.

**Recommendation for v1: Postgres LISTEN/NOTIFY with a strong polling fallback.** The schema needs to support the fallback without foreclosing either DO or both later. Concretely:

1. Add `runtime_sessions.sequenceNumber integer default 0` — a monotonic counter incremented atomically on every state change (new turn, checkpoint, tool call, handoff). The F3 screen polls `SELECT sequenceNumber FROM runtime_sessions WHERE conversationId = $1` and only fetches new turns if the sequence number has advanced. This is a single-integer SELECT per conversation per poll cycle, not a `MAX(createdAt)` scan.

2. The post-turn write path becomes a single transaction: INSERT `conversation_turn` → UPDATE `runtime_sessions.sequenceNumber = sequenceNumber + 1` → `NOTIFY workspace:<wsId>:turns, '<conversationId>'`. If the notification is lost, the next poll cycle catches it.

3. The schema does NOT embed DO affinity. If the team later moves to Durable Objects for session state, the `runtime_sessions` table becomes the snapshot target. The sequenceNumber pattern still works — the DO increments it and the supervisor polls against the Postgres snapshot after DO eviction.

**What the proposal must not do:** bake DO-specific columns (doId, doLocation) into `runtime_sessions` before the decision is made. The proposal currently avoids this. Good.

**Condition:** the team must build and load-test the polling fallback first, then add LISTEN/NOTIFY as an optimisation, not the reverse. The polling path is the reliability baseline; if it fails under load, no real-time mechanism will save the user experience.

---

## 4. Tool catalog freshness

**Verdict:** conditional

**Reasoning:** The proposal lists three options (§5 OQ #4) but does not pick one. The correct answer is a **hybrid pull-on-edit + nightly resync + runtime guard** strategy. Here is why each pure option fails:

- **Pull on every agent edit (tight).** Every time the agent editor's tool picker opens, the server fetches the full tool list from Composio. This is the correct UX — the user sees fresh tools immediately. But Composio's API is an external dependency with its own latency and rate limits. If Composio is down, the agent editor's tool picker is broken. This is unacceptable for a core editing flow.

- **Webhook from Composio (fragile).** Composio does not expose webhooks for toolkit changes as of the current API surface. Even if they did, relying on a third-party to push changes to your catalogue introduces a reconciliation problem: what if the webhook is delayed, lost, or delivers a partial update? The schema would need a `lastWebhookReceivedAt` + a reconciliation job, which is strictly more complex than pulling.

- **Nightly job (stale).** A nightly resync means changes to Composio toolkits take up to 24 hours to surface in the agent editor. For an operator adding a new integration mid-day, this is a support ticket generator.

**The hybrid contract:**

1. **Pull-on-edit, cached.** When the tool picker opens, the server checks `tool_catalog_providers.lastSyncedAt`. If the cache is ≤ 15 minutes old, serve from the local `tools` table. If stale, pull from Composio, diff against existing rows, upsert `tools` rows, update `lastSyncedAt`. The 15-minute cache window prevents Composio downtime from blocking the editor (serve slightly stale tools > serve nothing).

2. **Nightly resync.** Runs a full reconciliation sweep. Detects tools that disappeared from Composio, sets their `tools.status = 'deprecated'`. Detects new tools, inserts them. Sends a digest to the workspace admin if tools were deprecated.

3. **Runtime guard.** If a conversation invokes a tool that Composio rejects with "tool not found," the AriaFlow runtime catches the tool-error and the agent reasons around it ("I'm unable to access Gmail right now, let me try another way"). The schema needs a column to support this: `tools.status enum('active','deprecated','error','deleted') default 'active'`. The runtime filters to `status = 'active'` at hydration time. The `deletedAt` soft-delete column stays; `status = 'deleted'` is set when the workspace admin explicitly removes the tool.

**Failure mode: tool disappears mid-conversation.** AriaFlow's `ToolEnforcer` (proposal §3 confirms this is code-only) already handles tool errors — the agent receives a `tool-error` event and can retry, use a different tool, or apologise. The schema does not need to solve this; the runtime does. The schema just needs to surface the tool's status so the runtime can warn or block before starting a conversation with a deprecated tool.

**Condition:** Add `tools.status` and `tools.lastValidatedAt timestamp`. Document the hybrid refresh contract in a tool-catalogue ADR. Do not build the full nightly reconciliation job yet — stub it with a manual `sync-catalogue` CLI command for v1, promote to cron job post-MVP.

---

## 5. agents.toolIds[] array vs agent_tools junction

**Verdict:** recommend junction

**Reasoning:** The proposal §2 step 4 leans toward the junction table. Validate. With tool catalogues in the picture, the junction is the correct call for three reasons that compound:

1. **Catalogue invalidation query.** When a Composio token is revoked or a tool is deprecated, the system must surface which agents are affected. With a junction: `SELECT agentId, agents.name FROM agent_tools JOIN agents ON agentId = agents.id WHERE toolId = $1`. This is a single index scan on `agent_tools(toolId)`. With the array column: `SELECT id, name FROM agents WHERE $1 = ANY(toolIds)`. This requires a sequential scan of `agents` (the GIN index on the array helps but still reads every row with a matching element, and GIN indexes are write-amplified). For a workspace with 200 agents and one deprecated tool, the junction gives you an instantaneous answer; the array gives you a table scan.

2. **Audit trail.** "Who added the Gmail tool to the Calderon HVAC booking agent?" is a real compliance question. With a junction: `SELECT addedByUserId, addedAt FROM agent_tools WHERE agentId = $1 AND toolId = $2`. With an array: the `agents.updatedAt` and `agent_revisions.snapshot` can be correlated, but "who added which tool" requires diffing sequential revisions. That's an operational query, not an audit query.

3. **Write semantics.** When the agent editor saves, the array column requires a full `UPDATE agents SET toolIds = $1 WHERE id = $2` — the entire array is rewritten even if one tool was added. With a junction, adding a tool is `INSERT INTO agent_tools (agentId, toolId, addedByUserId) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`. Two agents being edited concurrently by different users will not conflict on `agents.toolIds` (they each own their row), but the array column pattern still means the full tool list is carried in the agent save transaction. With 50+ tools per agent, that's a moderately large UPDATE payload that doesn't need to exist.

The read-path cost of a junction is one join: `SELECT tools.* FROM tools JOIN agent_tools ON tools.id = agent_tools.toolId WHERE agent_tools.agentId = $1`. This is an indexed nested loop — negligible at any agent-tool cardinality (agents rarely exceed 200 per workspace, tools rarely exceed 50 per agent). The v1 proposal's argument for the array ("we never need to query all agents using tool X") was already weak; the catalogue requirement makes it wrong.

**Concrete delta:** Replace `agents.toolIds[]` with:

```ts
agent_tools {
  agentId         text       references agents(id) on delete cascade
  toolId          text       references tools(id) on delete cascade
  addedByUserId   text       references user(id)
  addedAt         timestamp  default now()
  primary key (agentId, toolId)
}
indexes: (toolId)   // for catalogue invalidation query
```

Similarly, `workflow_nodes.toolIds[]` should become `workflow_node_tools(nodeId, toolId, addedAt)`. The same catalogue-invalidation argument applies — if a tool is deprecated, the workflow editor must surface which nodes reference it.

---

## 6. Guardrails — per-agent vs two-tier workspace+agent

**Verdict:** conditional

**Reasoning:** The proposal §5 OQ #6 asks whether to model workspace-level guardrails inherited by every agent. The answer: **defer the workspace tier to v2, but design the schema so the migration surface is zero.** Here is why:

A regulated workspace (HIPAA, FERPA) wants "all agents must not emit PII" — a single workspace-level guardrail that every agent inherits. If we ship only per-agent guardrails in v1, the compliance officer must manually add the same guardrail to every agent, and must manually verify that each new agent gets it. This is an operational burden, but it is also the reality of v1: the number of agents per workspace will be single-digit (5–10), and the compliance officer is the same person as the workspace admin. The overhead is tolerable.

Building workspace-level inheritance now doubles the surface: you need a priority/override model (does agent-level override workspace-level? merge? replace?), a reconciliation check ("this workspace-level guardrail blocks PII, but this agent-level guardrail allows it — is that a violation?"), and a UI that shows inherited vs. custom guardrails. None of this is needed at 5–10 agents.

**What to do in the schema now to keep the migration surface at zero:**

Add two columns to `agent_guardrails`:

```ts
source              enum('manual','inherited') default 'manual'
sourceGuardrailId   text       references agent_guardrails(id)   // nullable; set when source='inherited'
```

When workspace-level guardrails ship in v2, add a `workspace_guardrails` table with the same shape. On agent creation, the system clones the workspace guardrails into `agent_guardrails` rows with `source = 'inherited'` and `sourceGuardrailId` pointing to the workspace parent. The agent editor UI already handles per-agent guardrails; adding the inheritance layer does not change the schema contract.

**Condition:** Add the two columns now. Do not build the workspace-level inheritance logic. The columns are cheap (two nullable fields, zero code) and prevent a migration when the feature lands.

---

## 7. Eval criteria snapshot semantics

**Verdict:** recommend snapshot semantics

**Reasoning:** The proposal §5 OQ #7 asks whether already-scored conversations keep their old verdict when the rubric changes. The answer is unambiguous: **snapshot the rubric at scoring time.** Here is the production-observability argument:

A verdict ("this conversation passed the 'Booking confirmed' criterion") is a claim about a specific conversation, scored against a specific rubric, at a specific point in time. If the rubric changes — say, the booking-confirmation criterion gets stricter — changing the verdict retroactively destroys the audit trail. An operator reviewing last month's conversations needs to see last month's verdicts, not this month's re-scored ones.

The ElevenLabs competitor (feature-inventory.md, "Success Evaluation") ties evaluations to conversations at scoring time. If the user changes the evaluation criteria, old conversations keep their scores. This is the industry-standard pattern because evaluation is a measurement, not a projection.

The proposal's current `conversation_evals` schema is:

```ts
conversation_evals {
  criterionId   text  references agent_eval_criteria(id)
  score         real
  passed        boolean
  details       jsonb
}
```

This is correct but incomplete: if the rubric text changes, the `criterionId` FK alone does not tell you what rubric was used. Add:

```ts
rubricSnapshot  text   not null   // the rubric text at scoring time
```

This is one extra text column per evaluation row. At 100 conversations/day × 3 criteria/conversation × 365 days = ~110,000 rows/year. The column adds ~500 bytes/row, or ~55 MB/year. Negligible.

The alternative — snapshotting criteria into `agent_revisions` and FK'ing `conversation_evals` to `agent_revisions` — is over-normalised. The question "what rubric was used for this conversation?" needs a direct answer, not "look up the agent revision active at the time this conversation started, then find the eval criteria in that revision snapshot."

**Concrete delta:** Add `conversation_evals.rubricSnapshot text not null`. Populate it from `agent_eval_criteria.rubric` at scoring time. Keep `criterionId` FK for the "which criterion was evaluated" query.

---

## 8. channel_endpoints.attachedAgentId nullability + multi-agent routing

**Verdict:** recommend

**Reasoning:** The proposal §5 OQ #8 notes that a WhatsApp number serves one agent at a time, but a web widget embedded on multiple routes must serve different agents per route. The current `channel_endpoints.attachedAgentId` is non-nullable, which means a web widget endpoint must pick exactly one agent. This is a **v1 blocker** — the web widget is a v1 feature, and single-agent-per-embedded-page is the competitor baseline (ElevenLabs' widget is single-agent, but AriaFlow's `createMessagingRouter` supports multi-platform — Kuralle's widget is positioned as a multi-agent surface by the README's "unified communication inbox" framing).

**Make `attachedAgentId` nullable** and add a `routing_rules` table:

```ts
routing_rules {
  id                  text       primary key  // rr_<nanoid>
  channelEndpointId   text       references channel_endpoints(id) on delete cascade
  ruleKind            enum('path','query_param','header','default') not null
  pattern             text                      // '/sales/*' or 'page=support' or null for default
  agentId             text       references agents(id) not null
  priority            integer    default 0     // lower = higher priority
  createdAt           timestamp  default now()
}
indexes: (channelEndpointId, priority)
```

When a web widget embed receives an inbound message, the router evaluates:

1. If `channel_endpoints.routingRulesId IS NULL` → use `channel_endpoints.attachedAgentId` (single-agent fallback, works for WhatsApp/voice).
2. If `channel_endpoints.routingRulesId IS SET` → match the request path/query against `routing_rules` rows for that rule set, pick the highest-priority match, route to that agent.
3. If no rule matches → fall back to the rule with `ruleKind = 'default'`.

For WhatsApp, Messenger, Instagram: `attachedAgentId` is set, `routingRulesId` is null. For web widgets: `attachedAgentId` is null, `routingRulesId` is set to a `routing_rules` record with at least one `default` rule.

**Concrete delta:** Make `channel_endpoints.attachedAgentId` nullable. Add `channel_endpoints.routingRulesId` (nullable FK to `routing_rules.id`). Add the `routing_rules` table as above. Add a CHECK constraint: `attachedAgentId IS NOT NULL OR routingRulesId IS NOT NULL` (every endpoint must have at least one routing mechanism).

---

## 9. RLS GUC + better-auth composition

**Verdict:** recommend

**Reasoning:** The proposal §5 OQ #9 asks two sub-questions: (a) does `current_setting('app.workspace_id')` compose cleanly with better-auth's session token, and (b) do `channel_connections.credentialsSecretId` and `secrets` need a stricter policy.

**Sub-question (a):** Yes, the GUC pattern composes cleanly. The flow is:

1. Request arrives with better-auth session cookie/token.
2. better-auth middleware validates the token, populates `req.user` and `req.session` (including `session.activeOrganizationId` from the `organization` plugin).
3. Kuralle's `withWorkspace` middleware reads `activeOrganizationId`, verifies the user's membership in that organization, and executes `SET LOCAL app.workspace_id = '<orgId>'` at transaction start.
4. Every subsequent query in the transaction is filtered by RLS policies: `USING (workspaceId = current_setting('app.workspace_id')::text)`.
5. Transaction ends → GUC is discarded.

This is the standard Postgraphile/Supabase pattern. Drizzle 0.39+ has first-class RLS helpers (proposal v1 §1 confirms this). There is no conflict with better-auth — better-auth owns the identity layer; the GUC owns the data-access layer. They meet at the `activeOrganizationId` and never touch.

**Sub-question (b):** Yes, secrets need a stricter policy. The proposal's instinct is correct. `secrets.ciphertext` and `channel_connections.credentialsSecretId` should only be readable by `owner` and `admin` roles. Two implementation approaches:

**Approach 1 — role GUC.** Set a second GUC: `SET LOCAL app.workspace_role = '<role>'` (resolved from the `member` table during the `withWorkspace` middleware). The secrets RLS policy becomes:

```sql
CREATE POLICY secrets_workspace_read ON secrets FOR SELECT
USING (
  workspaceId = current_setting('app.workspace_id')::text
  AND current_setting('app.workspace_role') IN ('owner', 'admin')
);
```

**Approach 2 — subquery.** The RLS policy checks `member.role` directly:

```sql
CREATE POLICY secrets_workspace_read ON secrets FOR SELECT
USING (
  workspaceId = current_setting('app.workspace_id')::text
  AND EXISTS (
    SELECT 1 FROM member WHERE
      member.organizationId = current_setting('app.workspace_id')::text
      AND member.userId = current_setting('app.current_user_id')::text
      AND member.role IN ('owner', 'admin')
  )
);
```

Approach 1 is simpler and avoids the subquery cost on every scan, but requires the middleware to set two GUCs and keep them in sync. Approach 2 is self-contained (no GUC sync risk) but runs a subquery on every row. At Kuralle's scale (secrets per workspace: low single digits, read frequency: low), both approaches are equally fine. Approve approach 1 for consistency with the existing GUC pattern.

**Policy boundary.** The boundary is:

| Table | Policy level |
|---|---|
| All domain tables (agents, conversations, etc.) | `workspaceId = current_setting('app.workspace_id')` |
| `secrets` | workspace filter + role check (owner/admin only) |
| `channel_connections` | workspace filter; `credentialsSecretId` column additionally role-gated for SELECT |
| `audit_log_events` | workspace filter + read-only (never INSERT/UPDATE/DELETE by user, only by system) |

**Condition:** Write an ADR documenting the GUC flow and the policy boundary. Do not implement RLS policies until the `withWorkspace` middleware is proven in integration tests — an RLS policy without the GUC being set blocks all queries, which is a full-outage failure mode.

---

## 10. Cold-archive strategy for append-only streams

**Verdict:** conditional

**Reasoning:** The proposal §5 OQ #10 asks about cold-archive strategy for six append-only streams. The answer differs per stream based on access patterns and compliance requirements. The proposal must lock in which streams need point-in-time replay before the schema design is finalised, because the replay requirement determines whether certain columns need long-lived indexes.

**Per-stream verdict:**

| Stream | Access pattern | Replay needed? | Archive strategy |
|---|---|---|---|
| `audit_log_events` | Per-resource history; compliance searches | **Yes** — HIPAA requires 6-year reconstructible audit trail | Monthly declarative partitions in Postgres. After 90 days, `pg_dump` partition to Parquet → S3 Glacier Instant Retrieval. Keep a `audit_log_events_archive_index` table in Postgres (eventId, partitionKey, s3Key) for per-event lookup. |
| `conversation_turns` | Per-conversation transcript (F2 detail screen) | **Conditional** — the F2 screen loads all turns for a specific conversation | After conversation.endedAt + 30 days, archive all turns for that conversation to S3 as a single JSONL file. Add `conversations.turnsArchiveKey text`. F2 screen: if `turnsArchiveKey IS NULL`, query `conversation_turns` live; if set, fetch from S3 with a "load transcript" button. |
| `usage_events` | Aggregation (monthly_receipts); per-conversation billing lookup | **No** — aggregated data is in `monthly_receipts`; per-conversation cost is on `conversations.costUsd` | Archive after 90 days to S3 as Parquet. No per-event lookup index needed — if billing is disputed, scan the Parquet partition for that month (month is known from the receipt). |
| `session_checkpoints` | Per-session replay for in-flight conversations only | **No** — once conversation ends, checkpoints are a durability artifact, not a query target | Hard-delete after conversation.endedAt + `agents.retentionDays`. No archive needed — checkpoints are a runtime concern, not a compliance artifact. |
| `webhook_deliveries` | Per-webhook delivery log; per-conversation webhook trace | **Minimal** — the delivery log is used for retry debugging and customer support ("did the webhook fire?"). Rarely accessed beyond 7 days. | Archive after 30 days to S3. Keep a `webhook_deliveries_archive_index` with `(webhookId, conversationId, s3Key)`. |
| `guardrail_events` | Per-conversation compliance audit | **Yes** — a guardrail trigger is a compliance event; it must be reconstructible alongside the conversation transcript. | Archive alongside `conversation_turns` — same JSONL file, or at minimum, same S3 key prefix so both are retrieved together. |

**What the schema needs now:**

1. `conversations.turnsArchiveKey text` — nullable; set when turns are archived.
2. `conversations.guardrailEventsArchiveKey text` — nullable; set when guardrail events are archived. Can be the same key as turns.
3. `schema comments` on each append-only table stating the archive policy and retention window. The Drizzle codegen can't read comments, but the ops runbook can.

**What to defer:** The archive pipeline itself (pg_dump → Parquet → S3 uploader, the archive-index tables). The schema just needs to know that archive keys exist.

**Condition:** Add the `turnsArchiveKey` and `guardrailEventsArchiveKey` columns to `conversations`. Document the archive policy per-table in the schema file comments. Defer the archive pipeline implementation.

---

## 11. Issues the proposal did not surface

### 11.1 `messaging_threads` has no `conversationId`

As flagged in §1 above: a WhatsApp thread can spawn multiple `conversations` rows. The WindowTracker sweep needs the current open conversation for a thread. Without `messaging_threads.lastConversationId`, every sweep requires a join to `conversations` on `threadKey`. Add the column.

### 11.2 Denormalized `channelKind` on `channel_endpoints` — missing integrity guard

The proposal has `channelKind` on both `channel_connections` and `channel_endpoints`. Since `channel_endpoints.connectionId` FKs to `channel_connections`, the `channel_endpoints.channelKind` is denormalized (it should match the connection's kind). The proposal does not mention a CHECK constraint or application-level enforcement. Without it, a `channel_endpoints` row of kind `voice` can reference a `channel_connections` row of kind `whatsapp`. Add a CHECK constraint: a trigger or application guard that enforces `channel_endpoints.channelKind = (SELECT channelKind FROM channel_connections WHERE id = channel_endpoints.connectionId)`. Or, drop `channelKind` from `channel_endpoints` and resolve it through the join — the extra join is one lookup on `connectionId`, which is already indexed.

**Recommendation:** Drop `channel_endpoints.channelKind` and resolve it through `channel_connections`. The denormalization saves one join but creates a consistency bug waiting to happen. The join is on a primary key — negligible cost.

### 11.3 `web_chat` endpoints need a nullable `connectionId`

The proposal says `widgets` becomes a *view* of `channel_endpoints WHERE channelKind='web_chat'`. But `web_chat` has no `channel_connection` — there is no provider, no OAuth, no SIP trunk. The `channel_endpoints.connectionId` FK must be nullable specifically for `web_chat` rows. The proposal's DDL shows `connectionId text references channel_connections(id) on delete cascade` — non-nullable. This is a contradiction. Either make `connectionId` nullable (and add a CHECK: non-null for all kinds except `web_chat`) or create a synthetic `channel_connections` row for the web widget (e.g., `kind='web-widget'`, `status='connected'`, no credentials). The synthetic option is cleaner — every endpoint has a connection, the widget connection just has minimal config.

**Recommendation:** Synthetic `channel_connections` row for `web_chat`. One row per workspace (the workspace's web widget "provider"). Zero operational overhead, keeps `connectionId` non-nullable, and gives a natural place for widget-level config (allowed origins, CORS, signed tokens).

### 11.4 `widgets` presentational config has nowhere to go

The proposal says `widgets` becomes a view, but `widgets` carries presentational columns (`accentColor`, `greeting`, `ctaLabel`, `showFeedback`, `variantConfig`) that `channel_endpoints` does not have. These must be stored somewhere. Options: (a) add them to `channel_endpoints.metadata` jsonb (quick, but loses queryability — "show me all widgets with accentColor '#0EA5A6'" becomes a jsonb path query), or (b) add a `widget_configs` table FK'd to `channel_endpoints`. For v1, option (a) is fine — widget config changes are infrequent and never queried in aggregate. Move to a dedicated table only if the widget editor ships with theme management requiring cross-widget queries.

**Recommendation:** Keep `widget_config` as jsonb on `channel_endpoints.metadata` for v1. Flag in a comment that it moves to its own table if the widget marketplace ships.

### 11.5 `audit_log_events.diff` shape is undefined

The proposal says `diff` contains "before / after for config events" but the shape is unspecified. For compliance, the diff format must be deterministic. Adopt the convention: `{before: jsonb | null, after: jsonb | null}` where `before` is null for create events and `after` is null for delete events. The `jsonb` values are the full row payload at the time of the event. This shape is used by Postgres' own `audit` extension and is well-understood by compliance auditors.

### 11.6 No `tool_catalog_providers.workspaceId` index for the per-workspace catalogue list

The proposal shows `indexes: (workspaceId, kind)` on `tool_catalog_providers`. That's correct. But the hot path is "list all catalogues for this workspace" (settings screen) — the leading `workspaceId` on the index covers it. Good.

### 11.7 Missing `channel_endpoints` unique constraint for E.164 across all voice-capable channels

The v1 `phone_numbers` had `unique (e164)`. The proposal replaces it with `channel_endpoints.unique(channelKind, identifier)`. This means the same E.164 could exist as both a `voice` endpoint and a `whatsapp` endpoint (WhatsApp numbers are E.164 too). That is correct and intentional — a single phone number can have both a voice line and a WhatsApp Business Profile. The unique constraint on `(channelKind, identifier)` correctly models this. No change needed.

### 11.8 `conversation_turns.messageId` is added but the dedup index is missing from the index list

The proposal §1 adds `messageId` and an `indexes (additional): (conversationId, messageId)` for de-dup webhook replay. The index is listed in the prose but not in the DDL block. Ensure it's in the DDL when generated.

---

## 12. Block vs defer for Drizzle codegen

**Block — these decisions must land before the first migration is generated:**

1. **Channel polymorphism design (§1).** The `conversations` root + `voice_calls` + `messaging_threads` structure plus the `channel_connections` + `channel_endpoints` replacement for `phone_numbers`/`telephony_connectors`. This is a foundational schema shape. Generating migrations before this is settled means re-migrating the conversation domain, which touches every downstream table (`conversation_turns`, `conversation_tool_calls`, `conversation_evals`, `runtime_sessions`).

2. **`threadKey` composite format (§2).** The format must be locked and documented before codegen because `conversations.threadKey` is the AriaFlow `SessionResolver` key and appears in unique constraints.

3. **`agent_tools` junction over array (§5).** Flip before codegen. The migration from array to junction later would require a backfill migration (unnest array into junction rows), which is doable but avoidable now that we know the junction is correct.

4. **`channel_endpoints.attachedAgentId` nullability + `routing_rules` table (§8).** The web widget routing model is a v1 requirement. Generating migrations with a non-nullable `attachedAgentId` would mean re-migrating `channel_endpoints` and adding `routing_rules` as a follow-up migration, with a brief window where web widget endpoints cannot route to multiple agents. Avoid that window.

5. **Eval criteria snapshot semantics (§7).** Add `conversation_evals.rubricSnapshot` before codegen. Adding a non-nullable text column to an append-only table post-launch requires a backfill (what rubric was used for existing conversations?). A nullable column avoids the backfill but is semantically wrong — every evaluation has a rubric.

6. **`messaging_threads.lastConversationId` (§11.1).** Add the column before codegen to avoid a migration on the WindowTracker hot path.

**Defer — these decisions can wait until after first-cut migration without structural cost:**

7. **Hot-path architecture for live supervisor (§3).** The schema needs `runtime_sessions.sequenceNumber` (simple add-column migration). The LISTEN/NOTIFY vs DO decision does not change any table shape.

8. **Tool catalogue freshness cadence (§4).** The schema needs `tools.status` and `tools.lastValidatedAt` (simple add-column migration). The refresh strategy is operational, not structural.

9. **Guardrails two-tier inheritance (§6).** The two `source`/`sourceGuardrailId` columns on `agent_guardrails` are simple add-column migrations. The workspace-level inheritance logic is application code, not schema.

10. **RLS policy strictness for secrets (§9).** RLS policies are CREATE POLICY statements — they can be added after migration without any table change.

11. **Cold-archive strategy (§10).** The `turnsArchiveKey` and `guardrailEventsArchiveKey` columns on `conversations` are nullable add-column migrations. The archive pipeline itself is infrastructure, not schema.

**Reasoning:** The "block" items are decisions that, if changed after migration, would require ALTER TABLE on central tables (`conversations`, `channel_endpoints`, `agents`) and potentially backfill migrations. The "defer" items are decisions that can be accommodated by adding nullable columns or CREATE POLICY statements, which are zero-downtime operations on Postgres. By resolving the block items now, the first migration is the only migration that touches the conversation and channel domains.

---
