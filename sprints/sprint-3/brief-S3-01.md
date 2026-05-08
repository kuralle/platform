# Story Brief — `S3-01` `ChannelRepository` expansion + Meta connector wizard half + env

> **Role.** You are a senior platform engineer (`pi/deepseek-v4-pro` worker — fresh process for this story; clean context window) with deep expertise in **TypeScript ESM, Drizzle ORM + Postgres 15, Zod, Hono, oRPC procedure design, and Cloudflare Workers env-binding patterns (Alchemy)**. You have shipped chat-platform connector flows in production (Twilio, Meta WhatsApp Cloud API, Slack); you understand Meta's Embedded Signup + webhook subscribe semantics, you respect HMAC verification as correctness not performance, and you write code other senior engineers nod at on first read.
>
> **Mindset.** You read the spec twice before opening an editor. You verify your assumptions against the **installed** library types — `node_modules/.bun/.../@ariaflowagents/messaging-meta/dist/*.d.ts`, `node_modules/.bun/.../drizzle-orm/.../*.d.ts`, `node_modules/.bun/.../@orpc/server/*.d.ts` — and live docs (`mcp__context7__query-docs`) before guessing. You prefer the smallest correct surface over speculative extensibility. You never silently bypass a constraint, never commit `--no-verify`, never claim "done" without proof — proof is `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F server test`, `bun -F web test`, and `bun -F server gen:openapi --check` exiting 0 in sequence.
>
> **Standards.** No `--no-verify`. No `@ts-ignore`. No `catch (e: any)` — `catch (e: unknown)` with `instanceof Error` narrowing. **No root `package.json` devDep additions** (memory rule — user reverts silently). No `default export` for libraries; named exports only. Use `import type` for type-only imports. Zod `.strict()` on every input/output schema. No premature abstractions; no speculative extensibility.
>
> **Boundaries.** This brief is the contract. Touch only files in §3. Read every required-reading file in §2. If anything contradicts what's on disk, **stop and ask** — don't guess and don't paper over.
>
> **Atomic-commit policy.** When done, stage every file you create / modify and commit atomically with `[S3-01] channels: meta connector wizard + env + polymorphic check trigger`. Do NOT push. One commit per story. Manager handles `[S3-01-fix]` after the kimi gate review.

---

## 1. Goal

Ship the WhatsApp connector half of the M5 wizard. Five oRPC procedures (`channels.connect`, `channels.list` (existing — expand with `kind` filter), `channels.endpoints.list`, `channels.endpoints.attach`, `channels.endpoints.detach`) compose `ChannelRepository` + `@ariaflowagents/messaging-meta`'s WhatsApp Cloud API client + `secrets` storage to land:
- A `channel_connections` row (`provider = 'meta-whatsapp-cloud'`) on `connect`.
- A `channel_endpoints` row (`channelKind = 'whatsapp'`, `identifier = phoneNumberId`) on `attach`, with the Meta webhook auto-registered to `${PUBLIC_BASE_URL}/webhooks/meta`.
- A soft-delete on `detach` plus an `unsubscribe` Graph API call.

Add the four `@ariaflowagents/*` deps in the right packages. Wire the five `META_*` env vars into Alchemy bindings + `.env` examples. Hand-author migration `0013_s3_01_meta.sql` enforcing the polymorphic CHECK between `channel_endpoints.channelKind` and its parent `channel_connections.channelKind`. Replace the `useTelephony` / `usePhoneNumbers` aliases with `channels.list({ kind: 'telephony' })` (closes `BL-S2-TELEPHONY-CHANNEL-FILTER`).

---

## 2. Required reading (in this order)

Read these files **in full** before touching code. They are the contract.

1. `sprints/STATE.md` — confirms sprint 3 is active.
2. `sprints/sprint-3/PLAN.md` — full sprint plan; story `S3-01` section is the spec; **§0 locks the AriaFlow + Meta env + Cloudflare decisions**.
3. `sprints/WBS.md` § Sprint 3 → row `S3-01` (around lines 170).
4. `sprints/sprint-2/HANDOFF.md` — read-me-first traps for sprint 3. Especially:
   - Hooks-only frontend access rule.
   - OpenAPI is the contract (`bun -F server gen:openapi --check`).
   - `useTelephony` / `usePhoneNumbers` rewrite is owed in this story.
   - Migration discipline going forward (drizzle-kit-generate for typed diffs; hand-authored `_meta.sql` siblings for CHECKs / triggers / partitions / RLS).
