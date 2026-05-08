# Spec + Code-Quality Gate — `S3-01` ChannelRepository expansion + Meta connector wizard half

> **Gate worker:** pi/kimi-k2.6
> **IC worker:** pi/deepseek-v4-pro (salvaged by manager)
> **Inputs:** brief, IC transcript (`.handoff/result-S3-01.txt`), diff on disk.
> **Verdict:** yellow

---

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 4.1 | ChannelRepository endpoint CRUD + cache invalidation | ⚠️ partial | `packages/core/src/repositories/channel.ts:267-519` — all five endpoint methods + three composites (`connectWithCredentials`, `attachEndpoint`, `detachEndpoint`) are present and invalidate the right cache keys in source. **Missing:** `packages/core/src/repositories/channel.test.ts` was not expanded; no test asserts the cache miss→hit→invalidate contract for endpoints. IC admits this in commit body. |
| 4.2 | 5 oRPC procedures with `.strict()` schemas | ⚠️ partial | `packages/api/src/routers/channels.ts:24-289` — six procedures shipped (`list`, `connect`, `endpoints.list`, `endpoints.listByKind`, `endpoints.attach`, `endpoints.detach`). The extra `listByKind` was a manager-salvage addition (justified in commit body). Every input/output schema has `.strict()`. |
| 4.3 | `channels.list({ kind: 'telephony' })` + `useTelephony`/`usePhoneNumbers` rewrite | ⚠️ partial | `channels.list` accepts `kind` filter (`packages/api/src/routers/channels.ts:26-30`). However, `useTelephony` and `usePhoneNumbers` were rewritten to `channels.endpoints.listByKind({ kind: 'telephony' })` (`apps/web/src/hooks/api/telephony.ts:14`, `phone-numbers.ts:14`) instead of `channels.list({ kind: 'telephony' })` as the brief specified. Functional outcome is correct (screens consume endpoint shape), but this is a spec deviation. |
| 4.4 | Five `META_*` env vars + `getEnv()` shim | ⚠️ partial | `packages/infra/alchemy.run.ts:25-30` — all five wired correctly (`META_APP_SECRET` + `META_SYSTEM_USER_TOKEN` via `alchemy.secret.env.*`; others via `alchemy.env.*`). `apps/server/.env.example` updated. **Deviation:** `apps/server/src/env.ts:16-27` `getEnv()` reads `process.env` exclusively; it does **not** prefer `cloudflare:workers` env and fall back as the brief requested. It works because Alchemy `compatibility: "node"` polyfills `process.env`, but the shim doesn't match the spec. |
| 4.5 | `connect` opens tx, inserts `secrets` + `channel_connections` | ✅ | `packages/core/src/repositories/channel.ts:305-353` — `connectWithCredentials` wraps both inserts in `db.transaction`. Integration test covers happy path. **Missing:** no test asserts rollback on Meta-API failure. |
| 4.6 | `endpoints.attach` calls `subscribeApp` + persists `publicWebhookUrl` | ✅ | `packages/api/src/routers/channels.ts:200-226` — `webhookUrl` computed from `PUBLIC_BASE_URL` and persisted on the endpoint row via `attachEndpoint`. `subscribeApp` is called inside the `onAttached` callback. **Note:** `webhookUrl` is not passed to `subscribeApp` because the Meta Graph API `POST /{phoneNumberId}/subscribed_apps` does not accept a webhook URL parameter (verified against installed `.d.ts`). |
| 4.7 | `endpoints.detach` idempotent — second call returns `alreadyReleased` | ✅ | `packages/api/src/routers/channels.ts:236-258` + `packages/core/src/repositories/channel.ts:471-519`. Test asserts `alreadyReleased: true` on second call (`apps/server/src/__tests__/channels.connect.test.ts:250-262`). |
| 4.8 | Polymorphic CHECK trigger (`0013_s3_01_meta.sql`) + test | ✅ | Migration exists, applies cleanly (`bun -F @kuralle/db db:migrate` exit 0). `_journal.json` updated. Integration test asserts Postgres rejects mismatched kind (`apps/server/src/__tests__/channels.connect.test.ts:273-286`). |
| 4.9 | Hooks-only frontend access | ⚠️ partial | `apps/web/src/hooks/api/channels.ts` does **not** import `@kuralle/api-client` directly (it imports from `@/providers/api-provider`). The only `apps/web/src/` file importing `@kuralle/api-client` is `providers/api-provider.tsx`, which is pre-existing infrastructure. No new forbidden imports introduced by S3-01. |
| 4.10 | Deps pinned at `1.0.0`; root unchanged | ✅ | `apps/server/package.json` and `packages/runtime/package.json` both pin `@ariaflowagents/core`, `@ariaflowagents/messaging`, `@ariaflowagents/messaging-meta` at `1.0.0`. Root `package.json` unchanged. |
| 4.11 | OpenAPI drift gate green + full row schemas | ✅ | `bun -F server gen:openapi --check` exit 0. `apps/server/openapi.json` contains full object schemas for all channel ops (no `{}` or `z.array(z.unknown())`). |
| 4.12 | Full test chain green | ⚠️ partial | `bun run check-types` ✅, `bun run lint` ✅ (0 errors, 1 pre-existing warning), `bun -F server test` ✅ (26 passed), `bun -F web test` ✅ (55 passed). `bun -F @kuralle/core test` has 1 pre-existing deadlock failure in `agent.test.ts` (not S3-01). `bun -F @kuralle/runtime test` has pre-existing failures in `projector/agent.test.ts` (not S3-01). **Missing new tests:** `channel.test.ts` endpoint expansion, `channels.test.ts` hook unit tests. |
| 4.13 | Demo artifacts at brief paths | ⚠️ partial | `sprints/sprint-3/artifacts/S3-01-channel-connect-trace.txt` exists (vitest output). `sprints/sprint-3/artifacts/S3-01-migration-apply.txt` is **missing**. |

