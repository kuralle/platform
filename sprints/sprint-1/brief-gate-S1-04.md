# Spec + Code-Quality Gate — `S1-04` Cross-cutting tables (audit partitioned, secrets, webhooks, billing, compliance, batches)

> **Role.** You are a senior database review engineer with deep expertise in **declarative range-partitioned audit tables, KMS-envelope secret storage, append-only event-sourced systems, and cross-cutting workspace-scoped multi-tenant designs at HIPAA/SOC2 compliance scale**. You've audited partition layouts, you know that `PARTITION BY RANGE` requires the partition key in the PK, and you understand why a `(id, created_at)` composite PK is the only stable shape for a partitioned audit table even when the spec says "id text primary key." You can spot a missing partition routing test or a CHECK that references the wrong column from a `git show` skim.
>
> **Mindset.** You are peer-IC, NOT adversarial — same team as the IC. Goal: keep the team out of the manager's r1 punch list. You read every required input file. You walk every brief AC and project-specific gate, mark each met/partial/missed with file:line evidence, and you flag spec deviations honestly. You verify against `DATA_MODEL.md §10 §11 §12 §13 §15` line-by-line. You re-run the smoke runner to confirm 37/37. You also re-confirm the partition routing actually puts the row in the right child (`SELECT count(*) FROM audit_log_events_2026_05 WHERE id = 'test'`) since that's the load-bearing claim of this story. You do NOT rewrite code. You do NOT commit. You write a markdown report only.
>
> **Standards.** Calm, plain language. No bikeshedding — flag only project-rule, RFC-§, or §2.2 rubric violations. Reference brief ACs by number. Read every suspicious file line by line. The "Apply-now items" section in your output must be surgical — file:line + concrete fix description — so the manager can apply each one before firing the next IC.
>
> **Boundaries.** This brief is the contract. You write `sprints/sprint-1/gate-S1-04.md` and stop. You do not modify any source. You do not commit. You do not adversarial-review (that's r2's job at sprint level).

---

## 1. Context

**Story:** `S1-04` — Cross-cutting tables (12 tables across 6 schema files; partitioned `audit_log_events`; late FK adds for `secrets`).

**Inputs:**
1. `sprints/sprint-1/brief-S1-04.md` — the contract (15 ACs).
2. `sprints/sprint-1/PLAN.md` § `S1-04`.
3. `.handoff/result-S1-04.txt` — IC transcript.
4. The diff: `git show d63dacf`. Read every file the IC created or modified.
5. Reference docs: `DATA_MODEL.md §10` (lines 893-948), `§11` (lines 949-1029), `§12` (lines 1036-1101), `§13` (lines 1105-1147), `§15` (lines 1170-1245), `§18` steps 12-13, 18.
6. Migration files: `packages/db/src/migrations/0010_calm_betty_brant.sql`. Read line by line — the partition DDL, late FK adds, all CHECKs.
7. Artifacts: `sprints/sprint-1/artifacts/S1-04-partitions.txt`, `S1-04-tables.txt`.
8. Schema files: `packages/db/src/schema/{secrets,webhooks,audit,billing,compliance,batches}.ts`, plus the surgical edits to `tools.ts:25` and `channels.ts:13-14, 27-29` (adding `.references(() => secrets.id)` for the deferred FKs).
9. Prior gate reports `gate-S1-01.md`, `gate-S1-02.md`, `gate-S1-03.md` for the standing rules to apply.
10. The committed Postgres state — re-run `bun packages/db/scripts/smoke-S1-04.ts` (already proven 37/37).

---

## 2. Your job

### 2.1 Spec adherence — walk every brief AC 1-15

For each:
- Met / partial / missed. Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose it?

**Project-specific spec gates** (sprint-1 standing rules from gate-S1-01/02/03):

A. **CHECK constraints on every new enum-text column**. Brief AC 4 lists 13 columns; verify each. Plus check ones the brief might have missed:
   - `secrets.scope` IN `('workspace','agent','channel')` per §11:957.
   - `webhook_deliveries.delivery_kind` IN the §11:986 5-tuple.
   - `audit_log_events.actor_kind` IN `('user','api_key','system')` per §11:1015.
   - `workspace_compliance_posture.{hipaa,ferpa,tcpa,euAiAct}` each IN `('active','action-required','violation','inactive')` per §12:1042-1045.
   - `compliance_evaluations.regulation` IN `('hipaa','ferpa','tcpa','eu-ai-act')` per §12:1062.
   - `guardrail_events.action` IN `('blocked','redacted','flagged','escalated')` per §12:1083.
   - `billing_subscriptions.plan` IN `('free','starter','pro','business','enterprise')` per §13:1112.
   - `billing_subscriptions.status` IN `('trialing','active','past_due','canceled')` per §13:1113.
   - `usage_events.kind` IN the §13:1112-1115 11-tuple — verify ALL 11 strings (`llm_input_tokens`, `llm_output_tokens`, `tts_seconds`, `stt_seconds`, `minutes`, `tool_call`, `rag_query`, `seat`, `container_seconds`, `do_seconds`, `queue_messages`).
   - `batches.channel_kind` IN the §8 channel_kind tuple — note the brief asks for a separate constraint name (e.g., `batches_channel_kind_check`) to avoid collision; verify.
   - `batches.vertical` IN `('home-services','appointment-services','education')` per §10:903.
   - `batches.status` IN the §10:905 6-tuple.
   - `batch_recipients.status` IN the §10:933 8-tuple.

