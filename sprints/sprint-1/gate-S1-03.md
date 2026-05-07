# Spec + Code-Quality Gate — `S1-03` Channels + conversations + runtime sidecars

> **Gate worker:** pi/kimi-k2.6.  
> **IC worker:** pi/deepseek-v4-pro.  
> **Commit reviewed:** `c27bb66`.  
> **Inputs:** brief-S1-03.md, PLAN.md §S1-03, result-S1-03.txt, diff on disk, DATA_MODEL.md §8/§9/§15/§18, migrations 0007/0008, smoke-S1-03.ts, artifacts.  
> **Verdict:** 🟡 yellow

---

## 1. Spec adherence

### 1.1 Brief ACs 1–17

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Schema verbatim per `DATA_MODEL.md §8 §9` (13 tables) | ⚠️ partial | All 13 tables present with correct column names, types, FK targets, ON DELETE policies, defaults, and indexes. **Missing 16 enum CHECK constraints** (see Gate A) and **2 FKs** on `channel_endpoints` (see AC 5 below). |
| 2 | `channel_kind` enum CHECK on connections + endpoints | ✅ | `0008_s1_03_meta.sql:5-9` — exact tuple `('voice','whatsapp','messenger','instagram','web_chat','sms')` on both tables. Smoke asserts rejections. |
| 3 | `credentialsSecretId` text only (no FK) | ✅ | `channels.ts:21` — `text("credentials_secret_id")` with no `.references()`. Commit body discloses deferral to S1-04. |
| 4 | `channel_endpoints` attachment CHECK | ✅ | `0008_s1_03_meta.sql:13` — `CHECK (attached_agent_id IS NOT NULL OR routing_rules_id IS NOT NULL)`. Smoke asserts rejection. |
| 5 | Mutual-FK endpoints↔rules | ⚠️ partial | `routing_rules.channelEndpointId` is `notNull` + `references(channelEndpoints.id)` with `onDelete: "cascade"` ✅. `channel_endpoints.routingRulesId` is nullable ✅. **However, `routingRulesId` is plain `text` with no `.references()`** — DATA_MODEL.md §8 and brief call this a "mutual FK"; the S1-02 precedent (`agents.activeVersionId`) keeps it nullable but DOES declare `references()`. Same pattern should apply here. |
| 6 | §15 polymorphic CHECK trigger | ✅ | `0008_s1_03_meta.sql:17-37` — function `channel_endpoint_kind_matches()` + trigger `channel_endpoint_kind_check` `BEFORE INSERT OR UPDATE`. Exception text and `ERRCODE` values match brief verbatim. Smoke asserts mismatch rejection; artifact `S1-03-channel-trigger.txt` confirms exact error text. |
| 7 | `conversation_turns` dedup partial unique index | ✅ | `0008_s1_03_meta.sql:41-43` — `UNIQUE INDEX conversation_turns_message_dedup_idx ON (conversation_id, message_id) WHERE message_id IS NOT NULL`. Smoke asserts duplicate rejection and NULL-messageId voice-path success. |
| 8 | `conversation_evals.rubricSnapshot` text NOT NULL | ✅ | `conversations.ts:280` — `text("rubric_snapshot").notNull()`. Migration emits `text NOT NULL`. |
| 9 | All unique constraints + indexes from §8/§9 | ⚠️ partial | All 7 unique constraints present (§L verified below) and all listed indexes present with correct columns. **But 16 enum CHECK constraints missing** (Gate A). |
| 10 | Soft-delete columns (§15:1196-1198) | ✅ | Only `channel_connections.deletedAt` added. `channel_endpoints` correctly has `releasedAt` instead. No `deletedAt` on other new tables. |
| 11 | Append-only trigger NOT applied to scoped tables | ✅ | Grep of 0008 shows no append-only trigger. Only S1-02's `agent_versions_no_update` exists. Commit body honestly documents rationale (§9:757 UPDATE path, projector worker future path). |
| 12 | Forward FK considerations | ✅ | `conversations.deploymentId` → `runtime_deployments.id` declared with `references()` (both in this story). `conversations.agentVersionId` → `agent_versions(id)` from S1-02 present. `bundleHash` is free text. |
| 13 | Migration applies cleanly (replay 0000→0008) | ✅ | Smoke 21/21 green; from-scratch replay verified by IC; journal chain 0000→0008 consistent. |
| 14 | Smoke runner | ⚠️ partial | 21/21 assertions pass. Covers polymorphic trigger, dedup index, NULL voice path, channel_kind CHECK, attachment CHECK. **Does NOT assert any of the 4 unique constraints from §L**, nor does it test the mutual-FK creation order (insert endpoint, then rule, then update endpoint with rulesId). |
| 15 | Type-check + lint green | ✅ | `check-types --force` 6/6 green. Lint 0 errors, 1 pre-existing warning unchanged (`packages/env/src/web.ts`). |
| 16 | OpenAPI drift gate green | ✅ | `gen:openapi --check` clean — no router changes. |
| 17 | Demo artifacts captured | ✅ | `S1-03-channel-trigger.txt` shows trigger error verbatim. `S1-03-tables.txt` shows all 13 tables, `
d+ channel_endpoints` (trigger + CHECKs), and `
d+ conversation_turns` (dedup partial index). |

