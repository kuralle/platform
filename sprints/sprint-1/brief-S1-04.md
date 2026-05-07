# Story Brief — `S1-04` Cross-cutting tables (secrets, webhooks, audit-partitioned, billing, compliance, batches)

> **Role.** You are a senior database engineer with strong experience in **partitioned Postgres tables, KMS-envelope encryption, audit/event-log architectures at compliance scale (HIPAA/SOC2), and cross-cutting workspace-scoped multi-tenant designs**. You've shipped declarative range-partitioned audit logs in production, you know that `PARTITION BY RANGE` requires the partition key in the PK, and you instinctively reach for hand-authored SQL when Drizzle can't natively express a feature (partitions, CHECK triggers, late FK adds, partial indexes with predicates).
>
> **Mindset.** You read `DATA_MODEL.md §10 §11 §12 §13 §15` twice before opening an editor. You verify the Drizzle 0.45 customType / partition / `pgTable` API shapes against `node_modules/.bun/.../drizzle-orm/**/*.d.ts` and the live docs (context7 `/drizzle-team/drizzle-orm-docs`) before guessing. You know that drizzle-kit's `generate` will try to emit a `CREATE TABLE` for any pgTable in the schema — so for the partitioned `audit_log_events` you have a deliberate plan: declare the pgTable for type-inference, then **delete the auto-emitted CREATE TABLE from the migration file** before committing and prepend the hand-authored partition DDL. You document this divergence prominently in the commit body. You never silently bypass; never commit `--no-verify`; never claim "done" without proof — proof is the migration applying on a from-scratch DB, every CHECK firing in the smoke, and an actual partition routing test (insert, then `SELECT count(*) FROM audit_log_events_2026_05` returns 1).
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (err: unknown)` with `err instanceof Error` narrowing. No root-`package.json` devDep pollution — scripts live inside `@kuralle/db`. No improvisation on enum tuples — read the §10-§13 spec lines you cite. No premature abstractions; repository code, Zod schemas, oRPC routers, and the seed are out of scope for this story. No append-only UPDATE-blocking triggers on `audit_log_events`/`usage_events`/`webhook_deliveries`/`compliance_evaluations` — they're declared "append-only" semantically but the projector worker / cron may legitimately UPDATE retry counters; document this decision (per S1-03 precedent).
>
> **Boundaries.** This brief is the contract. Touch only files in §3 — except the **two surgical schema-edits on `tools.ts` and `channels.ts`** explicitly authorised in AC 3 to add `.references()` for the deferred `credentials_secret_id` FKs. Read every §2 reference in full. If anything contradicts what's on disk (S1-02 / S1-03 schema field names, prior migration file naming), **stop and ask** — don't guess and don't paper over. The migration chain you inherit (0000..whatever S1-03 committed) is the ground truth; your migration sits at the next index.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S1-04] cross-cutting tables (audit partitioned, secrets, webhooks, billing, compliance, batches)`. Do NOT push. One commit per story.

---

## 1. Goal

Drizzle schema for all remaining cross-cutting tables per `DATA_MODEL.md §11 §12 §13`: `secrets`, `webhooks`, `webhook_deliveries`, `audit_log_events` (monthly partitioned per §11 — three child partitions for current and next two months), `workspace_compliance_posture`, `compliance_evaluations`, `guardrail_events`, `billing_subscriptions`, `usage_events`, `monthly_receipts`, `batches`, `batch_recipients`. Plus the **deferred FK** that S1-01 left open: `tool_catalog_providers.credentials_secret_id → secrets(id)` lands now via ALTER TABLE. Plus the **deferred FK** that S1-03 will leave open: `channel_connections.credentials_secret_id → secrets(id)` lands now via ALTER TABLE. RLS policies are NOT created (S5).

---

## 2. Required reading

