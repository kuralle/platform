# Sprint 0 — Warm-down

> **Author (main session):** Claude Opus 4.7 (1M context) · 2026-05-07.
> **Sprint window:** 2026-05-07 (single-day sprint; condensed from the WBS-default 1-week cadence because all 6 stories were achievable end-to-end in one session given the foundations scope).
> **Outcome:** Sprint goal hit. Foundations are real, not vaporware — schema, OpenAPI contract, hook-wrapper rule, and 8 platform ports + memory adapter all ship behind a green CI run.

---

## 1. Goal recap

**Sprint goal (verbatim from WBS §2):**

> Ship Postgres-backed auth, an OpenAPI 3 contract emitted by oRPC and committed as the canonical public spec, a thin `@orpc/tanstack-query` client package consumed by `apps/web` behind hook wrappers, and the eight platform ports + memory adapter — proving the hexagonal seam and the API contract before any domain code lands.

**Did we hit it? Yes.** Schema regenerated against system Postgres (8 better-auth tables + all `+ext` columns from `DATA_MODEL.md §3`). Sign-up E2E proven against local Postgres + `pg` driver — user / personal organization (isPersonal=true) / member (role=owner) / session.activeOrganizationId all populate correctly through better-auth's `databaseHooks.{user.create.after, session.create.after}`. The OpenAPI spec is committed at `apps/server/openapi.json` with a CI drift gate that fires non-zero on uncommitted router changes. `@kuralle/api-client` is a 22-LOC thin wrapper over `@orpc/tanstack-query`; B1 home shows a live `useHealthCheck()` pill behind two ESLint forbidden-import rules (api-client + api-provider bypass closed in r2 fix-pass). `@kuralle/platform` package compiles four subpath exports (`./interface`, `./memory`, `./cloudflare`, `./node`); the memory adapter has a 53-test contract suite; the hexagonal-import lint blocks `core`/`api`/`db`/`runtime` from importing `cloudflare`/`node`/`memory` adapters in production source.

The **codegen gate (DATA_MODEL §19 step 1)** is `Gate-Partial` per pre-flight decision (PLAN §0): the better-auth + drizzle + Postgres + hooks combination is proven against real Postgres 15.12; the @neondatabase/serverless HTTP transport against actual Neon and the wrangler-dev Workers runtime are deferred until a Neon project is provisioned + CF credentials are available. Documented in `GATE-PARTIAL.md`; tracked as a backlog item.

---

## 2. Stories shipped

