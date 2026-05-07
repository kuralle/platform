# Spec + Code-Quality Gate — `S0-01` Postgres swap

> **Gate worker:** pi / kimi-k2.6.
> **IC worker:** cursor / composer-2-fast.
> **Verdict:** green

---

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC1 | `bun run check-types` green workspace-wide | ✅ | Verified empirically at commit `fd4721c` (`git checkout` + run): 3 tasks, 3 cached, full turbo, zero errors. |
| AC2 | Local Postgres database exists | ✅ | Artifact shows `psql kuralle_dev -c '\dt'` connecting successfully; db is empty (`Did not find any relations`), which is explicitly acceptable per brief §4 AC2. |
| AC3 | `bun -F @kuralle/db db:generate` succeeds | ✅ | Exit code 0. Output: "0 tables", "No schema changes, nothing to migrate". No migration file emitted because `auth.ts` is still SQLite-flavored; this is expected and documented in the brief §4 AC3 and the IC's honest disclosure. |
| AC4 | `bun -F @kuralle/db db:push` runs without errors | ✅ | Exit code 0. Uses `'pg'` driver for querying. "No changes detected". |
| AC5 | `infra/alchemy.run.ts` no longer references `D1Database`; `DATABASE_URL` wired as secret | ✅ | `packages/infra/alchemy.run.ts:1-6` — `D1Database` import removed, `db` resource removed, `DB` binding dropped. `DATABASE_URL: alchemy.secret.env.DATABASE_URL!` added at `packages/infra/alchemy.run.ts:24`. |
| AC6 | `apps/server/.env.example` exists, no real secrets | ✅ | File created with 4 variables. `BETTER_AUTH_SECRET=replace-me-generate-a-secret` is a placeholder. `DATABASE_URL` uses the example localhost URL from brief §6. |
| AC7 | `@libsql/client` and `libsql` removed from catalog and `packages/db/package.json` | ✅ | Dropped from root catalog, `packages/db/package.json`, and `apps/web/package.json`. Grep across all workspace `package.json` files confirms zero direct references. **Note:** entries remain in `bun.lock` as transitive optional peers of `alchemy` and `drizzle-orm` — this is unavoidable lockfile noise, not a direct dependency. |
| AC8 | `apps/server/README.md` documents local-Postgres recipe | ✅ | Matches brief §6 verbatim, including the `psql` setup block and the docker-compose deviation note. |
| AC9 | Artifact captures `db:generate`, `db:push`, `psql \dt` | ✅ | `sprints/sprint-0/artifacts/S0-01-migration-output.txt` has all three sections separated by `---`. Contains terminal control sequences and real absolute paths, reads authentic. |
| AC10 | No D1 / libsql / Turso references in target dirs | ✅ | `git grep` across `packages/db/`, `packages/infra/`, `apps/server/`, `README.md` at commit `fd4721c` finds only one match: `README.md:46` "`/telephony` (D1)" — this is a sprint screen ID in the "What's built" section, not a database reference. |

---

## 2. File-list adherence

| Expected | Status |
|----------|--------|
| `packages/db/package.json` | ✅ |
| `packages/db/drizzle.config.ts` | ✅ |
| `packages/db/src/index.ts` | ✅ |
| `packages/infra/alchemy.run.ts` | ✅ |
| `apps/server/.env.example` | ✅ |
| `apps/server/README.md` | ✅ |
| `README.md` (root) | ✅ |
| `package.json` (root) | ✅ |
| `bun.lock` | ✅ |
| `sprints/sprint-0/artifacts/S0-01-migration-output.txt` | ✅ |

**Out-of-scope edits the IC made (justified or not):**

- `apps/web/**/*.tsx` — 14 files. Disclosed as pre-existing TS errors.
  - **Audit conclusion:** confirmed pre-existing. Verified by inspecting parent commit `fd4721c^`:
    - `agent-editor-shell.tsx` used `href` on TanStack `Link` (should be `to`).
    - `__root.tsx` used `delayDuration` on Base UI `TooltipProvider` (should be `delay`).
    - `compliance.tsx`, `behavior.tsx`, `batches.new.tsx`, `workspace.settings.tsx` used old Base UI `ToggleGroup` / `Slider` `onValueChange` array-destructuring signatures.
    - `models.tsx`, `knowledge.$docId.tsx` used old Base UI `Select` `onValueChange` signature.
    - `widget.tsx` used `direction` on `ResizablePanelGroup` (should be `orientation`).
    - Multiple routes passed `search` prop incorrectly to `Link` / `navigate`.
  - None of these files import from `@kuralle/db`; the errors are unrelated to the dialect flip. Fixing them was required to satisfy the universal DoD (`check-types` green).