5. `DATA_MODEL.md §8` — channels (`channel_connections`, `channel_endpoints`).
6. **`DATA_MODEL.md §15`** — append-only enforcement scope clarification + the *polymorphic CHECK trigger* requirement on `channel_endpoints.channelKind ↔ channel_connections.channelKind` (this is what `0013_s3_01_meta.sql` implements).
7. `USER_JOURNEYS.md §5 (3b)` — the M5 connector wizard for WhatsApp; user flow that `channels.connect → endpoints.list → attach` reproduces server-side.
8. `USER_JOURNEYS.md §9b` — the WhatsApp messager journey.
9. `HEXAGONAL_ARCHITECTURE.md §1` — Anti-Corruption Layer concept; `channels.connect` calls `@ariaflowagents/messaging-meta` outside the domain — wrap it through a typed thin client interface so the test seam is clean.
10. `packages/core/src/repositories/channel.ts` — current state (`findById`, `findManyByWorkspace`, `insert`, `update`, `softDelete` for `channel_connections`). You expand with endpoint-level CRUD and add the kind-filter parameter.
11. `packages/core/src/repositories/channel.test.ts` — current tests. Mirror this style.
12. `packages/db/src/schema/channels.ts` — `channel_connections` + `channel_endpoints` Drizzle tables (the unique index `channel_endpoints_kind_identifier_uidx` is already there — don't re-add).
13. `packages/api/src/routers/channels.ts` — current router (only `list` returns a stub). You replace with 5 procedures.
14. `packages/api/src/routers/channels.schemas.ts` — current `channelSchema` (mirrors `channel_endpoints.$inferSelect`). You add `channelConnectionSchema` and align/rename so the shapes match Meta + telephony semantics.
15. **`packages/db/src/migrations/`** — current head is `0012_s2_05_usage_events_slo.sql`. Next number is **0013**. Naming convention from `0005_s1_02_meta.sql` and `0008_s1_03_meta.sql`: `0013_s3_01_meta.sql` for hand-authored CHECK + trigger.
16. `packages/db/src/schema/secrets.ts` — secrets table; `connect` stores `META_APP_SECRET` + `META_SYSTEM_USER_TOKEN` in the secrets table and references `credentialsSecretId` on the `channel_connections` row.
17. `packages/infra/alchemy.run.ts` — Alchemy `Worker("server", { bindings: { ... } })`. You add five `META_*` bindings here (`alchemy.secret.env.META_APP_SECRET!`, `alchemy.secret.env.META_SYSTEM_USER_TOKEN!`, `alchemy.env.META_APP_ID!`, `alchemy.env.META_VERIFY_TOKEN!`, `alchemy.env.META_PHONE_NUMBER_ID!`). The `CloudflareEnv` type flows through `packages/env/env.d.ts` automatically.
18. `packages/env/src/server.ts` — re-exports `cloudflare:workers`'s `env`. No change needed unless you need a runtime fallback for `bun -F server test` (vitest doesn't load `cloudflare:workers`); document the test-time approach in commit body.
19. `apps/server/src/__tests__/agents.publish.test.ts` — example integration test against in-process oRPC + pglite/local-pg. Mirror its bootstrap pattern (`seedWorkspace`).
20. `packages/core/src/test-utils.ts` — `seedWorkspace` helper (already exists post-S2). Use it; do **not** raw-`client.query()`-INSERT fixtures (memory rule).
21. `apps/web/src/hooks/api/conversations.ts`, `apps/web/src/hooks/api/agents.ts` — existing hook-wrapper patterns. Match this style for `apps/web/src/hooks/api/channels.ts`.
22. `apps/web/src/hooks/api/telephony.ts`, `apps/web/src/hooks/api/phone-numbers.ts` — current aliases of `channels.list` with no filter. You rewrite both to use `channels.list({ kind: 'telephony' })`.
23. `eslint.config.mjs` — verify the `no-restricted-imports` (drizzle from routers) rule + the `forbidden-mock-import` rule + the hexagonal `no-restricted-imports` rule are wired; nothing changes here this story.
24. `apps/server/openapi.json` — current canonical contract (17 ops); regenerated automatically by `bun -F server gen:openapi`.
25. **Verify the `@ariaflowagents/messaging-meta` API surface** — before writing any `connect` handler, run `cat node_modules/@ariaflowagents/messaging-meta/dist/*.d.ts` (or the equivalent paths after `bun install` lands the dep) and read the actual `WhatsAppCloudClient` (or whatever the canonical class/factory name is). The brief asks you to call `listPhoneNumbers`, `subscribeApp`, `unsubscribeApp` — if the actual surface uses different method names, **adopt the actual names verbatim** and document the mapping in the commit body. Do NOT invent method names.

