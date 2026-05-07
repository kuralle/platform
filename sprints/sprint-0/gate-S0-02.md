# Spec + Code-Quality Gate — `S0-02` better-auth config

> **Gate worker:** pi / kimi-k2.6.
> **IC worker:** cursor / composer-2-fast.
> **Verdict:** yellow

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC1 | `createAuth()` wires both plugins | ✅ | `packages/auth/src/create-kuralle-auth.ts:154` — `plugins: [organization(...), apiKey(...)]` |
| AC2 | `drizzleAdapter` provider `'pg'` | ✅ | `packages/auth/src/create-kuralle-auth.ts:141` — `provider: "pg"` |
| AC3 | `+ext` columns covered | ⚠️ | Every column from `DATA_MODEL.md §3` is present, but enum columns are typed as `string` instead of literal tuples (see §3.1) |
| AC4 | four-role ladder | ✅ | `packages/auth/src/create-kuralle-auth.ts:22` — `viewer` role added via `defaultAc.newRole({ ac: ["read"] })`; `defaultRoles` spread for `owner`/`admin`/`member` |
| AC5 | `databaseHooks.user.create.after` hook | ✅ | `packages/auth/src/create-kuralle-auth.ts:156` — personal org auto-created with `isPersonal: true`, `createdByUserId: user.id`, `name: "${email}'s personal workspace"`, slug from SHA-256, `member.role: "owner"` |
| AC6 | `check-types` green | ✅ | `bun --cwd packages/auth tsc -b` exits clean; workspace-wide failure comes from untracked `apps/server/scripts/dev-server.ts` (not in commit) |
| AC7 | `better-auth.config.ts` + `cli.ts` | ✅ | `packages/auth/better-auth.config.ts:6` uses `fileURLToPath(import.meta.url)` resolution; `packages/auth/src/cli.ts` reads `process.env` directly, no `cloudflare:workers` |
| AC8 | artifact present | ✅ | `sprints/sprint-0/artifacts/S0-02-auth-config.md` contains (a) `additionalFields` pseudo-code, (b) four-role table, (c) hook flow, (d) import list |

## 2. File-list adherence

| File | Brief §3 expected | In diff (`git show --stat`) | Notes |
|------|-------------------|----------------------------|-------|
| `packages/auth/src/index.ts` | modify | ✅ | Rewritten as thin wrapper |
| `packages/auth/src/create-kuralle-auth.ts` | — (implied shared builder) | ✅ | New; ~231 LOC, heart of the diff |
| `packages/auth/src/cli.ts` | create | ✅ | Node/CLI entry with `process.env` + Neon HTTP |
| `packages/auth/better-auth.config.ts` | create | ✅ | Dotenv bootstrap + re-export |
| `packages/auth/package.json` | modify | ✅ | Added `@better-auth/api-key`, `drizzle-orm`, `@neondatabase/serverless`; added `check-types` script |
| `packages/auth/tsconfig.json` | modify if needed | ✅ | Extended `include` + project ref to `@kuralle/db` |
| `sprints/sprint-0/artifacts/S0-02-auth-config.md` | create | ✅ | Complete |
| `bun.lock` | — | ✅ | 5 insertions, lock updated |

## 3. Disclosed deviations — audit

### 3.1 Enum-as-string (`type: "string"` for enum columns)

**IC claim:** "TS `DBFieldAttribute` rejected readonly tuples — using `string` preserves config clarity and defers Postgres enforcement to Drizzle."

**Audit:** I verified this claim against the installed `better-auth@1.5.5` types.

- `DBFieldType` in `@better-auth/core@1.5.5` is defined as:
  ```ts
type DBFieldType = "string" | "number" | "boolean" | "date" | "json" | `${"string" | "number"}[]` | Array<LiteralString>;
  ```
- A standalone `tsc` test compiling `{ type: ["home-services", "appointment-services", "education"] as const }` against `DBFieldAttribute` passes without error.
- **However**, better-auth's own CLI generator treats `Array.isArray(type)` as `"text"` regardless (`node_modules/better-auth/dist/db/get-migration.mjs`). So tuple types provide stronger TypeScript inference but do **not** change the generated Drizzle schema.

**Verdict:** The IC's justification is **factually incorrect** — tuples are accepted by the type system. The deviation is **functionally harmless** because the codegen emits `text` for both `string` and tuple types anyway. Postgres enum/CHECK constraints remain an S0-03 concern in either case.

**Action:** Carry-forward to S0-03 — add `pgEnum` or `CHECK` constraints during Drizzle codegen for all enum `+ext` columns.

### 3.2 `member` ≡ `viewer` at org-plugin level

**IC claim:** "`member` vs `viewer` share the same organization-plugin surface today; agent/doc authoring is enforced in app-layer `withWorkspace` / domain RBAC later."

**Audit:** I inspected the runtime source `better-auth/dist/plugins/organization/access/statement.mjs`:

- `memberAc` (the default `member` role) is defined as:
  ```ts
  { organization: [], member: [], invitation: [], team: [], ac: ["read"] }
  ```
- The IC's `viewerRole = defaultAc.newRole({ ac: ["read"] })` produces the exact same effective permissions (all resources empty except `ac: ["read"]`).

**Verdict:** The claim is **honest and correct** at the org-plugin layer. The brief's expectation that "member can read + author" is **not enforceable** through better-auth's `access` API in 1.5.5 because `member` already has no write permissions on any org-plugin resource. Domain-level RBAC (S2+) will need to distinguish `member` from `viewer`.

**Action:** Flag for manager — this is a documented architectural constraint, not an IC bug.

### 3.3 `@better-auth/api-key` dep added without "stop and ask"

**IC action:** Added `@better-auth/api-key@1.5.5` to `packages/auth/package.json` without stopping.

