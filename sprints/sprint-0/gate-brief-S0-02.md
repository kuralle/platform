# Gate Brief — `S0-02` better-auth: organization + apiKey plugins, +ext fields, four-role access

> **You are the spec + code-quality gate worker (`pi/kimi-k2.6`). You are NOT the IC. You are NOT adversarial. You are the same team as the IC — the second pair of eyes that catches things before the manager's r1.** The IC was `cursor` running on `composer-2-fast`. The IC has already committed atomically. Your output is a markdown report — no code changes, no commits.

---

## 1. Context

- **Story:** `S0-02` — Configure better-auth with `organization` + `apiKey` plugins.
- **IC commit:** `7ef5b26` — `[S0-02] better-auth: organization + apiKey plugins, +ext fields, four-role access`
- **IC worker:** `cursor` / `composer-2-fast`.
- **You are:** `pi` / `kimi-k2.6`.

**Inputs to your gate (read all of them):**
1. The story brief: `sprints/sprint-0/brief-S0-02.md`. The contract.
2. The IC's transcript (note: 0 bytes — the IC's stdout-flush failed before exit, but the commit landed): `.handoff/result-S0-02.txt`. **Treat this transcript as effectively unavailable.** Use the commit body as the IC's narrative instead: `git log -1 --format=%B 7ef5b26` or `git show --no-patch --format=fuller 7ef5b26`.
3. The diff on disk:
   - `git show 7ef5b26` for the full diff (~374 insertions across 8 files).
   - Read every file the IC created or modified:
     - `packages/auth/src/create-kuralle-auth.ts` (new, ~231 LOC — the heart of the diff)
     - `packages/auth/src/index.ts` (rewritten as a thin wrapper)
     - `packages/auth/src/cli.ts` (new — Node `process.env` + Neon HTTP variant)
     - `packages/auth/better-auth.config.ts` (new — CLI re-export with dotenv)
     - `packages/auth/package.json` (added `@better-auth/api-key@1.5.5`, `@neondatabase/serverless`, `drizzle-orm`)
     - `packages/auth/tsconfig.json` (extended `include`)
     - `bun.lock`
     - `sprints/sprint-0/artifacts/S0-02-auth-config.md`
4. The sprint plan for context: `sprints/sprint-0/PLAN.md` §0 (esp. the better-auth `1.5.5` RFC pin in §0).
5. The relevant spec docs:
   - `DATA_MODEL.md §3` — the **+ext column list** for `user`, `organization`, `member`, `apikey`. **The brief lifted these verbatim into AC #3; verify every column survives in the IC's `additionalFields`.**
   - `DATA_MODEL.md §19 step 1` — better-auth 1.5.5 is the codegen-gate version. **Verify the catalog still pins 1.5.5; verify nothing in the diff bumps past it.**
   - `<https://www.better-auth.com/docs/plugins/organization>` — the organization plugin's `access` API and the four-role pattern.
   - `<https://www.better-auth.com/docs/plugins/api-key>` — apiKey plugin.