---

## 3. Files to create or modify

(If a file you need is missing from this list, stop and flag — don't silently add to scope.)

### Repository layer (`packages/core/`)
- `packages/core/src/repositories/channel.ts` — expand with:
  - `Endpoint` domain interface mirroring `channel_endpoints.$inferSelect`.
  - `EndpointInsert` / `EndpointUpdate` interfaces.
  - `findEndpointById(endpointId): Promise<Endpoint | null>` (cached as `repo:channel_endpoint:<workspaceId>:<endpointId>`).
  - `findEndpointsByConnection(connectionId): Promise<Endpoint[]>`.
  - `findEndpointsByKind(kind: string): Promise<Endpoint[]>` (used by `useTelephony`).
  - `insertEndpoint(input: EndpointInsert): Promise<Endpoint>` — standard insert + cache-invalidate.
  - `softDeleteEndpoint(endpointId): Promise<void>` — sets `releasedAt = now()`; cache-invalidate.
  - Existing `Channel` (= `channel_connections`) methods stay; add a `findManyByWorkspaceFiltered({ kind?: string })` variant that filters on `channelKind` when provided.
- `packages/core/src/repositories/channel.test.ts` — mirror existing happy + failure tests for the new methods. Cache-miss → cache-hit → invalidation contract MUST be exercised on `findEndpointById`.
- `packages/core/src/repositories/index.ts` — re-export `Endpoint`, `EndpointInsert`, `EndpointUpdate` if they're surfaced externally.

### Router + schemas (`packages/api/`)
- `packages/api/src/routers/channels.ts` — replace with the five procedures. Each MUST use explicit Zod input + output schemas. `connect`, `endpoints.attach`, `endpoints.detach` are **mutations** (oRPC `protectedProcedure` mutations, not queries). `connect` opens a Drizzle transaction: insert `secrets` row → insert `channel_connections` row pointing at it → return `{ connectionId, availablePhoneNumbers }`. **The Meta API call (list phone numbers) happens inside the transaction is acceptable here because it's read-only, but the signed-request validation happens before the tx starts — this MUST be explicit in the code with a comment stating why.**
- `packages/api/src/routers/channels.schemas.ts` — rename existing `channelSchema` to `channelEndpointSchema` (semantic accuracy); add `channelConnectionSchema` mirroring `channel_connections.$inferSelect`; add `availablePhoneNumberSchema = z.object({ phoneNumberId, displayPhoneNumber, qualityRating? }).strict()`. Update all imports.
- `packages/api/src/index.ts` (or wherever the appRouter lives) — verify `channelsRouter` is registered.

### Anti-Corruption thin client (`packages/runtime/src/clients/`)
- `packages/runtime/src/clients/meta-whatsapp.ts` (new) — typed thin wrapper around `@ariaflowagents/messaging-meta`'s WhatsApp client. Exposes `listPhoneNumbers(opts)`, `subscribeApp(opts)`, `unsubscribeApp(opts)`, `verifyHmac(opts)` (the last is used by S3-03; ship the export now so S3-03 doesn't reach into another package). The `connect` router handler imports from here, NOT directly from the AriaFlow package — this is the test seam the gate will look for.
- `packages/runtime/src/clients/meta-whatsapp.test.ts` (new) — unit-level tests against a `vi.mock('@ariaflowagents/messaging-meta', ...)` stub.
- `packages/runtime/src/clients/index.ts` (new) — public re-exports.
- `packages/runtime/src/test-utils.ts` (new) — exports `mockMetaClient(overrides)` factory returning a stub `WhatsAppClient` with `vi.fn()` methods. This is what router integration tests use.
- `packages/runtime/src/index.ts` — re-export `clients/`.

