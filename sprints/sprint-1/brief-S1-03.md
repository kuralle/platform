# Story Brief — `S1-03` Channels + conversations + runtime sidecars

> **Role.** You are a senior database engineer with deep production experience in Drizzle ORM, Postgres 15, polymorphic schemas, and append-only event-sourced systems. You have shipped CDR/voice-call schemas at the millions-of-rows-per-day scale. You respect schema reproducibility as a first-class concern: every migration must replay cleanly from a `DROP SCHEMA public CASCADE`. You write SQL that other senior engineers nod at on first read — names that say what they mean, indexes placed on the actual hot path, triggers that fire only when they should.
>
> **Mindset.** You read the spec twice before opening an editor. Before guessing a Drizzle API shape (e.g., partial-index `.where()`, mutual FKs, customType signatures), you verify against `node_modules/.bun/.../drizzle-orm/**/*.d.ts` or fetch the live docs via context7. You prefer hand-authored SQL where Drizzle can't speak Postgres natively (CHECK triggers, polymorphic constraints, partial indexes with predicates) — and you document why in the migration file as a comment block AND in the commit body. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is the migration applying on a from-scratch DB and the smoke runner exiting 0 with every assertion green.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (err: unknown)` with `err instanceof Error` narrowing (per S1-01-fix gate finding propagation). No root-`package.json` devDep pollution — scripts live inside `@kuralle/db` which already has `pg`, `drizzle-orm`, `drizzle-kit`. No improvisation on enum tuples — the `DATA_MODEL.md §8 §9` lines you cite are the contract, not your memory of them. No premature abstractions; no speculative extensibility — repository code, Zod schemas, and oRPC routers are S2/S1-05 scope.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2 in full. If anything contradicts what's on disk (e.g., S1-02's actual schema field names differ from this brief's references, or the migration file naming pattern is different from what I expect), **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S1-03] channels + conversations + runtime sidecars`. Do NOT push. One commit per story.

---

## 1. Goal

Drizzle schema for the conversation graph per `DATA_MODEL.md §8 §9 §15`: `channel_connections`, `channel_endpoints` (with denormalised `channelKind` enforced by §15 CHECK trigger), `routing_rules`, `conversations`, `voice_calls`, `messaging_threads`, `conversation_turns` (with messageId dedup), `conversation_tool_calls`, `conversation_extracted_fields`, `conversation_evals` (non-nullable `rubricSnapshot`), `runtime_sessions`, `session_checkpoints`, `runtime_deployments`. All migrate cleanly against `kuralle_dev`.

---

## 2. Required reading

1. `sprints/STATE.md`.
2. `sprints/sprint-1/PLAN.md` (story `S1-03` section).
3. `sprints/WBS.md` § Sprint 1 row `S1-03` (line 117).
4. **`DATA_MODEL.md §8`** lines 560-657 — channels.
5. **`DATA_MODEL.md §9`** lines 661-885 — conversations + runtime sidecars.
6. **`DATA_MODEL.md §15`** lines 1170-1245 — soft-delete, append-only, denormalisation guards.
7. `DATA_MODEL.md §18` — codegen sequence steps 5, 6, 8, 17 (channels, conversations, evals with rubricSnapshot, runtime_deployments).
8. `packages/db/src/schema/auth.ts`, `agents.ts` (post-S1-02), `tools.ts`, `voices.ts` — Drizzle precedent.
9. The S1-01 + S1-02 migration files — for trigger DDL precedent (S1-02 introduced the append-only trigger pattern; S1-03 introduces the polymorphic CHECK trigger).
10. `packages/db/scripts/smoke-S1-01.ts`, `smoke-S1-02.ts` — smoke runner precedent.

---

## 3. Files to create or modify

**Create:**
- `packages/db/src/schema/channels.ts` — `channelConnections`, `channelEndpoints`, `routingRules`.
- `packages/db/src/schema/conversations.ts` — `conversations`, `voiceCalls`, `messagingThreads`, `conversationTurns`, `conversationToolCalls`, `conversationExtractedFields`, `conversationEvals`.
- `packages/db/src/schema/runtime.ts` — `runtimeSessions`, `sessionCheckpoints`, `runtimeDeployments`.
- `packages/db/src/migrations/000X_*.sql` — drizzle-kit emit + hand-authored polymorphic CHECK trigger + any partial/conditional indexes drizzle-kit can't produce.
- `packages/db/scripts/smoke-S1-03.ts` — smoke runner: build a connection→endpoint→conversation→turn chain, verify the CHECK trigger fires on a mismatched `channelKind`, verify the `(conversationId, messageId)` dedup index rejects a duplicate.
- `sprints/sprint-1/artifacts/S1-03-channel-trigger.txt` — psql session showing the polymorphic CHECK trigger raising on a mismatched insert.
- `sprints/sprint-1/artifacts/S1-03-tables.txt` — `\dt public.{conversations,channel_*,routing_rules,voice_calls,messaging_threads,conversation_*,runtime_*,session_checkpoints}` plus `\d+ channel_endpoints` + `\d+ conversation_turns`.

**Modify:**
- `packages/db/src/schema/index.ts` — three new re-exports.
- `packages/db/src/migrations/meta/_journal.json` + new snapshot file.

**Do not touch:**
- Any S1-01 / S1-02 file.
- `packages/db/src/schema/auth.ts` or any landed `0000_*` / `0001_*` / `0002_*` / S1-02's migration.
- Repo-root `package.json` (memory rule).
- Anything outside `packages/db/` and `sprints/sprint-1/`.

---

## 4. Acceptance criteria

1. **Schema verbatim per `DATA_MODEL.md §8 §9`.** All thirteen tables. Exact column names, types, FK targets, ON DELETE policies, defaults, indexes.

2. **`channel_kind` enum CHECK applied** to both `channel_connections.channelKind` and `channel_endpoints.channelKind` columns:
   `CHECK (channel_kind IN ('voice','whatsapp','messenger','instagram','web_chat','sms'))` — exact set per §8 lines 564-571. Reuse the same constraint name pattern as S1-01's `*_check`.

3. **`channel_connections.credentialsSecretId`** is declared `text` only — **no `references()`**. `secrets` lands in S1-04; FK added then. Document the deferral in the commit body.

4. **`channel_endpoints` CHECK** `attached_agent_id IS NOT NULL OR routing_rules_id IS NOT NULL`. Hand-author or use Drizzle's `.check()` if drizzle-kit emits it cleanly.

5. **`channel_endpoints.routingRulesId` ↔ `routing_rules.channelEndpointId` mutual FK.** Like the agents↔agent_versions pattern in S1-02: keep `channel_endpoints.routingRulesId` nullable so an endpoint can exist before any rule is attached. `routing_rules.channelEndpointId` is `notNull` and ON DELETE CASCADE.

6. **§15 polymorphic CHECK trigger** on `channel_endpoints` enforcing `channel_endpoints.channelKind = (SELECT channelKind FROM channel_connections WHERE id = channel_endpoints.connectionId)`. Hand-author:
   ```sql
   CREATE OR REPLACE FUNCTION channel_endpoint_kind_matches() RETURNS TRIGGER AS $$
   DECLARE conn_kind text;
   BEGIN
     SELECT channel_kind INTO conn_kind FROM channel_connections WHERE id = NEW.connection_id;
     IF conn_kind IS NULL THEN
       RAISE EXCEPTION 'channel_endpoint connection_id=% not found', NEW.connection_id
         USING ERRCODE = 'foreign_key_violation';
     END IF;
     IF NEW.channel_kind <> conn_kind THEN
       RAISE EXCEPTION 'channel_endpoint.channel_kind=% does not match channel_connections.channel_kind=%',
         NEW.channel_kind, conn_kind
         USING ERRCODE = 'check_violation';
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER channel_endpoint_kind_check
     BEFORE INSERT OR UPDATE ON channel_endpoints
     FOR EACH ROW
     EXECUTE FUNCTION channel_endpoint_kind_matches();
   ```
   Trigger fires `BEFORE INSERT OR UPDATE`. DELETE is unaffected.

7. **`conversation_turns` dedup**: emit a partial unique index `CREATE UNIQUE INDEX conversation_turns_message_dedup_idx ON conversation_turns (conversation_id, message_id) WHERE message_id IS NOT NULL;` — interprets WBS DoD "with `messageId` dedup index" + §9 comment "de-dup webhook replay". Voice turns have NULL `messageId` so this partial index doesn't constrain them. Document this interpretation in the commit body.

8. **`conversation_evals.rubricSnapshot`** is `text NOT NULL` — non-nullable per §9 line 820 ("locked from v1 to avoid backfill"). Verify your Drizzle emits `NOT NULL`.

9. **All other unique constraints + indexes from §8/§9** present:
   - `channel_endpoints` UNIQUE `(channelKind, identifier)` per §8:624.
   - `conversations` UNIQUE `(workspaceId, threadKey, startedAt)` per §9:702.
   - `conversation_turns` UNIQUE `(conversationId, ordinal)` per §9:768.
   - `runtime_sessions.conversationId` UNIQUE per §9:829.
   - All workspace-scoped indexes from §8:595, §9:704-709, §9:881-884.
   - Partial indexes (`WHERE endedAt IS NULL`, `WHERE terminatedAt IS NULL`, `WHERE status='ready'`): use Drizzle's `.where(sql\`...\`)` — verify it emits the partial index, else hand-author.

10. **Soft-delete columns** on tables §15:1196-1198 lists: `channel_connections.deletedAt` only (in this story; `agents`/`kb_documents`/`tools` already have it; `organization` is in S0). `channel_endpoints` has `releasedAt` instead per §8:623 — that's the DOM concept, not soft-delete. Don't add `deletedAt` to it.

11. **Append-only tables in scope**: §15:1206-1210 lists `conversation_turns`, `conversation_tool_calls`, `session_checkpoints`, `runtime_deployments` (with `terminatedAt`). Do NOT add an append-only trigger to these in this story — they're declared "append-only" semantically, but the actual write path is the projector worker (§14, future). Adding a hard trigger now would block legitimate sink writes. (`agent_versions` got the trigger in S1-02 because its UPDATE path is genuinely never legitimate — config rows. Conversation turns get UPDATE via `deliveryStatus`/`statusUpdatedAt` per §9:757-758, so a UPDATE trigger would break that.) Document this decision in the commit body.

12. **Forward FK considerations**: `conversations.deploymentId` → `runtime_deployments.id`. Both live in this story; declare the FK with `references()`. `conversations.agentVersionId` → `agent_versions(id)` exists from S1-02. `conversations.bundleHash` is a free-text column (no FK; §9:671 — "runtime artifact pin").

13. **Migration applies cleanly**: `bun -F @kuralle/db db:migrate` from S1-02-state to S1-03-state. From-scratch replay (`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT...; db:migrate`) reapplies all of 0000→S1-03 cleanly.

14. **Smoke runner** (`bun packages/db/scripts/smoke-S1-03.ts`):
    - Insert `organization`, `agents`, `agent_versions` (using the pattern from S1-02's smoke).
    - Insert a `channel_connections` (kind='voice'). Insert a matching `channel_endpoints` (kind='voice'). Should succeed.
    - Insert another `channel_endpoints` with the same connection but kind='whatsapp' — must raise `channel_endpoint.channel_kind=whatsapp does not match` from the trigger.
    - Insert a `conversation` + two `conversation_turns` with the same `(conversationId, messageId='wamid.X')` non-NULL — second insert must raise unique-violation. Verify two turns with NULL messageId on the same conversation succeed (voice path).
    - Insert a `conversation` referencing `runtime_deployments`, a `runtime_session`, two `session_checkpoints`. All succeed.
    - Cleanup at end. Exit 0/1.

15. **Type-check + lint green.** `bun run check-types --force`, `bun run lint` (0 errors, no NEW warnings — write `catch (err: unknown)` not `catch (err: any)` per S1-01 gate finding propagation).

16. **OpenAPI drift gate** still green; no router changes.

17. **Demo artifacts** captured.

---

## 5. Definition of Done

- [ ] All 17 ACs met.
- [ ] From-scratch reproducibility verified.
- [ ] `bun run check-types --force` green; `bun run lint` 0 errors and **no new warnings** beyond the 1 pre-existing in `packages/env/src/web.ts`; `bun -F @kuralle/platform test` 53/53; `bun -F server gen:openapi --check` clean.
- [ ] No `--no-verify`, `@ts-ignore`, swallowed errors. **No `catch (e: any)`** — use `catch (err: unknown)` and narrow.
- [ ] Atomic commit `[S1-03] channels + conversations + runtime sidecars` includes only the §3 files.
- [ ] Commit body covers: trigger semantics, dedup-index interpretation, FK deferrals (`credentialsSecretId`), append-only-trigger NON-application rationale, mutual-FK ordering for endpoints↔rules, trade-offs.

---

## 6. What NOT to do

- Do NOT pre-create `secrets`, `webhooks`, `audit_log_events`, etc. — those are S1-04.
- Do NOT add repository code, Zod schemas, oRPC routers — those are S1-05 / S2.
- Do NOT add RLS policies — RLS is S5.
- Do NOT modify `apps/web/`, `apps/server/`, `packages/api/`, `packages/auth/`.
- Do NOT add an append-only trigger to `conversation_turns` / `conversation_tool_calls` / `session_checkpoints` / `runtime_deployments` (see AC 11).
- Do NOT improvise enums. The §8/§9 spec lines are exact.
- Do NOT add `pgEnum` types — match the precedent (text + CHECK).
- Do NOT add deps to repo-root `package.json`.
- Do NOT regenerate `apps/server/openapi.json`.

---

## 7. Demo artifacts

1. `sprints/sprint-1/artifacts/S1-03-channel-trigger.txt` — captured psql session showing:
   - `INSERT INTO channel_endpoints (...) VALUES (... 'voice' ...)` succeeds against a `voice` connection.
   - `INSERT INTO channel_endpoints (...) VALUES (... 'whatsapp' ...)` against the same `voice` connection raises with the trigger's exception message.
2. `sprints/sprint-1/artifacts/S1-03-tables.txt` — `\dt` of new tables + `\d+ channel_endpoints` (showing trigger and CHECK) + `\d+ conversation_turns` (showing dedup partial index).

---

## 8. Reporting back

Atomic commit, body covering: tables added; trigger semantics; dedup-index interpretation; FK deferral on `credentialsSecretId`; append-only trigger NOT applied (and why); reproducibility outcome; trade-offs.

No push. No PR.

---

## 9. If you get stuck

- If drizzle-kit emits the partial unique index inconsistently across runs: hand-author after the `CREATE TABLE`.
- If a from-scratch replay fails due to FK ordering: investigate the ALTER TABLE ADD CONSTRAINT order in the emitted migration; you may need to reorder via hand-edit.
- If a CHECK constraint conflicts with a NOT NULL emit (e.g., `channel_endpoints.channel_kind` becoming non-null AFTER the trigger is created): adjust DDL order so the column is created with NOT NULL + default in `CREATE TABLE`, then add the CHECK, then the trigger.
- If you discover any column name in `0000_legal_vanisher.sql` (auth tables) is a different casing from what I cited: trust the migration file, not me.

Sincere work only. Never claim done without proof.
