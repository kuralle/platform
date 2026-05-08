# Story Brief — `S3-01` continuation pass (resume from partial)

> **Role.** You are a senior platform engineer (`pi/deepseek-v4-pro` worker — fresh process; clean context window) with deep expertise in **TypeScript ESM, Drizzle ORM + Postgres 15, Zod, oRPC procedure design, Hono webhook handlers, and Meta WhatsApp Cloud API surfaces**. The previous IC pass on this story landed the foundation cleanly (deps, env bindings, thin client, mock factory, migration) but exited before completing the bulk. You are picking up the work and finishing it. **Read what is already on disk before writing one line.**
>
> **Mindset.** You read the spec twice and verify your assumptions against the **installed** library types in `node_modules/.bun/.../*.d.ts` and live docs (`mcp__context7__query-docs`). You verify Drizzle + oRPC + `@ariaflowagents/messaging-meta` API shapes from the actual `.d.ts`. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof. **Proof is `bun run check-types` exit 0, `bun run lint` exit 0, every test suite green, `bun -F server gen:openapi --check` exit 0.** Run them before committing.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)`. **No root `package.json` devDep additions** (memory rule). Named exports only. Zod `.strict()` on every schema. No premature abstractions.
>
> **Boundaries.** Touch only files in §3 below. **Do NOT undo, rewrite, or duplicate the work already on disk** (listed in §1.1). Read every required-reading file in §2.
>
> **CRITICAL: You MUST commit before exiting.** The previous IC didn't commit and left work uncommitted; that ate a session. After running the test chain, stage every modified/created file and `git commit -m "[S3-01] channels: meta connector wizard + env + polymorphic check trigger"`. **Do not stop short of the commit.**

---

## 1. State of the world (what's already done)

### 1.1 Already on disk (uncommitted) — DO NOT REDO

The previous IC pass shipped these. Read them before writing anything else:

- **Deps pinned at `1.0.0`:**
  - `apps/server/package.json` — `@ariaflowagents/{core,messaging,messaging-meta}@1.0.0` added.
  - `packages/runtime/package.json` — same three plus `@kuralle/platform: workspace:*`.
  - `bun.lock` — updated.
- **Alchemy bindings (`packages/infra/alchemy.run.ts`):** five `META_*` env vars + `PUBLIC_BASE_URL` wired (`META_APP_SECRET` and `META_SYSTEM_USER_TOKEN` use `alchemy.secret.env.*`; others use `alchemy.env.*`).
- **Thin client (`packages/runtime/src/clients/meta-whatsapp.ts`):** typed wrapper around `@ariaflowagents/messaging-meta`'s `GraphAPIClient` + `verifySignature`. Exports: `createMetaWhatsAppClient`, `listPhoneNumbers`, `subscribeApp`, `unsubscribeApp`, `verifyHmac` plus types `MetaWhatsAppClientDeps`, `PhoneNumberInfo`, `ListPhoneNumbersOpts`, `SubscribeAppOpts`, `UnsubscribeAppOpts`, `VerifyHmacOpts`. **The actual AriaFlow API is `GraphAPIClient` + `verifySignature` — verbatim from `node_modules/@ariaflowagents/messaging-meta/dist/*.d.ts`. Use these exact names if you need them anywhere else.**
- **Thin client tests (`packages/runtime/src/clients/meta-whatsapp.test.ts`):** vi.mock-based unit tests; happy + failure paths.
- **`packages/runtime/src/clients/index.ts`:** re-exports.
- **`packages/runtime/src/test-utils.ts`:** `mockMetaClient(overrides)` factory returning a stub `MetaWhatsAppClientDeps`. **Use this factory in the integration test.**
- **`packages/runtime/src/index.ts`:** updated to re-export everything from `clients/` + `mockMetaClient`.
- **Migration `packages/db/src/migrations/0013_s3_01_meta.sql`:** renames the polymorphic CHECK trigger to canonical names. **The trigger semantics ALREADY existed in `0008_s1_03_meta.sql` (function `channel_endpoint_kind_matches()` + trigger `channel_endpoint_kind_check`); the new migration renames them to `enforce_channel_endpoint_kind_match()` + `channel_endpoints_kind_match`.** Journal already updated.
- **PLAN, brief, gate brief at `sprints/sprint-3/`:** present.

`bun run check-types` exits 0 against the partial work (8/8 successful). The foundation is solid. You build on top.

### 1.2 What's missing (the bulk you must finish)

The acceptance criteria from `sprints/sprint-3/brief-S3-01.md §4` that are **NOT yet met**:

| # | What's missing |
|---|----------------|
| 4.1 | `ChannelRepository` endpoint-level CRUD methods (`findEndpointById`, `findEndpointsByConnection`, `findEndpointsByKind`, `insertEndpoint`, `softDeleteEndpoint`) + connection-level `findManyByWorkspaceFiltered({ kind? })`. |
| 4.2 | Five oRPC procedures on `channelsRouter`: `list` (existing — add `kind` filter), `connect`, `endpoints.list`, `endpoints.attach`, `endpoints.detach`. Plus `channelConnectionSchema` + rename `channelSchema` → `channelEndpointSchema`. |
| 4.3 | `useTelephony` + `usePhoneNumbers` hook rewrites to use `channels.list({ kind: 'telephony' })`. |
| 4.4 | `getEnv()` shim for tests — `apps/server/src/env.ts` reading `cloudflare:workers` `env` with `process.env` fallback. |
| 4.5 | `connect` handler — opens tx, inserts `secrets` + `channel_connections`, returns `{ connectionId, availablePhoneNumbers }`. |
| 4.6 | `endpoints.attach` — opens tx, inserts `channel_endpoints`, calls `subscribeApp` with `webhookUrl = ${PUBLIC_BASE_URL}/webhooks/meta`. |
| 4.7 | `endpoints.detach` — opens tx, calls `unsubscribeApp`, soft-deletes; idempotent (returns `{ alreadyReleased: true }` on 2nd call). |
| 4.8 | Trigger test in integration test asserts mismatched-kind insert raises a Postgres exception. |
| 4.9 | Frontend hooks (`apps/web/src/hooks/api/channels.ts`) — five hooks per §3 of the parent brief. |
| 4.11 | `apps/server/openapi.json` regenerated; `packages/api-client/src/schema.d.ts` regenerated; drift gate green. |
| 4.12 | Full test chain green. |
| 4.13 | Demo artifact — `sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt`. |

§4.10 (deps pinned) and §4.4-partial (env bindings) and §4.8-partial (migration exists) are met.

---

## 2. Required reading (in this order)

1. `sprints/sprint-3/brief-S3-01.md` — the full original brief. Read every §.
2. `sprints/sprint-3/PLAN.md` — sprint plan; story `S3-01` section + §0 (locked decisions).
3. **`packages/runtime/src/clients/meta-whatsapp.ts`** — the thin client your router will compose with. Read the function signatures.
4. **`packages/runtime/src/test-utils.ts`** — the `mockMetaClient` factory your integration test uses.
5. **`packages/db/src/migrations/0013_s3_01_meta.sql`** — already shipped; just confirm it applies (run `bun -F @kuralle/db migrate:dev` or whatever the project script is — verify in `packages/db/scripts/`). The semantics are unchanged from `0008_s1_03_meta.sql`.
6. `packages/core/src/repositories/channel.ts` — current state: connection-level CRUD only. You add endpoint-level CRUD.
7. `packages/core/src/repositories/channel.test.ts` — mirror this test style.
8. `packages/core/src/repositories/agent.ts:170-225` — the publish path is the **transactional pattern blueprint**. Mirror it for `channels.connect` and `channels.endpoints.attach`.
9. `packages/db/src/schema/channels.ts` — `channel_connections` + `channel_endpoints` Drizzle tables.
10. `packages/db/src/schema/secrets.ts` — `secrets` table; `connect` stores Meta secrets here.
11. `packages/api/src/routers/channels.ts` — currently a `list` stub. You replace with five procedures.
12. `packages/api/src/routers/channels.schemas.ts` — currently exports `channelSchema` (which is actually a channel-endpoint shape). You rename + add `channelConnectionSchema`.
13. `packages/api/src/routers/agents.ts` — five-procedure example pattern. Mirror.
14. `apps/server/src/__tests__/agents.publish.test.ts` — integration-test bootstrap pattern. Mirror.
15. `packages/core/src/test-utils.ts` — `seedWorkspace`. Use it; do NOT raw-`client.query()`-INSERT fixtures.
16. `apps/web/src/hooks/api/agents.ts` — hook-wrapper pattern. Mirror for `channels.ts`.
17. `apps/web/src/hooks/api/conversations.ts` — same.
18. `apps/web/src/hooks/api/telephony.ts`, `apps/web/src/hooks/api/phone-numbers.ts` — current aliases. You rewrite both.
19. `apps/server/src/index.ts` — find the existing `getEnv` pattern (if any) or where Hono mounts; you create `apps/server/src/env.ts`.

---

## 3. Files to create or modify

(Files already on disk from the partial pass — DO NOT modify those except where this list explicitly requires it.)

### Repository layer
- `packages/core/src/repositories/channel.ts` — **expand**:
  - Add `Endpoint` domain interface mirroring `channel_endpoints.$inferSelect`.
  - Add `EndpointInsert`, `EndpointUpdate` interfaces.
  - Add methods: `findEndpointById(endpointId)`, `findEndpointsByConnection(connectionId)`, `findEndpointsByKind(kind: string)`, `insertEndpoint(input: EndpointInsert)`, `softDeleteEndpoint(endpointId)`.
  - Add `findManyByWorkspaceFiltered({ kind?: string, cursor?: string, limit?: number })` for the kind-filtered list.
  - Cache invalidation: `repo:channel_endpoint:<workspaceId>:<endpointId>`.
- `packages/core/src/repositories/channel.test.ts` — **expand**: cache-miss → cache-hit → invalidate-on-update for `findEndpointById`; `findEndpointsByConnection` returns scoped rows; `findEndpointsByKind` filters; `insertEndpoint` invalidates; `softDeleteEndpoint` sets `releasedAt`.
- `packages/core/src/repositories/index.ts` — re-export `Endpoint`, `EndpointInsert`, `EndpointUpdate` if surfaced.

### Router + schemas
- `packages/api/src/routers/channels.schemas.ts` — **rename** `channelSchema` → `channelEndpointSchema`; **add** `channelConnectionSchema` mirroring `channel_connections.$inferSelect`; **add** `availablePhoneNumberSchema = z.object({ phoneNumberId, displayPhoneNumber, qualityRating? }).strict()`.
- `packages/api/src/routers/channels.ts` — **replace** with five procedures (see §1.2 #4.2 for shapes). All input/output Zod with `.strict()`. `connect`/`attach`/`detach` are `protectedProcedure` mutations. Each composes `ChannelRepository` + the thin client (S3-01 partial-pass: `packages/runtime/src/clients/meta-whatsapp.ts`) + `secrets` writes.
- All call sites of the old `channelSchema` name updated.

### Env shim (test substrate)
- `apps/server/src/env.ts` — **new**. Exports `getEnv()` returning a typed object with the runtime env. In production reads from `cloudflare:workers` `env`. In tests (NODE_ENV=test or vitest) falls back to `process.env`. Document in commit body why this exists (vitest doesn't load `cloudflare:workers`).
- All apps/server code that reads env for the new META vars (router handlers) goes through `getEnv()`.

### Frontend hooks
- `apps/web/src/hooks/api/channels.ts` — **new**. Five hooks per §3 of the parent brief.
- `apps/web/src/hooks/api/channels.test.ts` — **new**. RTL + MSW or oRPC test client; happy paths.
- `apps/web/src/hooks/api/telephony.ts` — **rewrite** to call `useChannels({ kind: 'telephony' })`.
- `apps/web/src/hooks/api/phone-numbers.ts` — same.

### Integration test
- `apps/server/src/__tests__/channels.connect.test.ts` — **new**. Wires in-process oRPC + pglite/local-pg + memory KvStore + `mockMetaClient` (from `packages/runtime/src/test-utils.ts`). Steps:
  - `connect` → assert `channel_connections` + `secrets` rows; return matches mockMetaClient stub.
  - `endpoints.attach` → assert `channel_endpoints` row; `subscribeApp` mock called with correct `webhookUrl`.
  - `endpoints.detach` → assert soft-delete; `unsubscribeApp` mock called; second call returns `{ alreadyReleased: true }`.
  - **Trigger test:** attempt to insert `channel_endpoints` with `channel_kind='whatsapp'` against a `channel_connections` of `channel_kind='telephony'`; assert Postgres throws (use the `expect.rejects.toThrow` pattern matching the migration's exception text).

### OpenAPI + api-client
- Run `bun -F server gen:openapi` and commit the regenerated `apps/server/openapi.json`.
- `packages/api-client/src/schema.d.ts` regenerated.

### Demo artifact
- `sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt` — `bun -F server test channels.connect --reporter verbose` output showing the four-step trace.

### What you do NOT touch
- `apps/server/package.json`, `bun.lock`, `packages/runtime/package.json` deps section — the previous pass landed the right pins. Only touch if `bun install` reveals a missing dep.
- `packages/infra/alchemy.run.ts` — bindings are correct.
- `packages/runtime/src/clients/*` — the thin client + tests are good.
- `packages/runtime/src/test-utils.ts` — mock factory is good. **However** the type returned by `mockMetaClient` is `MetaWhatsAppClientDeps` which only carries `graphApi`. If the integration test needs a higher-level mock surface (e.g., `metaClient.listPhoneNumbers(...)` directly), you may extend the factory — but mirror the shape so the router uses the same call-site whether real or mocked.
- `packages/db/src/migrations/0013_s3_01_meta.sql` — already correct.
- `packages/runtime/src/index.ts` — re-exports already added.

---

## 4. Acceptance criteria — verify each before commit

The full §4 list lives in `sprints/sprint-3/brief-S3-01.md`. The CRITICAL ones for this pass:

1. ChannelRepository expansion landed (criterion 4.1).
2. Five oRPC procedures with `.strict()` Zod schemas (4.2).
3. `channels.list({ kind: 'telephony' })` works; `useTelephony`/`usePhoneNumbers` rewritten (4.3).
4. `getEnv()` shim in place; tests inject env via `process.env` (4.4 partial).
5. Connect/attach/detach handlers transactional + Meta-API-mocked (4.5–4.7).
6. Trigger test asserts Postgres rejects mismatched kind (4.8).
7. `apps/web/src/hooks/api/channels.ts` is the only file in `apps/web/` importing `@kuralle/api-client` (verify `grep -r '@kuralle/api-client' apps/web/src/ | grep -v 'hooks/api'` returns empty) (4.9).
8. OpenAPI regenerated; full row-shape outputs; drift gate green (4.11).
9. Full test chain green: `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test`, `bun -F server test`, `bun -F web test`, `bun -F server gen:openapi --check` (4.12).
10. Demo artifact at `sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt` (4.13).

---

## 5. When you're done — COMMIT FIRST, EXIT SECOND

```bash
bun install --frozen-lockfile && \
bun run check-types --force && \
bun run lint && \
bun -F @kuralle/core test && \
bun -F @kuralle/runtime test && \
bun -F server test && \
bun -F web test && \
bun -F server gen:openapi --check
```

Every command exits 0. Then:

```bash
git add packages/core/src/repositories/channel.ts \
        packages/core/src/repositories/channel.test.ts \
        packages/core/src/repositories/index.ts \
        packages/api/src/routers/channels.ts \
        packages/api/src/routers/channels.schemas.ts \
        apps/server/src/env.ts \
        apps/server/src/__tests__/channels.connect.test.ts \
        apps/server/openapi.json \
        packages/api-client/src/schema.d.ts \
        apps/web/src/hooks/api/channels.ts \
        apps/web/src/hooks/api/channels.test.ts \
        apps/web/src/hooks/api/telephony.ts \
        apps/web/src/hooks/api/phone-numbers.ts \
        sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt \
        apps/server/package.json apps/server/.env.example \
        bun.lock \
        packages/db/src/migrations/0013_s3_01_meta.sql \
        packages/db/src/migrations/meta/_journal.json \
        packages/infra/alchemy.run.ts \
        packages/runtime/package.json \
        packages/runtime/src/index.ts \
        packages/runtime/src/clients/index.ts \
        packages/runtime/src/clients/meta-whatsapp.ts \
        packages/runtime/src/clients/meta-whatsapp.test.ts \
        packages/runtime/src/test-utils.ts \
        sprints/sprint-3/PLAN.md \
        sprints/sprint-3/brief-S3-01.md \
        sprints/sprint-3/brief-gate-S3-01.md \
        sprints/sprint-3/brief-S3-02.md \
        sprints/sprint-3/brief-S3-01-continuation.md
```

(If a file isn't in your modified list, drop it from `git add`. The above is exhaustive — verify against `git status` first.)

Then commit:
```bash
git commit -m "[S3-01] channels: meta connector wizard + env + polymorphic check trigger"
```

Commit body should include:
- One bullet per acceptance criterion confirming met / partial / missed.
- `@ariaflowagents/messaging-meta` API names actually used (verbatim from `.d.ts`): `GraphAPIClient`, `verifySignature`.
- Note: the polymorphic CHECK trigger was already in `0008_s1_03_meta.sql`; `0013_s3_01_meta.sql` only renames it to canonical names. Verbatim semantics.
- Acknowledgement that the previous IC pass shipped the foundation; this pass completes the bulk.

**If any test fails: do NOT commit a partial story. Stop, name what's blocking, ask. Manager will salvage.**
