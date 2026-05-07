# Sprint Brief (Second Opinion, r2) — Sprint 0 Foundations

> **You are codex, the second-opinion adversarial reviewer.** The ICs were `pi/deepseek-v4-pro` (S0-03..S0-06) and `cursor/composer-2-fast` (S0-01, S0-02). The spec+quality gate was run per-story by `pi/kimi-k2.6`. The manager (Claude Opus 4.7) wrote `review-sprint-r1.md`. You are the fourth independent voice — find what r1 + the per-story gates missed.

---

## 1. Context

**Sprint:** 0 — Foundations.
**Goal:** Postgres-backed auth + OpenAPI 3 contract + `@orpc/tanstack-query` hook wrappers + 8 platform ports + memory adapter — proving the hexagonal seam and the API contract before any domain code lands.

**Inputs (read all in this order):**

1. **Plan + decisions:**
   - `sprints/sprint-0/PLAN.md` (esp. §0 pre-flight: local Postgres only, Neon deferred).
   - `sprints/AMENDMENT-001.md` (frontend uses `@orpc/tanstack-query`).
   - `sprints/AMENDMENT-002.md` (apikey `referenceId` IS `organizationId`; `revokedAt` deferred).
   - `sprints/sprint-0/GATE-PARTIAL.md` (codegen gate state: local pg passed, Workers+Neon-HTTP untestable).

2. **Story briefs (the contracts):**
   - `sprints/sprint-0/brief-S0-01.md` — Postgres swap.
   - `sprints/sprint-0/brief-S0-02.md` — better-auth org+apiKey plugins.
   - `sprints/sprint-0/brief-S0-03.md` — auth schema regen + sign-up E2E (CODEGEN GATE).
   - `sprints/sprint-0/brief-S0-04.md` — OpenAPI emission + drift CI.
   - `sprints/sprint-0/brief-S0-05.md` — api-client + hook wrappers + forbidden-import lint.
   - `sprints/sprint-0/brief-S0-06.md` — 8 platform ports + memory adapter + hexagonal-import lint.

3. **Per-story spec gates (pi/kimi-k2.6):**
   - `sprints/sprint-0/gate-S0-01.md` (verdict: green).
   - `sprints/sprint-0/gate-S0-02.md` (verdict: yellow).
   - `sprints/sprint-0/gate-S0-03.md` (verdict: yellow).
   - `sprints/sprint-0/gate-S0-04.md` (verdict: green).
   - `sprints/sprint-0/gate-S0-05.md` (verdict: green).
   - `sprints/sprint-0/gate-S0-06.md` (verdict: yellow).

4. **Manager r1 sandwich review:**
   - `sprints/sprint-0/review-sprint-r1.md`.

5. **The diffs on disk (12 commits):**
   ```
   git log --oneline e152186..HEAD
   6a39c24 [S0-06-fix] gate-S0-06 Apply-now: ActorRef any[], no silent catch, vitest dist exclude, test rename
   a73efc2 [S0-06] platform ports + memory adapter + hexagonal-import lint
   4c24bbf [S0-05-fix] gate-S0-05 Apply-now: commit cloudflare:workers-types fix to apps/web
   f69722f [S0-05] @kuralle/api-client + tanstack-query hooks + forbidden-import lint
   72e5070 [S0-04-fix] gate-S0-04 Apply-now: log temp-file cleanup failures instead of swallowing
   2e86acd [S0-04] OpenAPI emission + drift CI gate
   c70b654 [S0-03-fix] gate-S0-03 Apply-now items: rename GATE file, demo log, AMENDMENT-002
   0200168 [S0-03] regen auth schema, initial migration, sign-up E2E
   7ef5b26 [S0-02] better-auth: organization + apiKey plugins, +ext fields, four-role access
   fd4721c [S0-01] swap @kuralle/db to Neon serverless Postgres
   ```
   Use `git diff e152186..HEAD` for the cumulative diff, or `git show <sha>` for each commit.