### Env (Alchemy + `.env.example`)
- `packages/infra/alchemy.run.ts` — add five `META_*` bindings to the `server` Worker:
  - `META_APP_ID: alchemy.env.META_APP_ID!,`
  - `META_APP_SECRET: alchemy.secret.env.META_APP_SECRET!,`
  - `META_SYSTEM_USER_TOKEN: alchemy.secret.env.META_SYSTEM_USER_TOKEN!,`
  - `META_VERIFY_TOKEN: alchemy.env.META_VERIFY_TOKEN!,`
  - `META_PHONE_NUMBER_ID: alchemy.env.META_PHONE_NUMBER_ID!,`
- `apps/server/.env.example` (new if missing, else extend) — placeholders for all five `META_*` vars + the existing CORS/BETTER_AUTH/DATABASE_URL pattern. Also include `PUBLIC_BASE_URL` if not already present (used by `attach` to compute the webhook URL).
- `.env.example` at repo root if there's a project-wide one — sync the additions.
- `packages/env/env.d.ts` — verify the `CloudflareEnv` flow works after the alchemy bindings change; nothing to edit unless you discover the type doesn't refresh automatically.
- For tests: vitest doesn't load `cloudflare:workers`. The integration test must inject `META_*` via `process.env` in the test setup file (`apps/server/src/__tests__/setup.ts` if it exists, else create) and the production code path must read env via a single `getEnv()` shim that prefers `cloudflare:workers` `env` and falls back to `process.env` — extracted to `apps/server/src/env.ts` so the test substrate works without bypassing the discipline. Document the shim in commit body.

### Deps
- `apps/server/package.json` — add `@ariaflowagents/messaging@1.0.0`, `@ariaflowagents/messaging-meta@1.0.0`, `@ariaflowagents/core@1.0.0`. Verify exact pin via `bun pm view @ariaflowagents/<pkg> version` before committing (latest stable is 1.0.0 as of 2026-05-08).
- `packages/runtime/package.json` — add `@ariaflowagents/messaging-meta@1.0.0`, `@ariaflowagents/messaging@1.0.0`, `@ariaflowagents/core@1.0.0`. (S3-02 will need core; landing all three here is fine since the client wraps messaging-meta which transitively pulls them.)
- Root `package.json` — DO NOT add deps. If `bun install` complains about workspace catalog mismatches, surface that as a flag, don't paper over.

### Migration
- `packages/db/src/migrations/0013_s3_01_meta.sql` (new) — hand-authored `_meta.sql`. Adds:
  - A `BEFORE INSERT OR UPDATE` trigger function `enforce_channel_endpoint_kind_match()` that raises `EXCEPTION` when `NEW.channel_kind` does not equal the parent `channel_connections.channel_kind` (lookup by `connection_id`).
  - A trigger `channel_endpoints_kind_match` on `channel_endpoints` invoking the function.
  - A migration journal entry consistent with `_journal.json` format used by drizzle-kit (verify the existing journal — IC reads it before naming the migration).
- Run the migration locally against the dev DB (`bun -F @kuralle/db migrate` or whatever the script is — verify in `packages/db/scripts/`) and verify it applies cleanly. Capture into `sprints/sprint-3/artifacts/S3-01-migration-apply.txt`.

### Frontend hooks (`apps/web/src/hooks/api/`)
- `apps/web/src/hooks/api/channels.ts` (new) — five hook wrappers:
  - `useChannels(opts?: { kind?: string })` → `channels.list`
  - `useChannelEndpoints(connectionId: string)` → `channels.endpoints.list`
  - `useConnectMetaChannel()` → mutation around `channels.connect`
  - `useAttachEndpoint()` → mutation around `channels.endpoints.attach`
  - `useDetachEndpoint()` → mutation around `channels.endpoints.detach`
  Each invalidates the right query keys after success. Use `@orpc/tanstack-query` per AMENDMENT-001.
