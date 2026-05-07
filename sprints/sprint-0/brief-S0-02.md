# Story Brief — `S0-02` Configure better-auth with `organization` + `apiKey` plugins

> **You are the IC engineer (`cursor` worker — fresh process; clean context window) with no prior context.** This brief is self-contained. Read it end-to-end before writing any code. If anything is ambiguous or contradicts what you find on disk, **stop and ask**.
>
> **Atomic-commit policy:** when you finish, stage every file you create / modify and commit atomically with `[S0-02] better-auth: organization + apiKey plugins, +ext fields, four-role access`. Do NOT push.

---

## 1. Goal

Replace the current `packages/auth/src/index.ts` (SQLite/D1-flavoured drizzle adapter, no plugins) with a Postgres-flavoured better-auth instance that mounts the `organization` and `apiKey` plugins, configures `additionalFields` for every `+ext` column listed in `DATA_MODEL.md §3`, sets up a four-role access ladder (owner / admin / member / viewer), and registers a `databaseHooks.user.create.after` hook that auto-creates a personal `organization` plus a `member` row linking the new user as `owner`. **No schema codegen in this story** — codegen is S0-03; this story sets up the better-auth config so the CLI generation in S0-03 emits the right schema.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md`
2. `sprints/sprint-0/PLAN.md` § Pre-flight notes + `S0-02` section
3. `sprints/WBS.md` § Sprint 0, story `S0-02`
4. `DATA_MODEL.md §3` (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `apikey` shapes — bA core + organization + apiKey plugins; the `+ext` columns are the ones marked `// +ext` in the doc)
5. `DATA_MODEL.md §1` (tenancy) — context for why `organization ≡ workspace`
6. `packages/auth/src/index.ts` — current state (SQLite drizzle adapter, no plugins)
7. `packages/auth/package.json` — current deps (`better-auth: catalog:` resolves to **1.5.5** per the workspace catalog)
8. `packages/db/src/index.ts` — note: `createDb()` now returns a Postgres drizzle instance via neon-http (S0-01 just landed)
9. `packages/db/src/schema/auth.ts` — current state is hand-authored SQLite-flavoured. **Do not delete it in this story.** S0-03 deletes + regenerates it. Reading it gives context but you don't modify it here.
10. `apps/server/src/index.ts` — sees `createAuth()` mounted at `/api/auth/*`. No edit needed.
11. better-auth docs:
    - <https://www.better-auth.com/docs/concepts/database> — the `additionalFields` API and `databaseHooks` shape
    - <https://www.better-auth.com/docs/plugins/organization> — the organization plugin
    - <https://www.better-auth.com/docs/plugins/api-key> — the apiKey plugin
    - <https://www.better-auth.com/docs/plugins/organization#access-control> — the `access()` API and roles
    - <https://hono.dev/examples/better-auth-on-cloudflare> — the recipe

If a doc URL above is unreachable, surface the failure rather than guessing the API shape.

---

## 3. Files you will create or modify

**Create:**
- `packages/auth/better-auth.config.ts` — the **CLI config file** that `npx @better-auth/cli generate --config ./better-auth.config.ts` will read in S0-03. It re-exports the same `betterAuth(...)` instance that `src/index.ts` exports. Pattern:
  ```ts
  // packages/auth/better-auth.config.ts
  // CLI-only entry point. Re-exports the production instance for codegen.
  // Avoids importing cloudflare:workers env in CLI context — it loads from .env via dotenv.
  import { config } from 'dotenv';
  config({ path: '../../apps/server/.env' });
  export { auth } from './src/cli';
  ```
  And a sibling `packages/auth/src/cli.ts` that exposes a CLI-friendly variant of `createAuth()` reading `process.env` directly (no `cloudflare:workers` env import — the better-auth CLI is a Node process).
- `packages/auth/src/cli.ts` — see above. Same plugin / additionalFields config; the only difference is env loading.
- `sprints/sprint-0/artifacts/S0-02-auth-config.md` — markdown demo artifact described in §8.