| Story | Status | Commit | Demo / artifact | Notes |
|-------|--------|--------|-----------------|-------|
| S0-01 | Done | `fd4721c` | `artifacts/S0-01-migration-output.txt` | Postgres swap via Neon HTTP at runtime; `pg` for drizzle-kit on localhost. Cursor IC; manager pre-fix none; pi/kimi gate green. Pre-existing apps/web TS errors fixed in same commit (kimi verified pre-existing on prior tip). |
| S0-02 | Done | `7ef5b26` | `artifacts/S0-02-auth-config.md` | Better-auth + organization + apiKey plugins + four-role access ladder + `databaseHooks.user.create.after` (personal org + owner member). Cursor IC; pi/kimi gate yellow (3 disclosed deviations, all justified or unavoidable per `@better-auth/api-key@1.5.5` types). |
| S0-03 | Done (Gate-Partial) | `0200168` + `c70b654` (fix) | `artifacts/{S0-03-tables.txt,S0-03-rows.txt,S0-03-signup.log}` | Schema regen via better-auth CLI; initial migration `0000_legal_vanisher.sql` applied. Sign-up E2E proven against local Postgres. Pi `[S0-03]` IC made two S0-02 amendments validated by kimi gate: `session.create.before → after` (transaction-isolation fix), apikey config simplified (referenceId IS organizationId per docs). Pi/kimi gate yellow → S0-03-fix landed AMENDMENT-002. |
| S0-04 | Done | `2e86acd` + `72e5070` (fix) | `artifacts/S0-04-drift-ci.txt` | OpenAPI drift CI via `OpenAPIGenerator` programmatic API (no server boot). `bun -F server gen:openapi --check` exits non-zero on drift; `.github/workflows/openapi-drift.yml` wires it. Pi/kimi gate green; one minor silent-catch fixed in fix-pass. |
| S0-05 | Done | `f69722f` + `4c24bbf` (fix) | `artifacts/{S0-05-type-flow-output.txt,S0-05-lint-violation.txt}` | `@kuralle/api-client` (22 LOC over `@orpc/tanstack-query`); `<ApiProvider>` mounted; B1 health pill live. ESLint flat config + forbidden-import rule. Pi/kimi gate green; manager pre-fix added `@cloudflare/workers-types` to apps/web tsconfig (pre-existing leak surfaced by S0-05 cache bust; verified pre-existing at parent commit). |
| S0-06 | Done | `a73efc2` + `6a39c24` (fix) | `artifacts/{S0-06-contract-test.txt,S0-06-lint-violation.txt}` | 8 platform ports + memory adapter (48 tests, 1 file post fix-pass), CF/Node stubs (type-honest, runtime-throw), hexagonal-import lint, vitest config excluding dist. Pi/kimi gate yellow → 5 fixes applied (ActorRef.call any[] match, drain async + no-silent-catch, dist exclude, test rename). |
| Sprint-level r2 fix-pass | Done | `9ff0f71` | `review-sprint-{r1,r2}.md` | Codex r2 verdict: Override r1. Manager applied 4 Apply-now items: hook-wrapper bypass closed (api-provider import restriction), hexagonal §6 rule 1 enforced literally for memory adapter (test-file exception), MessageQueue ack/nack mutual exclusivity + stop()-targets-exact-consumer + drain re-snapshot, drift-ci artifact rewritten with literal output. 5 new contract tests (53 total). |

No carry-over. No story slipped.

---

## 3. What's working

- **Sign-up flow end-to-end.** A POST to `/api/auth/sign-up/email` against the dev-server creates user + personal organization (isPersonal=true, name="<email>'s personal workspace", deterministic SHA-256-derived slug) + member (role=owner) + session (activeOrganizationId set) all in one transaction-coherent flow. Verified by `packages/auth/src/smoke-local.ts` and dumped to `artifacts/S0-03-rows.txt`.

- **OpenAPI spec is the canonical contract.** `apps/server/openapi.json` is regenerated programmatically via `OpenAPIGenerator` (no live HTTP fetch needed). `--check` mode exits non-zero on drift. The deliberate-drift demonstration in `artifacts/S0-04-drift-ci.txt` shows real exit codes and real `git diff` output. CI workflow `.github/workflows/openapi-drift.yml` runs on every push to `main` and PR.

- **Hook-wrapper purity is enforceable.** Two ESLint rules guard `apps/web`: (1) no `@kuralle/api-client` outside `hooks/api/**`, (2) no `@/providers/api-provider` outside `hooks/api/** + main.tsx + the provider itself`. Both rules verified by deliberate violation in throwaway branches.

- **Hexagonal seam is real.** All 8 ports (`KvStore`, `BlobStore`, `MessageQueue`, `RuntimePlatform` synthesis, `SessionStore`, `AuthAdapter`, `ActorHost`, `LlmGateway`) defined in `packages/platform/src/interface.ts` matching `HEXAGONAL §2` line-for-line. Memory adapter is a 53-test contract-faithful implementation. CF/Node stubs are type-honest (return shapes match port; runtime throws `not-implemented`). Domain code (`packages/{core,api,db,runtime}/**`) cannot import `cloudflare`/`node`/`memory` adapters in production source — only `interface.ts` is reachable. Memory adapter remains accessible in `*.test.ts` files.

- **MessageQueue contract semantics are correct.** ack/nack are mutually exclusive (throw on second call), idempotent on repeat. `handle.stop()` removes the exact registered consumer (Set-keyed by closure ref). `drain()` re-snapshots the consumer set per iteration so removing all consumers mid-flight terminates cleanly.