- `apps/web/src/hooks/api/telephony.ts` — rewrite to call `useChannels({ kind: 'telephony' })` instead of `useChannels()` with no filter.
- `apps/web/src/hooks/api/phone-numbers.ts` — same rewrite.
- `apps/web/src/hooks/api/channels.test.ts` (new) — RTL + MSW or oRPC test client; happy path of each hook.

### OpenAPI + api-client
- `apps/server/openapi.json` — regenerated; do NOT hand-edit. Run `bun -F server gen:openapi` and commit the diff.
- `packages/api-client/src/schema.d.ts` — regenerated.

### Integration test
- `apps/server/src/__tests__/channels.connect.test.ts` (new) — wires in-process oRPC + pglite/local-pg + memory KvStore + `mockMetaClient`. Calls `channels.connect → endpoints.list → endpoints.attach → endpoints.detach`; asserts row inserts/deletes + cache invalidation. Match the bootstrap pattern of `agents.publish.test.ts`.

---

## 4. Acceptance criteria (numbered, in priority order)

1. `ChannelRepository` exposes `findEndpointById`, `findEndpointsByConnection`, `findEndpointsByKind`, `insertEndpoint`, `softDeleteEndpoint`, plus the existing connection-level methods. All write methods invalidate the right cache keys after the op completes (test asserts the contract — cache miss → DB hit → cache stored → DB write → cache deleted → next find = miss).
2. Five oRPC procedures on `channelsRouter`: `list` (with `kind` filter), `connect`, `endpoints.list`, `endpoints.attach`, `endpoints.detach`. Each has explicit Zod input + output schemas with `.strict()`.
3. `channels.list({ kind: 'telephony' })` returns only telephony connections; the result is consumed by `useTelephony` + `usePhoneNumbers` (closes `BL-S2-TELEPHONY-CHANNEL-FILTER`).
4. The five `META_*` env vars are wired through Alchemy bindings + `.env.example`s. `PUBLIC_BASE_URL` is also wired if not already present. `getEnv()` shim works in both `cloudflare:workers` and `process.env` (test) substrates.
5. `connect` opens a Drizzle transaction, inserts a `secrets` row holding `META_APP_SECRET` + `META_SYSTEM_USER_TOKEN`, inserts a `channel_connections` row pointing at it, calls `mockMetaClient.listPhoneNumbers(...)`, returns `{ connectionId, availablePhoneNumbers }`. On any failure inside the tx, the secret + connection are rolled back.
6. `endpoints.attach({ connectionId, phoneNumberId, agentId })` opens a tx, inserts `channel_endpoints`, calls `metaClient.subscribeApp({ phoneNumberId, webhookUrl: '${PUBLIC_BASE_URL}/webhooks/meta' })`, commits. On Meta-API failure, the tx rolls back. `publicWebhookUrl` is persisted on the row.
7. `endpoints.detach({ endpointId })` opens a tx, calls `metaClient.unsubscribeApp(...)`, soft-deletes the endpoint (`releasedAt = now()`), commits. Idempotent — second call on a soft-deleted endpoint returns `{ alreadyReleased: true }`.
8. **Polymorphic CHECK trigger** (`0013_s3_01_meta.sql`) prevents an INSERT into `channel_endpoints` with `channel_kind = 'whatsapp'` when its parent `channel_connections.channel_kind = 'telephony'`. A test in `apps/server/src/__tests__/channels.connect.test.ts` (or a dedicated migration test) asserts the trigger fires by attempting an invalid insert and catching the Postgres error.
9. **Hooks-only frontend access** — `apps/web/src/hooks/api/channels.ts` is the only file in `apps/web/` importing from `@kuralle/api-client` (per ESLint forbidden-import rule). All M5/D2 screens that reach for channels go through the hooks.
10. `@ariaflowagents/messaging-meta@1.0.0`, `@ariaflowagents/messaging@1.0.0`, `@ariaflowagents/core@1.0.0` are pinned in `apps/server/package.json` AND `packages/runtime/package.json`. Root `package.json` is unchanged (memory rule).
11. **OpenAPI + drift gate green** — `bun -F server gen:openapi --check` passes; `apps/server/openapi.json` shows full Zod row-shapes for all five channel ops; `packages/api-client/src/schema.d.ts` is regenerated.
12. **Tests green:** `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test`, `bun -F server test`, `bun -F web test`, `bun -F server gen:openapi --check` all exit 0. The new `channels.connect.test.ts` covers the four-step happy path + the polymorphic-CHECK trigger failure path.
13. **Demo artifact:** `sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt` — vitest verbose output of `channels.connect.test.ts` showing the four-step trace with cache-invalidation lines visible. Plus `sprints/sprint-3/artifacts/S3-01-migration-apply.txt` for the trigger migration.