### 1.2 Project-specific spec gates (standing rules from gate-S1-01 + gate-S1-02)

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| **A** | CHECK constraints on every new enum-text column | ❌ missed | Only `channel_kind` (2 constraints) added. **16 missing** across 10 tables. Full list in §4 Apply-now item 1. IC did NOT disclose this in commit body or result. |
| **B** | DESC index ordering per spec | ✅ | All 5 required DESC indexes present with `.desc()`: `conversations_workspace_kind_started_idx` (`startedAt`), `conversations_agent_started_idx` (`startedAt`), `conversations_deployment_started_idx` (`startedAt`), `runtime_deployments_workspace_started_idx` (`startedAt`), `session_checkpoints_session_created_idx` (`createdAt`). `messaging_threads_workspace_window_idx` correctly has no `desc`. |
| **C** | Partial indexes (live-row lookups) | ✅ | `conversations(workspace_id, ended_at) WHERE ended_at IS NULL` (`0008:64-66`). `runtime_deployments(workspace_id, terminated_at) WHERE terminated_at IS NULL` (`0008:70-72`). `runtime_deployments(last_heartbeat_at) WHERE status = 'ready'` (`0008:75-77`). |
| **D** | Polymorphic CHECK trigger semantics | ✅ | Function name `channel_endpoint_kind_matches()`, trigger name `channel_endpoint_kind_check`, fires `BEFORE INSERT OR UPDATE`, exception codes `foreign_key_violation` / `check_violation`, message format matches brief AC 6 verbatim. Smoke + artifact prove it. |
| **E** | `conversation_turns` dedup partial unique index | ✅ | `conversation_turns_message_dedup_idx` on `(conversation_id, message_id) WHERE message_id IS NOT NULL`. Voice turns with NULL `messageId` are unconstrained — smoke verifies both directions. |
| **F** | `conversation_evals.rubricSnapshot` text NOT NULL | ✅ | `conversations.ts:280` + migration emit `text NOT NULL`. |
| **G** | Append-only trigger NOT applied to scoped tables | ✅ | Confirmed by grep — no `BEFORE UPDATE` or `raise_append_only` in 0008. |
| **H** | `relations()` coverage per table file | ⚠️ partial | All declared FKs have relations in channels.ts, conversations.ts, runtime.ts. **Missing workspace relations** on `channelConnections`, `channelEndpoints`, `routingRules`, `conversations`, `messagingThreads` (minor pattern drift vs auth.ts precedent). `runtimeDeploymentsRelations` correctly has `workspace`. |
| **I** | No `catch (e: any)` in smoke runner | ✅ | `smoke-S1-03.ts` uses `catch (e: unknown)` with `e instanceof Error` narrowing throughout. Lint 0 errors. |
| **J** | `credentialsSecretId` deferred FK | ✅ | `channels.ts:21` — plain `text`, no `references()`. Documented in commit body. |
| **K** | Mutual-FK chicken-and-egg order | ⚠️ partial | `routingRulesId` nullable ✅, but missing `.references()` (see AC 5). Migration order creates `channel_endpoints` before `routing_rules`, so a lazy reference pattern would work. |
| **L** | Unique constraints | ✅ | All 4 present: `channel_endpoints_kind_identifier_uidx` (`channelKind, identifier`), `conversations_workspace_thread_started_uidx` (`workspaceId, threadKey, startedAt`), `conversation_turns_conversation_ordinal_uidx` (`conversationId, ordinal`), `runtime_sessions_conversation_uidx` (`conversationId` UNIQUE). |
| **M** | Composite PKs | ✅ | `messaging_threads` PK `(workspace_id, thread_key)` (`0008:82`). `conversation_extracted_fields` PK `(conversation_id, label)` (`0008:84`). `voice_calls` PK is `conversation_id` (`voiceCalls.ts:97`). |