6. **The source RFCs (only sections relevant to S0):**
   - `DATA_MODEL.md §3` (auth/tenancy via better-auth) — verify the `+ext` columns survived in the regenerated schema.
   - `DATA_MODEL.md §19 step 1` — the codegen gate; understand why pi reported `Gate-Partial` honestly.
   - `HEXAGONAL_ARCHITECTURE.md §2` — the eight ports. Walk every interface signature against the diff.
   - `HEXAGONAL_ARCHITECTURE.md §6` — discipline rules (esp. rules 1, 3, 6).
   - `INTERFACE_DESIGNS_RuntimeHost.md §5` — the synthesis sketch (Voice + Messaging + Diagnostics + RuntimeFailure).
   - `INTERFACE_DESIGNS_RuntimeHost.md §A.2(d)` — the in-memory messaging RuntimeHost reference (~28 LOC).

---

## 2. Your job

**Find what r1 + the per-story gates missed.** r1 already lists 1 major (M1: lint relaxations), 3 minors (m1-m3), and 5 nits. r1 marked the sprint as "Approve with minor fixes." Be skeptical of that verdict.

**Adversarial focus areas (project-specific):**

1. **AriaFlow event drift — N/A in S0.** Aria-flow is not yet on the dep graph (lands S2). But: do the `RuntimePlatform` interfaces in `packages/platform/src/interface.ts` shape themselves around AriaFlow primitives in a way that will collide when aria-flow is installed in S2? Specifically the `SessionStore` placeholder marker — does the placeholder shape *constrain* what we can re-export from `@ariaflowagents/core` later, or is it permissive enough?

2. **Projection-vs-snapshot consistency — N/A in S0.** No projector in S0; lands S2.

3. **RLS bypass paths — N/A in S0** (RLS lands S5). But: is there any place in `packages/auth/src/create-kuralle-auth.ts`'s hooks where a query bypasses workspace scoping? Specifically `databaseHooks.user.create.after`: does it scope `getOrgAdapter(...).findOrganizationBySlug(slug)` correctly? If the slug-collision retry produces a slug that already exists for ANOTHER user's personal org, what happens?

4. **Hook-wrapper bypass paths.** The ESLint rule restricts `@kuralle/api-client` outside `apps/web/src/hooks/api/**` and `apps/web/src/providers/api-provider.tsx`. Are there any other paths a component could reach the client (e.g., re-exporting from `hooks/api/` and importing the re-export elsewhere)? Is the `ApiProvider` itself doing anything that should be in a hook?

5. **OpenAPI drift CI cliff cases.** The `--check` mode shells out to `diff` (kimi S0-04 carry-forward). What happens in CI if `diff` emits binary-mode output (different line endings)? What if the spec gets a stable property added by an `@orpc/*` patch — the gate fails and blocks PRs even though no router changed.

6. **Hexagonal-import lint coverage.** r1 m1 noted that `@kuralle/platform/memory` is implicitly allowed in `packages/{core,api,db,runtime}/**`. Is this safe? Could a domain author silently import the memory adapter into production code, where it would Map-back the production behaviour and look correct in tests but fail at runtime in CF/Node?

7. **Type-safety holes specifically:**
   - `packages/platform/src/interface.ts:271-275` — the two scoped `any` in `ActorRef.call`. They match HEXAGONAL §2.7 verbatim, but is the `any` actually necessary or can it be expressed with `unknown[]` + a type guard?
   - `packages/platform/src/memory/auth-adapter.ts` — the base64 widget-token encoding is non-cryptographic. Is the type signature honest about that (returns `string`, accepts `string`)? Is there any path where a non-memory caller would mistake the format for a cryptographic JWT?
   - `packages/platform/src/memory/blob-store.ts` — the `signedUrl` returns a `memory://` URL. If a caller passes this to `fetch()` directly, it'll fail. Is the URL shape clear about its non-routability?