---

## 5. What NOT to do (anti-scope to prevent drift)

- Do **not** ship the actual webhook handler at `apps/server/src/webhooks/meta.ts`. That's S3-03. You ship the `verifyHmac` export on the thin client so S3-03 has the seam, but the route handler itself is out of scope.
- Do **not** ship the `MessagingDO` or `wrangler.jsonc`. S3-03.
- Do **not** ship the projector worker or queue producer wiring. S3-04.
- Do **not** rename or reshuffle existing `channels.list` semantics beyond adding the optional `kind` filter — existing callers must keep working without changes (the rewrite is additive).
- Do **not** delete the old `useTelephony` / `usePhoneNumbers` aliases — rewrite them in place so import sites don't break.
- Do **not** introduce a new oRPC procedure for `useTelephony` — `channels.list({ kind: 'telephony' })` is the contract.
- Do **not** edit `apps/server/openapi.json` by hand. Always regenerate.
- Do **not** add deps to root `package.json` (memory rule).
- Do **not** raw-`client.query()`-INSERT fixtures. Use `seedWorkspace` from `@kuralle/core/test-utils`.
- Do **not** invent `WhatsAppCloudClient` method names — use whatever `@ariaflowagents/messaging-meta`'s `.d.ts` actually exposes. If the surface doesn't fit the brief's expected names (`listPhoneNumbers`, `subscribeApp`, `unsubscribeApp`, `verifyHmac`), adopt the actual names and document the mapping.
- Do **not** silently change AMENDMENT-002 (`apikey.organizationId → referenceId`) or any RFC. If you find a contradiction, stop and flag.
- Do **not** push to remote.

---

## 6. Test plan (you author)

Use `seedWorkspace` from `@kuralle/core/test-utils`. The test substrate matches S2 (pglite or local-pg per repo convention; verify which is wired and use the same).

- **Repo unit (`packages/core/src/repositories/channel.test.ts`):**
  - findEndpointById cache-miss → cache-hit → invalidate-on-update.
  - findEndpointsByConnection returns rows for a given connection only.
  - findEndpointsByKind filters correctly.
  - insertEndpoint inserts + invalidates cache.
  - softDeleteEndpoint sets `releasedAt`.
- **Router integration (`apps/server/src/__tests__/channels.connect.test.ts`):**
  - `connect` → assert `channel_connections` + `secrets` rows; `availablePhoneNumbers` returned matches `mockMetaClient.listPhoneNumbers` stub return.
  - `endpoints.list` → returns the endpoint count for the connection.
  - `endpoints.attach` → `channel_endpoints` row inserted; `mockMetaClient.subscribeApp` called with `webhookUrl = ${PUBLIC_BASE_URL}/webhooks/meta`.
  - `endpoints.detach` → soft-deleted; `mockMetaClient.unsubscribeApp` called; second call on the same endpoint returns `{ alreadyReleased: true }`.
  - Trigger test: attempt to insert a `channel_endpoints` row with mismatched `channel_kind`; assert Postgres throws.
- **Hook unit (`apps/web/src/hooks/api/channels.test.ts`):**
  - `useChannels` happy path; `kind` filter passed through.
  - Each mutation invalidates the right query keys.

---

## 7. When you're done

Run:
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
All exit 0. Then `git add` every file in §3 and:
```
git commit -m "[S3-01] channels: meta connector wizard + env + polymorphic check trigger"
```
Your commit body should include:
- Which `@ariaflowagents/messaging-meta` method names you used (verbatim from the `.d.ts`) and any deviations from the brief's expected names.
- The exact migration number you used (verify head before naming).
- One bullet per acceptance criterion confirming it landed.
- Any anti-scope items you nearly drifted into and stopped.

If any acceptance criterion is unmet at the end, **do not commit a partial story**. Stop, name what's blocking, and ask. Manager will salvage if needed.