**Modify:**
- `packages/auth/src/index.ts` — full rewrite of the plugin / drizzle-adapter block. Switch `provider` to `'pg'`. Mount `organization()` and `apiKey()` plugins. Add `additionalFields` covering the §2 column list below. Add `databaseHooks.user.create.after`. Keep `trustedOrigins`, `secret`, `baseURL`, `advanced.defaultCookieAttributes` as-is (don't touch unrelated fields).
- `packages/auth/package.json` — verify it covers the plugin imports. Better-auth ships `organization` + `apiKey` from the same package (`better-auth/plugins/organization`, `better-auth/plugins/api-key`); no new deps should be needed. If you find that the plugins are split into a separate `@better-auth/plugins` package in 1.5.5, **stop and ask** before adding it (the catalog pins `better-auth: 1.5.5` per `DATA_MODEL.md §19 step 1`; do not bump).
- `packages/auth/tsconfig.json` — only if needed for the new `cli.ts` file's compilation; usually not.

**Do not touch:**
- `packages/db/src/schema/auth.ts` — that's S0-03.
- `apps/server/src/index.ts` — already mounts `createAuth().handler`. No change needed.
- Any other package outside `packages/auth/`.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`packages/auth/src/index.ts` exports `createAuth()`** that returns a configured `betterAuth(...)` instance with the `organization` plugin and the `apiKey` plugin mounted.
2. **Drizzle adapter** is configured with `provider: 'pg'` and the same `schema` import pattern as today (`schema: schema` from `@kuralle/db/schema/auth`). The fact that `auth.ts` is still SQLite-flavoured in the workspace at this point is acceptable — type-check may even still pass because better-auth doesn't validate column types at config time. **If type-check fails because of the dialect mismatch, surface it; the resolution is to coordinate with S0-03.**
3. **`additionalFields`** cover every `+ext` column from `DATA_MODEL.md §3`:
   - **`user`**:
     - `systemRole`: enum `'user' | 'staff' | 'superadmin'`, default `'user'`
     - `lastSeenAt`: timestamp, nullable
   - **`organization`** (= workspace):
     - `vertical`: enum `'home-services' | 'appointment-services' | 'education'`, nullable
     - `environment`: enum `'production' | 'staging' | 'sandbox'`, default `'production'`
     - `region`: enum `'us-east-1' | 'us-west-2' | 'eu-west-1'`, default `'us-east-1'`
     - `isPersonal`: boolean, default `false`
     - `createdByUserId`: text, references `user.id` (FK lives in the schema; better-auth doesn't generate the FK from `additionalFields` — note that in your commit body)
     - `complianceMode`: enum `'none' | 'hipaa' | 'ferpa' | 'tcpa'`, default `'none'`
     - `updatedAt`: timestamp
     - `deletedAt`: timestamp, nullable
   - **`member`**:
     - `invitedBy`: text, references `user.id`, nullable
     - `lastActiveAt`: timestamp, nullable
   - **`apikey`**:
     - `organizationId`: text, references `organization.id`, NOT NULL on creation
     - `revokedAt`: timestamp, nullable
4. **Four-role access ladder** configured per better-auth's `access`/`role` API. Roles: `owner` > `admin` > `member` > `viewer`. The exact permission map is your call — keep it minimal but functional. At minimum: `owner` can do everything, `admin` can invite + manage members, `member` can read + author within the workspace, `viewer` can only read. **Cite the exact better-auth API you used in the artifact** (`§8`).
5. **`databaseHooks.user.create.after` hook** auto-creates a personal organization for the new user:
   - `organization.isPersonal = true`
   - `organization.createdByUserId = user.id`
   - `organization.name = "${user.email}'s personal workspace"` (or similar — keep the email-derived form)
   - `organization.slug = <slugified email or nanoid prefix>` — choose a deterministic generator that avoids collisions; document the choice in the commit body
   - and inserts a `member` row: `member.userId = user.id`, `member.organizationId = <newly created org id>`, `member.role = 'owner'`
   The hook **must run inside the same logical creation flow** so the user always has at least one membership after sign-up. If better-auth's hook API doesn't expose `organization.create` (rare; the docs say it does), use the SDK's `auth.api.createOrganization(...)` from inside the hook with the new user's session context.
6. **`bun run check-types` green workspace-wide** after your changes.
7. **`packages/auth/better-auth.config.ts` + `packages/auth/src/cli.ts`** exist and are import-resolvable from the package's CWD. (You can verify by running `bun --cwd packages/auth tsc -b` or by `bun --cwd packages/auth -e "import('./better-auth.config.ts').then(m => console.log(typeof m.auth))"` — note: do not run the CLI generate step itself; that's S0-03.)
8. **Artifact** `sprints/sprint-0/artifacts/S0-02-auth-config.md` documents (a) the resolved `additionalFields` schema as TypeScript pseudo-code, (b) the four-role permission map as a table, (c) the hook flow as a pseudo-step list, and (d) the API names you imported from better-auth (e.g., `import { organization, apiKey } from "better-auth/plugins"`). One page max.

---

## 5. Definition of Done (universal)

- [ ] Atomic commit with `[S0-02] better-auth: organization + apiKey plugins, +ext fields, four-role access`.
- [ ] `bun run check-types` green workspace-wide.
- [ ] `bun install` clean (no new peer warnings).
- [ ] No `@ts-ignore`, no `--no-verify`, no silent catch.
- [ ] Public TS surface: `createAuth()` keeps its existing signature; new exports (`auth` from `cli.ts`) are additions, not breaking changes.
- [ ] Artifact present at `sprints/sprint-0/artifacts/S0-02-auth-config.md`.

---

## 6. What NOT to do

- Do not regenerate `packages/db/src/schema/auth.ts`. That's S0-03's exclusive scope.
- Do not run `npx @better-auth/cli generate` in this story. S0-03 owns it.
- Do not bump `better-auth` past `1.5.5` — `DATA_MODEL.md §19 step 1` names that version explicitly. Bumping requires an RFC amendment.
- Do not introduce dependencies beyond `better-auth/plugins/{organization,api-key}` (which ship inside the `better-auth` package).
- Do not modify `apps/server/src/index.ts` — `createAuth().handler` mounting is unchanged.
- Do not touch any other package.
- Do not add tests in this story; behavioral coverage is downstream (S0-03 sign-up E2E).

---

## 7. Demo artifact

`sprints/sprint-0/artifacts/S0-02-auth-config.md` — see §4 acceptance criterion 8.

---

## 8. How to report back

Commit body must include:
- The story brief link.
- DoD checklist with every box ticked.
- The list of files changed.
- Citations of the better-auth API surfaces you used (e.g., "used `organization({ creatorRole: 'owner', allowUserToCreateOrganization: true, ...})` per docs version X").
- One paragraph "what I considered but didn't do, and why" — the trade-offs you accepted (e.g., the slug strategy, whether you used `additionalFields.input.required` vs `defaultValue`).

---

## 9. If you get stuck

- If better-auth 1.5.5's plugin API differs from what `<https://www.better-auth.com/docs/plugins/organization>` documents (the docs may track latest), **fetch the version-pinned docs or read better-auth's source under `node_modules/better-auth/`**. Do not guess the API.
- If `dotenv` env loading in `packages/auth/better-auth.config.ts` doesn't see `apps/server/.env` (path resolution differs by CWD), document the resolution and prefer absolute paths from the file's `import.meta.url` — `node:url`'s `fileURLToPath`.
- If a `+ext` column on `DATA_MODEL.md §3` cannot be expressed via `additionalFields` (e.g., better-auth doesn't support enum types directly), document the gap and use `text` with a CHECK constraint — but flag it for r1 review. Do not invent column types.
- If the `databaseHooks.user.create.after` API is unavailable in 1.5.5, fall back to a `before` or to the `organization` plugin's `creatorRole` setting plus a manual create call from the route. Document whichever you chose.
- If `bun run check-types` fails because of the SQLite-flavoured `auth.ts` colliding with `provider: 'pg'`, **stop and ask** — the resolution may be to fold S0-02 + S0-03 into one story. Do not silently revert `provider` to `'sqlite'`.

You are the IC. Sincere work is the only kind we ship.