- **Type flow end-to-end.** Breaking a Zod refinement on `appRouter.healthCheck`'s output forces `tsc` to fail in `apps/web/src/hooks/api/health.ts`. Captured in `artifacts/S0-05-type-flow-output.txt`.

---

## 4. What's not working / known issues

| ID | Description | Severity | Owner | Tracking |
|----|-------------|----------|-------|----------|
| KI-S0-01 | `@neondatabase/serverless` HTTP driver cannot reach `localhost:5432`; production Workers + Neon runtime untested. Needs a Neon project + DATABASE_URL switched to a Neon HTTP endpoint. | major | next sprint with Neon access | `GATE-PARTIAL.md` (4 paths forward listed) |
| KI-S0-02 | `wrangler dev` / `alchemy dev` requires CF credentials (`alchemy login`); the Workers runtime is structurally validated (better-auth + drizzle adapter + `@kuralle/env/server` "cloudflare:workers" import) but never executed end-to-end. | major | next sprint with CF token | same |
| KI-S0-03 | `apikey` table lacks `organizationId` and `revokedAt` per `DATA_MODEL §3`. `referenceId` plays the `organizationId` role (semantic match per better-auth docs). `revokedAt` is genuinely missing; built-in `enabled` boolean + `expiresAt` cover most revocation needs. | minor | when use case demands | `AMENDMENT-002.md` |
| KI-S0-04 | Three global ESLint relaxations (`no-explicit-any → warn`, `triple-slash-reference → off`, `no-empty-object-type → off`) instead of file-scoped overrides. Each was justified per-file but globalised. | minor | S1 cleanup | r1 M1, r2 §3 |
| KI-S0-05 | `apps/web/tsconfig.json` includes `@cloudflare/workers-types` because `@kuralle/api-client → @kuralle/api → @kuralle/auth → @kuralle/env/server → "cloudflare:workers"` traverses the type graph. Fix is the right *immediate* fix; cleaner architectural fix is to split `@kuralle/env`. | minor | S1 or S2 architectural cleanup | r1 m3, r2 §3 |
| KI-S0-06 | Enum `+ext` columns (`organization.{environment,region,complianceMode}`, `user.systemRole`) stored as `text` without `CHECK` constraints. Better-auth's CLI emits `text` for both `string` and tuple types. Application layer uses correct enum strings; direct SQL writes could violate. | minor | supplement migration in S1 | S0-02 + S0-03 gate carry-forwards |
| KI-S0-07 | Six pre-existing source files are fully ignored by ESLint (lint debt). Tracked but not addressed this sprint. | minor | S1 cleanup | gate-S0-05 §3 |
| KI-S0-08 | `LlmProviderClient.__llm_placeholder` and `SessionStore.__aria_marker` placeholders in `packages/platform/src/interface.ts`. Will flip to real shapes / `@ariaflowagents/core` re-export in S2 when the LLM gateway and aria-flow are exercised. | minor | S2 | gate-S0-06 §6 |
| KI-S0-09 | No integration UI test for B1 health pill state mapping (only hook-state assertions). | nit | S1 polish | r2 §3 |
| KI-S0-10 | Platform contract.test.ts exercises `voice.openSupervisorTap()` only at existence level, not behavioural. Fine for S0; needs concrete assertions before S4. | nit | S4 | r2 §3 |

---

## 5. Decisions made

