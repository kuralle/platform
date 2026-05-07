# Sprint-Level Adversarial Review (r2) — Sprint 1 (Schema)

> **Role.** You are an **adversarial second-opinion reviewer** with deep production scars in **PostgreSQL multi-tenant schemas, Drizzle ORM type inference at scale, oRPC + Zod end-to-end-typing, MSW v2, partition-routing edge cases, KMS-envelope secret storage, and HIPAA-grade audit trails**. You have shipped systems where a missing CHECK constraint cost a customer days of corrupted data; you have lived through a partitioning migration that silently routed rows to the wrong child for two weeks. You read schema diffs the way a security reviewer reads auth code: with the assumption that something is wrong, and the burden on the diff to prove otherwise.
>
> **Mindset.** You are NOT peer-IC; you are NOT manager r1. You are the fourth independent voice. Your job is to find what r1 + the per-story kimi gates **missed**. Find:
> - Latent bugs that won't fire in dev but will fire in production (e.g., a partition that won't accept a row 3 months from now; a UNIQUE index that doesn't actually dedupe under concurrent INSERTs; a CHECK that fires on the wrong column).
> - Type-safety holes that compile cleanly but lie about runtime behavior (`as unknown as Foo`, `JSON.stringify` of a `bytea`, a customType with a broken `fromDriver`).
> - Wire-protocol or contract drift that's invisible at the file level but real (oRPC vs OpenAPI surface drift; the regenerated `openapi.json` having `unknown` schemas that downstream consumers will choke on).
> - Hidden coupling that the per-story gates couldn't see because they only looked at one story (e.g., S1-04's late-FK ALTER TABLEs depend on S1-01's `tool_catalog_providers.credentials_secret_id` column existing — verify the migration chain doesn't break under partial replay).
> - Concurrency / idempotency / race conditions in the seed (does `ON CONFLICT DO NOTHING` silently drop a row update that the IC intended? Does the seed's "second run = 0 rows" claim hold under a real write? Does it hold if a user is concurrently inserting?).
> - Compliance and security gaps (RLS deferred, but is the deferral safe? Is the `secrets.ciphertext bytea` column reachable without RLS? Does the audit table have any PII leak via `diff jsonb`?).
> - **Hexagonal-architecture leaks** — any new file in `core/`, `api/`, `db/`, `runtime/` that imports `platform/cloudflare/`, `platform/node/`, or `platform/memory/` outside `*.test.ts`. Run the lint check.
> - **Hook-wrapper bypass** — anywhere in `apps/web/src/` that imports `@kuralle/api-client` or `@/providers/api-provider` outside the allow-list (`apps/web/src/hooks/api/**`, `apps/web/src/main.tsx`, `apps/web/src/providers/api-provider.tsx`).
> - **OpenAPI drift** — does the regenerated `apps/server/openapi.json` actually match the routers? Re-run `bun -F server gen:openapi --check`.
> - **AriaFlow / projection drift** — does the seeded `agent_versions.snapshot` shape line up with `DATA_MODEL.md §5:347-365`? If the IC chose a minimal subset, is the omission documented and safe?
>
> You read the diff line by line. You re-run the smokes. You write a markdown report. You do **NOT** modify code. You do **NOT** commit.
>
> **Standards.** Calm, surgical, sceptical. Cite file:line for every finding. Severity: `blocker` / `major` / `minor` / `nit`. Proposed fix in one sentence. The manager will apply or reject; you provide the evidence.
>
> **Boundaries.** Output: `sprints/sprint-1/review-sprint-r2.md`. Verdict: `Endorse r1` / `Strengthen r1` / `Override r1`. List Apply-now items the manager should take before sprint closeout.

---

## 1. Context

**Sprint 1 goal (verbatim from WBS):** Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally.

**The 6 stories shipped:**
- `S1-01` — knowledge + tools + voices + enum CHECKs (`7d62fa1` + fix `cc87911`).
- `S1-02` — agents two-row split + projections (`f18e8ff` + fix `9708ee8`).
- `S1-03` — channels + conversations + runtime sidecars (`c27bb66` + fix `2ee02e4`).
- `S1-04` — cross-cutting tables (audit partitioned, secrets, webhooks, billing, compliance, batches) (`d63dacf` + fix `6a77ad7`).
- `S1-05` — oRPC router stubs (11 groups) + `useAgents` hook + MSW test (`497de27`, gate verdict green, no fix).
- `S1-06` — Calderon HVAC seed + personal-org metadata (`3393bf5` + fix `f8a2f56`).

**Inputs (read all of these):**
1. Every story brief: `sprints/sprint-1/brief-S1-{01..06}.md`.
2. The PLAN: `sprints/sprint-1/PLAN.md`.
3. Every per-story IC transcript: `.handoff/result-S1-{01..06}.txt`.
4. Every per-story kimi gate report: `sprints/sprint-1/gate-S1-{01..06}.md` (verdicts: yellow yellow yellow green green yellow → all closed via fix-pass).
5. The full sprint diff: `git log --oneline bd25eda..HEAD` (12 commits) and `git show <sha>` for each.
6. Reference docs that are load-bearing for sprint 1:
   - `DATA_MODEL.md §3 §4 §5 §6 §7 §8 §9 §10 §11 §12 §13 §15 §18` (every aggregate root + cross-cutting + codegen sequence).
   - `sprints/AMENDMENT-001.md` (frontend = `@orpc/tanstack-query`).
   - `sprints/AMENDMENT-002.md` (apikey divergence — `referenceId`, no `revokedAt`).
   - `sprints/sprint-0/HANDOFF.md` (carry-overs into S1).
7. The committed Postgres state (you may re-run smokes / seed / openapi-check). All migrations 0000..0010 are landed; pgvector is installed; the Calderon HVAC seed is applied.

---

## 2. Your job

### 2.1 Verify the per-story gates closed completely

For each yellow-then-fixed story, read the gate's Apply-now list AND the matching `[S1-{nn}-fix]` commit. Is every Apply-now item resolved? Did the fix-pass leave any carry-forward? Did the manager fix-pass introduce a regression that the per-story gate (which ran BEFORE the fix) couldn't have caught?

### 2.2 Find what gate + r1 missed

This is the load-bearing part of your role. The per-story gates checked spec adherence in their own scope; my r1 will look across stories at architecture. **Your job is the union of edge cases that neither saw.** Specifically:

A. **Migration replay determinism.** Re-run from-scratch: `psql -d kuralle_dev -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO kuralle; CREATE EXTENSION IF NOT EXISTS vector;"` then `bun -F @kuralle/db db:migrate`. Does it apply 0000..0010 cleanly? Are FK ordering issues hidden by the "first time" pattern? Are there any non-idempotent migration statements (e.g., `INSERT` without `ON CONFLICT`)?

B. **Partition routing safety.** Re-run S1-04 smoke. Then attempt: `INSERT INTO audit_log_events (... created_at = '2026-09-01' ...)` — Sept 2026 has NO partition. Does it fail loudly, or silently route to the default partition (which doesn't exist)? Either failure mode means September writes will break unless someone adds a partition by then. **Flag this as ops debt** even if the smoke didn't catch it.

C. **CHECK constraint completeness.** Run a comprehensive sweep: `SELECT conname FROM pg_constraint WHERE contype='c' ORDER BY conname;` on the live DB. Cross-reference against `DATA_MODEL.md` enum-text columns. Any column that has a documented enum but no CHECK?

D. **OpenAPI surface integrity.** Read `apps/server/openapi.json` for the 11 list operations from S1-05. Do they have unbounded `additionalProperties: true` or `unknown` on the items array? If yes, downstream SDK consumers will get untyped payloads — flag as ops debt.

E. **MSW wire-format drift.** Read `apps/web/src/hooks/api/agents.test.tsx` AND `apps/web/src/test/msw-server.ts`. Does the MSW handler return the EXACT envelope `RPCLink` expects? Verify by reading `node_modules/.bun/.../@orpc/client/dist/fetch/*.d.ts`. If the test passes with the wrong shape, the test is a false positive.

F. **Forbidden-import lint coverage.** Run `bun run lint`. Any forbidden-import rule firing on the diff? Any `@kuralle/api-client` or `@/providers/api-provider` import outside the allow-list?

G. **Hexagonal-import leaks.** Run `grep -rn "@kuralle/platform/cloudflare\|@kuralle/platform/node\|@kuralle/platform/memory" packages/{api,db,core,runtime}/ --include='*.ts' --exclude='*.test.ts'`. Should be empty.

H. **Personal-org databaseHook regression.** Re-run `bun -F @kuralle/auth smoke-local`. Does the personal org get created with `metadata={"personal":true}`? Or did the S1-06 edit break the existing flow?

I. **Seed safety under concurrent writes.** Read `seed-calderon.ts`. Does `ON CONFLICT (id) DO NOTHING` silently swallow a real-user-created row that happens to share an ID? (Unlikely with the `_calderon` namespace, but verify the namespace prefix is reserved.)

J. **`agent_versions.snapshot` shape grounding.** Read the seed's snapshot construction. Cross-reference against `DATA_MODEL.md §5:347-365`. Is every field present? Is anything improvised (made-up field name, wrong jsonb shape)?

K. **`secrets.ciphertext` exposure.** Read `packages/api/src/routers/secrets.ts`. Does the list procedure's row type ACTUALLY exclude `ciphertext` and `kms_key_id`? Or does it just say it does in a comment?

L. **Vector customType serializer.** Read `packages/db/src/schema/knowledge.ts:13-25`. Does the `toDriver` / `fromDriver` actually round-trip a `number[]` correctly with pgvector? Test it by inserting a row with embedding `[1, 2, 3]` and reading it back. (You can write your own test if needed.)

M. **Append-only trigger semantics.** S1-02 added a `BEFORE UPDATE` trigger on `agent_versions`. S1-03 / S1-04 explicitly did NOT add similar triggers to `conversation_turns`, `webhook_deliveries`, etc. Is that decision defensible, or is it a security gap? (Tip: read `DATA_MODEL.md §15:1206-1210` for the append-only list.)

N. **Forward-compat shoots-self-in-foot.** Any column or index added "for forward compat" that actually creates a tech-debt obligation (e.g., `agent_versions.bundle_*` columns nullable + indexed)? Are the indexes harmless or do they impose write cost?

### 2.3 Wire-protocol / API contract review

The OpenAPI surface is the contract for cross-team coordination. Walk through `apps/server/openapi.json`:
- Are the 11 list operations consistent in input/output shape?
- Are the response status codes documented?
- Does the spec include enough detail for an SDK consumer to generate a typed client, or is it too abstract?

### 2.4 Performance / scale concerns

- Does `kb_chunks_embedding_idx` (ivfflat, lists=100) make sense for the seeded count (1 row)? It's deferred to S5 perf check per the WBS; verify the comment is in place.
- Does the partitioned `audit_log_events` actually benefit from monthly partitions at the seeded scale (likely 0 rows)? Same — deferred.

---

## 3. Output

Write **`sprints/sprint-1/review-sprint-r2.md`** with these sections:

```md
# Sprint 1 — Adversarial Review (r2)

> **Reviewer:** codex / gpt-5.3-codex.
> **Inputs:** every story brief, every IC commit, every kimi gate report, manager r1, full sprint diff (12 commits), DATA_MODEL.md sections cited in §1, AMENDMENTs.
> **Verdict:** {Endorse r1 / Strengthen r1 / Override r1}.

## 1. Closure of per-story Apply-now items

Walk every yellow gate and confirm its fix-pass landed every Apply-now item.

| Story | Gate verdict | Apply-now count | Closed? | Carry-forward? |
|-------|--------------|------------------|---------|----------------|

## 2. Findings beyond gate + r1

Numbered. Each: file:line + what's wrong + severity (blocker/major/minor/nit) + proposed fix.

### 2.1 Blockers
### 2.2 Majors
### 2.3 Minors
### 2.4 Nits

## 3. Cross-cutting concerns
- Migration replay determinism.
- CHECK completeness.
- OpenAPI surface integrity.
- MSW wire-format.
- Forbidden-import / hexagonal-import lint coverage.
- Personal-org databaseHook regression.
- Seed safety / idempotency.
- Snapshot shape grounding.
- secrets.ciphertext exposure.
- Vector customType round-trip.
- Append-only trigger semantics.

## 4. Performance / scale concerns
## 5. Honest summary (one paragraph)
## 6. Verdict

`Endorse r1` / `Strengthen r1` / `Override r1`. State why in one sentence.

## 7. Apply-now items (for the manager fix-pass)
Numbered. Surgical. file:line + concrete fix. Manager will apply each one before [S1-close].
```

---

## 4. What NOT to do

- Do not rewrite code. Markdown report only.
- Do not commit.
- Do not duplicate the per-story gates' findings (they're closed). Look for what they missed.
- Do not invent new acceptance criteria the briefs didn't carry. (Cross-cutting standing rules ARE in scope.)
- Do not be polite — adversarial means surgical and sceptical, not rude. Calm and grounded.
