# Handoff — Sprint 0 → Sprint 1

> **One page. Read this before doing anything else.** Depth lives in [`WARMDOWN.md`](./WARMDOWN.md); this is the read-me-first.

---

## State of the world (one paragraph)

Sprint 0 (Foundations) is complete. Postgres-backed auth + 8 better-auth tables w/ all `+ext` columns + initial migration applied; OpenAPI 3 contract committed at `apps/server/openapi.json` with a CI drift gate that fires on uncommitted router changes; `@kuralle/api-client` (22-LOC `@orpc/tanstack-query` wrapper) consumed by `apps/web` behind two ESLint forbidden-import rules; eight platform ports + memory adapter (53 contract tests) + CF/Node stubs + hexagonal-import lint. **The hexagonal seam is real and CI-enforced.** The S0 codegen-gate (`DATA_MODEL §19 step 1`) is `Gate-Partial`: better-auth + drizzle + Postgres + hooks proven against local Postgres 15.12; Workers + Neon-HTTP transport deferred until a Neon project + CF credentials are provisioned (does NOT block S1).

---

## Sprint 1 goal (verbatim from WBS §2)

> **Land all 18 codegen steps from `DATA_MODEL.md §18` as Drizzle files plus initial migration plus a Calderon HVAC seed, with one oRPC router stub per aggregate root so the OpenAPI spec grows incrementally.**

The full sprint section is at `sprints/WBS.md` § Sprint 1 (stories S1-01 through S1-06).

---

## Read these first (in this order, before delegating any story)

1. `sprints/STATE.md` — confirms the active sprint and the load-bearing reading list.
2. `sprints/WBS.md` § Sprint 1 (S1-01 .. S1-06).
3. `sprints/sprint-0/WARMDOWN.md` — only §4 (known issues) + §10 (pointers).
4. `sprints/AMENDMENT-002.md` — apikey divergence; consult before touching apikey-related code.
5. `DATA_MODEL.md §4–§13` (every aggregate root) + `§18` (codegen sequence steps 1-18).
6. `DATA_MODEL.md §15` (cross-cutting constraints: monthly partitioning for `audit_log_events`, soft-delete columns, the channel-polymorphic CHECK trigger).
7. `apps/server/openapi.json` — the canonical contract from S0; will grow from 2 to ~12 route groups during S1.
8. `packages/db/src/schema/auth.ts` + `packages/db/src/migrations/0000_legal_vanisher.sql` — the precedent for how the rest of the schema lands (Drizzle `pgTable`, `pgcore.text`, `timestamp`, etc.).

---

## Traps to know about

- **Turbo cache can hide TS errors.** S0-05's `[S0-05-fix]` caught a `cloudflare:workers` resolution failure that had been latent since the initial commit (turbo's check-types cache hid it). After any big change in S1, run `bun run check-types --force` once to bust the cache.
- **`apikey` schema diverges from `DATA_MODEL §3`** per `AMENDMENT-002.md`: `referenceId` IS the org FK (no `organizationId`); `revokedAt` is omitted (use `enabled=false` + `expiresAt`). New code must consult AMENDMENT-002, not the original §3 wording.
- **`@kuralle/env/server` leaks `cloudflare:workers`** into `apps/web`'s type graph. `apps/web/tsconfig.json` includes `@cloudflare/workers-types` to compensate. S1 should not make this worse; ideally S1 or S2 splits `@kuralle/env` (BL-S0-03).
- **Enum `+ext` columns are `text` without `CHECK` constraints.** Better-auth's CLI emits `text` for both `string` and tuple types; the application layer uses the right enum strings, but a direct SQL writer could violate. Plan: add a supplement migration `00xx_enum_checks.sql` early in S1 (BL-S0-02).
- **Three global ESLint relaxations** (`no-explicit-any → warn`, `triple-slash-reference → off`, `no-empty-object-type → off`) are pragmatic band-aids from S0-05/S0-06. Tighten to file-scoped overrides during S1 (BL-S0-04).
- **Hexagonal-import lint already covers `core/`/`runtime/`** which don't exist yet; when those packages first appear in S2, the rule applies automatically. Memory adapter is forbidden in domain production source — only `*.test.ts` files can import it.
- **Hook-wrapper bypass closed via the `@/providers/api-provider` lint rule.** Any new hook in `apps/web/src/hooks/api/<resource>.ts` is the ONLY allowed consumer of `$api`. `main.tsx` is allow-listed for the `<ApiProvider>` JSX wrapper but does not use `$api`.

---

## Open issues that block sprint 1

| Issue | Severity | Status |
|-------|----------|--------|
| (none) | — | S1 is unblocked. Schema work doesn't need Neon or CF credentials. |

The Neon/Workers gate-partial (`GATE-PARTIAL.md`) does NOT block S1. S1 builds schema; runtime concerns lift in S2+ when domain code starts running.

---

## Start by running

```bash
cd /Users/mithushancj/Documents/asyncdot/openscoped/voice-platform/kuralle && \
  cat sprints/STATE.md && \
  bun install --frozen-lockfile && \
  bun run check-types && \
  bun run lint && \
  bun -F @kuralle/platform test && \
  bun -F server gen:openapi --check && \
  echo "✅ S0 baseline confirmed; S1 ready"
```

Expect: 6/6 check-types, 0 lint errors, 53/53 platform tests, OpenAPI clean.

---

## When you're done

End the session after the warm-down. The next session pastes `sprints/SESSION_KICKOFF_PROMPT.md` and picks up from `sprints/STATE.md`.
