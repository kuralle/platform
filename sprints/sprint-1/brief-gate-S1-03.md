# Spec + Code-Quality Gate — `S1-03` Channels + conversations + runtime sidecars

> **Role.** You are a senior database review engineer with deep expertise in **multi-tenant Postgres schemas, polymorphic-relationship triggers, and append-only event-sourced systems at production scale**. You've audited CDR/voice-call schemas, you understand why dedup partial unique indexes matter, and you can spot a bad FK direction or a missing `BEFORE INSERT OR UPDATE` clause from a `git diff` skim. You take pride in spec adherence and you're allergic to "verbatim" claims that aren't actually verbatim.
>
> **Mindset.** You are peer-IC, NOT adversarial — you're on the same team as the IC and your goal is to keep the team out of the manager's r1 punch list. You read every required input file. You walk every brief AC, mark each met/partial/missed with file:line evidence, and you flag spec deviations honestly even when the IC's commit body is confident. You verify against `DATA_MODEL.md §8 §9 §15` line-by-line — column names, types, FK targets, ON DELETE policies, defaults, indexes, CHECK semantics, trigger semantics. You re-run the smoke runner to confirm it actually exercises what the IC claims. You do NOT rewrite code. You do NOT commit. You write a markdown report only.
>
> **Standards.** Calm, plain language. No bikeshedding — flag only project-rule, RFC-§, or §2.2 rubric violations. Reference brief ACs by number. Read every suspicious file line by line. The "Apply-now items" section in your output must be surgical — file:line + concrete fix description — so the manager can apply each one before firing the next IC.
>
> **Boundaries.** This brief is the contract. You write `sprints/sprint-1/gate-S1-03.md` and stop. You do not modify any source. You do not commit. You do not adversarial-review (that's r2's job at sprint level).

---

## 1. Context

**Story:** `S1-03` — Channels + conversations + runtime sidecars (13 tables).

**Inputs:**
1. `sprints/sprint-1/brief-S1-03.md` — the contract (17 ACs).
2. `sprints/sprint-1/PLAN.md` § `S1-03`.
3. `.handoff/result-S1-03.txt` — IC transcript.
4. The diff: `git show c27bb66`. Read every file the IC created or modified.
5. Reference docs: `DATA_MODEL.md §8` (lines 560-657), `§9` (lines 661-885), `§15` (lines 1170-1245), `§18` step 5/6/8/17.
6. Migration files: `packages/db/src/migrations/0007_moaning_arachne.sql`, `0008_s1_03_meta.sql`.
7. Artifacts: `sprints/sprint-1/artifacts/S1-03-channel-trigger.txt`, `S1-03-tables.txt`.
8. Schema files: `packages/db/src/schema/channels.ts`, `conversations.ts`, `runtime.ts`, `index.ts` (3 new re-exports).
9. Prior gate reports `sprints/sprint-1/gate-S1-01.md` and `gate-S1-02.md` for the standing rules to apply.
10. The committed Postgres state — re-run `bun packages/db/scripts/smoke-S1-03.ts` (already proven 21/21 by the IC).

---

## 2. Your job

### 2.1 Spec adherence — walk every brief AC 1-17

For each:
- Met / partial / missed. Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose it?

**Project-specific spec gates** (sprint-1 standing rules from gate-S1-01 + gate-S1-02):

A. **CHECK constraints on every new enum-text column** (BL-S0-02 spirit). The brief's AC 2 covers `channel_kind` on connections and endpoints. But verify ALSO:
   - `channel_connections.status` IN `('connected','available','coming-soon','error','degraded')` per §8:587.
   - `channel_connections.provider` — note this is a free-text column with documented values per §8:583-585; check whether the IC added a CHECK or left it free.
   - `routing_rules.ruleKind` IN `('path','query_param','header','default')` per §8:646.
   - `conversations.direction` IN `('inbound','outbound')` per §9:682.
   - `conversations.outcome` IN the §9:688 8-tuple.
   - `conversation_turns.speaker` IN `('agent','caller','system')` per §9:753.
   - `conversation_turns.deliveryStatus` IN `('sending','sent','delivered','read','failed')` per §9:757.
   - `conversation_turns.evalVerdict` IN `('passed','failed','warning')` per §9:760.
   - `voice_calls.hangupBy` IN `('caller','agent','system','transfer')` per §9:723.
   - `runtime_deployments.{kind,status,platform,terminationReason,resourceTier,complianceMode,isolationKind}` — each has its own §9 enum (lines 862-879). All seven need CHECKs.
   - `session_checkpoints.trigger` IN `('tool-result','tool-error','flow-transition','handoff','manual')` per §9:849.