8. **MessageQueue async-drain correctness.** `[S0-06-fix]` made `drain()` properly async-await the handler before checking ack/nack. Walk through: what if a consumer's `handler()` calls `ack()` AND `nack()`? What if it calls neither and the handler resolves normally? What if the handler is removed mid-drain (consumer.stop())?

9. **Deliberate-violation artifact authenticity.** Read `S0-04-drift-ci.txt`, `S0-05-lint-violation.txt`, `S0-06-lint-violation.txt`, `S0-05-type-flow-output.txt`. Is any of them narrative-only (kimi S0-04 carry-forward flagged this)? Could any be fabricated? Read each line.

10. **bun.lock entropy.** Look at the cumulative `bun.lock` diff over the 12 commits. Anything unexpected enter the dep graph? A new transitive that pulls in heavy native deps (e.g., a `node-gyp` chain)?

11. **The S0-02 amendments pi made in [S0-03].** pi changed `session.create.before` → `session.create.after` for transaction-isolation reasons, AND removed apikey `additionalFields`. The kimi gate validated both against installed package types. Verify the rationale ONE more time:
    - Is `session.create.after` actually post-transaction in better-auth 1.5.5 source? (Read `node_modules/.bun/.../better-auth/dist/db/with-hooks.mjs`.)
    - Does the `is_personal || isPersonal` snake_case fallback in the hook actually need both keys, or is one redundant given drizzle-pg's column mapping?

12. **`apps/web` cloudflare:workers leak.** r1 m3 says it's "the right immediate fix but the wrong architectural fix." Is the leak actually exploitable? If a malicious dependency ships a `cloudflare:workers` virtual module, would apps/web pick it up at runtime?

13. **Test gaps:**
    - `apps/web/src/hooks/api/health.test.tsx` — the failure-path test mocks the oRPC client. Does it actually exercise the hook's error-rendering path in B1 home, or just the hook's `isError` state in isolation?
    - `packages/platform/src/memory/contract.test.ts` — does it exercise the `RuntimePlatform`'s `voice.openSupervisorTap()` and the diagnostics methods? Or only KvStore/BlobStore/MessageQueue?
    - `apps/server/openapi.json` regen idempotency: tested in CI but not in a unit test of `gen-openapi.ts` itself.

14. **Critique r1 directly.** Where r1 marked something a "minor" — does it deserve "major"? Where r1 said "load-bearing decision" — was the praise generic? Disagree explicitly if you find a divergence.

---

## 3. What NOT to do

- Do not rewrite code. Markdown report only.
- Do not litigate style. Cite a rule (RFC §, wiki §, DoD line, kickoff prompt rule, library doc) for every critique.
- Do not duplicate r1's praise. Assume the reader has already read it.
- Do not invent rules. Every critique cites a real source.
- Do not commit anything.

---

## 4. Output

Write `sprints/sprint-0/review-sprint-r2.md` (the manager will commit it during closeout).

Your verdict at the end is one of:

- **Endorse r1.** r1 caught everything; nothing additional to add. (Rare — be skeptical.)
- **Strengthen r1.** r1 was substantially right; here are additional items.
- **Override r1.** r1 missed a blocker or upgraded a critique that should have been downgraded (or vice-versa). Name the disagreement explicitly.

Use the structure of `sprints/templates/REVIEW-r2.md` if it exists, or just write a clean markdown report with sections: (1) what r1 got right and what it missed (2) Apply-now items the manager must resolve before sprint closeout (3) carry-forwards (4) verdict.

---

## 5. Tone

Senior, calm, evidence-based. No mockery, no hedging. "This is a blocker because X" — not "perhaps reconsider." If you escalate something r1 marked minor, name the rule that's violated.

You are the strongest spec + code-quality + adversarial gate before sprint closeout. The sprint does not close until every blocker and major item from both reviews is resolved.