1. `sprints/STATE.md`.
2. `sprints/sprint-1/PLAN.md` (story `S1-04` section).
3. `sprints/WBS.md` § Sprint 1 row `S1-04` (line 118).
4. **`DATA_MODEL.md §10`** lines 893-948 — batches.
5. **`DATA_MODEL.md §11`** lines 949-1029 — secrets, webhooks, webhook_deliveries, audit_log_events.
6. **`DATA_MODEL.md §12`** lines 1036-1101 — workspace_compliance_posture, compliance_evaluations, guardrail_events.
7. **`DATA_MODEL.md §13`** lines 1105-1147 — billing_subscriptions, usage_events, monthly_receipts.
8. `DATA_MODEL.md §15` — soft-delete + append-only + indexing rules.
9. `DATA_MODEL.md §18` — codegen sequence steps 12 (audit_log_events partitioned), 13 (usage + receipts + billing), 18 (workspace_compliance_posture + compliance_evaluations).
10. The S1-01, S1-02, S1-03 schema files + their migrations on disk (`packages/db/src/schema/{auth,knowledge,tools,voices,agents,channels,conversations,runtime}.ts` and `0001..XXXX_*.sql`) — for Drizzle precedent and for the FK targets you'll create back-references to.
11. `packages/db/src/migrations/0001_crazy_purifiers.sql` (CREATE EXTENSION pattern), the S1-02 trigger DDL (precedent for hand-authored DDL alongside drizzle-kit emit), the S1-03 trigger DDL (precedent for polymorphic CHECKs).
12. The S1-01..S1-03 smoke runners — for smoke-runner shape.

---

## 3. Files to create or modify

**Create:**
- `packages/db/src/schema/secrets.ts` — `secrets`.
- `packages/db/src/schema/webhooks.ts` — `webhooks`, `webhookDeliveries`.
- `packages/db/src/schema/audit.ts` — `auditLogEvents` (parent declaration only; child partitions hand-authored in migration).
- `packages/db/src/schema/billing.ts` — `billingSubscriptions`, `usageEvents`, `monthlyReceipts`.
- `packages/db/src/schema/compliance.ts` — `workspaceCompliancePosture`, `complianceEvaluations`, `guardrailEvents`.
- `packages/db/src/schema/batches.ts` — `batches`, `batchRecipients`.
- `packages/db/src/migrations/000X_*.sql` — drizzle-kit emit for the new tables + hand-authored partition DDL + late FK adds.
- `packages/db/scripts/smoke-S1-04.ts` — smoke runner: partition routing + late-FK round-trip + idempotent CHECK constraint coverage + soft-delete column presence.
- `sprints/sprint-1/artifacts/S1-04-partitions.txt` — `\d+ audit_log_events` showing the partition layout.
- `sprints/sprint-1/artifacts/S1-04-tables.txt` — `\dt` of all S1-04 tables.

**Modify:**
- `packages/db/src/schema/index.ts` — six new re-exports.
- `packages/db/src/migrations/meta/_journal.json` + new snapshot file.

**Do not touch:**
- Any S1-01 / S1-02 / S1-03 file beyond the schema/index.ts re-exports already there.
- Any landed migration (0000, 0001, 0002, 0003, S1-02's, S1-03's).
- Repo-root `package.json`.
- Anything outside `packages/db/` and `sprints/sprint-1/`.

---

## 4. Acceptance criteria

1. **Schema verbatim per `DATA_MODEL.md §10 §11 §12 §13`.** Twelve tables (counting `audit_log_events` as one). Exact column names, types, FK targets, ON DELETE policies, defaults, indexes.