B. **DESC index ordering** per S1-02-fix precedent. `DATA_MODEL.md §9` indexes that should be `desc`:
   - `conversations`: `(workspaceId, channelKind, startedAt desc)`, `(agentId, startedAt desc)`, `(deploymentId, startedAt desc)` per §9:704-708.
   - `messaging_threads`: `(workspaceId, windowExpiresAt)` per §9:743 — no `desc` per spec, verify.
   - `runtime_deployments`: `(workspaceId, startedAt desc)` per §9:884.
   - `session_checkpoints`: `(sessionId, createdAt desc)` per §9:853.

C. **Partial indexes** per §9:705-708, §9:882-883:
   - `conversations(workspaceId, endedAt) WHERE endedAt IS NULL` — present?
   - `runtime_deployments(workspaceId, terminatedAt) WHERE terminatedAt IS NULL` — present?
   - `runtime_deployments(lastHeartbeatAt) WHERE status = 'ready'` — present?

D. **Polymorphic CHECK trigger** for `channel_endpoints.channelKind ↔ channel_connections.channelKind` per §15:1237-1238. Trigger fires `BEFORE INSERT OR UPDATE`. Verify the trigger function's exact name, exception code (`check_violation`), and the message format. Smoke artifact `S1-03-channel-trigger.txt` should show the exact error.

E. **`conversation_turns` dedup**: partial unique index `(conversationId, messageId) WHERE messageId IS NOT NULL` per brief AC 7. Voice turns (NULL messageId) must NOT be constrained. Smoke verifies both directions.

F. **`conversation_evals.rubricSnapshot`** is `text NOT NULL` per §9:820 / brief AC 8 — verify.

G. **Append-only trigger NOT applied** to `conversation_turns`, `conversation_tool_calls`, `session_checkpoints`, `runtime_deployments` per brief AC 11. Verify by grep — the only append-only trigger should be the S1-02 one on `agent_versions`.

H. **`relations()` coverage** per S1-02-fix precedent — every new table file should declare relations() for every FK. Verify channels.ts / conversations.ts / runtime.ts.

I. **No `catch (e: any)`** in smoke runner — verify via lint output (0 errors, 1 pre-existing warning unchanged).

J. **`credentialsSecretId` deferred FK** on `channel_connections` — should be `text` only, no `references()` per brief AC 3. Will be added via ALTER TABLE in S1-04.

K. **Mutual-FK chicken-and-egg** for `channel_endpoints.routingRulesId ↔ routing_rules.channelEndpointId` per brief AC 5. Verify nullable on endpoints side.

L. **Unique constraints**:
   - `channel_endpoints` UNIQUE `(channelKind, identifier)` per §8:624.
   - `conversations` UNIQUE `(workspaceId, threadKey, startedAt)` per §9:702.
   - `conversation_turns` UNIQUE `(conversationId, ordinal)` per §9:768.
   - `runtime_sessions.conversationId` UNIQUE per §9:829.

M. **Composite PKs**:
   - `messaging_threads` PK `(workspaceId, threadKey)` per §9:741.
   - `conversation_extracted_fields` PK `(conversationId, label)` per §9:800.
   - `voice_calls` PK is just `conversationId` (one-to-one) per §9:716.

### 2.2 Code quality

- **Naming**: TS exports camelCase, SQL columns snake_case.
- **Type tightness**: no `any` casts. No unjustified type assertions. AnyPgColumn used only for circular FKs.
- **Idiomatic patterns**: `relations()` per table, `pgTable(name, columns, (table) => [indexes])` shape.
- **Smells**: dead branches; copy-paste between similar table definitions; magic numbers.
- **Comments**: WHY-only.
- **Test quality**: smoke runner — does each PASS assert distinct behavior? Does it cover the polymorphic trigger, the dedup partial index, the mutual-FK creation order, AND the unique constraints from §L?

---

## 3. Output

Write **`sprints/sprint-1/gate-S1-03.md`** with the standard sections:
1. Spec adherence table (17 ACs + project-specific A-M).
2. File-list adherence table.
3. Wiring + demo artifact.
4. Code quality bullets (one per file or "clean").
5. Honest summary paragraph.
6. Recommended action: `Ready for fix-pass` / `Needs IC re-fire` / `Ambiguous — manager owns`.
7. **Apply-now items** — numbered, file:line, surgical fix description.

Verdict: green / yellow / red.
