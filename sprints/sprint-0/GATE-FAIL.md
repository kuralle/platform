# S0-03 Gate Report — `@neondatabase/serverless` + Workers untestable without Neon DB

**Status:** `Gate-Partial` — local Postgres E2E passes; neon-http + Workers path blocked.
**Date:** 2026-05-07
**Author:** `pi` (deepseek-v4-pro) IC worker

---

## What was tested and passed

### 1. Schema regeneration via better-auth CLI
```
npx @better-auth/cli@latest generate \
  --config ./packages/auth/better-auth.config.ts \
  --output ./packages/db/src/schema/auth.ts -y
```
- 8 tables emitted: `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey`
- All `+ext` columns present on `user`, `organization`, `member`
- `apikey` uses `referenceId` (from `references: "organization"`) as the org FK — standard better-auth behavior

### 2. Migration generation + application
```
bun -F @kuralle/db db:generate   # → 0000_legal_vanisher.sql
bun -F @kuralle/db db:migrate    # → applied against localhost:5432/kuralle_dev
```
- All 8 tables confirmed via `psql \dt`

### 3. Sign-up E2E against local Postgres (pg wire protocol)
Using `drizzle-orm/node-postgres` + `pg.Pool` (standard wire protocol, not neon-http):
- `auth.api.signUpEmail()` → user row created ✅
- `user.create.after` hook → personal organization created ✅
- `user.create.after` hook → member row (role=owner) created ✅
- `session.create.after` hook → `activeOrganizationId` set to personal org ID ✅

### 4. S0-02 amendment: session hook fix
- Changed `session.create.before` → `session.create.after` (transaction isolation: `listOrganizations` couldn't see the just-created org in the `.before` hook)
- Snake_case column check added (`is_personal` as well as `isPersonal`)

### 5. S0-02 amendment: apiKey plugin config
- Removed broken `schema.apikey.additionalFields` from `apiKeyPluginOptions` — the apiKey plugin doesn't support `additionalFields`
- `organizationId` is covered by `referenceId` (standard better-auth FK when `references: "organization"`)
- `revokedAt` is **not creatable** through the apiKey plugin's schema — deferred to a supplement migration if needed

### 6. Type-check green workspace-wide

---

## What could NOT be tested (and why)

### `@neondatabase/serverless` + Workers

The `@neondatabase/serverless` driver uses Neon's proprietary **HTTP fetch protocol** (`POST https://<endpoint>.neon.tech/sql`). It **cannot connect** to a standard Postgres instance on `localhost:5432` which speaks the wire protocol (port 5432, TCP).

This is a fundamental architectural constraint:
- **Neon HTTP driver** → only works with Neon's serverless proxy (or self-hosted Neon proxy)
- **Local Postgres** → only works with `pg` / `node-postgres` (standard wire protocol)

Without a provisioned Neon database, the full Workers + neon-http path cannot be exercised.

### `wrangler dev` (Cloudflare Workers local runtime)

Starts via Alchemy (`packages/infra/alchemy.run.ts` → `alchemy dev`) which requires Cloudflare API credentials. Without `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_API_KEY`, `alchemy dev` fails with:
```
No credentials found. Please run `alchemy login`
```

The app uses `cloudflare:workers` virtual module for environment access (`packages/env/src/server.ts`), which also prevents running the server outside Workers with the standard entry point.

---

## What was attempted

| Approach | Result |
|----------|--------|
| `bun -F server dev` | No `dev` script in server package |
| `bun -F @kuralle/infra dev` | `alchemy dev` requires CF credentials |
| Create standalone Bun HTTP server importing from `apps/server/src/index.ts` | `@kuralle/env/server` uses `cloudflare:workers` virtual module |
| Create standalone Bun HTTP server with direct better-auth + neon-http | `neon()` can't connect to `postgres://localhost:5432` |
| Create standalone Bun HTTP server with `pg.Pool` + `drizzle-orm/node-postgres` | **Works** — validated schema + hooks + sign-up E2E |

---

## What wrangler-dev's logs said

N/A — `wrangler dev` was never reached because `alchemy dev` fails at the authentication step (CF credentials not available).

---

## Decision required from the user

1. **Provision a Neon database** — then update `DATABASE_URL` in `apps/server/.env` to the Neon HTTP endpoint. The neon-http driver will then work against that endpoint, and the codegen gate can be re-tested.

2. **Provide Cloudflare API credentials** — then `alchemy dev` / `wrangler dev` will work for local development, and the full Workers runtime path can be tested.

3. **Accept the partial gate** — the schema, migration, and hooks are validated against a real Postgres 15.12 instance. The neon-http driver is the same code path used in production; the only difference is the target Postgres (Neon proxy vs. local). The risk of failure at the driver level is low since `@neondatabase/serverless` is a well-established package.

4. **Swap auth strategy** — if better-auth + neon-http is deemed too risky, the alternative is to use a different auth library or a different DB driver strategy.

**Recommendation:** Option 1 (provision Neon). The schema and hook code is validated and working. The neon-http driver is a thin transport layer that's widely used. The gate can be closed quickly once a Neon endpoint is available.

---

## What I considered but didn't do

- **Adding a dev-only `pg` fallback to `create-kuralle-auth.ts`:** Would add branching logic to the auth module. Instead, I documented the two-driver reality: `pg` for local dev, `neon-http` for Workers/Neon. This is an infra concern, not an auth-module concern.
- **Creating a docker-compose with a Neon-compatible proxy:** Over-engineering; no such proxy exists that perfectly emulates the Neon HTTP API.
- **Using `@neondatabase/serverless` with a tunnel:** The driver's HTTP fetch is hardcoded to Neon's endpoint format; can't point at a local Postgres.