2. **`audit_log_events` partitioning** per §11 line 1024 (`partition by range (createdAt) -- monthly partitions`):
   - Drizzle CANNOT emit `PARTITION BY RANGE` cleanly on a `pgTable`. Hand-author the parent table DDL in the migration:
     ```sql
     CREATE TABLE audit_log_events (
       id text PRIMARY KEY,
       workspace_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
       actor_user_id text REFERENCES "user"(id),
       actor_kind text,
       api_key_id text REFERENCES apikey(id),
       event text NOT NULL,
       resource_kind text,
       resource_id text,
       diff jsonb,
       ip_address inet,
       user_agent text,
       created_at timestamp NOT NULL DEFAULT now()
     ) PARTITION BY RANGE (created_at);
     ```
   - Note: `id` cannot be the sole PK for a partitioned table because Postgres requires the partition key in the PK. Either:
     - **(a)** make the PK composite `(id, created_at)`, OR
     - **(b)** drop the PK and use a UNIQUE INDEX `(id, created_at)`.
     Pick (a). Document the divergence from §11 line 1010 (`id text primary key`) in the commit body. `id` alone remains globally unique by virtue of the prefixed nanoid scheme; the composite key is a Postgres artifact.
   - **Three monthly partitions** for `2026-05`, `2026-06`, `2026-07` (current month + next two; today is 2026-05-07). Hand-author:
     ```sql
     CREATE TABLE audit_log_events_2026_05 PARTITION OF audit_log_events
       FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
     CREATE TABLE audit_log_events_2026_06 PARTITION OF audit_log_events
       FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
     CREATE TABLE audit_log_events_2026_07 PARTITION OF audit_log_events
       FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
     ```
   - **Indexes** per §11 lines 1025-1027 — these need to be on the PARENT (Postgres ≥ 11 propagates them to all children via partition-aware index machinery): `(workspaceId, createdAt desc)`, `(workspaceId, event, createdAt desc)`, `(resourceKind, resourceId, createdAt desc)`. Hand-author after the partition DDL.
   - In the Drizzle TS schema (`audit.ts`), declare a regular `pgTable` so `auditLogEvents.$inferSelect` works for downstream code. Do NOT have drizzle-kit emit the CREATE TABLE — exclude it via the `out` mechanism if possible, or manually delete the Drizzle-generated CREATE for this one table from the migration before committing. Document the path in the commit body.

3. **Late FK adds** for the deferred forward references:
   ```sql
   ALTER TABLE tool_catalog_providers
     ADD CONSTRAINT tool_catalog_providers_credentials_secret_id_fk
     FOREIGN KEY (credentials_secret_id) REFERENCES secrets(id);
   ALTER TABLE channel_connections
     ADD CONSTRAINT channel_connections_credentials_secret_id_fk
     FOREIGN KEY (credentials_secret_id) REFERENCES secrets(id);
   ```
   These also need to be added to the Drizzle TS schemas via `.references()` so future generates don't re-emit them. **Schema edits to `tools.ts` and `channels.ts` are explicitly allowed for this purpose** — narrow the edit to the single column. Keep the current migration + the snapshot consistent: after adding `.references()`, drizzle-kit's snapshot will diff; either regenerate the snapshot or hand-authoring is enough as long as journal advances. Pick whichever route keeps the chain reproducible.

4. **All enum-text columns get CHECK constraints** matching the BL-S0-02 spirit + S1-01-fix precedent:
   - `secrets.scope` IN `('workspace','agent','channel')`
   - `webhook_deliveries.delivery_kind` IN `('conversation_completed','batch_completed','call_initiation_failure','audio_ready','transcription_ready')`
   - `audit_log_events.actor_kind` IN `('user','api_key','system')`
   - `workspace_compliance_posture.{hipaa,ferpa,tcpa,eu_ai_act}` each IN `('active','action-required','violation','inactive')`
   - `compliance_evaluations.regulation` IN `('hipaa','ferpa','tcpa','eu-ai-act')`
   - `guardrail_events.action` IN `('blocked','redacted','flagged','escalated')`
   - `billing_subscriptions.plan` IN `('free','starter','pro','business','enterprise')`
   - `billing_subscriptions.status` IN `('trialing','active','past_due','canceled')`
   - `usage_events.kind` IN the 11-tuple per §13:1112-1115 (verify exact strings against §13)
   - `batches.channel_kind` IN the §8 channel_kind tuple — but use a different constraint name (e.g., `batches_channel_kind_check`) to avoid collision with `channel_endpoints` / `channel_connections` checks
   - `batches.vertical` IN `('home-services','appointment-services','education')`
   - `batches.status` IN `('draft','scheduled','running','paused','completed','failed')`
   - `batch_recipients.status` IN `('pending','vetting','dnc','queued','dialing','completed','failed','deferred')`