- **Local-system Postgres only this sprint; no docker-compose; Neon target deferred.** Rationale: user runs Postgres.app 15.12; PLAN §0 captured the trade-off; the codegen gate's load-bearing claim (better-auth + drizzle + Postgres + hooks all wire correctly) is proven against a real Postgres regardless of which Postgres the driver points at. RFC amendment: none (sprint-local deviation; documented in `GATE-PARTIAL.md`).
- **`@kuralle/api-client` wraps `@orpc/tanstack-query`, not `openapi-typescript`.** Source: `sprints/AMENDMENT-001.md`. Already accepted pre-sprint.
- **`apikey.organizationId` and `apikey.revokedAt` deviate from `DATA_MODEL §3`.** Rationale: `@better-auth/api-key@1.5.5`'s `ApiKeyOptions.schema` is typed `InferOptionSchema<ReturnType<typeof apiKeySchema>>` and rejects `additionalFields`; `referenceId` semantically replaces `organizationId`; built-in `enabled` + `expiresAt` cover revocation. Source: `sprints/AMENDMENT-002.md`.
- **`session.create.before → session.create.after`** in `packages/auth/src/create-kuralle-auth.ts`. Rationale: `.before` runs inside the user/org-creation transaction; `listOrganizations()` couldn't see the uncommitted personal org. Source: pi/kimi `gate-S0-03.md §3.1`.
- **`@kuralle/platform/memory` IS forbidden in domain production source.** Rationale: codex r2 §1.B argued correctly that `HEXAGONAL §6 rule 1` is literal — only `interface.ts` is allowed in domain code; memory is the test seam (rule 3) but binding production code to it makes tests pass while CF/Node runtime diverges. Test files are exempt via `*.test.ts` glob. Source: `gate-S0-06` + `review-sprint-r2.md`.
- **Hook-wrapper bypass closed via `@/providers/api-provider` lint restriction.** Rationale: codex r2 §1.A; without the rule, components could `import { $api }` directly. The api-provider module is allow-listed only for `hooks/api/**`, the provider file itself, and `main.tsx`. Source: `review-sprint-r2.md`.

---

## 6. Wiki / RFC amendments this sprint

| Amendment | File | Section | Commit |
|-----------|------|---------|--------|
| AMENDMENT-001 (pre-existing; honoured throughout) | `sprints/AMENDMENT-001.md` | n/a | (pre-sprint) |
| AMENDMENT-002 (apikey divergence) | `sprints/AMENDMENT-002.md` | references `DATA_MODEL.md §3 apikey` | `c70b654` |

`DATA_MODEL.md §3` itself is NOT edited this sprint; the divergence is documented in AMENDMENT-002 and tracked. A small follow-up commit at the start of S1 should append a "see AMENDMENT-002" note in `DATA_MODEL.md §3 apikey`.

---

## 7. Metrics

- **Sprint commits:** 12 (6 IC, 5 manager fix-passes, 1 sprint-level fix-pass)
- **Files changed across the sprint (vs `e152186`):** 111 files; +6470 / −184 lines
- **New packages:** 2 (`@kuralle/api-client` 22 LOC, `@kuralle/platform` ~2080 LOC across 37 files)
- **Tests:** 53 (platform contract) + 36 (apps/web: 34 pre-existing + 2 new health hook) = 89 total
- **OpenAPI spec endpoints:** 2 (`/healthCheck`, `/privateData`) — will grow to ~12 route groups in S1
- **`bun run check-types`:** 6/6 packages green (was 4/4 at sprint start; added `@kuralle/api-client` + `@kuralle/platform`)
- **`bun run lint`:** 0 errors, 1 pre-existing warning
- **`bun -F server gen:openapi --check`:** clean (drift gate green)
- **Workspace package count:** 9 (was 7 at sprint start; added `api-client`, `platform`)
- **Catalog deps added:** `@neondatabase/serverless@^1.1.0`, `pg@^8.14.1`, `@orpc/tanstack-query@^1.14.2`, `@tanstack/react-query@^5.100.9`, `vitest@^4.1.5`. `@orpc/{server,openapi,zod,client}` bumped `^1.13.14 → ^1.14.2`.
- **Catalog deps removed:** `@libsql/client`, `libsql` (no longer reachable post-D1 swap).

---

## 8. Backlog updates