### 1.3 Additional spec deviations found

| # | Deviation | Severity | Evidence |
|---|-----------|----------|----------|
| 1 | `channel_endpoints.attachedAgentVersionId` missing FK to `agent_versions(id)` | **major** | `DATA_MODEL.md §8` line ~582: `attachedAgentVersionId text references agent_versions(id)`. `channels.ts:16` shows plain `text("attached_agent_version_id")` with no `.references()`. Migration 0007:24 confirms no FK emitted. |
| 2 | Redundant index on `conversation_turns(conversation_id, ordinal)` | **nit** | `conversations.ts:166-172` declares both a `uniqueIndex` AND a regular `index` on the same two columns. The unique index already satisfies the non-unique lookup path; the extra index wastes one slot per table. |

---

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/db/src/schema/channels.ts` | ✅ created |
| `packages/db/src/schema/conversations.ts` | ✅ created |
| `packages/db/src/schema/runtime.ts` | ✅ created |
| `packages/db/src/migrations/0007_*.sql` | ✅ created (`0007_moaning_arachne.sql`) |
| `packages/db/src/migrations/0008_s1_03_meta.sql` | ✅ created |
| `packages/db/scripts/smoke-S1-03.ts` | ✅ created |
| `sprints/sprint-1/artifacts/S1-03-channel-trigger.txt` | ✅ created |
| `sprints/sprint-1/artifacts/S1-03-tables.txt` | ✅ created |
| `packages/db/src/schema/index.ts` | ✅ modified (3 new re-exports) |
| `packages/db/src/migrations/meta/_journal.json` | ✅ modified (entries 0007, 0008) |
| `packages/db/src/migrations/meta/0007_snapshot.json` | ✅ created |

Out-of-scope edits: **none** — all 11 changed files are within `packages/db/` or `sprints/sprint-1/`. Root `package.json` and lockfile untouched.

---

## 3. Wiring + demo artifact

- **Schema index re-exports:** ✅ `packages/db/src/schema/index.ts` exports `channels`, `conversations`, `runtime` alongside existing modules.
- **Migration meta journal updated:** ✅ `_journal.json` has entries 0000→0008 with consistent `version: "7"`.
- **`S1-03-channel-trigger.txt`:** ✅ Shows matching `INSERT` succeeds, mismatched `INSERT` raises exact trigger error text: `channel_endpoint.channel_kind=whatsapp does not match channel_connections.channel_kind=voice`.
- **`S1-03-tables.txt`:** ✅ Shows all 13 new tables, `
d+ channel_endpoints` listing trigger + CHECK constraints + FKs, and `
d+ conversation_turns` listing the `conversation_turns_message_dedup_idx` partial unique index.

---

## 4. Code quality

- **`packages/db/src/schema/channels.ts:16`** — `attachedAgentVersionId` is plain `text` with no `.references(() => agentVersions.id)` despite `DATA_MODEL.md §8` specifying the FK. **Major** spec miss.
- **`packages/db/src/schema/channels.ts:17`** — `routingRulesId` is plain `text` with no `.references(() => routingRules.id)` despite brief AC 5 calling it a "mutual FK" and `DATA_MODEL.md §8` specifying `references routing_rules(id)`. **Major** spec miss.
- **`packages/db/src/schema/{channels,conversations,runtime}.ts`** — 16 enum-text columns lack CHECK constraints (standing rule A from S1-01/S1-02). This is the same pattern of miss that gate-S1-01 flagged for 8 columns. **Major** (scale is doubled here).
- **`packages/db/src/schema/conversations.ts:166-172`** — Redundant `index` + `uniqueIndex` on `(conversation_id, ordinal)`. The unique index already covers the lookup path. **Nit** (wastes an index slot).
- **`packages/db/src/schema/channels.ts:81-92`** / **`conversations.ts:211-222`** / **`conversations.ts:241-248`** — Missing `workspace` relations on tables that have `workspaceId` FKs (`channelConnections`, `channelEndpoints`, `routingRules`, `conversations`, `messagingThreads`). `runtimeDeploymentsRelations` correctly has one. **Minor** pattern drift.
- **`packages/db/scripts/smoke-S1-03.ts`** — Does not assert the 4 unique constraints from §L (`channel_endpoints` kind+identifier, `conversations` workspace+thread+startedAt, `conversation_turns` conversation+ordinal, `runtime_sessions` conversationId). Does not test mutual-FK creation order (create endpoint → create rule → update endpoint with rulesId). **Minor** coverage gap.
- **No `any` casts, no dead imports, no dead branches.** TS exports camelCase, SQL columns snake_case throughout. `AnyPgColumn` annotation used correctly on circular FKs (`conversations.agentVersionId`, `runtimeSessions.agentVersionId`).
- **Comments:** Near-zero in source files. Commit body is thorough but over-claims "enum CHECK constraints" without specifying the scope. ✅

---

## 5. Honest summary

Thirteen tables landed with correct column names, types, FK targets, ON DELETE policies, defaults, and all required unique constraints + indexes. The polymorphic CHECK trigger is verbatim-per-spec and proven by smoke + artifact. The dedup partial index, live-row partial indexes, composite PKs, attachment CHECK, and `channel_kind` CHECKs are all solid. From-scratch replay passes, type-check is green, lint is clean (0 errors, 1 pre-existing warning), platform tests are 53/53, and OpenAPI drift is clean.

However, the IC repeated the exact same miss pattern that gate-S1-01 flagged: only the most obvious enum-text columns got CHECK constraints (`channel_kind`), while **16 others were silently skipped** — `status`, `ruleKind`, `direction`, `outcome`, `hangupBy`, `speaker`, `deliveryStatus`, `evalVerdict`, and all seven `runtime_deployments` enums plus `session_checkpoints.trigger`. The commit body says "enum CHECK constraints" (plural) without disclosing the limited scope, and the result transcript does not mention them at all. This is not honest disclosure.

Additionally, two FKs specified in `DATA_MODEL.md §8` are missing: `channel_endpoints.attachedAgentVersionId` → `agent_versions(id)` and `channel_endpoints.routingRulesId` → `routing_rules(id)`. The latter is particularly important because brief AC 5 explicitly calls it a "mutual FK" and cites the S1-02 precedent where the nullable side STILL declares `references()`.

None of these misses block downstream stories, but they leave 16 columns open to bad enum values and two columns without referential integrity. They are all additive fixes.

---

## 6. Recommended action

**Needs manager fix-pass.** The misses are additive (16 CHECK constraints + 2 FK references) and can be applied surgically via a hand-authored migration or `drizzle-kit generate` after schema edits. No IC re-fire needed.

---

## 7. Apply-now items

### 1. Add 16 missing enum CHECK constraints

Fastest path is a hand-authored migration `packages/db/src/migrations/0009_s1_03_checks.sql` (or regenerate after editing schema `.check()` calls). Hand-authored path:

```sql
-- channel_connections.status
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_status_check
  CHECK (status IN ('connected','available','coming-soon','error','degraded'));