5. **Soft-delete columns** per §15:1196-1198 — none of the S1-04 tables get `deletedAt` (the §15 list is `agents`, `kb_documents`, `tools`, `organization`, `channel_connections`; secrets/webhooks/billing/etc. are append-only or ephemeral). Confirm.

6. **Append-only semantics** per §15:1206-1210:
   - `audit_log_events`, `usage_events`, `webhook_deliveries`, `compliance_evaluations` are append-only.
   - **Do NOT add UPDATE-blocking triggers** to these — the same rationale as S1-03 (the projector worker / cron writes them; UPDATE may be needed for retry counts on `webhook_deliveries.attemptCount`/`responseStatus`/etc.). Document this decision.

7. **`secrets.ciphertext`** is `bytea NOT NULL` per §11:951.

8. **`monthly_receipts`** UNIQUE `(workspaceId, month)` per §13:1140. `month` is `text` (`'YYYY-MM'`) per §13:1135.

9. **All FKs from §10/§11/§12/§13** present, including:
   - `secrets.workspace_id → organization(id) cascade`, `agent_id → agents(id)` (nullable).
   - `webhooks.workspace_id → organization(id) cascade`.
   - `webhook_deliveries.webhook_id → webhooks(id) cascade`, `conversation_id → conversations(id)`.
   - `audit_log_events.workspace_id → organization(id) cascade`, `actor_user_id → user(id)`, `api_key_id → apikey(id)`.
   - `workspace_compliance_posture.workspace_id → organization(id) cascade` (PK).
   - `compliance_evaluations.workspace_id → organization(id) cascade`.
   - `guardrail_events.conversation_id → conversations(id) cascade`, `turn_id → conversation_turns(id)`, `guardrail_id → agent_guardrails(id)`.
   - `billing_subscriptions.workspace_id → organization(id) cascade` (PK).
   - `usage_events.workspace_id → organization(id) cascade`, `agent_id`, `agent_version_id`, `conversation_id`.
   - `monthly_receipts.workspace_id → organization(id) cascade`.
   - `batches.workspace_id → organization(id) cascade`, `agent_id`, `channel_endpoint_id`, `created_by_user_id`.
   - `batch_recipients.batch_id → batches(id) cascade`, `conversation_id`.

10. **All indexes from §10/§11/§12/§13** present:
    - `webhook_deliveries`: `(webhookId, createdAt desc)`, `(conversationId)` per §11:992.
    - `audit_log_events`: `(workspaceId, createdAt desc)`, `(workspaceId, event, createdAt desc)`, `(resourceKind, resourceId, createdAt desc)` per §11:1025-1027.
    - `usage_events`: three indexes per §13:1124-1126.
    - `monthly_receipts`: `(workspaceId, month desc)` per §13:1142.
    - `batches`: `(workspaceId, status)`, `(workspaceId, scheduledFor)` per §10:914.
    - `batch_recipients`: `(batchId, status)`, `(conversationId)` per §10:935.
    - `secrets`: `(workspaceId, name)` per §11:962. UNIQUE `(workspaceId, agentId, name)`.
    - `webhooks`: `(workspaceId, active)` per §11:976.
    - `compliance_evaluations`: `(workspaceId, regulation, evaluatedAt desc)` per §12:1067.
    - `guardrail_events`: `(conversationId, triggeredAt)` per §12:1085.

11. **Migration applies cleanly**: `bun -F @kuralle/db db:migrate` from S1-03-state to S1-04-state. From-scratch replay reapplies all migrations cleanly (drop public + drizzle schemas, CREATE EXTENSION vector, run db:migrate).

