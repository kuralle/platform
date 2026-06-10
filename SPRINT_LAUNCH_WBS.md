# Sprint L — Launch WBS (chat-first, WhatsApp deploy, CF default)

Goal: **ready to launch** — a user signs up, builds an agent in the UI, publishes,
connects a WhatsApp number, and the agent **runs** (real model, tools, guardrails),
with conversations visible in F1/F2. Voice (S4-01..03) and Stripe stay next-sprint.

Grounding: full gap inventory 2026-06-10 (agent review, file:line-verified). Keystone:
`__messagingDODeps` never injected in prod (`apps/server/src/index.ts`) → MessagingDO
early-exits at the `!deps?.loadAgentIr || !deps.resolveModel` check → published agents
never answer. Adapter `irToAgentConfig` is complete; resolvers + injection are the gap.

## Phase L0 — Foundation (sequential, blocks everything)

**L0-1 · Upgrade @kuralle-agents 0.5.0 → 0.8.5 (all packages)**
- Bump every `@kuralle-agents/*` pin (apps/server, packages/runtime, scripts/sink-spike);
  `bun install`; fix type breaks. Known deltas 0.5→0.8.5: multimodal `RunOptions.input:
  UserInputContent` (string still valid), `text-start/delta{id,delta}/end` lifecycle
  (verify projector event mapping), zod 4, new core exports (builtin guards, compaction,
  escalation, wake/Scheduler, commerce) the platform can now consume.
- DoD: workspace `check-types` green per-package, full test suite green, adapter test
  (`agent-config.test.ts`) green against 0.8.5 `AgentConfig`.

## Phase L1 — Keystone: published agents RUN

**L1-1 · Production deps factory + injection (BL-S3-01)**
- Implement `createMessagingDODeps(env)` in apps/server: 
  - `loadAgentIr(conversationId)` → messaging_thread → channel_endpoint → agent →
    activeVersion.snapshot (AgentIR), workspace-scoped.
  - `resolveModel(provider, name)` → AI SDK model: provider routing (openai first;
    anthropic/google behind the same switch) with API keys from the `secrets` table
    (workspace credentials), env fallback for sandbox.
  - keep `loadWorkingMemory/persistWorkingMemory/emitEvents` prod impls.
- Inject in `apps/server/src/index.ts` before DO use (same env-attachment seam tests use).
- DoD: extend `slo-do-real-loop.test.ts` (or sibling) — publish a deterministic IR with a
  mock model → inbound envelope → **assistant turn emitted + persisted**. This is the
  single most important test in the repo.
- **Multi-agent graphs**: `subagentAttachments` → handoffs already (adapter), but the DO
  loads ONE agent — handoffs would crash. `loadAgentGraph` resolves the bound agent +
  subagent attachments transitively (workspace-scoped, cycle-guarded, depth 5);
  `runtimeAgents` gets every config. DoD includes a live 2-agent handoff test.

**L1-2 · Tool + guardrail resolution (unstub)**
- `resolveTool` / `resolveIntegrationTools` / `resolveMcpTools`: DB-backed lookup of the
  tool catalog / integration selections / MCP allowedTools → `defineTool` instances
  (durable). Unknown tools: skip + warn, never crash the turn.
- Guardrails: replace the `{action:'allow'}` stubs by mapping `guardrailGraph` nodes onto
  the framework's 0.8.5 builtins — `createPiiInputGuard/OutputGuard`, `createModerationGuard`,
  `createPromptInjectionGuard`, `createGroundingValidator` (complianceConfig.redactionPatterns
  → custom regex redactor in the same pipeline).
- DoD: unit tests per resolver; integration test: IR with one tool + PII guard → turn
  calls the tool, redacts a card number.

**L1-3 · Window-safe WhatsApp outbound**
- Assistant reply → WhatsApp send through `@kuralle-agents/engagement` policy pipeline
  (whatsappPolicy: 24h window store, interactive rendering, template strategist seam) —
  not a bare client send. Per-tenant WABA creds from `channel_connections.credentialsSecretId`
  (env creds only as sandbox fallback).
- DoD: workflow test — window open: text out; window closed: deferred/template path; the
  outbound payloads asserted at the (fake) Graph API layer.

## Phase L2 — Onboarding loop (UI → real agent)

**L2-1 · Create-agent + workspace context (BL-S3-09, BL-S3-10)**
- Wire `useCreateAgent()` → `agents.create` → navigate to the new agent; replace every
  hardcoded `"demo-workspace"` with `useActiveWorkspaceId()` (sweep all list calls).
- DoD: manual journey + component test — sign in → create agent → edit → publish, all
  against the user's real workspace.

**L2-2 · Test drawer runs the draft agent (C10)**
- Server endpoint `agents.testTurn` (workspace-scoped): body `{agentId, draftIr?, input,
  sessionId?}` → irToAgentConfig → ephemeral runtime turn (same deps factory, in-memory
  session) → streamed reply. UI drawer wired to it.
- DoD: drawer round-trips a real model reply for a draft (unpublished) IR.

## Phase L3 — Deployment surface (CF default, WhatsApp first)

**L3-1 · Formalize "deploy agent to WhatsApp"**
- Deployment = published agent + channel endpoint binding on the CF worker (shared-worker
  + per-thread DO model — document this explicitly as the default CF deployment).
- Channels UI: connect WhatsApp number (store WABA creds per workspace in `secrets`),
  bind endpoint → agent, show deploy status (webhook verified? last inbound? active
  version). Webhook setup instructions surfaced (PUBLIC_BASE_URL/webhooks/meta).
- DoD: E2E (mock Meta): connect endpoint → publish → signed webhook → assistant reply →
  F1/F2 shows the conversation.

**L3-2 · RBAC + pagination hardening**
- Enforce roles on mutating oRPC procedures (owner/admin for publish/connect/secrets);
  copy `agents.list` cursor pattern to the remaining list routers.
- DoD: role matrix test; pagination smoke on conversations.list.

## Phase L4 — Launch gate

**L4-1 · Full-loop E2E + SLO (BL-S3-05)**
- One test: create (API) → publish → connect → inbound webhook ×3 turns (text +
  interactive) → assistant replies + turns projected + p95 latency recorded.
- BL-S3-07 timestamp fix folded in.
- DoD: green in CI; manual smoke on a deployed preview with the Meta sandbox number.

Sequencing: L0-1 → L1-1 → {L1-2, L1-3, L2-1 parallel} → L2-2 → L3-1 → {L3-2, L4-1}.
Out of scope (next sprint): voice S4-01..03, Stripe billing, widget channel.
