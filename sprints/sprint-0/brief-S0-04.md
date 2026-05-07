# Story Brief — `S0-04` Lock OpenAPI emission + drift CI

> **You are the IC engineer (`pi` worker, deepseek-v4-pro — fresh process; clean context window) with no prior context.** This brief is self-contained.
>
> **Atomic-commit policy:** when you finish, commit atomically with `[S0-04] OpenAPI emission + drift CI gate`. Do NOT push.

---

## 1. Goal

The existing `apps/server/src/index.ts` already mounts an `OpenAPIHandler` with the `OpenAPIReferencePlugin`. This story (a) confirms the spec is fetchable from a live `wrangler dev`, (b) adds a `bun -F server gen:openapi` script that writes the live spec to `apps/server/openapi.json` deterministically, (c) commits the resulting `openapi.json` as the canonical contract, (d) wires a CI step that re-runs the script and `git diff --exit-code apps/server/openapi.json` (fails on drift), and (e) documents the rule that every PR adding/changing a router must regenerate the spec. Verify the gate fires by deliberately editing a router on a throwaway branch and observing CI failure.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md`
2. `sprints/sprint-0/PLAN.md` — pre-flight notes + `S0-04` section
3. `sprints/WBS.md` § Sprint 0, story `S0-04`
4. `apps/server/src/index.ts` — the existing handler mount (`OpenAPIHandler` + `OpenAPIReferencePlugin`, `apiHandler.handle(..., { prefix: "/api-reference" })`)
5. `apps/server/package.json` — current scripts
6. `packages/api/src/routers/index.ts` — current router shape (just `healthCheck` + `privateData` at sprint-start)
7. `turbo.json` — current task graph
8. `package.json` (repo root) — current scripts and catalog
9. oRPC OpenAPI handler docs:
   - <https://orpc.dev/docs/openapi/integrations/openapi-handler>
   - <https://orpc.dev/docs/openapi/openapi-specification>
   - The `OpenAPIReferencePlugin` source / docs — find what URL it serves the spec at by default. Common values: `/spec.json` under the prefix, or `/scalar` for the UI plus `/openapi.json` for the raw spec. **Read the source under `node_modules/@orpc/openapi/plugins/...` if the docs don't say.**

---

## 3. Files you will create or modify

**Create:**
- `apps/server/scripts/gen-openapi.ts` — the script. **Strongly prefer the programmatic API** over a live HTTP fetch:
  - Option 1 (preferred): use `OpenAPIGenerator` from `@orpc/openapi` (or whichever class exposes the `.generate()` / `.toSpec()` method) to render the spec from the in-memory `appRouter`. No server boot needed. Output is deterministic if you sort keys.
  - Option 2 (fallback): boot `wrangler dev` (or `bun -F server dev`) in a child process, wait for it to be reachable, `fetch()` the spec URL, write to `apps/server/openapi.json`, kill the child. More fragile; only use if Option 1 is not available in the installed `@orpc/openapi` version.
  Document the chosen path in `apps/server/README.md` and in the commit body.
- `apps/server/openapi.json` — the committed spec. Whatever the script emits. Must round-trip: re-running `bun -F server gen:openapi` is a no-op (no diff) when the router hasn't changed.
- `.github/workflows/openapi-drift.yml` — the CI gate. (No GH Actions infra exists in this repo today; you are creating the first workflow.) Steps: checkout, install bun, `bun install`, `bun -F server gen:openapi`, `git diff --exit-code apps/server/openapi.json`. Fail on drift. Trigger on `push` to `main` and `pull_request`.
- `sprints/sprint-0/artifacts/S0-04-drift-ci.txt` — captured logs of two manual runs: (a) clean run that passes, (b) deliberate-drift run on a throwaway branch (e.g., add `helloWorld: publicProcedure.handler(() => 'hi')` to the router, run the script without committing the regen, observe `git diff` non-zero exit). Restore the throwaway after capture; the deliberate edit is **not** committed.

**Modify:**
- `apps/server/package.json` — add `"gen:openapi": "bun run scripts/gen-openapi.ts"` to `scripts`. Add a `--check` flag handled by the script (when passed, the script writes to a tempfile and `diff`s against the committed `openapi.json`; non-zero exit on drift). The same script handles both write and check modes.
- `apps/server/README.md` — add a "OpenAPI contract" section documenting:
  - The URL where the live spec is served (whatever `OpenAPIReferencePlugin` exposes; cite from source).
  - The rule: every PR that adds or changes a router MUST regenerate `apps/server/openapi.json` (run `bun -F server gen:openapi` and commit the result).
  - The CI gate fails on drift; manual edits to `openapi.json` are forbidden (the spec is a build artifact).
- `turbo.json` — only if needed to wire the script into a `turbo` task. Probably **not needed** — the script is invoked directly via `bun -F server gen:openapi`.
- (No edits to `apps/server/src/index.ts` — the handler mount stays as-is.)

**Do not touch:**
- `packages/api/src/routers/**` — the routers stay exactly as they are. The whole point is to capture today's spec.
- `packages/auth`, `packages/db`, `packages/platform` (doesn't exist yet anyway), `packages/api-client` (doesn't exist yet either).
- `apps/web/**`.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`apps/server/openapi.json` is committed** and matches what the live `apps/server` emits (verified by Option 1's deterministic output OR Option 2's live fetch).
2. **`bun -F server gen:openapi` is idempotent.** Running it twice in a row produces no diff.
3. **`bun -F server gen:openapi --check` exits non-zero on drift.** Test by temporarily adding a router, running `--check`, observing failure; revert.
4. **`.github/workflows/openapi-drift.yml`** exists, triggers on push/PR, and runs the same `--check` invocation. **You do not need to push to a remote** to verify this; structurally inspect the workflow YAML.
5. **`sprints/sprint-0/artifacts/S0-04-drift-ci.txt`** captures the two runs (clean + deliberate-drift) using the local script (since we don't have GH Actions running yet). Plain text, two sections separated by `---`.
6. **`apps/server/README.md`** documents the rule and the spec URL.
7. **Spec content sanity check:** `apps/server/openapi.json` must contain at minimum the two existing procedures (`healthCheck`, `privateData`). Verify via `jq '.paths | keys' apps/server/openapi.json` (or your equivalent) and capture in the artifact.
8. **`bun run check-types` green workspace-wide** after your changes.
9. **No `--no-verify`, no `@ts-ignore`, no silent catch.**

---

## 5. Definition of Done (universal)

- [ ] Atomic commit `[S0-04] OpenAPI emission + drift CI gate`.
- [ ] `bun run check-types` green.
- [ ] `bun -F server gen:openapi` idempotent.
- [ ] `bun -F server gen:openapi --check` exits non-zero on drift.
- [ ] CI workflow YAML committed.
- [ ] README rule documented.
- [ ] Artifact present.

---

## 6. What NOT to do

- Do not modify any router. The story captures the current shape; it doesn't change it.
- Do not write to `apps/server/openapi.json` by hand. The script is the only writer.
- Do not introduce new dependencies. The `@orpc/openapi` package is already installed; if its programmatic API requires a new export, use what's already exported. If only a live-fetch approach works, no new deps needed (use Node 22 native `fetch`).
- Do not add tests in this story; the CI gate IS the test.
- Do not skip the deliberate-drift demonstration.

---

## 7. Demo artifact

`sprints/sprint-0/artifacts/S0-04-drift-ci.txt` — see §3 above.

---

## 8. How to report back

Commit body:
- DoD checklist.
- Files changed.
- Which programmatic API (or fallback) you used; cite the import path and version.
- The exact spec URL that the OpenAPIReferencePlugin serves on.
- One paragraph "considered but didn't do" — e.g., "considered hosting Scalar UI at `/docs` in this story; deferred to S5-05 per the WBS."

---

## 9. If you get stuck

- If `@orpc/openapi`'s programmatic spec generation isn't documented but the source under `node_modules/@orpc/openapi/dist/...` exposes a `OpenAPIGenerator` class or similar, prefer it over the live-fetch fallback.
- If `OpenAPIReferencePlugin`'s default spec URL is unclear, **read the plugin source**. If it requires a query param (`?spec`), `?download`, or a sub-path, document and use that.
- If wrangler-dev requires a `DATABASE_URL` (it does, post-S0-01), set a fake one for the CI script:
  ```bash
  DATABASE_URL=postgres://fake:fake@localhost:5432/fake bun -F server gen:openapi
  ```
  The spec generation should not require a live DB connection (oRPC builds the spec from router shape, not runtime calls).
- If the spec generation **does** require a DB connection (i.e., the OpenAPIHandler eagerly resolves something that touches `createDb()`), that's a code-shape issue: surface it as an `Apply now` finding for the manager fix pass (the brief itself doesn't fix it; document and proceed with the live-fetch fallback if needed).

You are the IC. Sincere work is the only kind we ship.