12. **Smoke runner** (`bun packages/db/scripts/smoke-S1-04.ts`):
    - Verify the late FKs exist: query `pg_constraint` for `tool_catalog_providers_credentials_secret_id_fk` and `channel_connections_credentials_secret_id_fk` — both should be present.
    - Insert into `audit_log_events` with `created_at = now()` (within May 2026); query the child partition directly (`SELECT count(*) FROM audit_log_events_2026_05 WHERE id = ...`) and assert the row landed in the May partition.
    - Insert two rows into `monthly_receipts` for the same `(workspace_id, month)` — second must raise unique-violation.
    - Insert with `usage_events.kind = 'bogus'` — must raise the CHECK.
    - Insert with `compliance_evaluations.regulation = 'bogus'` — must raise the CHECK.
    - Smoke green → exit 0.

13. **Type-check + lint green.** No new warnings; `catch (e: unknown)` everywhere.

14. **OpenAPI drift gate** still green; no router changes.

15. **Demo artifacts** captured.

---

## 5. Definition of Done

- [ ] All 15 ACs met.
- [ ] From-scratch reproducibility verified.
- [ ] `bun run check-types --force` green; `bun run lint` 0 errors and **no new warnings**; `bun -F @kuralle/platform test` 53/53; `bun -F server gen:openapi --check` clean.
- [ ] No `--no-verify`, `@ts-ignore`, swallowed errors. No `catch (e: any)`.
- [ ] Atomic commit `[S1-04] cross-cutting tables (...)` with the §3 file list only.
- [ ] Commit body covers: partition DDL approach, composite-PK divergence + rationale, late FK adds, append-only-trigger NON-application rationale, snapshot-vs-hand-author choice, trade-offs.

---

## 6. What NOT to do

- Do NOT pre-create oRPC routers. S1-05.
- Do NOT add the seed. S1-06.
- Do NOT add RLS policies (§3 says secrets has stricter RLS — defer to S5).
- Do NOT add a UPDATE-blocking trigger to the §15-listed append-only tables (see AC 6).
- Do NOT modify `apps/web/`, `apps/server/`, `packages/api/`, `packages/auth/`.
- Do NOT regenerate `apps/server/openapi.json`.
- Do NOT add deps to repo-root `package.json`.
- Do NOT improvise enums. The §10-§13 spec lines are exact.

---

## 7. Demo artifacts

1. `sprints/sprint-1/artifacts/S1-04-partitions.txt` — `psql -d kuralle_dev -U kuralle -c "\d+ audit_log_events"` showing the parent and `\d+ audit_log_events_2026_05` showing the child range.
2. `sprints/sprint-1/artifacts/S1-04-tables.txt` — `\dt` of all S1-04 tables (`secrets`, `webhooks*`, `audit_log_events*`, `workspace_compliance*`, `compliance*`, `guardrail_events`, `billing_*`, `usage_events`, `monthly_receipts`, `batches*`).

---

## 8. Reporting back

Atomic commit, body covering: tables added; partition DDL approach + composite-PK rationale; late FK adds; append-only-trigger NON-application; snapshot-vs-hand-author choice; reproducibility outcome; trade-offs.

No push. No PR.

---

## 9. If you get stuck

- If drizzle-kit insists on emitting the CREATE TABLE for `audit_log_events` (which would conflict with the hand-authored partition DDL): regenerate, then **delete** the auto-emitted CREATE TABLE for `audit_log_events` from the SQL file before committing, and prepend the hand-authored partition DDL. The Drizzle TS schema definition still lets `auditLogEvents.$inferSelect` work.
- If the snapshot diff after late-FK additions is large: prefer hand-authoring the ALTER TABLE in the migration over regenerating; document.
- If the partition routing doesn't actually route in your smoke (insert succeeds but the child shows 0 rows): the partition bounds are likely off — double-check the date math.
- If 2026-05 partition fails to accept a `now()` insert because the project clock is past the bound: extend the partition window (e.g., Jan 2026 → Aug 2026).

Sincere work only. Never claim done without proof.
