# Design Patterns Review — Round Two

## 1. Two-row split (`agents` thin + `agent_versions` fat snapshot)

**Verdict:** adapt

**Reasoning:** The two-row split (`MASTRA_PATTERNS_REVIEW.md` §"Concrete deltas" Delta 1, based on Mastra's `packages/core/src/storage/types.ts:440-460` — `StorageAgentType` and `StorageAgentSnapshotType`) is structurally correct for Kuralle. The thin record carries metadata (`status`, `activeVersionId`, `authorId`); the version row carries the full configuration snapshot as jsonb. This collapses `agent_drafts`, `agent_revisions`, and `agents.publishedState` into a single mechanism: the agent record points at one version, the version table holds every version that has ever existed.

The team's volume estimate (10 agents/workspace × 100 versions × 10K workspaces = 10M version rows) does not threaten Postgres. At ~5 KB per jsonb snapshot, 10M rows is ~50 GB — a modest table on any managed Postgres instance (RDS db.r6g.xlarge handles 500 GB+ comfortably). The storage strategy is correct.

The risk is not storage. It is queryability. The team's Delta 1 correctly says "projection tables stay — they're the materialisation of the version snapshot for queries the editor and supervisor screens need." The verdict adapts because **the team must hard-commit to normalized projection tables as the read surface, not treat them as optional caching.** Mastra avoids this problem because their editor is server-side Node.js — they read the jsonb blob, hydrate in-process, and serve fully-resolved objects through a typed API. Kuralle's editor is a React SPA communicating via REST/GraphQL. If the editor queries jsonb directly for "which agents use tool X," the query is jsonb-path with a GIN index — functional, but slow at scale and opaque to the ORM layer. The projection tables (`agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`) are the read-optimized query surface committed in round one (§5, §6) and must remain.

**Concrete delta:** Add a column `agent_versions.projectionsReady boolean default false`. The publish flow is: (1) INSERT `agent_versions` row with snapshot jsonb, returning immediately to the editor; (2) async worker decomposes snapshot into projection tables, sets `projectionsReady = true`. The editor polls this flag before loading screens that depend on projection queries. If `projectionsReady = false`, the screen falls back to jsonb-path queries against the snapshot (acceptable at single-digit agent scale, replaced by projections within ~200ms).

---

## 2. `StorageConditionalField<T>` with `RuleGroup`

**Verdict:** adapt with a hard constraint

**Reasoning:** The conditional-variant pattern (`MASTRA_PATTERNS_REVIEW.md` §"Conditional variants," Mastra `packages/core/src/storage/types.ts:376-395` — `StorageConditionalVariant<T>` and `StorageConditionalField<T>`) is the correct abstraction for per-context configuration. A single agent that behaves differently under HIPAA vs non-HIPAA, US-east vs EU-west, or HVAC vertical vs Title-IX vertical is a product requirement Kuralle will hit within the first six months. The pattern collapses the two-tier guardrail model (round one §6: per-agent vs per-workspace), the tool catalogue per-context selection, and the channel-specific voice config into one uniform mechanism.

The team's Delta 2 ("adopt `StorageConditionalField<T>` everywhere it matters") is directionally correct but misses three operational constraints that must be locked before codegen:

**Constraint A — RLS is foreclosed for conditional fields.** A Postgres RLS policy checks column values at row-retrieval time. A jsonb column containing `[{value: {...}, rules: {complianceMode: "hipaa"}}, {value: {...}, rules: {complianceMode: "ferpa"}}]` cannot be filtered by RLS at the DB level because the resolution requires the `RuleEvaluator` — a TypeScript function, not a SQL expression. If Kuralle wants RLS as a defense-in-depth layer (round one §1), the RLS policy can only filter on non-conditional columns (`workspaceId`, `status`). Conditional columns must be resolved in the application layer. This is acceptable — Mastra has the same limitation and accepts it — but the team must document which columns are RLS-filterable and which are resolved in code.

**Constraint B — GIN indexes index raw JSON, not resolved variants.** A GIN index on `agent_versions.snapshot->'tools'` can answer "does this snapshot contain tool X in any variant?" but cannot answer "does this snapshot use tool X when `complianceMode = 'hipaa'`?" The latter requires runtime evaluation of every matching row, which is an N+1 scan. The projection-on-publish approach (Delta 1) is the correct answer: the publish-time worker evaluates conditional variants against known contexts (the workspace's `vertical`, `complianceMode`, `region` — values that change rarely) and writes pre-resolved rows into projection tables. Queries against projection tables are plain SQL, fully indexed, and RLS-compatible.

**Constraint C — Query patterns the editor depends on.** The agent editor's tool picker ("show all tools available to this agent in this workspace's current context") and the supervisor screen ("show all agents that can handoff to agent X") must be fast (< 100ms). If these queries go through jsonb, they are GIN-index scans at best, and at worst, require in-application resolution of every agent's conditional variants. The projection tables make them indexed JOINs. **Hard constraint: every editor-screen query that depends on conditional fields must route through a projection table, not jsonb. The `RuleEvaluator` is for runtime (per-request) resolution, not for editor/supervisor queries.**

**Verdict specifics:** Adopt `StorageConditionalField<T>` for the snapshot jsonb schema. Add `RuleGroup` evaluator (port Mastra's `packages/editor/src/rule-evaluator.ts` — it is 100 lines, declarative, no LLM, cheap per-request). Build the projection tables FIRST, with static pre-resolved fields; add conditional variant resolution in the projection worker as a follow-up. Do not ship the editor with conditional-field jsonb-path queries as the primary read path.

---

## 3. Composed instruction blocks (`AgentInstructionBlock[]` + `prompt_blocks`)

**Verdict:** defer

**Reasoning:** Mastra's composed instruction blocks (`packages/editor/src/instruction-builder.ts:27-80` — `resolveInstructionBlocks`) elegantly models disclosure scripts, compliance prompts, voice-vs-chat preamble differences, vertical presets, and tenant-customisable content — all things Kuralle needs eventually. The mechanism: an agent's prompt is assembled per turn from a list of `text` / `prompt_block_ref` / `prompt_block` blocks, each gated on `RuleGroup` rules, each templated against the runtime `RequestContext`.

The team's Delta 3 proposes promoting `prompt_blocks` and `prompt_block_versions` to their own aggregate roots — two new tables, two new CRUD surfaces, a version resolution layer, a template engine, and cross-entity cache invalidation (`invalidateAgentsReferencingSkill` → now also referencing prompt blocks).

At MVP scale (5–10 agents/workspace, single-digit compliance prompts, one disclosure script), this is premature. The cost is not the table count — it is the editor UX surface. `prompt_blocks` as a separate entity means a new screen (the prompt block library), a new picker in the agent editor, new RBAC considerations ("can members edit shared prompt blocks?"), and a versioning model for an entity that customers will see as "a paragraph of text."

**What to do instead for MVP:** Keep `agents.systemPrompt` as a flat text column. Use template variables (`{{complianceMode}}`, `{{disclosureMode}}`, `{{vertical}}`) injected by the runtime. The runtime reads `agents.systemPrompt`, substitutes workspace-level variables, and produces the final prompt. This is the v1 IR model (DATA_MODEL.md §5, `agents.systemPrompt text not null`). It covers compliance disclosures and vertical presets without a separate entity.

**When to promote:** When the product requires (a) a prompt block library visible in the UI as a shared asset, (b) non-technical workspace admins editing compliance text without touching agent config, or (c) prompt block versioning with rollback. All three are post-MVP features. The migration from flat text to `AgentInstructionBlock[]` in jsonb is additive — existing `systemPrompt` text becomes a single `{type: 'text', content: oldSystemPrompt}` block.

**Concrete delta:** Remove `prompt_blocks` and `prompt_block_versions` from the v2 proposal. Add them to a deferred-features appendix with a migration plan. Keep `agents.systemPrompt` as the MVP prompt column.

---

## 4. Hybrid code+stored model with `Pick<…>`-typed snapshot

**Verdict:** adapt

**Reasoning:** The team's Delta 5 proposes a type-level contract: `AgentSnapshot = Pick<AriaFlowAgentConfig, serializableFields> & { kuralleAdditions }`. Mastra ships the same pattern at `packages/core/src/storage/types.ts:343-370` (`StorageDefaultOptions = Omit<AgentExecutionOptionsBase, nonSerializables>`). The contract is: "the DB type IS the serializable subset by construction; fields like `onStepFinish`, `onFinish`, `toolsets`, `providerOptions` are excluded from the storage type because they contain functions, SDK instances, or complex non-serializable types."

The type-level contract prevents storing functions in the DB — a compile-time guard. The team's claim that this "kills `tools.binding` and `agent_revisions.engineVersion`" is correct: if the storage type never includes `binding` or `engineVersion`, those columns never exist. Round one flagged `tools.binding` and `agent_revisions.engineVersion` as columns that don't exist in the v1 IR; the team was considering adding them. The `Pick<>` contract confirms: don't.

However, the type-level contract is insufficient without two additional guards:

**Guard 1 — Runtime Zod validation at the adapter boundary (round one §3).** The `Pick<>` type prevents TypeScript from compiling code that stores a function. It does not prevent a runtime object from having extra fields (a `jsonb` blob arriving from the editor UI could carry anything). The adapter that reads `agent_versions.snapshot` from Postgres must validate the shape with Zod before passing it to the runtime hydrator. If the snapshot has an unexpected field, the adapter rejects it with a structured error, not a runtime crash inside the agent's LLM loop. The round-one review (DATA_MODEL_v2_ARCHITECT_REVIEW.md §3) already flagged this; the Mastra study reinforces it — Mastra's `applyStoredOverrides` (`packages/editor/src/namespaces/agent.ts:174`) explicitly names fields it will and will not overlay, but does not runtime-validate the snapshot shape (it trusts the storage layer). Kuralle should not trust the storage layer.

**Guard 2 — Publish-time FK validation.** A stored snapshot may reference tools, KB documents, prompt blocks, or voices by ID. If a tool is deleted between the last editor save and publish, the snapshot carries a dangling reference. Mastra handles this at resolution time (`resolveStoredTools` returns `undefined` for missing tools — graceful degradation). Kuralle needs stricter semantics: the publish flow must validate that every FK in the snapshot resolves to an existing, non-deleted row in the workspace. If not, publish fails with a specific error ("cannot publish: tool `gmail_send_email` was deleted — remove it from the agent first"). This prevents runtime surprises where a tool silently disappears from a published agent.

**Concrete delta:** Add a Zod schema for `AgentSnapshot` in `packages/api/src/schemas/`. The adapter boundary validates every snapshot after reading from Postgres. Add a `validateSnapshotReferences(snapshot, workspaceId)` function that runs in the publish transaction and checks all FK references. If validation fails, the publish API returns a 422 with specific field errors.

---

## 5. Multi-source tool slots (5 orthogonal collections)

**Verdict:** adapt

**Reasoning:** The team's Delta 4 proposes splitting the agent's tool surface into five separate jsonb slots on `agent_versions`: `toolAttachments`, `workflowAttachments`, `subagentAttachments`, `integrationTools`, `mcpClientAttachments`. Mastra ships this exact pattern (`packages/core/src/storage/types.ts:410-428` — `tools`, `workflows`, `agents`, `integrationTools`, `mcpClients`, each `StorageConditionalField<Record<string, …>>`).

The round-one review (DATA_MODEL_v2_ARCHITECT_REVIEW.md §5) recommended a single `agent_tools` junction table with a `source` discriminator. The Mastra pattern appears to contradict this but the two approaches address different layers:

- **Snapshot layer (write path):** Five separate jsonb slots are correct because each tool source has different resolution semantics. Workflows are `FlowAgent` instances resolved from the `workflows` table. Integration tools need provider auth and catalogue freshness checks. MCP clients need connection state. Sub-agents need their own version resolution. A single unified slot would collapse these into an opaque `toolIds[]` array that can't distinguish sources at resolution time. The five slots make the resolution code honest: each slot has its own `resolveStored*` method.

- **Projection layer (read path):** A single `agent_tool_attachments` table with a `source` column is correct because the editor, supervisor screen, and audit queries all need "which tools does this agent use?" without caring about the source. The five-slot separation is a resolution concern, not a query concern.

The supervisor screen's "tools used in this conversation" view is unaffected — it queries `conversation_tool_calls.toolId → tools` and the `tools` table has its own `kind` and `catalogProviderId` columns that discriminate the source. The agent's internal tool-slot layout doesn't leak into the conversation tool-call record.

**Concrete delta:** Store five separate jsonb fields on `agent_versions` (matching Mastra). Store a single `agent_tool_attachments` projection table with columns `(agentVersionId, toolId, source enum('native','workflow','subagent','integration','mcp'), config jsonb, addedAt)`. The projection worker decomposes all five jsonb slots into this one table on publish. The editor queries `agent_tool_attachments WHERE agentVersionId = $1`; the resolution code dispatches to the appropriate `resolveStored*` method based on `source`.

---

## 6. Projection-on-publish

**Verdict:** adapt with a synchronous fallback

**Reasoning:** The team proposes "on every publish: a worker reads `agent_versions.snapshot`, decomposes into projection tables, updates indexes" (`MASTRA_PATTERNS_REVIEW.md` §"Concrete deltas" Delta 1). The alternatives:

**Postgres triggers.** A trigger on `agent_versions` INSERT decomposes the jsonb into projection rows in PL/pgSQL or PL/V8. Pros: atomic (same transaction), no worker queue. Cons: the decomposition logic must be implemented twice — once in TypeScript for the runtime hydrator, once in SQL for the trigger. The dual implementation is a maintenance liability. When the snapshot shape changes, the trigger must change, and discrepancies between the two implementations create silent projection errors that are hard to detect. Reject.

**Logical replication.** Overkill. Logical replication replicates WAL changes to a subscriber database. The projection tables are local to the same database. Replication adds infrastructure complexity for no benefit. Reject.

**Worker queue (the team's proposal).** Pros: single implementation language (TypeScript), idempotent (replay the same snapshot, get the same projection rows), retry-able, scales independently of the API. Cons: eventual consistency — projection lags behind snapshot by queue processing latency, typically < 500ms. This is the correct choice.

The concern is publish latency for the editor user. The team asks: "is publish latency acceptable (seconds vs sub-second)?" The answer: the API write path (INSERT `agent_versions`) returns in ~50ms. The worker processes the projection in ~100-500ms. The editor user never waits for the projection — they get a 200 response immediately. The editor screen polls `agent_versions.projectionsReady` (see §1 above) and shows a brief loading state (sub-second). This is acceptable.

**What Postgres triggers do better:** atomicity. If the trigger fails, the INSERT rolls back — the agent version is never created with stale projections. With a worker queue, there is a window where the version exists but projections are not ready. The `projectionsReady` flag handles this, but a bug in the projection worker could leave projections permanently stale. Add: (a) a nightly reconciliation job that scans `agent_versions WHERE projectionsReady = false AND publishedAt < now() - interval '5 minutes'` and re-processes stuck rows, (b) a Prometheus metric for projection lag, and (c) a PagerDuty alert if lag exceeds 10 minutes.

**Concrete delta:** Worker queue approach confirmed. Add `agent_versions.projectionsReady` flag. Add nightly reconciliation job. Add projection-lag monitoring. Defer the queue infrastructure choice (Cloudflare Queues vs AWS SQS vs in-process pg-boss) — it's operational, not structural.

---

## 7. Drop `agent_drafts` table

**Verdict:** adopt verbatim with one addition

**Reasoning:** Mastra's model (`packages/core/src/storage/types.ts:440-460` — `status: 'draft' | 'published' | 'archived'` on the thin agent record, `activeVersionId` as the live pointer) eliminates the draft table. A draft is a `agent_versions` row whose ID is not the agent's `activeVersionId`. The team's Delta 1 correctly identifies this: "drafts are just versions."

The team's concern ("does it complicate 'load my unsaved draft' UX") has an answer: Mastra handles this by auto-saving a draft version on every meaningful editor change. The editor's "Save" button is actually "create a new `agent_versions` row." At the next load, the editor fetches `agent_versions WHERE agentId = $1 ORDER BY versionNumber DESC LIMIT 1` — always gets the latest state.

But auto-save-on-every-change means the version table accumulates rows quickly. During a 30-minute editing session with auto-save every 30 seconds, that's 60 version rows per editing session. Distinguish between:

- **Auto-save versions** — frequent, lightweight, ephemeral. Created by the editor's auto-save mechanism. Prune-able (keep last 10 per agent).
- **Manual-save versions** — user explicitly hits Save. Retained indefinitely.
- **Publish versions** — promoted to `activeVersionId`. Never deleted.

Add a `version_kind` column to `agent_versions`:

```ts
agent_versions.versionKind enum('auto_save', 'manual_save', 'publish') default 'manual_save'
```

The editor's auto-save creates rows with `version_kind = 'auto_save'`. A nightly job deletes auto-save rows older than 7 days, keeping the last 10 per agent. Manual saves and publishes are never pruned. This prevents version table bloat from auto-save at zero operational cost — the prune job is one `DELETE … WHERE versionKind = 'auto_save' AND createdAt < now() - interval '7 days'` in a cron.

Browser localStorage as a draft layer is unnecessary with server-side auto-save. The editor always reads from the latest `agent_versions` row. The only edge case: a user opens the editor, types for 3 seconds, and closes the tab before the first auto-save fires. Those 3 seconds of text are lost. This is acceptable — it's the same failure mode as every web form without auto-save.

**Concrete delta:** Drop `agent_drafts`. Add `agent_versions.versionKind`. Configure auto-save from the editor SPA (30-second interval, debounced). Add a nightly prune job for auto-save rows.

---

## 8. Alternative references worth studying

### Builder.io's content versioning model — recommend study: yes

**What it solves better than Mastra:** Builder.io's content model has "content entries" with draft/published states, structured fields (text, reference, rich text, conditional), and a visual editor. Their "targeting" feature (show variant A to users matching rule X) is the exact analogue of Kuralle's `StorageConditionalField<T>` applied at the content-model level — not at the agent level. Builder has solved the problem of "how do you let non-technical users configure structured content with conditional variants AND query it efficiently?" by projecting targeted content into CDN-edge caches at publish time.

**Relevance to Kuralle:** Builder's "publish = project targeted content" pipeline is the precedent for Kuralle's projection-on-publish approach. Their data model separates the "entry" (what Kuralle calls an agent version snapshot), the "targeting rules" (what Kuralle calls conditional variants with RuleGroups), and the "published content" (what Kuralle calls projection tables). The team should study Builder's content delivery pipeline — specifically, how they handle the edge case of "a targeting rule references a field that doesn't exist yet in the content model" — because Kuralle will have the same problem when a conditional variant references `workspace.complianceMode` but a workspace hasn't set it.

**Cost:** Time — 2-3 hours reading Builder's public docs and their blog posts on content versioning. No infrastructure impact.

**Recommendation:** Study Builder.io's docs on Content Versioning, Targeting & Scheduling, and their Content API before committing to the projection worker's exact shape. The team will find that Builder solved the "conditional content projection" problem a decade before Mastra shipped `StorageConditionalField`.

---

### Git's object model (blobs + trees + commits) — recommend study: deferred

**What it solves better than Mastra:** Git models configuration as immutable snapshots (commits) with parent pointers (history), branching (multiple lines of development), and diffing (what changed between two versions). Mastra's two-row split models commits (version rows) and branches (agent record status) but does not model parent pointers — `agent_versions` has no `parentVersionId` column. Without parent pointers, diffing two versions requires comparing two jsonb blobs, which is expensive and fragile. If Kuralle ever ships "compare versions" or "roll back to version N" as a product feature, the git model provides the exact data structure.

**Relevance to Kuralle:** The ElevenLabs competitor already ships git-style branching for agent configs. Kuralle will need this post-MVP. The incremental cost of adding `agent_versions.parentVersionId` to the v2 schema is zero — it's one nullable FK column. With it, the version history becomes a DAG (like git commits), not a flat sequence. Later, if branching ships, `agent_versions` already has the parent pointer needed for branch topology.

**Cost:** One nullable column. Zero operational cost. The branching logic is deferred.

**Recommendation:** Add `agent_versions.parentVersionId text references agent_versions(id)` — nullable, set to the version that was active when this version was created. Do not build branching, diffing, or rollback UI yet. The column is a cheap forward-compatibility bet.

---

### CRDT-based editors (Yjs / Automerge) — recommend study: no, but footnote

**What it would solve:** Real-time collaborative editing of the same agent by multiple workspace members. If two users edit the agent's system prompt simultaneously, a CRDT merges their changes without conflicts.

**Why not now:** Kuralle's MVP has single-user editing. Agent config is a structured form (dropdowns, toggles, chip lists), not a free-text document where real-time collaboration is the core UX. The CRDT integration cost (Yjs server, conflict-resolution UI, awareness protocol) is high and the benefit is zero for v1.

**Footnoted for later:** If Kuralle ships multi-user editing, the `agent_versions` table should NOT be the collaboration transport. The live editing session should use a CRDT document store (Yjs + a persistence backend). When the user hits Save or Publish, the CRDT document is snapshotted into `agent_versions`. The version table remains the durability layer; the CRDT is the real-time transport layer. Do not conflate them.

---

### Rejected alternatives

- **Kubernetes CRDs + SSA:** Solves multi-user field-ownership conflicts — not relevant until Kuralle ships multi-user editing. The apply/merge semantics add complexity with no v1 benefit.
- **Temporal Workflows:** Temporal's persistence model is for long-running workflow execution, not for agent configuration storage. AriaFlow already handles workflow execution; Kuralle doesn't need Temporal's persistence model.
- **Strapi / Sanity / Hygraph:** Headless CMS models. The draft/published pattern is relevant (it's what Mastra does), but their content-type flexibility (arbitrary schemas) adds complexity Kuralle doesn't need — Kuralle's agent config schema is fixed, not user-defined.
- **Retool / Plasmic / Tooljet:** Visual app builders storing component trees. The analogy to agent config is strained — apps have layouts and data bindings; agents have prompts and tool attachments. The data model shapes are dissimilar.
- **Salesforce Metadata API:** Enterprise config-per-tenant with XML descriptors, deploy/retrieve pipeline, and sandbox orgs. The complexity-to-relevance ratio is extremely high. Reject.
- **Stripe Connect / GitHub Actions YAML / Terraform HCL:** These are the same pattern Mastra already ships — declarative config with version history. They don't add new insights beyond what Mastra demonstrates.
- **Apache Iceberg metadata:** Storage format for analytical tables, not an application schema. Postgres handles Kuralle's append-only streams at projected scale without the Iceberg abstraction.

---

## 9. Specific critiques

### 9.1 `Pick<…>`-typed snapshot — transitive non-serializability

The type-level contract (`AgentSnapshot = Pick<AriaFlowAgentConfig, serializableFields>`) prevents storing functions, callbacks, SDK instances, and complex types. It does not prevent storing a serializable reference to a non-serializable runtime entity.

Concrete example: a webhook tool's `config.auth` field in the snapshot might be `{type: 'bearer', token: 'secret://xai-api-key'}`. The string `'secret://xai-api-key'` IS serializable — it's a reference to a secret in the KMS-backed `secrets` table. The resolution happens at runtime when the hydrator calls `resolveSecret('xai-api-key')`. This is correct behavior. But what if the secret is rotated between publish and resolution? The old token value in the snapshot is stale, and the runtime resolves the new token correctly because the snapshot stores the reference, not the value. This is the desired behavior.

The danger case: what if the snapshot stores a non-reference value that CANNOT be resolved at runtime because it depends on an SDK instance? Example: a tool defined in code registers as `createHttpTool({ url: 'https://api.example.com', headers: { Authorization: `Bearer ${process.env.API_KEY}` } })`. The `headers` field contains a runtime-computed value from `process.env`. If the snapshot tries to persist `headers: { Authorization: 'Bearer xyz' }`, the persisted value may be stale when the environment variable changes. The `Pick<>` contract doesn't prevent this because `headers` is a plain object — it is serializable. The contract only prevents storing the `createHttpTool` function itself.

The fix: the snapshot should store tool references by ID, not by resolved config. The `agent_versions.toolAttachments` jsonb should contain: `{"gmail_send": {description: "Overridden desc", rules: {...}}}` — the tool's ID and per-agent overrides. The tool's actual config (`url`, `auth`, `inputSchema`) lives in the `tools` table and is resolved from there at hydration time. The snapshot never stores a tool's resolved config. This is how Mastra does it (`StorageToolConfig` at `packages/core/src/storage/types.ts:327` — only `description` and `rules`, not the tool's implementation). The team's Delta 5 should make this explicit: the snapshot stores tool references with overrides, not tool definitions.

### 9.2 Conditional variants × eval criteria snapshots

Round one §7 (DATA_MODEL_v2_ARCHITECT_REVIEW.md) established that eval criteria must be snapshotted at scoring time: `conversation_evals.rubricSnapshot text not null` captures the exact rubric text used to score a conversation.

The conditional-variant pattern adds a resolution step before the snapshot. If `agent_eval_criteria` becomes a `StorageConditionalField` — e.g., the rubric is stricter when `workspace.complianceMode = 'hipaa'` — then "snapshot the rubric at scoring time" means: (a) evaluate the conditional variant against the conversation's context (which workspace, which compliance mode, which channel), (b) resolve to the specific rubric text, (c) store that resolved text in `conversation_evals.rubricSnapshot`. The FK (`conversation_evals.criterionId`) still points to the criterion definition; the snapshot captures what the definition resolved to for that specific conversation.

This adds a requirement: the scoring worker must have access to the `RuleEvaluator` and the conversation's context (workspace metadata, agent version snapshot) to resolve the conditional variant before scoring. This is not a schema change — it's an operational requirement on the scoring pipeline. The round-one recommendation stands; the conditional-variant layer is resolved upstream of the snapshot.

### 9.3 Dropping `agent_drafts` and `tools.binding`

**`agent_drafts` table:** Confirmed. Drop it. See §7 above. The addition of `agent_versions.versionKind` handles the auto-save bloat risk.

**`tools.binding` column:** Confirmed. Drop it. The `Pick<>` contract eliminates the need. The v1 IR (`DATA_MODEL.md` §7) already does not have a `binding` column on `tools`. The round-one review (DATA_MODEL_v2_ARCHITECT_REVIEW.md §3) flagged `tools.binding` as a column the team was considering adding; the Mastra study confirms it is unnecessary. The tool's runtime binding (whether it's a webhook, an MCP tool, a system tool, or a code-defined function) is determined by `tools.kind` + `tools.config` at resolution time. The agent version snapshot stores which tools are attached and any per-agent overrides. The binding is code-only.

One clarification: `tools.config` (jsonb in the v1 IR) is the serializable tool configuration. For webhook tools, this includes the URL, method, and auth reference. For MCP tools, this includes the server URL and allowed tools list. For system tools, this includes the system tool ID. This column stays. The dropped `binding` column was a separate concept — a code-level binding (e.g., a TypeScript function reference) that can't be serialized. It never existed in v1 and should never be added.

### 9.4 Projection-on-publish performance

At 10K workspaces × 10 agents × 1 publish per agent per day on average:

- 100,000 publishes/day globally
- ~1.2 publishes/second sustained
- Peak (business hours burst): ~5 publishes/second

A single Cloudflare Queue consumer processes ~100 messages/second at default concurrency. At 5 publishes/second peak, one consumer with concurrency=1 handles it with 80% idle time. The bottleneck is not the queue — it is Postgres write throughput for the projection tables.

Per publish, the projection worker does:
1. Read `agent_versions.snapshot` (one SELECT, ~5 KB jsonb, cached by Postgres)
2. Decompose into projection rows (in-memory TS, < 10ms)
3. UPSERT projection rows (~10–50 rows per publish, batched)

At 1.2 publishes/second × 25 projection rows average = 30 projection row writes/second. Postgres handles 30 writes/second without breathing hard. Even at 10× peak (12 publishes/second), 300 projection row writes/second is trivial.

**Publish latency for the editor user:**
- API writes `agent_versions` row: ~50ms (single INSERT with jsonb)
- API returns 200 to editor immediately
- Queue consumer picks up event: ~10–50ms queue latency
- Worker processes projection: ~100–300ms (decompose + batch UPSERT)
- Worker sets `projectionsReady = true`: ~10ms
- Editor polls `projectionsReady`: ~100ms polling interval
- Editor reloads data from projection tables: ~50ms

Total user-visible latency: ~50ms (the API response). The user sees the "published" state immediately. The projection is ready ~200–500ms later. If the user navigates to a screen that queries projection tables within that 500ms window, the screen shows a brief loading state or falls back to snapshot jsonb. This is acceptable.

**Worst case:** a workspace with 200 agents gets a bulk-publish operation (e.g., compliance officer publishes all agents after a policy update). That's 200 publish events in rapid succession. The queue consumer processes them sequentially. At 200ms/projection, that's 40 seconds of processing time. The last agent in the batch has its projection ready 40 seconds after publish. This is acceptable — bulk operations have different latency expectations than single-agent edits.

**Concrete concern:** what if the projection worker crashes mid-batch? The queue retries unacknowledged messages. The projection worker must be idempotent: reprocessing the same snapshot produces the same projection rows. This is achieved by UPSERT (ON CONFLICT DO UPDATE). The nightly reconciliation job (see §6) catches any permanently-stuck rows.

---

## 10. What changes from your round-one verdicts

**Round-one verdicts that still stand:**

- **§1 — Channel polymorphism (polymorphic root `conversations` + sidecars).** Stands. No Mastra implication — Mastra doesn't model channels.
- **§2 — `threadKey` composite format.** Stands. Document the format, move on.
- **§3 — Hot path for live supervisor.** Stands. Postgres LISTEN/NOTIFY with polling fallback. The Mastra study doesn't change this — Mastra's session storage is a different model (their `StorageThreadType` is simpler).
- **§4 — Tool catalogue freshness hybrid strategy.** Stands. The conditional-variant pattern adds per-context tool selection, but catalogue freshness remains a pull-on-edit + nightly resync concern.
- **§5 — `agent_tools` junction over array.** Modified (see below).
- **§6 — Guardrails per-agent vs two-tier.** Modified (see below).
- **§7 — Eval criteria snapshot semantics.** Stands. Confirmed by Mastra's scorer versioning.
- **§8 — `channel_endpoints.attachedAgentId` nullability + `routing_rules`.** Stands. No Mastra implication.
- **§9 — RLS GUC + better-auth composition.** Stands. The conditional-variant pattern partially forecloses RLS for variant-bearing columns (see §2 Constraint A), but the GUC pattern for workspace-scoped tables is unaffected.
- **§10 — Cold-archive strategy.** Stands. No Mastra implication.
- **§11.1–11.8 — Issues the proposal did not surface.** All stand. The Mastra study surfaced additional issues (§2 Constraints A–C, §4 Guards 1–2, §7 `versionKind`).

**Round-one verdicts that change:**

- **§5 — Junction over array for `agent_tools`.** The single `agent_tools` junction with `source` discriminator remains correct as the **projection table**. But the source of truth (the snapshot) now carries five separate jsonb slots (`toolAttachments`, `workflowAttachments`, `subagentAttachments`, `integrationTools`, `mcpClientAttachments`) matching Mastra. The junction table is rebuilt from these five slots on publish. The round-one recommendation ("replace `agents.toolIds[]` with `agent_tools` junction") applies to the projection layer, not the snapshot layer.

- **§6 — Guardrails per-agent vs two-tier workspace+agent.** The conditional-variant pattern eliminates the need for a two-tier guardrail model entirely. A workspace-level guardrail is not a separate `workspace_guardrails` table — it is a variant on the agent's `guardrailGraph` field with rules `{source: 'workspace'}` that is inserted into every agent at publish time by a workspace policy worker. The round-one recommendation ("defer workspace tier, add `source`/`sourceGuardrailId` columns") is superseded: those columns are not needed. Instead, add a `workspace_policies` table (one row per workspace) with the default guardrail graph, compliance rules, and tool allow/deny lists. On agent publish, the projection worker merges workspace policies into the agent's snapshot via conditional variants (the workspace policy becomes a variant with no rules — always applies as the base). This is simpler than a two-tier inheritance model and doesn't require the `source`/`sourceGuardrailId` columns.

- **§12 — Block vs defer for Drizzle codegen.** Updated list in §11 below.

- **New finding not in round one:** The `agent_versions` table needs `versionKind` and `parentVersionId` columns (see §7 and §8). These are zero-cost additions that prevent future migrations.

---

## 11. Block vs defer for Drizzle codegen (updated)

**Block (must land before the first migration is generated):**

1. **Two-row split (`agents` thin + `agent_versions` fat).** Foundational schema shape. Every query, every API endpoint, every screen depends on this. Landing it after codegen means re-migrating the agent domain.

2. **Drop `agent_drafts` table.** Do not generate a table that will be immediately deleted. The draft-is-a-version model must be the codegen baseline.

3. **`agent_versions.versionKind` column.** Must be non-nullable with a default. Adding a non-nullable enum column to a table post-launch requires a backfill. Avoid that.

4. **`agent_versions.parentVersionId` nullable FK.** See §8 (Git model). One column, zero code, prevents a migration when version diffing ships.

5. **`channel_endpoints.attachedAgentId` nullable + `routing_rules` table.** Web widget multi-agent routing is a v1 requirement (round one §8). Landing a non-nullable `attachedAgentId` means re-migrating `channel_endpoints` when the web widget ships.

6. **`messaging_threads.lastConversationId`.** Round one §11.1. Add before codegen to avoid a migration on the WindowTracker hot path.

7. **`conversation_evals.rubricSnapshot` non-nullable.** Round one §7. Adding a non-nullable column to an append-only table requires a backfill migration. Avoid it by landing the column in the first migration.

8. **Snapshot schema design (the shape of `agent_versions.snapshot` jsonb columns).** While jsonb columns don't need ALTER TABLE when their internal shape changes, the Zod validation schema and the projection worker depend on the snapshot shape. Design the snapshot fields (`instructions`, `model`, `toolAttachments`, `workflowAttachments`, `subagentAttachments`, `integrationTools`, `mcpClientAttachments`, `guardrailGraph`, `scorerAttachments`, `skills`, `voiceConfig`, `channelConfig`, `complianceConfig`, `requestContextSchema`) before codegen so the API types and the projection worker are aligned from day one. The jsonb itself is flexible; the type contract is not.

**Defer (can land after first migration without structural cost):**

1. **`prompt_blocks` / `prompt_block_versions` tables.** Defer to v2. Keep `agents.systemPrompt` flat text for MVP. The migration from flat text to `AgentInstructionBlock[]` jsonb is additive.

2. **Projection worker (Queue consumer).** Defer. Start with synchronous projection (the publish API decomposes the snapshot into projection rows in the same transaction). Add the worker when publish latency exceeds 200ms at scale. The schema (`projectionsReady` column, projection tables) is already in the block list.

3. **`StorageConditionalField<T>` in all snapshot fields.** Start with static values. The jsonb columns can hold either `T` or `Variant<T>[]` — start with `T` everywhere, add conditional variants incrementally. The `RuleEvaluator` port is deferred until the first conditional variant is added.

4. **`workspace_policies` table.** Defer to v2. For MVP, workspace-level config (compliance mode, guardrails) is applied at agent creation time manually. The workspace policy worker that auto-injects compliance guardrails into every agent at publish time is a v2 feature.

5. **RLS policies.** Defer. Implement application-layer middleware first. RLS is defense-in-depth; it can be added with CREATE POLICY statements that don't change any table shape.

6. **`runtime_sessions.sequenceNumber`.** Round one §3. Add-column migration — zero structural risk. Defer to when the supervisor screen ships with polling.

7. **Cold-archive columns (`turnsArchiveKey`, `guardrailEventsArchiveKey`).** Round one §10. Nullable add-column migrations. Defer to when the archive pipeline is built.

8. **`agent_versions.projectionsReady` column.** Simple add-column with default `true` (initially, projections are written synchronously). Defer to when the async projection worker ships.

**Reasoning:** The block list has grown from six items (round one) to eight because the Mastra study revealed new foundational decisions (two-row split, snapshot shape, `versionKind`, `parentVersionId`). The defer list has grown correspondingly because the Mastra study also revealed features that are correct but premature (prompt blocks, conditional variants, workspace policies). The criterion is the same as round one: if changing the decision after migration requires an ALTER TABLE on a central table with a backfill, it blocks. If it can be accommodated with a nullable add-column or a CREATE POLICY, it defers.