---

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/core/src/repositories/channel.ts` | ✅ modified |
| `packages/core/src/repositories/channel.test.ts` | ❌ not modified (deferred per IC) |
| `packages/api/src/routers/channels.ts` | ✅ modified |
| `packages/api/src/routers/channels.schemas.ts` | ✅ modified |
| `packages/runtime/src/clients/meta-whatsapp.ts` | ✅ created |
| `packages/runtime/src/clients/meta-whatsapp.test.ts` | ✅ created |
| `packages/runtime/src/clients/index.ts` | ✅ created |
| `packages/runtime/src/test-utils.ts` | ✅ created |
| `packages/runtime/src/index.ts` | ✅ modified |
| `packages/infra/alchemy.run.ts` | ✅ modified |
| `apps/server/.env.example` | ✅ modified |
| `apps/server/src/env.ts` | ✅ created |
| `apps/server/src/index.ts` | ✅ modified (wires `getEnv()`) |
| `apps/server/src/__tests__/channels.connect.test.ts` | ✅ created |
| `packages/db/src/migrations/0013_s3_01_meta.sql` | ✅ created |
| `packages/db/src/migrations/meta/_journal.json` | ✅ modified |
| `apps/web/src/hooks/api/channels.ts` | ✅ modified |
| `apps/web/src/hooks/api/channels.test.ts` | ❌ not created |
| `apps/web/src/hooks/api/telephony.ts` | ✅ modified |
| `apps/web/src/hooks/api/phone-numbers.ts` | ✅ modified |
| `apps/server/openapi.json` | ✅ regenerated |
| `packages/api-client/src/schema.d.ts` | ❌ does not exist in repo (path may be aspirational) |

**Out-of-scope edits:**
- `apps/server/src/__tests__/agents.publish.test.ts` and `agents.publish.slo.test.ts` — modified only to inject `env` into test context (required by `createContext` change). Substantive and necessary.
- `apps/web/src/routes/_app.phone-numbers.tsx` — dropped `limit` param to match new hook signature. Substantive.
- Sprint scaffolding docs (`sprints/sprint-3/PLAN.md`, `brief-S3-01.md`, `brief-S3-02.md`, etc.) — planning artifacts committed in same atomic commit. Not source-code scope creep.

---

## 3. Wiring + AriaFlow API verbatim

- **Thin client wraps `@ariaflowagents/messaging-meta`:** ✅ `packages/runtime/src/clients/meta-whatsapp.ts` is the only file importing the AriaFlow package. `apps/server/src/` and `packages/api/src/` import from `@kuralle/runtime`.
- **Method names match installed `.d.ts`:** ✅ Verified against `node_modules/.bun/...@ariaflowagents+messaging-meta@1.0.0/.../dist/index.d.ts`. Actual exported names are `GraphAPIClient` (class) and `verifySignature` (function). The thin client uses these verbatim. The brief expected `listPhoneNumbers`, `subscribeApp`, `unsubscribeApp`, `verifyHmac` — the IC documented the mapping correctly in the commit body.
- **`getEnv()` shim works in both substrates:** ⚠️ It reads `process.env` exclusively. Works in vitest (node) and in CF Workers with `compatibility: "node"` (Alchemy polyfills `process.env`), but does not "prefer `cloudflare:workers` env and fall back" as specified.

---

## 4. Code quality

For each new/modified source file, one bullet per finding:

- `packages/api/src/routers/channels.schemas.ts:24` — `channelEndpointSchema.displayName` is `z.string()` but `channelEndpoints.display_name` is nullable in Drizzle schema and `Endpoint` domain type is `string \| null`. A null value in DB will fail Zod validation at the API boundary. — **minor**.
- `apps/web/src/hooks/api/channels.ts:57-65` — `useDetachEndpoint` invalidates `connectionId: ""`, but the detach mutation input (`endpointsDetachInput`) only has `workspaceId` and `endpointId`. `variables.connectionId` is undefined, so the invalidation query key never matches the actual list query keys. Cache stays stale after detach. — **major**.
- `packages/core/src/repositories/channel.ts:338,369` — `(input.metadata ?? null) as Record<string, unknown> \| null` casts. The Drizzle `jsonb` column accepts `unknown`; the cast is unnecessary and papers over a type mismatch. — **nit**.
- `packages/core/src/repositories/channel.ts:351` — `await this.kv.delete(cacheKey(..., (resultRow as typeof schema.channelConnections.$inferSelect).id))`. The `as` cast is unnecessary because `resultRow` is already typed; leftover from iterative draft. — **nit**.
- `packages/runtime/src/test-utils.ts:35` — `as unknown as MetaWhatsAppClientDeps["graphApi"]` cast at mock boundary. Acceptable for a test seam, but could be narrowed with a proper mock interface. — **nit**.
- `apps/server/src/env.ts:16-27` — Returns empty-string fallbacks (`?? ""`) for all env vars. In production, a missing binding would silently become `""` rather than failing loudly. The router handlers do catch empty strings and throw `ORPCError`, so the blast radius is contained, but the shim itself is lenient. — **minor**.
- `packages/api/src/routers/channels.ts:111-119` — `connect` handler lacks the comment the brief mandated: "signed-request validation happens before the tx starts — this MUST be explicit in the code with a comment stating why." No signed-request validation is performed at all (the flow stores raw credentials rather than verifying a Meta callback signature). — **minor**.

---

## 5. OpenAPI + drift gate

- `bun -F server gen:openapi --check` exit 0: **yes**
- New ops have full Zod row-shape outputs (no `{}` or `unknown`): **yes**
- `packages/api-client/src/schema.d.ts` regenerated: **N/A** — file does not exist in this repo.

---

## 6. Honest summary

The S3-01 commit is functionally sound: the repository layer has the right methods, the router exposes typed oRPC procedures, the thin client wraps the AriaFlow API verbatim, the migration applies cleanly, and the integration test covers the four-step happy path plus the polymorphic trigger. OpenAPI drift is green and server/web tests pass. However, three gaps keep this from green: (1) the deferred repository unit-test expansion means the cache-invalidation contract for endpoints is unproven in isolation; (2) `useDetachEndpoint` has a broken cache-invalidation query key that will leave endpoint lists stale after detach; (3) the missing frontend hook tests (`channels.test.ts`) and migration artifact mean the brief's test-coverage and demo-artifact requirements are not fully met. The `getEnv()` shim deviates from the requested `cloudflare:workers`-first pattern, though it works in practice via node compatibility. The `channelEndpointSchema.displayName` nullability mismatch is a latent Zod validation bug. No unauthorized source-code scope creep was introduced.

---

## 7. Recommended action

**Needs IC fix pass before next IC.** Specific fixes:

1. **Major — fix `useDetachEndpoint` invalidation** (`apps/web/src/hooks/api/channels.ts:57-65`). The mutation must invalidate the correct connection-scoped endpoint list. Options: (a) make `endpoints.detach` return the `connectionId` so the hook can invalidate accurately; (b) invalidate broader keys (e.g., all `channels.endpoints.list` and `channels.endpoints.listByKind` queries for the workspace).
2. **Major — expand `packages/core/src/repositories/channel.test.ts`** with endpoint-level tests: `findEndpointById` cache miss→hit→invalidate on `softDeleteEndpoint`; `findEndpointsByConnection` scoped filtering; `findEndpointsByKind` filtering; `insertEndpoint` insert + cache invalidate.
3. **Major — create `apps/web/src/hooks/api/channels.test.ts`** with RTL + oRPC test client: `useChannels` passes `kind` filter; `useConnectMetaChannel` invalidates list key; `useAttachEndpoint` invalidates connection list; `useDetachEndpoint` invalidates correctly after fix.
4. **Minor — fix `channelEndpointSchema.displayName`** to `z.string().nullable()` to match DB schema and `Endpoint` domain type.
5. **Minor — capture `sprints/sprint-3/artifacts/S3-01-migration-apply.txt`** by running `bun -F @kuralle/db db:migrate` against a clean DB and saving the output.
6. **Minor (manager discretion) — align `useTelephony`/`usePhoneNumbers`** with brief's `channels.list({ kind: 'telephony' })` contract, or document the deviation in `AMENDMENT-00x` if endpoint shape is the correct abstraction.
7. **Minor (manager discretion) — tighten `getEnv()`** to import from `cloudflare:workers` when available and fall back to `process.env`, per the brief's hexagonal intent.

Manager re-delegates with a focused fix brief pointing at the seven items above. After `[S3-01-fix]` lands, gate worker re-runs the check-types → lint → server test → web test → openapi-check chain and updates this gate file.