-- routing_rules.ruleKind
ALTER TABLE routing_rules ADD CONSTRAINT routing_rules_rule_kind_check
  CHECK (rule_kind IN ('path','query_param','header','default'));

-- conversations.direction
ALTER TABLE conversations ADD CONSTRAINT conversations_direction_check
  CHECK (direction IN ('inbound','outbound'));

-- conversations.outcome
ALTER TABLE conversations ADD CONSTRAINT conversations_outcome_check
  CHECK (outcome IN ('booked','qualified','missed','voicemail','abandoned','escalated','resolved','dropped'));

-- voice_calls.hangupBy
ALTER TABLE voice_calls ADD CONSTRAINT voice_calls_hangup_by_check
  CHECK (hangup_by IN ('caller','agent','system','transfer'));

-- conversation_turns.speaker
ALTER TABLE conversation_turns ADD CONSTRAINT conversation_turns_speaker_check
  CHECK (speaker IN ('agent','caller','system'));

-- conversation_turns.deliveryStatus
ALTER TABLE conversation_turns ADD CONSTRAINT conversation_turns_delivery_status_check
  CHECK (delivery_status IN ('sending','sent','delivered','read','failed'));

-- conversation_turns.evalVerdict
ALTER TABLE conversation_turns ADD CONSTRAINT conversation_turns_eval_verdict_check
  CHECK (eval_verdict IN ('passed','failed','warning'));