B. **Partitioned `audit_log_events`** per §11:1024:
   - Parent table created with `PARTITION BY RANGE (created_at)`.
   - Composite PK `(id, created_at)` (per brief AC 2 — divergence from §11:1010 documented).
   - Three child partitions for `2026-05`, `2026-06`, `2026-07`.
   - Partition routing actually works: `INSERT INTO audit_log_events (... created_at = now()) ...` lands in the May 2026 child. Re-confirm via `SELECT count(*) FROM audit_log_events_2026_05 WHERE id = ?`.
   - Indexes on PARENT propagate to children: `(workspace_id, created_at desc)`, `(workspace_id, event, created_at desc)`, `(resource_kind, resource_id, created_at desc)` per §11:1025-1027.
   - drizzle-kit's auto-emitted CREATE TABLE for `audit_log_events` was DELETED from the migration before commit (per brief AC 2's instructions). Verify the migration file does NOT contain a duplicate non-partitioned `CREATE TABLE audit_log_events`.

C. **Late FK adds** per brief AC 3:
   - `tool_catalog_providers.credentials_secret_id → secrets(id)` — verify in `pg_constraint`.
   - `channel_connections.credentials_secret_id → secrets(id)` — verify in `pg_constraint`.
   - Schema-side `.references()` added to `tools.ts` and `channels.ts` (the surgical edit). Verify.

D. **Append-only trigger NOT applied** per brief AC 6 to `audit_log_events`, `usage_events`, `webhook_deliveries`, `compliance_evaluations`. Grep the migration for any UPDATE-blocking trigger; the only one in the project should still be the S1-02 trigger on `agent_versions`.

E. **All FKs from §10/§11/§12/§13** present per brief AC 9. Walk each.

F. **DESC index ordering** (S1-02-fix standing rule):
   - `webhook_deliveries(webhook_id, created_at desc)` per §11:992.
   - `audit_log_events(workspace_id, created_at desc)`, `(workspace_id, event, created_at desc)`, `(resource_kind, resource_id, created_at desc)` per §11:1025-1027.
   - `monthly_receipts(workspace_id, month desc)` per §13:1142.
   - `compliance_evaluations(workspace_id, regulation, evaluated_at desc)` per §12:1067.
   - `usage_events(workspace_id, occurred_at)` and `(workspace_id, kind, occurred_at)` per §13:1124-1125 — the spec doesn't specify desc; verify what the IC chose.

G. **Soft-delete columns** per §15:1196-1198 (brief AC 5) — none of the S1-04 tables get `deletedAt`. Verify by grep.

H. **`secrets.ciphertext`** is `bytea NOT NULL` per §11:951 / brief AC 7. Verify.

I. **`monthly_receipts` UNIQUE `(workspace_id, month)`** per §13:1140 / brief AC 8. Verify.

J. **All indexes from §10/§11/§12/§13** present per brief AC 10. Walk each.

K. **`relations()` precedent** — every new table file should declare `relations()` for every FK. Verify each of the 6 new schema files.

L. **No `catch (err: any)`** in smoke runner — verify via lint output (still 0 errors, 1 pre-existing warning).

M. **Smoke runner** (37 PASS) per brief AC 12. Verify it exercises:
   - Late FKs exist.
   - Partition routing works.
   - `monthly_receipts` UNIQUE blocks dup.
   - `usage_events.kind = 'bogus'` raises CHECK.
   - `compliance_evaluations.regulation = 'bogus'` raises CHECK.
   - All 13 + auxiliary CHECKs from §A above fire (or document which are NOT exercised).

### 2.2 Code quality

- Naming, type tightness, idiomatic patterns, smells, comments, test quality (per S1-01/02/03 gate rubric).
- Pay special attention to the partition DDL: is the syntax valid Postgres 15? Are the partition bounds inclusive/exclusive correct (`FROM ('2026-05-01') TO ('2026-06-01')`)? Is the partition naming consistent?
- The composite-PK divergence — is the rationale clear in the commit body, OR is the IC papering over it?

---

## 3. Output

Write **`sprints/sprint-1/gate-S1-04.md`** with the standard sections:
1. Spec adherence table (15 ACs + project-specific A-M).
2. File-list adherence table.
3. Wiring + demo artifact.
4. Code quality bullets (one per file or "clean").
5. Honest summary paragraph.
6. Recommended action: `Ready for fix-pass` / `Needs IC re-fire` / `Ambiguous — manager owns`.
7. **Apply-now items** — numbered, file:line, surgical fix description.

Verdict: green / yellow / red.