**Added (BL-S0-* from KI-S0-* above):**
- BL-S0-01: provision Neon DB + close Workers+Neon-HTTP runtime gate (KI-S0-01, KI-S0-02).
- BL-S0-02: enum CHECK constraints supplement migration (KI-S0-06).
- BL-S0-03: split `@kuralle/env` so apps/web doesn't traverse Workers types (KI-S0-05).
- BL-S0-04: replace 3 global ESLint relaxations with file-scoped overrides + clear ignores list (KI-S0-04, KI-S0-07).
- BL-S0-05: `apikey.revoked_at` supplement migration if/when distinct-from-`enabled`/`expiresAt` is needed (KI-S0-03).
- BL-S0-06: assign explicit completion sprint for `kb`, `tools`, `voices`, `webhooks`, `secrets`, `batches` router stubs (the WBS is implicit).

**Promoted from backlog into S1:**
- (none — S1 already has its own scope per `WBS §3 Sprint 1`)

**Removed (no longer relevant):**
- (none)

---

## 9. Retrospective

### Keep
The four-role review pipeline (cursor/pi/deepseek IC → pi/kimi gate → manager r1 → codex r2 → manager fix) found real bugs that any single voice would have missed. Codex r2 specifically caught the hook-wrapper bypass and the memory-adapter import leak — both architectural, not surface-level. The per-story manager-fix-pass commit cadence (`[S0-{nn}-fix]`) gave clean attribution: every fix traces to a specific gate finding. Keep this loop.

### Change
The cursor/composer-2-fast model ran out of credits mid-sprint (after S0-02). The mid-flight switch to `pi/deepseek-v4-pro` for ICs was bumpy: pi created multiple stray scratch files in wrong locations (3 stray smoke copies + 2 dev-server.ts copies) before its final commit cleaned up. The S0-03 IC took ~37 min wall time (vs ~10 min for cursor's S0-01/S0-02) partly due to this iteration noise. Next sprint: use pi/deepseek from story 1 (no model switching mid-sprint), and pin the smoke/dev-tooling location explicitly in the brief to reduce iteration on file placement.

### Try next
For S1, run **two independent stories in parallel** (e.g. S1-01 knowledge family + S1-04 cross-cutting tables) using `/delegate-parallel` since they touch disjoint schema files. The remaining four (S1-02 agents, S1-03 channels, S1-05 router stubs, S1-06 seed) still depend on each other and run sequentially. Risk: bun.lock contention during parallel `bun install`s — mitigate by having both ICs share the same lockfile baseline at fire time.

---

## 10. Pointers for the next sprint

These end up in `HANDOFF.md` more concisely. Here, the load-bearing things the S1 session must know:

- **Read first:** `sprints/STATE.md` → `sprints/sprint-0/HANDOFF.md` → `sprints/sprint-0/GATE-PARTIAL.md` → `DATA_MODEL.md §4–§13` and `§18` (codegen sequence).
- **Traps:**
  - `apikey` schema diverges from `DATA_MODEL §3` per AMENDMENT-002. New code that touches apikey should consult that file.
  - The "pre-existing TS errors got fixed in S0-01" pattern means turbo's cache may hide real errors. After a big change in S1, force a fresh `bun run check-types --force` once.
  - The `@kuralle/env/server` `cloudflare:workers` import path leaks into `apps/web`'s type graph. Workers types are pulled in via `apps/web/tsconfig.json`. S1 should avoid making this worse and ideally split `@kuralle/env` (BL-S0-03).
- **Open RFC amendments still in flight:** AMENDMENT-001 (frontend client; pre-sprint), AMENDMENT-002 (apikey divergence; this sprint).
- **Open issues that block S1:** none. S1 is unblocked. The Neon/Workers gate-partial does NOT block S1 — S1 builds schema; runtime concerns lift in S2+.

---

## 11. Closeout

- [x] All shipped stories have atomic commits.
- [x] All `Apply now` items from r1 + r2 + per-story gates are resolved.
- [x] Backlog deltas added (above; will be reflected in `WBS §4` in a follow-up).
- [x] `sprints/sprint-0/HANDOFF.md` written.
- [x] `sprints/STATE.md` updated with S1 active sprint pointer + load-bearing reading list.
- [x] Demo artifacts archived under `sprints/sprint-0/artifacts/`.

Sprint 0 is closed.