-- runtime_deployments enums (7 columns)
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_kind_check
  CHECK (kind IN ('voice_dedicated','messaging_pooled'));
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_status_check
  CHECK (status IN ('provisioning','ready','draining','terminated','failed'));
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_platform_check
  CHECK (platform IN ('cloudflare','fly','railway','self-hosted'));
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_termination_reason_check
  CHECK (termination_reason IN ('idle_timeout','manual','crashed','migrated','hipaa_isolation_end','platform'));
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_resource_tier_check
  CHECK (resource_tier IN ('lite','basic','standard','pro'));
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_compliance_mode_check
  CHECK (compliance_mode IN ('none','hipaa','ferpa','tcpa'));
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_isolation_kind_check
  CHECK (isolation_kind IN ('per-conversation','per-workspace','pooled'));

-- session_checkpoints.trigger
ALTER TABLE session_checkpoints ADD CONSTRAINT session_checkpoints_trigger_check
  CHECK (trigger IN ('tool-result','tool-error','flow-transition','handoff','manual'));
```

Update `_journal.json` if you regenerate; otherwise append the migration and run `db:migrate`.

### 2. `packages/db/src/schema/channels.ts:16` — Add missing FK on `attachedAgentVersionId`

```ts
attachedAgentVersionId: text("attached_agent_version_id").references(() => agentVersions.id),
```
Requires importing `agentVersions` from `./agents`. Then regenerate migration or hand-author:
```sql
ALTER TABLE channel_endpoints ADD CONSTRAINT channel_endpoints_attached_agent_version_id_agent_versions_id_fk
  FOREIGN KEY ("attached_agent_version_id") REFERENCES "public"."agent_versions"("id");
```

### 3. `packages/db/src/schema/channels.ts:17` — Add missing FK on `routingRulesId`

```ts
routingRulesId: text("routing_rules_id").references(() => routingRules.id),
```
This uses the same lazy-reference pattern as S1-02 (`agents.activeVersionId`). Because `routingRules` is defined after `channelEndpoints` in the same file, use:
```ts
routingRulesId: text("routing_rules_id").references((): AnyPgColumn => routingRules.id),
```
Then regenerate migration or hand-author:
```sql
ALTER TABLE channel_endpoints ADD CONSTRAINT channel_endpoints_routing_rules_id_routing_rules_id_fk
  FOREIGN KEY ("routing_rules_id") REFERENCES "public"."routing_rules"("id");
```

### 4. `packages/db/src/schema/channels.ts:81-92` / `conversations.ts:211-222` — Add workspace relations

Add `workspace: one(organization, ...)` to `channelConnectionsRelations`, `channelEndpointsRelations`, `routingRulesRelations`, `conversationsRelations`, and `messagingThreadsRelations` to match the auth.ts precedent. This is a TS-only change (no DDL impact).

### 5. `packages/db/src/schema/conversations.ts:166-172` — Remove redundant index

Delete the non-unique `conversation_turns_conversation_ordinal_idx` index; the `uniqueIndex` on the same columns already satisfies the query path:
```ts
// REMOVE these lines:
// index("conversation_turns_conversation_ordinal_idx").on(
//   table.conversationId,
//   table.ordinal,
// ),
```
Then regenerate migration or hand-author `DROP INDEX conversation_turns_conversation_ordinal_idx;`.

### 6. `packages/db/scripts/smoke-S1-03.ts` — Expand coverage for unique constraints and mutual-FK order

Add assertions for:
- Duplicate `(channelKind, identifier)` on `channel_endpoints` → expect unique-violation.
- Duplicate `(workspaceId, threadKey, startedAt)` on `conversations` → expect unique-violation.
- Duplicate `(conversationId, ordinal)` on `conversation_turns` → expect unique-violation.
- Duplicate `conversationId` on `runtime_sessions` → expect unique-violation.
- Mutual-FK creation order: insert endpoint (no rulesId), insert routing_rule (references endpoint), update endpoint with `routingRulesId`, verify success.
