# Amendment 001 — Frontend client uses `@orpc/tanstack-query`, not `openapi-fetch`

**Status:** Accepted
**Date:** 2026-05-07
**Affects:** `WBS.md` S0-05, S0-04, §1.2 DoD #6, §2 RFC-to-phase mapping, §3 risks, §4 backlog (BL-10), §5 risks; `SESSION_KICKOFF_PROMPT.md` rule #12; `STATE.md` goal sentence; `README.md` project-specific gates.

---

## What changed

The frontend client in `apps/web` will consume the oRPC router directly via `@orpc/tanstack-query` (https://orpc.dev/docs/integrations/tanstack-query) instead of consuming the OpenAPI spec via `openapi-typescript` + `@scalar/openapi-fetch` + `@scalar/openapi-react-query`.

## What did NOT change

- **OpenAPI 3 emission stays canonical.** `apps/server/openapi.json` is still committed every router PR. The drift CI gate from S0-04 stays. The Scalar `/docs` deploy at S5-05 stays. The spec is still the contract for any external consumer.
- **The hook-wrapper rule stays.** Every API call in `apps/web` goes through a typed hook in `apps/web/src/hooks/api/<resource>.ts`. Components never call the underlying client directly. ESLint enforced.
- **Forbidden-import discipline stays** — the lint rule forbids any direct oRPC client usage in `apps/web/src/components/**`; only `apps/web/src/hooks/api/**` may import the client.
- **Both-adapters CI, hexagonal seam, schema discipline, OpenAPI drift CI** — all unchanged.

## Why

1. The frontend is the only consumer for the entire S0–S5 arc. Mobile / public SDK / partner integrations are all in the backlog (BL-09, BL-10, BL-11, BL-12).
2. `@orpc/tanstack-query` preserves Zod refinements, branded types, custom error shapes, and discriminated unions verbatim. `openapi-typescript`'s output flattens these to JSON Schema, losing fidelity.
3. One fewer build step (no `bun -F api-client gen:types`), one fewer drift surface, two fewer dependencies in `packages/api-client`.
4. When BL-10 ships a public SDK, that SDK uses `openapi-typescript` against the committed `openapi.json` — the same way any external consumer would. The frontend's choice doesn't constrain external consumers.

## Flip-back trigger

If a customer-facing API tier ships (BL-10 brought forward, or partner integrations land), evaluate whether `apps/web` should also switch to consuming the spec. Reason: a public SDK with weaker typing than the frontend creates a class of bugs the frontend's superior typing hides. Better-typed-frontend is acceptable today because there is no public SDK; the day a second consumer exists, this calculus changes.

## Concrete edits applied in this commit

1. `WBS.md` §1.2 DoD #6 — softened wording from "wrapping `openapi-react-query`" to "may wrap `@orpc/tanstack-query`'s utilities or any equivalent typed client; the wrapper is the contract, not the underlying library."
2. `WBS.md` §2 roadmap row for Sprint 0 — goal sentence rewritten.
3. `WBS.md` §2 RFC-to-phase mapping for Sprint 0 — wording fix.
4. `WBS.md` Sprint 0 goal sentence — rewritten.
5. `WBS.md` Sprint 0 S0-05 — full rewrite. Now: thin wrapper over `@orpc/tanstack-query` re-exporting `client` + `$api` factory typed against `RouterClient<typeof appRouter>`. No `openapi-typescript`, no `schema.d.ts` generation, no `@scalar/openapi-fetch`, no `@scalar/openapi-react-query`.
6. `WBS.md` Sprint 0 Source RFC § — wording fix.
7. `WBS.md` Sprint 0 risks — dropped "openapi-typescript may emit broken types for oRPC's spec quirks" (no longer applies).
8. `WBS.md` Sprint 3 S3-05 — `useConversationLive` no longer mentions openapi-react-query's `subscribe`; replaced with the equivalent oRPC subscription pattern.
9. `WBS.md` §4 BL-10 — added "When this lands, the public SDK uses `openapi-typescript` against the committed `openapi.json`. The frontend's choice doesn't constrain external consumers."
10. `WBS.md` §5 risks — "Frontend hook-wrapper rule violated by ad-hoc fetch" wording updated to drop the openapi-react-query-specific framing.
11. `SESSION_KICKOFF_PROMPT.md` rule #12 — wording updated.
12. `STATE.md` Sprint 0 goal sentence — rewritten.
13. `README.md` project-specific gates — "Hook-wrapper purity" wording updated.

## Reference

- oRPC TanStack Query docs: <https://orpc.dev/docs/integrations/tanstack-query>
- oRPC OpenAPI handler: already wired in `apps/server/src/index.ts` via `@orpc/openapi/fetch`. No change needed.
- The committed `openapi.json` (S0-04) is still the public face of the API and the contract for any future external consumer.