6. The kickoff prompt's **rules** that apply to S0-02 specifically:
   - **§13 rule 9:** Pin latest stable (or amend RFC pin). The IC kept `better-auth: 1.5.5` per the RFC pin. Verify.
   - **§13 rule 10:** Manager owns commits. IC made one atomic commit. ✅ structurally; verify.
   - **No shortcuts:** zero `--no-verify`, `@ts-ignore`, `try/catch: pass` in the diff. Verify with grep.
   - **Public TS surface:** `createAuth()` signature unchanged (per AC #1 + DoD). Verify by reading the new `index.ts`.

---

## 2. Your job — two halves

### 2.1 Spec adherence (did the IC meet the brief?)

Walk **every** acceptance criterion in `sprints/sprint-0/brief-S0-02.md §4` (criteria 1–8). For each:
- **Met / partial / missed.** Cite file:line in the diff.
- If partial: what's missing?
- If missed: is the IC's commit-body hedge honest?

**Specific things to verify rigorously:**

- **AC #3 — `additionalFields` cover every `+ext` column.** Compare the IC's `create-kuralle-auth.ts` lines 29–116 to `DATA_MODEL.md §3`. The IC's commit body discloses two **deviations from the brief's letter**:
  1. **Enum types as `string`.** The brief asked for enum types (e.g., `vertical: enum('home-services', ...)`). The IC used `type: "string"` because better-auth's `DBFieldAttribute` TypeScript shape rejects literal tuple types in 1.5.5. The artifact (`S0-02-auth-config.md`) discloses this. **Audit:**
     - Is the IC's claim about the `DBFieldAttribute` shape true? (You can verify by inspecting `node_modules/better-auth/dist/.../additional-fields.d.ts` or the org-plugin types.)
     - If true → ✅ the deviation is necessary; the Postgres-level `pgEnum` / `CHECK` constraint must be added during S0-03 codegen. **Flag this as an explicit S0-03 carry-forward** so the next IC doesn't miss it.
     - If false → ⚠️ the IC took a shortcut; flag for manager.
  2. **`member` ≡ `viewer` at org-plugin level.** The IC's `defaultAc.newRole({ ac: ["read"] })` for viewer is identical (in org-plugin permissions) to `member`'s default. The artifact discloses this with the note "domain-level RBAC will distinguish them." Per the brief AC #4: "owner can do everything, admin can invite + manage members, member can read + author within the workspace, viewer can only read." The IC's map collapses `member` and `viewer` at the org-plugin layer. Audit:
     - Is `member` actually given write access at the org-plugin level by `defaultRoles.member`? Read `node_modules/better-auth/plugins/organization/access.d.ts` (or the runtime export `defaultStatements` / `defaultRoles`) to know what `member` actually carries.
     - If `defaultRoles.member` already includes write (e.g., `member: ["create"]` on resources), then the IC's claim that `member ≡ viewer` is wrong — they ARE distinct, the IC just summarized it incorrectly in the artifact. Note the discrepancy.
     - If `defaultRoles.member` is identical to `viewer` here, the IC's claim is honest, and the brief's "member can author" expectation has to be enforced in domain RBAC (S2+). **Flag for manager** as a documented architectural constraint.

- **AC #5 — `databaseHooks.user.create.after` hook.** Read `create-kuralle-auth.ts` lines 156–194. Verify:
  - Personal org name format matches the brief: `${user.email}'s personal workspace` ✅ visible at line 178.
  - `isPersonal: true`, `createdByUserId: user.id`, `complianceMode: 'none'`, `environment: 'production'`, `region: 'us-east-1'` all set ✅ (verify exact values).
  - Slug strategy: SHA-256 of lowercase email, first 12 bytes hex, prefixed `personal-` (lines 118–124). Collision retry up to 8 attempts. **Verify** `crypto.subtle.digest` is available in the runtime contexts that will execute this hook (better-auth runs both on Workers and Node CLI — `crypto.subtle` works on both).
  - `member.role = 'owner'` ✅ (line 192).
  - The hook short-circuits if `user.id`, `user.email`, or `ctx.context.adapter` is missing (line 159) — defensive. **Is this defensive guard appropriate or overcautious?** (Brief did not specify; minor finding either way.)
  
  **Bonus the IC added:** `databaseHooks.session.create.before` to seed `session.activeOrganizationId` to the personal org id (lines 197–222). **The brief did not ask for this.** It addresses S0-03's AC #5 ("session.activeOrganizationId is set"). Audit:
  - Is the addition load-bearing for S0-03's gate? If S0-03 will fail without it, the IC was right to add it (HEXAGONAL-style "fix the underlying issue").
  - If better-auth's organization plugin already auto-populates `activeOrganizationId` on session create when there's only one org, the addition is redundant. Check the plugin source / docs.

- **AC #7 — `packages/auth/better-auth.config.ts` + `packages/auth/src/cli.ts` exist and are import-resolvable.** Verify the dotenv path:
  - `better-auth.config.ts` (line ~3) loads `apps/server/.env`. The brief specified `import.meta.url` resolution for path stability. Verify this is actually used (or the path is otherwise stable).
  - `cli.ts` should NOT import `cloudflare:workers`. Verify (it should read `process.env.DATABASE_URL` directly).

- **AC #8 — Artifact `S0-02-auth-config.md`.** Read it. The brief required four sub-pieces:
  - (a) `additionalFields` shape ✅ visible.
  - (b) Four-role permission table ✅ visible (lines 60–66).
  - (c) Hook flow ✅ visible (lines 71–80).
  - (d) better-auth API names imported ✅ visible (lines 7–16).
  All four present. ✅.

**The IC's added export — `@better-auth/api-key`:** the IC discovered that better-auth 1.5.5 doesn't ship `apiKey` from `better-auth/plugins/*`; it lives in a separate package `@better-auth/api-key@1.5.5`. The IC added it to deps. **Is this an undisclosed dep deviation?** The brief said: "Better-auth ships `organization` + `apiKey` from the same package … no new deps should be needed. If you find that the plugins are split into a separate `@better-auth/plugins` package in 1.5.5, **stop and ask** before adding it." The IC added the dep without stopping. **Audit:**
- If the apiKey plugin truly is only available via `@better-auth/api-key` in 1.5.5, the IC was correct to add it (there was no alternative). The "stop and ask" was a guard against an avoidable bump; this is unavoidable.
- The peer-version match (`@better-auth/api-key@1.5.5` matches `better-auth@1.5.5`) is good hygiene.
- **Flag this as a procedural finding** — the IC ignored the "stop and ask" directive but the underlying decision was correct. Manager can decide.

### 2.2 Code quality

For every new or modified source file, check (per the gate template §2.2):

- **Type tightness.** No `any`. The IC used `Parameters<typeof drizzleAdapter>[0]` for `db` parameter — that's good (avoids hard-coupling to drizzle's specific db type). Verify no `any` slipped in.
- **Naming.** `createKuralleBetterAuth` reads clearly; `slugFromEmailStable` is descriptive. The wrapper `createAuth` in `index.ts` keeps the public name unchanged. ✅ if so.
- **Idiomatic patterns.**
  - The `cli.ts` and the production `index.ts` share the `createKuralleBetterAuth` builder. **DRY check:** is the shared logic actually shared (single source of truth) or duplicated?
  - Imports use `import type` where possible (e.g., `OrganizationOptions`, `ApiKeyConfigurationOptions`).
