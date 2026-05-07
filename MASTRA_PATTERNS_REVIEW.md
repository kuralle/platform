# Mastra's Agent Editor — patterns to steal

Source: sparse clone of `mastra-ai/mastra` at
`research/mastra/`. Read: `packages/editor/`, `packages/core/src/storage/types.ts`,
`packages/playground-ui/`. The Mastra Cloud visual editor itself is
closed-source; everything below is from the open-source backend that powers
it.

---

## TL;DR — what they got right

1. **Two-row split.** A thin `agents` record (just metadata + `activeVersionId`)
   plus an `agent_versions` table that holds *all* config. The agent record
   is mostly empty; configuration lives entirely in versions. Drafts vs
   published is a status on the agent record + a version pointer, not a
   shadow table.
2. **Conditional variants** (`StorageConditionalField<T>`) — every
   configuration field can be either a static value OR an array of
   `{value, rules?}` variants that resolve at request time against the
   `RequestContext`. Same agent, different prompt for HIPAA vs non-HIPAA
   workspaces, evaluated in code at the resolution boundary. We've been
   calling this "guardrails inheritance" and "compliance posture"; Mastra
   ships it as a uniform mechanism for *every* field.
3. **Composed instruction blocks**, not a single `instructions` string.
   `instructions: string | AgentInstructionBlock[]`. Three block kinds:
   `text` (literal), `prompt_block_ref` (FK to a versioned prompt-block
   library), `prompt_block` (inline with rules). Renders through
   `template-engine` + `rule-evaluator`. This is a much better model than
   our flat `agents.systemPrompt` text column.
4. **Hybrid code+stored agents.** The runtime can take a code-defined
   agent and overlay stored config on top. They explicitly enumerate what
   *cannot* be overlaid (callbacks, processor instances, tools/toolsets,
   complex types, ProviderOptions) — exactly the serializability
   conversation we just had, formalised as `Omit<…>` types.
5. **Repository / Namespace pattern with pluggable storage.** Each entity
   (agent, mcp, mcpServer, prompt, scorer, workspace, skill) is its own
   `CrudEditorNamespace<…>` with a `StorageAdapter<…>` that maps generic
   CRUD calls to entity-specific storage methods. Cache-aware, mutation
   evictions cascade across namespaces (skill update → evicts agents that
   reference that skill).
6. **Composio + Arcade as first-class subpath imports** —
   `@mastra/editor/composio`, `@mastra/editor/arcade`. Each is a
   `ToolProvider` plugged into the editor at construction time. Tools from
   these providers live in `integrationTools` separate from `tools`.
7. **Multi-tool-source on the agent**: `tools`, `workflows`, `agents`,
   `integrationTools`, `mcpClients` — five orthogonal collections, each a
   conditional field. So workflows-as-tools and agents-as-tools and MCP
   clients are not all stuffed under one `toolIds[]` umbrella.
8. **Versioned prompt blocks, versioned skills**, all separate aggregate
   roots. An agent references a `prompt_block` by `id` + (implicit latest
   published or pinned version); changing the block triggers cache
   invalidation across every agent that uses it.
9. **Filesystem providers + Sandbox providers** — abstractions for an
   agent's "working directory" (local, S3) and execution sandbox (local,
   e2b). Not relevant to Kuralle's MVP but tells us where they expect
   agents to grow.

---

## Two-row split (the biggest single takeaway)

`packages/core/src/storage/types.ts:440`:

```ts
// Thin record — just the metadata
interface StorageAgentType {
  id: string;
  status: 'draft' | 'published' | 'archived';
  activeVersionId?: string;
  authorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// All configuration — lives in version snapshots
interface StorageAgentSnapshotType {
  name: string;
  description?: string;
  instructions: string | AgentInstructionBlock[];
  model: StorageConditionalField<StorageModelConfig>;
  tools?: StorageConditionalField<Record<string, StorageToolConfig>>;
  defaultOptions?: StorageConditionalField<StorageDefaultOptions>;
  workflows?: StorageConditionalField<Record<string, StorageToolConfig>>;
  agents?: StorageConditionalField<Record<string, StorageToolConfig>>;
  integrationTools?: StorageConditionalField<Record<string, StorageMCPClientToolsConfig>>;
  inputProcessors?: StorageConditionalField<StoredProcessorGraph>;
  outputProcessors?: StorageConditionalField<StoredProcessorGraph>;
  memory?: StorageConditionalField<SerializedMemoryConfig>;
  scorers?: StorageConditionalField<Record<string, StorageScorerConfig>>;
  mcpClients?: StorageConditionalField<Record<string, StorageMCPClientToolsConfig>>;
  workspace?: StorageConditionalField<StorageWorkspaceRef>;
  skills?: StorageConditionalField<Record<string, StorageSkillConfig>>;
  skillsFormat?: 'xml' | 'json' | 'markdown';
  requestContextSchema?: Record<string, unknown>;  // JSON Schema
}

type StorageResolvedAgentType = StorageAgentType & StorageAgentSnapshotType;
```

The implications for our schema:

- **Our `agents` table is too wide.** Half its columns belong on
  `agent_revisions`. The right shape mirrors Mastra:
  `agents` = metadata-only (id, status, activeVersionId, workspaceId,
  authorId, createdAt, updatedAt, deletedAt), `agent_revisions` = the
  whole snapshot (name, prompts, model, tools attachments, kb attachments,
  workflow, guardrails, eval criteria — all of it).
- **`activeVersionId` is the live pointer.** Channel endpoints route by
  `agentId`; the runtime resolves to `activeVersionId` at call start. To
  roll back, swap the pointer.
- **`status` is on the agent record, not on the version.** Versions are
  immutable history; status (draft / published / archived) lives on the
  agent.
- **Drafts are just versions.** A draft is a version that hasn't been
  promoted to `activeVersionId`. No `agent_drafts` table needed.

This collapses three things we'd been treating separately —
`agent_revisions` (history), `agent_drafts` (in-flight work), and
`agents` (publishable state) — into one mechanism: *the agent record
points at one version; the version table holds every version that has
ever existed.*

---

## Conditional variants — the pattern we didn't have a name for

`packages/core/src/storage/types.ts:376`:

```ts
interface StorageConditionalVariant<T> {
  value: T;
  rules?: RuleGroup;          // evaluated against RequestContext
}

type StorageConditionalField<T> = T | StorageConditionalVariant<T>[];
```

At resolution time, the runtime walks all variants whose `rules` evaluate
true against the request context. Matches **accumulate** — arrays
concatenate, objects shallow-merge. A variant with no `rules` always
matches (the default/base).

This is how Mastra ships:

- A workspace-level guardrail that applies to every agent: store it on
  the agent's `outputProcessors` field with no rules; it always merges in.
- An HVAC-vertical-specific tool selection: store as a variant of `tools`
  with `rules: { vertical: 'home-services' }`.
- A region-specific model fallback: variant of `model` with
  `rules: { region: 'eu-west-1' }`.
- A draft prompt that only the author sees: variant of `instructions`
  with `rules: { userId: '<author>' }`.

**Why this is interesting for Kuralle:**

