# Sprint 1 — Adversarial Review (r2)

> **Reviewer:** codex / gpt-5.3-codex.
> **Inputs:** every story brief, every IC commit, every kimi gate report, manager r1, full sprint diff (12 commits), DATA_MODEL.md sections cited in §1, AMENDMENTs.
> **Verdict:** Strengthen r1.

## 1. Closure of per-story Apply-now items

| Story | Gate verdict | Apply-now count | Closed? | Carry-forward? |
|-------|--------------|------------------|---------|----------------|
| S1-01 | yellow | 6 | Yes (`cc87911`) | None found |
| S1-02 | yellow | 4 | Yes (`9708ee8`) | None found |
| S1-03 | yellow | 6 | Yes (`2ee02e4`) | None found |
| S1-04 | green (optional fix-pass) | 1 | Yes (`6a77ad7`) | None found |
| S1-05 | green | 0 | N/A | None |
| S1-06 | yellow | 3 | Yes (`f8a2f56`) | None found |

## 2. Findings beyond gate + r1

### 2.1 Blockers

1. `packages/db/src/migrations/0010_calm_betty_brant.sql:24-31` defines only May/Jun/Jul 2026 partitions for `audit_log_events`; inserting `created_at='2026-09-01'` fails with `no partition of relation "audit_log_events" found for row`. **Severity: blocker.** Proposed fix: add an ops-owned rolling partition creation job (or migration cadence) plus at least 6-12 months of forward partitions before sprint close.

### 2.2 Majors

1. `DATA_MODEL.md:1206-1209` marks 10 tables append-only, but runtime DB has only one append-only trigger (`agent_versions_no_update`) and no update-blocking triggers on `conversation_turns`, `conversation_tool_calls`, `usage_events`, `webhook_deliveries`, `guardrail_events`, `compliance_evaluations`, `runtime_deployments`, `session_checkpoints`, `audit_log_events` (`information_schema.triggers` shows only `agent_versions_no_update` plus `channel_endpoint_kind_check`). **Severity: major.** Proposed fix: either add explicit `BEFORE UPDATE` append-only triggers for the listed tables or document a formal ADR exception narrowing DATA_MODEL append-only semantics.

2. `packages/api/src/routers/{agents,batches,channels,compliance,conversations,kb,receipts,secrets,tools,voices,webhooks}.ts:11-13` all use `items: z.array(z.unknown())`, and `apps/server/openapi.json:61-71` (same shape repeated across list routes) emits item schema as `anyOf: [{}, {"type":"null"}]`. This makes downstream SDK payload typing effectively unknown despite TS-internal typing. **Severity: major.** Proposed fix: replace `z.unknown()` with explicit Zod item schemas per router before external consumers rely on generated OpenAPI.

### 2.3 Minors

1. `packages/db/src/schema/knowledge.ts:20-22` `fromDriver(value)` assumes non-null and calls `slice`; `embedding` is nullable (`knowledge.ts:70` without `.notNull()`), so null-driver behavior is unchecked in-code and unverified in Drizzle runtime (direct Drizzle runtime check was blocked by local env package resolution). **Severity: minor.** Proposed fix: harden parser to guard null/undefined and add a focused round-trip test in `packages/db` for nullable + populated embeddings.

### 2.4 Nits

1. `.handoff/result-S1-01.txt:16` claims “Unverified: Nothing”, but vector customType runtime decode path was not directly exercised via Drizzle client in sprint automation. **Severity: nit.** Proposed fix: adjust claim language to “schema + SQL verified; Drizzle runtime vector decode pending dedicated test.”

## 3. Cross-cutting concerns

- Migration replay determinism: **Pass.** Reset + `bun -F @kuralle/db db:migrate` applied 0000..0010 cleanly from scratch.
- CHECK completeness: **Pass.** Constraint inventory includes the expected enum CHECK set (61 check constraints total including inherited partition checks and domains).
- OpenAPI surface integrity: **Risk.** `--check` passes for drift, but list item schemas are unknown-shaped (`openapi.json` item `anyOf: [{}, null]`).
- MSW wire-format: **Pass.** `apps/web/src/hooks/api/agents.test.tsx:27-29` returns `{ json: { ... } }`, matching oRPC RPC serializer expectation (`@orpc/client` `StandardRPCSerializer` deserializes `data.json` in `client.DeBTBp5q.mjs:383`).
- Forbidden-import / hexagonal-import lint coverage: **Pass.** `bun run lint` has no import-rule errors; allow-list scan is clean; hex leak grep in `packages/{api,db,core,runtime}` outside tests is empty.
- Personal-org databaseHook regression: **Pass.** `bun -F @kuralle/auth smoke-local` green; DB row confirms `metadata='{"personal":true}'` on personal org.
- Seed safety / idempotency: **Mostly pass.** Deterministic IDs and `ON CONFLICT (id) DO NOTHING` are idempotent; collision risk is low due `_calderon` namespace but still assumes reserved IDs policy.
- Snapshot shape grounding: **Pass.** `seed-calderon.ts:39-78` matches `DATA_MODEL.md:347-365` key set without made-up keys.
- secrets.ciphertext exposure: **Current behavior safe but contract-weak.** `secrets.ts` uses `SecretSafeRow` in handler return type, but OpenAPI output still `z.unknown()` so wire contract does not prove exclusion.
- Vector customType round-trip: **Partially verified.** SQL-level pgvector insert/read works; Drizzle runtime round-trip not executed due local env import blocker.
- Append-only trigger semantics: **Gap.** Current trigger coverage is narrower than DATA_MODEL append-only list.

## 4. Performance / scale concerns

- `kb_chunks_embedding_idx` ivfflat `lists=100` is over-provisioned for current tiny seed volume; acceptable if explicitly treated as deferred S5 tuning debt.
- Monthly partitioning on `audit_log_events` gives little immediate performance benefit at seeded scale, but is structurally fine; the real risk is operational partition rollover, not runtime overhead.

## 5. Honest summary (one paragraph)

Sprint 1 is structurally sound on migration determinism, schema closure, and gate-fix completion, and the required smokes/checks pass after replay. The residual risks are cross-story and production-facing: `audit_log_events` will hard-fail once writes move past July 2026 unless partition rollout is automated, append-only enforcement in DB does not currently match DATA_MODEL’s broader append-only claim, and OpenAPI list payloads remain unknown-shaped for SDK consumers. No forbidden-import or hex-architecture leaks were found, and personal-org metadata regression is fixed and verified. I did not modify code.

## 6. Verdict

`Strengthen r1` — core sprint deliverables are in place, but three production-relevant gaps (future partition coverage, append-only enforcement scope, and OpenAPI typed contract quality) should be closed or explicitly accepted before S1 closeout.

## 7. Apply-now items (for the manager fix-pass)

1. `packages/db/src/migrations/0010_calm_betty_brant.sql:24-31` or new follow-up migration: add forward monthly `audit_log_events` partitions through at least `2027-06`, and add an ops runbook/automation note for monthly partition creation.
2. `packages/db/src/migrations/*` (new migration): add `BEFORE UPDATE` append-only triggers for DATA_MODEL append-only tables, or if intentional, add explicit ADR + DATA_MODEL amendment narrowing which tables are append-only-enforced in DB.
3. `packages/api/src/routers/*.ts:11-13` (all 11 list routers): replace `z.array(z.unknown())` with explicit item schemas so `apps/server/openapi.json` emits typed item objects.
4. `packages/db/src/schema/knowledge.ts:20-22`: make `fromDriver` null-safe and add a regression test that round-trips both `NULL` and non-null vector embeddings through Drizzle.