- **Smells.**
  - The slug-collision retry loop (lines 165–172) has a magic constant `8`. Acceptable for a small bound but worth noting.
  - The `as ApiKeyConfigurationOptions` cast on line 116 — is it necessary, or is it papering over a missing property? Audit.
  - `complianceMode` in additionalFields (line 58) and in the hook (line 185) — consistent.
- **Tests.** None added in this story. The brief said no tests in S0-02 (behavioral coverage in S0-03). ✅. Verify no fake placeholder tests.
- **Project-specific rules:**
  - **OpenAPI drift CI** (kickoff §13 rule 11): S0-04 lands the gate; S0-02 added no oRPC routers. ✅ N/A.
  - **Hook-wrapper rule** (kickoff §13 rule 12): S0-02 doesn't touch `apps/web`. ✅ N/A.
  - **Hexagonal discipline** (kickoff §13 rule 13): `core/` and `runtime/` don't exist yet. `auth/` is its own module. The IC's `cli.ts` imports `@neondatabase/serverless` directly — that's a CF-native dep, but `cli.ts` runs on Node (it's the CLI entry). Is this acceptable?
    - The hexagonal rule forbids `core/`, `api/`, `db/`, `runtime/` from importing `platform/cloudflare/` or `platform/node/` adapter packages. `auth/` isn't on the forbidden list. `@neondatabase/serverless` is not a kuralle adapter; it's a third-party driver. So the rule doesn't apply.
    - But for the codegen CLI to run on Node and use `neon-http` is unusual; check whether it works. If the CLI errors on Node, that's an S0-03 risk — flag.
  - **Better-auth pin 1.5.5** (DATA_MODEL §19 step 1): catalog still says `1.5.5`; the new dep `@better-auth/api-key@1.5.5` matches. ✅ verify.

---

## 3. Output

Write `sprints/sprint-0/gate-S0-02.md` with these sections:

```md
# Spec + Code-Quality Gate — `S0-02` better-auth config

> **Gate worker:** pi / kimi-k2.6.
> **IC worker:** cursor / composer-2-fast.
> **Verdict:** {green | yellow | red}

## 1. Spec adherence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| AC1 | createAuth wires both plugins | ✅ | packages/auth/src/create-kuralle-auth.ts:154 |
| AC2 | drizzleAdapter provider:'pg' | ✅ | … |
| AC3 | +ext columns covered | ✅/⚠️/❌ | … |
| AC4 | four-role ladder | ✅/⚠️/❌ | … |
| AC5 | user.create.after hook | ✅ | … |
| AC6 | check-types green | ✅ | manager pre-verified |
| AC7 | better-auth.config.ts + cli.ts | ✅ | … |
| AC8 | artifact present | ✅ | … |

## 2. File-list adherence

(table — every file in brief §3 vs. what's in the diff)

## 3. Disclosed deviations — audit

- Enum-as-string: justified / unjustified — verdict + reason.
- member ≡ viewer at org-plugin level: justified / discrepant — verdict + reason.
- @better-auth/api-key dep added without "stop and ask": justified (unavoidable in 1.5.5) / unjustified — verdict + reason.
- session.create.before hook (undisclosed addition in brief): justified (load-bearing for S0-03) / not — verdict + reason.

## 4. Wiring + demo artifact

(text)

## 5. Code quality

(bullet list per file)

## 6. Carry-forwards for S0-03

- pgEnum / CHECK constraint additions for the `string`-typed enum +ext columns must be added during S0-03 codegen.
- Verify the codegen CLI runs cleanly with `cli.ts` + `better-auth.config.ts` against Node.
- (any others surfaced)

## 7. Honest summary

One paragraph.

## 8. Recommended action

- Ready for r1
- Needs IC fix pass before r1
- Ambiguous spec — manager owns
```

Verdict: green | yellow | red.

---

## 4. What NOT to do

- Do not rewrite the IC's code.
- Do not be adversarial. r2 (codex) is the adversarial pass.
- Do not duplicate brief language.
- Do not skip files.
- **Do not commit.** Manager owns commits.
- Do not approve a story with fake artifacts or misleading commit-body claims.

---

## 5. Tone

Calm, grounded, on-team. Plain language. The manager reads your report alongside the diff.