We had an open question (pi §6) about workspace-vs-agent guardrails as a
two-tier model. The conditional-variant pattern collapses the question:
guardrails (Mastra's `outputProcessors`) are a `StorageConditionalField`,
and a workspace-level guardrail is "a variant whose rules check the
workspace context." Same mechanism, no second table.

Same applies to:
- Compliance posture (`hipaa`, `ferpa`, `tcpa`) — the rules fire on
  `workspace.complianceMode`.
- Vertical-specific behavior — rules fire on `workspace.vertical`.
- Per-region routing — rules on `workspace.region`.
- A/B testing — rules on `requestContext.experimentBucket`.

Mastra's `RuleGroup` evaluator is in
`packages/editor/src/rule-evaluator.ts`. Reading it confirms the rule
language is small and declarative (op + field + value, AND/OR groups).
Cheap to evaluate per request, no LLM involved.

---

## Composed instruction blocks

`packages/editor/src/instruction-builder.ts:27`:

```ts
type AgentInstructionBlock =
  | { type: 'text'; content: string }                          // literal
  | { type: 'prompt_block_ref'; id: string }                   // FK to prompt library
  | { type: 'prompt_block'; content: string; rules?: RuleGroup } // inline w/ rules

resolveInstructionBlocks(blocks, context, deps) →
  segments
    .filter(rules pass)
    .map(renderTemplate)
    .join('\n\n')
```

Where `prompt_block_ref` resolves to a row in a versioned `prompt_blocks`
table. Where `template-engine` renders Mustache-style `{{var}}` against
the runtime `RequestContext`. Where rules are the same `RuleGroup`
language as conditional variants.

So the agent's prompt is **assembled per turn** from:
- A list of text/ref/inline blocks
- Each block gates on rules
- Each block templates against context

This is significantly more powerful than our flat `agents.systemPrompt`.
It models things we already need:

- **Disclosure scripts** (`agents.disclosureScript` in v1) — should be a
  `prompt_block` with rules `{ disclosureMode: 'verbal' }`.
- **Compliance prompts** (HIPAA / FERPA / TCPA reminders) — `prompt_block_ref`
  to a workspace-level library, with rules on `workspace.complianceMode`.
- **Voice-vs-chat instruction differences** — single agent, different
  preamble per channel.
- **Vertical preset prompts** (HVAC vs Title-IX) — workspace-shared
  blocks, conditionally injected.
- **Tenant-customisable content** — fork the prompt block, edit, the
  agent inherits without re-publishing.

---

## Hybrid code+stored — and the explicit non-serializable list

`packages/editor/src/namespaces/agent.ts:174` (`applyStoredOverrides`):

> "Model, workspace, memory, and other code-defined fields are never
> overridden — they may contain SDK instances or dynamic functions that
> cannot be safely serialized."

`packages/core/src/storage/types.ts:343` (`StorageDefaultOptions`):

```ts
type StorageDefaultOptions = Omit<
  AgentExecutionOptionsBase<any>,
  | 'onStepFinish' | 'onFinish' | 'onChunk' | 'onError' | 'onAbort' | 'prepareStep'
  | 'abortSignal' | 'requestContext' | 'tracingContext'
  | 'inputProcessors' | 'outputProcessors' | 'clientTools' | 'scorers' | 'toolsets'
  | 'context' | 'memory' | 'instructions' | 'system' | 'stopWhen' | 'providerOptions'
>;
```

This is the answer to "are our agents serializable?" — Mastra answers
**no, not all of them**, then formalises which fields are safe to
persist by literally `Omit`-ing the unsafe ones from the storage type.

The pattern:
- Code-defined agents register via the SDK with full TS power.
- Stored agents are a strictly serializable subset.
- The runtime can produce a `Resolved` agent by overlaying stored config
  on top of a code agent; conflicting non-serializable fields stay
  code-defined.
- The `__fork()` method on `Agent` produces a per-request copy so
  overlays don't poison the singleton.

We'd been gesturing at this. Mastra ships the explicit type-level
contract: "the DB contains only `Pick<…>` of what the runtime understands;
the binary fills in the rest." Adopt this verbatim — it cleans up
"`tools.binding`" and "`agent_revisions.engineVersion`" from my earlier
note: instead, the storage type *is* the serializable subset by
construction.

---

## Storage adapter + namespace pattern

`packages/editor/src/namespaces/base.ts:13`:

```ts
interface StorageAdapter<TCreate, TUpdate, TList, TListOut, TListResolved, TResolved> {
  create(input: TCreate): Promise<unknown>;
  getByIdResolved(id: string, options?: GetByIdOptions): Promise<TResolved | null>;
  update(input: TUpdate): Promise<unknown>;
  delete(id: string): Promise<void>;
  list(args?: TList): Promise<TListOut>;
  listResolved(args?: TList): Promise<TListResolved>;
}

abstract class CrudEditorNamespace<...> extends EditorNamespace {
  protected _cache = new Map<string, THydrated>();
  protected abstract getStorageAdapter(): Promise<StorageAdapter<...>>;
  protected async hydrate(resolved): Promise<THydrated> { ... }
  protected onCacheEvict(id): void { ... }

  async create(input) { … cache.set(input.id, hydrated) … }
  async getById(id, options) { … cache hit/miss … }
  async update(input) { … cache.delete(input.id) … }
  async delete(id) { … }
  async list(args) { … }
}
```

Subclasses (one per aggregate root): `EditorAgentNamespace`,
`EditorMCPNamespace`, `EditorMCPServerNamespace`,
`EditorPromptNamespace`, `EditorScorerNamespace`,
`EditorWorkspaceNamespace`, `EditorSkillNamespace`.

Each owns:
- Its CRUD shape (typed inputs/outputs)
- Its cache strategy
- Its hydration (resolved config → runtime primitive)
- Cross-namespace invalidation cascades (e.g.
  `invalidateAgentsReferencingSkill(skillId)` evicts any cached agent
  whose `skills` field references the changed skill)

This is the textbook **Repository pattern + Identity Map cache**.

We'd been calling this `AgentRepository`, `ConversationRepository`,
etc. Mastra has shipped the implementation; we should mirror the shape.

---

## Things Mastra has that we did not have on the radar

| Concept | What it is | Should we adopt? |
|---|---|---|
| **`prompt_blocks`** as a versioned aggregate | Reusable named prompts (e.g. "HIPAA disclosure"), versioned, referenced by agents | **Yes.** Models compliance disclosures, vertical presets, brand voice — all things we currently inline into `agents.systemPrompt` |
| **`skills`** as versioned aggregate | Reusable skill definitions (system prompt + tools + maybe small flow), composable into agents | **Maybe v2.** Equivalent to AriaFlow `.ariaflow/skill/` packs |
| **`scorers`** as separate aggregate | Eval scorers as their own entity; agents reference them with sampling + rules | **Yes** — replaces our `agent_eval_criteria` shape with a re-usable definition |
| **`processor graphs`** | Input/output processor pipelines stored as a graph (`StoredProcessorGraph`) | **Probably yes.** Better fit for "guardrails + redactors + content filters" than a flat `agent_guardrails` list |
| **`integrationTools`** | First-class slot for Composio/Arcade/etc. tool catalogue selections, separate from native `tools` | **Yes.** Cleaner than mixing them under `tools.kind='mcp'` with a `catalogProviderId` FK |
| **`mcpClients`** | First-class slot for MCP servers separate from `integrationTools` | **Yes.** Custom MCP servers are different from a curated catalogue |
| **`workspace` (agent-level)** | Working-directory + sandbox attached to an agent | **Defer.** Relevant when we ship code-execution agents |
| **`agents` slot on agents** | An agent that delegates to other agents (composite/triage) | **Yes.** Replaces our `canHandoffTo[]` text-array with structured config |
| **`workflows` slot on agents** | A workflow exposed as a tool to the parent agent | **Yes** — this is the AriaFlow primitive we've been modelling implicitly |
| **`requestContextSchema`** | JSON Schema declaring what request-context fields the agent expects (channel, vertical, region, …) | **Yes.** Lets us validate at API boundaries; needed for conditional-variant rules to make sense |

---

## Concrete deltas to our v2 proposal

**Delta 1 — split `agents` thin/fat**

```ts
agents {
  id, workspaceId, authorUserId,
  status enum('draft','published','archived'),
  activeVersionId text references agent_versions(id),
  metadata jsonb,
  createdAt, updatedAt, deletedAt
}

agent_versions {                          // renamed from agent_revisions
  id, agentId, versionNumber,
  changeMessage, changedFields,
  publishedByUserId, publishedAt,

  // Snapshot fields — everything that was on `agents` in v1 moves here:
  name, description,
  instructions jsonb,                     // AgentInstructionBlock[]
  model jsonb,                            // StorageConditionalField<ModelConfig>
  defaultOptions jsonb,                   // temperature, maxTokens, etc.
  toolAttachments jsonb,                  // StorageConditionalField<Record<string, ToolConfig>>
  kbAttachments jsonb,
  workflowConfig jsonb,                   // StorageConditionalField<WorkflowConfig>
  guardrailGraph jsonb,                   // StoredProcessorGraph
  scorerAttachments jsonb,
  integrationTools jsonb,
  mcpClients jsonb,
  skills jsonb,
  voiceConfig jsonb,                      // pipelineMode, ttsModel, sttModel, etc.
  channelConfig jsonb,                    // per-channel overrides
  complianceConfig jsonb,                 // retentionDays, redactionPatterns, etc.
  requestContextSchema jsonb,             // JSON Schema
  unique (agentId, versionNumber)
}
```

The query-friendly projection tables (`workflow_nodes`, `workflow_edges`,
`agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`,
`agent_eval_criteria`) **stay** — they're the materialisation of the
version snapshot for queries the editor and supervisor screens need
("which agents use this tool?", "which agents reference this KB doc?").
But the source of truth is `agent_versions.snapshot`.

This is the *Aggregate Root + Memento + CQRS-lite* composition: write
goes to one snapshot row, read goes to projection tables that are
rebuilt from the snapshot on publish.

**Delta 2 — adopt `StorageConditionalField<T>` everywhere it matters**

Fields that should become conditional variants instead of static:

- `model` (per-region fallback, per-vertical preset)
- `instructions` already is, via `AgentInstructionBlock[]`
- `tools`/`workflows`/`agents`/`integrationTools`/`mcpClients`
- `guardrails` (workspace-level vs agent-level)
- `evalCriteria` (workspace-level baseline vs agent-specific)
- `voiceConfig` (channel-specific voice)

Implementation: a single `RuleGroup` evaluator (port Mastra's
`rule-evaluator.ts`), a single `resolveConditional<T>(field, ctx): T`
helper. The schema doesn't change beyond "this field is jsonb of
`T | Variant<T>[]`."

**Delta 3 — promote `prompt_blocks` to its own table**

```ts
prompt_blocks {
  id, workspaceId, name, description,
  status enum('draft','published','archived'),
  activeVersionId
}
prompt_block_versions {
  id, promptBlockId, versionNumber,
  content text, rules jsonb,
  publishedByUserId, publishedAt,
  unique (promptBlockId, versionNumber)
}
```

Agents reference prompt blocks by `id`; the runtime resolves the active
published version at request time (or pinned version, see snapshot
semantics). Compliance disclosures, brand-voice paragraphs, vertical
preset preambles all live here.

**Delta 4 — split tool sources**

Current: one `tools` table, one `agent_tools` junction.
Proposed (mirrors Mastra):

| Source | Stored where | Agent reference |
|---|---|---|
| Native tools (webhook, system) | `tools` rows | `agent_versions.toolAttachments` jsonb |
| Workflows-as-tools | `workflows` rows | `agent_versions.workflowAttachments` jsonb |
| Agents-as-tools (delegation) | `agents` rows (other agents) | `agent_versions.subagentAttachments` jsonb |
| Composio/Arcade/Pipedream | `tool_catalog_providers` rows | `agent_versions.integrationTools` jsonb |
| Custom MCP servers | `mcp_clients` rows | `agent_versions.mcpClientAttachments` jsonb |

The shape of "an agent's tool list" is then the union of these five
slots, each conditional. Query "which agents use Composio Gmail" is one
SQL JOIN; query "which agents handoff to agent X" is a different SQL
JOIN — they don't collide.

**Delta 5 — formal serializable type as `Pick<…>` of the runtime type**

In the new `packages/api/src/schemas/`:

```ts
// AriaFlow's full Agent shape (code-time, contains functions, models, etc.)
import type { AgentConfig as AriaFlowAgentConfig } from '@ariaflowagents/core';

// Kuralle's stored shape — explicit subset
type AgentSnapshot = Pick<
  AriaFlowAgentConfig,
  'name' | 'description' | 'systemPrompt' | 'temperature' | 'maxSteps'
  // …everything else we explicitly opt-in to persist
> & {
  // Things Kuralle adds on top of AriaFlow's shape
  instructions: AgentInstructionBlock[];
  model: ConditionalField<ModelConfig>;
  toolAttachments: ConditionalField<Record<string, ToolAttachment>>;
  // …
};
```

The Zod schema is derived from this TS type. The IR the UI sends is
`AgentSnapshot`. The DB column shape matches.

---

## What I'd drop from our v2 proposal in light of this

- **`agent_drafts` table** — not needed. Drafts are just unpublished
  `agent_versions`.
- **Two-tier guardrails (workspace + agent)** — not needed. One
  `guardrailGraph` field with conditional variants does both.
- **`agents.toolIds[]` array column conversation** — not needed at all.
  The new shape is jsonb conditional field; "which agents use tool X"
  becomes a projection-table query against `agent_tool_attachments`,
  rebuilt from snapshots on publish.
- **`agent_revisions.engineVersion` column** — replaced by the
  `Pick<…>`-typed snapshot contract. If a snapshot only contains
  serializable fields by construction, version drift in non-serializable
  fields is impossible.

---

## What I'd keep that Mastra doesn't have

- **`channel_endpoints` + `channel_connections`** — Mastra is text/web
  centric; we have voice, WhatsApp, SMS, Messenger, Instagram. Their
  storage doesn't model this, but it's right for them — they don't need
  it. We do.
- **`runtime_sessions` + `session_checkpoints`** — Mastra has session
  storage too but it's structured differently (their memory model). For
  Kuralle's voice supervisor we need our own shape; AriaFlow's
  `SessionStore` is the contract.
- **`usage_events` / `monthly_receipts`** — billing meter. Mastra Cloud
  has this in their SaaS layer (closed-source); we need it.
- **`audit_log_events`** — same; their compliance story is their cloud
  layer.

---

## What I'd run before committing

A second `pi` review with the brief: *"You reviewed
DATA_MODEL_v2_PROPOSAL.md last round. Mastra has shipped a similar
product with a different shape — see MASTRA_PATTERNS_REVIEW.md. Tell me
which of their patterns we should adopt verbatim, which to adapt, and
which to ignore. Critique the conditional-variant pattern's effect on
RLS, indexability, and query performance specifically."*

Worth doing because:
- Conditional variants in jsonb means most queries that matter ("which
  agents use tool X with rule Y") become jsonb-path queries — that's a
  performance regression vs the projection-table approach pi
  recommended last round.
- Two-row split changes the answer to pi's §5 (junction vs array) — the
  junction tables become projections of `agent_versions.snapshot`, not
  source of truth.
- Pi's §3 hot-path advice (sequenceNumber, LISTEN/NOTIFY) is unaffected
  but worth re-checking against Mastra's own session storage.

---

## Source map (for verification)

| Concept | Mastra file:line |
|---|---|
| Two-row split | `packages/core/src/storage/types.ts:440` (`StorageAgentType`) and `:393` (`StorageAgentSnapshotType`) |
| Conditional variant type | `packages/core/src/storage/types.ts:376` |
| Storage default options omits | `packages/core/src/storage/types.ts:343` |
| `applyStoredOverrides` | `packages/editor/src/namespaces/agent.ts:174` |
| `CrudEditorNamespace` base | `packages/editor/src/namespaces/base.ts:66` |
| `StorageAdapter` interface | `packages/editor/src/namespaces/base.ts:13` |
| `resolveInstructionBlocks` | `packages/editor/src/instruction-builder.ts:36` |
| Cross-namespace cache invalidation | `packages/editor/src/namespaces/agent.ts:135` (`invalidateAgentsReferencingSkill`) |
| Composio integration | `packages/editor/src/composio.ts` (subpath export) |
| Arcade integration | `packages/editor/src/arcade.ts` |
| Rule evaluator | `packages/editor/src/rule-evaluator.ts` |
| Template engine (Mustache-style) | `packages/editor/src/template-engine.ts` |
| Processor graph hydrator | `packages/editor/src/processor-graph-hydrator.ts` |

Repo: `research/mastra/` (sparse-cloned, packages + docs only).
