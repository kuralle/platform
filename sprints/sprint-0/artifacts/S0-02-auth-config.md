# S0-02 — Better Auth config snapshot

This artifact mirrors `packages/auth` as of story **S0-02** (better-auth **1.5.5**, organization plugin, API key plugin).

## Imports (server / CLI)

```ts
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getOrgAdapter, organization } from "better-auth/plugins/organization";
import {
  defaultAc,
  defaultRoles,
} from "better-auth/plugins/organization/access";
```

- **Organization access ladder** uses the organization plugin’s **`ac` / `roles` options** (see [Organization — access control](https://www.better-auth.com/docs/plugins/organization#access-control)): `defaultRoles` from `better-auth/plugins/organization/access` plus a fourth role created with **`defaultAc.newRole({ … })`** (same factory as shipped defaults).

## Resolved `additionalFields` (pseudo-TS)

> **Note:** `better-auth`’s typed `additionalFields.type` accepts `DBFieldAttribute` primitives. Enum-valued columns from `DATA_MODEL.md` are modeled as **`string`** here so the config type-checks; **Postgres `CHECK` constraints / enum types** belong in Drizzle codegen + migrations (**S0-03**).

```ts
// user — root betterAuth({ user: { additionalFields } })
additionalFields: {
  systemRole: string /* 'user' | 'staff' | 'superadmin' */, default "user";
  lastSeenAt: Date | null;
}

// organization + member — organization({ schema: { … } })
organization.additionalFields: {
  vertical: string | null;
  environment: string; // default 'production'
  region: string; // default 'us-east-1'
  isPersonal: boolean; // default false
  createdByUserId: string | null; // FK → user.id (DB-level FK in Drizzle / migration)
  complianceMode: string; // default 'none'
  updatedAt: Date; // default now, onUpdate now
  deletedAt: Date | null;
}
member.additionalFields: {
  invitedBy: string | null; // FK → user.id
  lastActiveAt: Date | null;
}

// apikey — apiKey({ schema: … }) via @better-auth/api-key (see packaging note below)
apikey.additionalFields: {
  organizationId: string; // required; FK → organization.id
  revokedAt: Date | null;
}
```

**Packaging note:** At **better-auth@1.5.5**, the API key plugin is **not** re-exported from `better-auth/plugins/*`. This repo uses **`@better-auth/api-key@1.5.5`** (peer-aligned with `better-auth@1.5.5`).

## Four-role permission map (organization plugin `hasPermission`)

Statements are the organization plugin defaults (`organization`, `member`, `invitation`, `team`, `ac`) from `defaultStatements` / `defaultAc` (see `better-auth/plugins/organization/access`).

| Role    | organization | member (create/update/delete) | invitation (create/cancel) | team (create/update/delete) | ac (CRUD) |
|---------|--------------|----------------------------------|------------------------------|-----------------------------|-----------|
| owner   | update, delete | full                           | full                         | full                        | full      |
| admin   | update       | full                           | full                         | full                        | full      |
| member  | —            | —                              | —                            | —                           | read      |
| viewer  | —            | —                              | —                            | —                           | read      |

**Product nuance:** `member` vs `viewer` share the same organization-plugin surface today; **agent/doc authoring** is enforced in app-layer `withWorkspace` / domain RBAC later (per `DATA_MODEL.md`).

**Runtime check:** `POST /organization/has-permission` uses `hasPermission({ role, options, permissions }, ctx)` from the organization plugin ([access control](https://www.better-auth.com/docs/plugins/organization#access-control)).

## Hooks (signup path)

1. **`databaseHooks.user.create.after`**  
   - Build slug `personal-<first 12 bytes of SHA-256(lowercased email) as hex>`; on rare collision, append `-2`, `-3`, …  
   - `getOrgAdapter(ctx.context, organizationOptions).createOrganization({ organization: { name: "<email>'s personal workspace", slug, isPersonal: true, createdByUserId, environment/region/complianceMode defaults, updatedAt } })`  
   - `createMember({ userId, organizationId, role: "owner" })`  
   - Uses **`getOrgAdapter`** from `better-auth/plugins/organization` (adapter API from plugin source / docs).

2. **`databaseHooks.session.create.before`** (not a substitute for (1); wires S0-03 expectation)  
   - If `activeOrganizationId` is unset, `listOrganizations(userId)` and pick `isPersonal === true`, then merge `activeOrganizationId` into the session row before insert.

## CLI entry (S0-03)

- `packages/auth/better-auth.config.ts` → loads `apps/server/.env` via `dotenv` + `import.meta.url` resolution.  
- Re-exports `auth` from `packages/auth/src/cli.ts` (Node `process.env` + Neon HTTP Drizzle, same plugin / field config).

FKs from `references` in `additionalFields` are **ORM metadata for CLI/codegen**; exact `ON DELETE` behavior is finalized in Drizzle migrations (**S0-03**).