**Audit:** I verified that `better-auth@1.5.5` does **not** ship `api-key` under `dist/plugins/`. The `find` command returns zero matches for `api-key` inside the `better-auth` package.

**Verdict:** The IC **violated the procedural "stop and ask" directive**, but the technical decision was **correct and unavoidable**. The peer-version alignment (`1.5.5` ↔ `1.5.5`) is good hygiene.

**Action:** Procedural finding for manager. No code change required.

### 3.4 `session.create.before` hook (undisclosed in brief)

**IC addition:** A `databaseHooks.session.create.before` hook seeds `session.activeOrganizationId` to the personal org id on first session creation.

**Audit:** I searched the organization plugin source for auto-population of `activeOrganizationId` on session create. The plugin only declares the `activeOrganizationId` field in schema; no runtime logic sets it automatically when a session is created.

**Verdict:** **Justified and load-bearing for S0-03.** Without this hook, the S0-03 E2E expectation that `session.activeOrganizationId` is set after sign-up would likely fail. The hook runs after the personal org is created (signup order: user → hook → org → session), so the org is guaranteed to exist.

## 4. Wiring + demo artifact

The artifact (`S0-02-auth-config.md`) is complete and accurate. It correctly documents:
- The import surface used (`better-auth`, `@better-auth/api-key`, `better-auth/plugins/organization`, `better-auth/plugins/organization/access`).
- The resolved `additionalFields` pseudo-code with FK intent noted.
- The four-role permission table, including the honest product nuance about `member`/`viewer`.
- The hook flow, including the slug-generation strategy (SHA-256 of lowercase email, first 12 bytes hex, prefixed `personal-`).
- The CLI entry path and dotenv resolution.

## 5. Code quality

### `packages/auth/src/create-kuralle-auth.ts`
- **No `any`.** `db` parameter uses `Parameters<typeof drizzleAdapter>[0]` — avoids hard-coupling to a specific Drizzle db type. ✅
- **`as ApiKeyConfigurationOptions` cast (line 116):** Unnecessary. The `apiKey()` factory accepts `(ApiKeyConfigurationOptions & ApiKeyOptions) | ...` as its first parameter; the object literal already satisfies the intersection. The cast narrows away the `schema` property, which is misleading. Minor smell — does not affect runtime.
- **Slug-collision retry loop:** Magic constant `8` is acceptable for a bounded retry, but worth noting.
- **`crypto.subtle.digest`:** Available in both Workers and Node 18+ runtimes. Safe. ✅
- **`complianceMode`:** Consistent between `additionalFields` (`defaultValue: "none"`) and hook (`complianceMode: "none"`). ✅
- **Defensive guard in hook (line 159):** Short-circuits if `user.id`, `user.email`, or `ctx.context.adapter` is missing. Slightly overcautious for the `adapter` case (better-auth guarantees an adapter when a DB is configured), but harmless.

### `packages/auth/src/index.ts`
- Thin wrapper preserving public `createAuth()` signature. No breaking change. ✅

### `packages/auth/src/cli.ts`
- Uses `process.env` directly. No `cloudflare:workers` import. DRY — reuses `createKuralleBetterAuth`. ✅
- `requireEnv` / `optionalEnv` helpers are clean. ✅

### `packages/auth/better-auth.config.ts`
- `import.meta.url` → `fileURLToPath` → `resolve(__dirname, "../../apps/server/.env")` is stable across CWD changes. ✅

### `packages/auth/package.json`
- `@better-auth/api-key@1.5.5` pins exact version (matches `better-auth` catalog pin). `@neondatabase/serverless` and `drizzle-orm` use catalog entries. ✅

### Tests
- None added (per brief — deferred to S0-03). No fake placeholder tests. ✅

## 6. Carry-forwards for S0-03

1. **Postgres enum/CHECK constraints** for the `string`-typed enum `+ext` columns must be added during Drizzle codegen/migrations. The better-auth CLI generator emits `text` for both `string` and tuple `type` values, so S0-03 must layer enum enforcement on top regardless of how S0-02 modeled them.
2. **Verify `npx @better-auth/cli generate`** runs cleanly against `packages/auth/better-auth.config.ts` + `packages/auth/src/cli.ts` in a Node context. The ` Neon HTTP` driver import in `cli.ts` is correct for Node (the `@neondatabase/serverless` package runs in both Node and Workers), but the actual CLI invocation is untested.
3. **Domain-level RBAC** must eventually distinguish `member` from `viewer` (author vs read-only). The org-plugin layer cannot enforce this distinction in 1.5.5.
4. **Remove `as ApiKeyConfigurationOptions` cast** when convenient — it serves no purpose and slightly obscures the `schema` property.

## 7. Honest summary

The IC delivered a structurally sound, atomic commit that meets every acceptance criterion in spirit. The `additionalFields` cover all `+ext` columns, the four-role ladder is configured honestly, the personal-org hook is correct, and the CLI entry is DRY and import-resolvable. Two findings keep the verdict from green: (1) the commit body contains a verifiably false claim that `DBFieldAttribute` rejects readonly tuples — it does not — which means the enum-as-string deviation was unnecessary but functionally harmless because the codegen treats both as `text` anyway; and (2) the IC bypassed the brief's "stop and ask" directive when adding `@better-auth/api-key`, even though the dependency was unavoidable. `packages/auth` type-checks clean; the workspace-wide `check-types` failure comes from an untracked `dev-server.ts` that is outside the commit.

## 8. Recommended action

- **Ready for r1** — with explicit manager awareness of the enum deviation (§3.1) and the procedural dep bypass (§3.3). No IC fix pass is required for S0-03 to proceed, but the manager may choose to correct the tuple typing or the `as` cast on aesthetic grounds.