- `apps/web/src/test/setup.ts` — removed `@ts-expect-error` comments in favor of proper `as typeof window.matchMedia` / `as typeof ResizeObserver` casts. Pre-existing.

- `packages/ui/src/components/scroll-area.tsx` — removed unused `import * as React from "react"`. Pre-existing.

---

## 3. Wiring + demo artifact

- **`packages/infra/alchemy.run.ts`**: ✅ `DATABASE_URL` secret binding wired correctly. `DB` (D1) binding and import fully removed. `Env` type inference via `packages/env/env.d.ts` is unchanged and still flows from `alchemy.run.ts`.
- **`packages/db/src/index.ts`**: ✅ `drizzle-orm/neon-http` + `@neondatabase/serverless` `neon(env.DATABASE_URL)` wiring is correct. No CF-specific types leak into the public surface.
- **Artifact `S0-01-migration-output.txt`**: ✅ Exists, three sections present, looks real (terminal escape codes, absolute paths, exit code 0 on both commands). Honest about "0 tables" and "No schema changes".

---

## 4. Code quality

For each new/modified source file, one bullet per finding (or "clean"):

- `packages/db/src/index.ts` — **clean**. No `any`. No comments. Simple two-line body. Return type is inferred (`NeonHttpDatabase<typeof schema>`); since there is no explicit annotation, the source-text signature is unchanged from the pre-existing `createDb()`.
- `packages/db/drizzle.config.ts` — **clean**. Uses `dbCredentials: { url: process.env.DATABASE_URL! }`. Dialect is `'postgresql'`. `dotenv` loads `../../apps/server/.env` as before.
- `packages/infra/alchemy.run.ts` — **clean**. Surgical removal of D1 lines; `DATABASE_URL` added in the same bindings block. Pre-existing `console.log` statements at the bottom remain (not introduced by IC).
- `apps/server/.env.example` — **clean**. No secrets committed.
- `apps/server/README.md` — **clean**. Verbatim from brief §6.
- `README.md` (root) — **clean**. Stack line updated; no other changes.
- `package.json` (root) — **clean**. Catalog pins match mandated versions.
- `packages/db/package.json` — **clean**. `pg` is correctly scoped to `devDependencies` only.
- `apps/web/src/test/setup.ts` — **clean**. Type assertions are tighter than the previous `@ts-expect-error` approach.
- `apps/web/**/*.tsx` typing fixes — **clean**. All surgical, one-liner or minimal-hunk changes to match updated Base UI / TanStack Router APIs.

**Smells / nits:** None.

---

## 5. The `pg` devDependency deviation

- **What the IC did:** Added `pg: ^8.14.1` to the workspace catalog and to `packages/db` `devDependencies`.
- **Disclosed rationale:** drizzle-kit preferentially uses `@neondatabase/serverless` (websocket Pool) when it is the only Postgres driver present. The Neon websocket Pool cannot reach `localhost:5432`, causing `db:push` to fail against the local system Postgres.
- **Audit of the claim:** The artifact confirms the claim — `db:push` output shows `Using 'pg' driver for database querying` and succeeds. Without `pg` present, drizzle-kit would indeed default to the Neon driver.
- **Scoped properly?** Yes. `pg` is in `devDependencies` only. The runtime driver remains `drizzle-orm/neon-http`. No runtime code imports `pg`.
- **Verdict:** Justified deviation. Manager pass-through OK.

---

## 6. Honest summary

The IC shipped clean, surgical plumbing. The `packages/db` driver swap from `drizzle-orm/d1` to `drizzle-orm/neon-http` is correctly wired end-to-end: Drizzle config uses the Postgres dialect + `dbCredentials.url`, the runtime factory constructs a Neon HTTP client from `env.DATABASE_URL`, and the Alchemy Worker binding exposes `DATABASE_URL` as a secret. The `db:generate` / `db:push` demo ran successfully against the user's local system Postgres, producing an honest artifact. The out-of-scope `apps/web` typing fixes were all pre-existing TypeScript errors required to satisfy the DoD; none were caused by the dialect flip. The one deviation (`pg` as a devDependency) is well-scoped, honestly disclosed, and necessary for local `drizzle-kit` operations. No `@ts-ignore`, no `--no-verify`, no placeholder code, no fake artifacts.

---

## 7. Recommended action

- **Ready for r1.** Spec met, quality acceptable. Manager can run critical eval.
