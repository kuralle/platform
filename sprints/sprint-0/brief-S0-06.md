# Story Brief — `S0-06` Eight platform ports + memory adapter + hexagonal-import lint

> **You are the IC engineer (`pi` worker, deepseek-v4-pro — fresh process; clean context window) with no prior context.** This brief is self-contained.
>
> **Atomic-commit policy:** when you finish, commit atomically with `[S0-06] platform ports + memory adapter + hexagonal-import lint`. Do NOT push.

---

## 1. Goal

Create one `@kuralle/platform` package containing all eight ports verbatim from `HEXAGONAL_ARCHITECTURE.md §2` and the `RuntimePlatform` synthesis from `INTERFACE_DESIGNS_RuntimeHost.md §5`. Subpath exports: `./interface`, `./memory`, `./cloudflare`, `./node`. Build a Map-backed memory adapter for every port. Stub the cloudflare and node adapters (`createCloudflareBindings()` / `createNodeBindings()` returning all eight ports; runtime impls may throw `not-implemented` in S0; **types must be honest**). Add an ESLint `no-restricted-imports` rule forbidding `@kuralle/platform/cloudflare` and `@kuralle/platform/node` imports inside `packages/{core,api,db,runtime}/**` (only `@kuralle/platform/interface` is allowed). Add a one-shot port-contract test exercising every port through the memory adapter.

---

## 2. Required reading (in this order)

1. `sprints/STATE.md`
2. `sprints/sprint-0/PLAN.md` — pre-flight notes + `S0-06` section
3. `sprints/WBS.md` § Sprint 0, story `S0-06`
4. `HEXAGONAL_ARCHITECTURE.md §2` — the eight ports verbatim. **The interface in `interface.ts` matches this section line-for-line. No edits, no improvisation.**
5. `HEXAGONAL_ARCHITECTURE.md §3` — the directory layout (`packages/platform/{interface.ts, cloudflare/, node/, memory/}` — single package, subpaths)
6. `HEXAGONAL_ARCHITECTURE.md §6` — the discipline rules (esp. rule 1, rule 3, rule 6)
7. `INTERFACE_DESIGNS_RuntimeHost.md §5` — the `RuntimePlatform` synthesis (Voice + Messaging + Diagnostics, plus `RuntimeFailure` discriminated union)
8. `INTERFACE_DESIGNS_RuntimeHost.md §A.2(d)` — the in-memory `RuntimeHost` reference (~28 LOC) for messaging
9. `packages/api/package.json`, `packages/db/package.json` — examples of how a workspace package is wired in this repo
10. `eslint.config.mjs` (lands in S0-05) — the existing flat config you will extend with the hexagonal rule

---

## 3. Files you will create or modify

**Create — new package `packages/platform/`:**
- `packages/platform/package.json` — name `@kuralle/platform`. Type `module`. **Subpath exports**:
  ```json
  "exports": {
    "./interface": { "default": "./src/interface.ts" },
    "./memory":    { "default": "./src/memory/index.ts" },
    "./cloudflare":{ "default": "./src/cloudflare/index.ts" },
    "./node":      { "default": "./src/node/index.ts" }
  }
  ```
  Deps: `zod: catalog:` (used in some port shapes if useful). No `@cloudflare/workers-types` runtime dep — that goes in `devDependencies` if any of the cloudflare-stub files reference CF types.
- `packages/platform/tsconfig.json` — extends `@kuralle/config/tsconfig.base.json`, mirror `packages/db/tsconfig.json`.
- `packages/platform/README.md` — short readme: ports + adapters + the discipline rules.
- `packages/platform/src/interface.ts` — all eight port interfaces verbatim from `HEXAGONAL_ARCHITECTURE.md §2`:
  - `KvStore` (§2.1)
  - `BlobStore`, `BlobPutOpts`, `BlobListResult` (§2.2)
  - `MessageQueue`, `PublishOpts`, `ConsumeMessage<T>`, `ConsumeOpts`, `ConsumerHandle` (§2.3)
  - `RuntimePlatform` + `VoiceRuntimeHost` + `MessagingRuntimeHost` + `RuntimePlatformDiagnostics` + `RuntimeFailure` (§2.4 + INTERFACE_DESIGNS §5 synthesis sketch)
  - `SessionStore` (§2.5) — re-export from `@ariaflowagents/core` if installable; if not (aria-flow lands in S2-S3), use a typed placeholder:
    ```ts
    /**
     * SessionStore is owned by AriaFlow. It will be re-exported from
     * @ariaflowagents/core in S2 (when aria-flow is added to the dep graph).
     * Until then this is a structural placeholder that captures the shape we
     * expect. Anything that consumes SessionStore in S0–S1 must use the memory
     * adapter, not a real impl.
     */
    export interface SessionStore { /* see https://aria-flow.dev/... */
      readonly __aria_marker: 'SessionStore';
    }
    ```
    Document the placeholder choice in the commit body. **Do not** install aria-flow in S0.
  - `AuthAdapter`, `ResolvedSession` (§2.6)
  - `ActorHost`, `ActorRef<T>`, `ActorClass`, `ActorState` (§2.7)
  - `LlmGateway`, `LlmProviderClient` (§2.8) — `LlmProviderClient` shape isn't fully specified in §2.8; use `unknown`-typed if you must, with a docs comment that S2 fills in the shape when AriaFlow integrates the gateway. **If you have to invent shape, surface in commit body.**
- `packages/platform/src/memory/kv-store.ts` — Map-backed `KvStore`. `getOrCompute` is single-flight per key (use a `Map<string, Promise<unknown>>` for in-flight tracking).
- `packages/platform/src/memory/blob-store.ts` — Map-backed bytes; `signedUrl` returns a fake `data:` URL or `memory://...` URL since memory has no real signing.
- `packages/platform/src/memory/message-queue.ts` — Map-keyed `topic → consumers + buffered messages`. `publish` enqueues; `consume` registers a handler that drains. Idempotency-key support via a `Set<string>` of seen keys per topic. `ConsumerHandle.stop()` removes the consumer.
- `packages/platform/src/memory/runtime-host.ts` — implements `RuntimePlatform` with all three sub-interfaces. The messaging in-memory host follows `INTERFACE_DESIGNS_RuntimeHost.md §A.2(d)` (~28 LOC). For voice, a minimal stub that satisfies the type but throws on physical operations is acceptable for S0. Diagnostics returns empty arrays / healthy.
- `packages/platform/src/memory/session-store.ts` — Map-backed implementation of the placeholder `SessionStore` shape. If using the placeholder marker shape, this file simply asserts the marker.
- `packages/platform/src/memory/auth-adapter.ts` — Map-backed sessions; `resolveSession` reads from a test-provided session map; `issueWidgetToken` / `verifyWidgetToken` use a deterministic encoder (e.g., base64-of-JSON; not cryptographic — note that's fine for memory).
- `packages/platform/src/memory/actor-host.ts` — Map-keyed actor instances; `actor(klass, id)` returns a proxy that calls the underlying instance's methods. `ActorState.blockConcurrencyWhile` is a queue (Promise chain) per actor.
- `packages/platform/src/memory/llm-gateway.ts` — `client(provider)` returns a fake client whose methods throw `not-implemented`. `checkQuota` always returns `{ allowed: true }`.
- `packages/platform/src/memory/index.ts` — exports `createMemoryBindings(): { kvStore, blobStore, messageQueue, runtimePlatform, sessionStore, authAdapter, actorHost, llmGateway }` (a flat record of all eight ports plus `runtimePlatform` which exposes `voice`, `messaging`, `diagnostics`).
- `packages/platform/src/memory/contract.test.ts` — the one-shot test. Each of the eight ports has at least one happy-path and one failure-path assertion. Use `vitest` (already in the workspace via apps/web).
- `packages/platform/src/cloudflare/index.ts` — exports `createCloudflareBindings(env: Env): typeof memoryBindings.shape` — i.e., the same shape as memory. Each method may `throw new Error('not-implemented (s0 stub; lands in S3-S5)')`. **Types must be honest** — the return shape genuinely matches the port; only the runtime body throws.
- `packages/platform/src/cloudflare/{kv-store,blob-store,message-queue,runtime-host,session-store,auth-adapter,actor-host,llm-gateway}.ts` — one file per port, each exporting a class or factory that throws at runtime but compiles to the right type.
- `packages/platform/src/node/index.ts` — same pattern as cloudflare, for `createNodeBindings()`.
- `packages/platform/src/node/{kv-store,blob-store,message-queue,runtime-host,session-store,auth-adapter,actor-host,llm-gateway}.ts` — stubs.
- `sprints/sprint-0/artifacts/S0-06-contract-test.txt` — captured `bun -F @kuralle/platform test` output.
- `sprints/sprint-0/artifacts/S0-06-lint-violation.txt` — captured deliberate-violation `bun run lint` output (an `import {} from '@kuralle/platform/cloudflare'` placed in `packages/api/src/index.ts`; observe the rule fire; revert; re-run clean).

**Modify:**
- `eslint.config.mjs` — extend with a `no-restricted-imports` block scoped to `packages/{core,api,db,runtime}/**/*.{ts,tsx}` forbidding `@kuralle/platform/cloudflare` and `@kuralle/platform/node`. Allow `@kuralle/platform/interface`. Note: `core` and `runtime` don't exist as packages yet; the rule's pattern still applies if/when they do.
- `package.json` (repo root) — workspace catalog already covers `packages/*`; verify. Add a `test` task in `turbo.json` if missing, so `@kuralle/platform`'s contract test runs in CI (use `vitest run`).
- `turbo.json` — wire `test` task. Pattern: `"test": { "dependsOn": ["^build"], "inputs": ["$TURBO_DEFAULT$"], "outputs": [] }`.
- `packages/platform/package.json` — add `"scripts": { "test": "vitest run", "check-types": "tsc -b" }`.

**Do not touch:**
- Any other package.
- `apps/server`, `apps/web`.
- The S0-05 ESLint rule (`@kuralle/api-client` forbidden import) — leave it as is; just append the new rule.

---

## 4. Acceptance criteria (numbered, in priority order)

1. **`packages/platform/src/interface.ts` defines all eight ports** matching `HEXAGONAL_ARCHITECTURE.md §2` line-for-line (modulo the `SessionStore` placeholder). The `RuntimePlatform` + `VoiceRuntimeHost` + `MessagingRuntimeHost` + `RuntimePlatformDiagnostics` + `RuntimeFailure` types match `INTERFACE_DESIGNS_RuntimeHost.md §5` synthesis.
2. **Memory adapter implements every port.** `createMemoryBindings()` returns all eight ports.
3. **Cloudflare and Node adapters compile** as stubs. `createCloudflareBindings(env)` and `createNodeBindings()` return objects with the correct types; method bodies throw `not-implemented`.
4. **Subpath exports work:** `import { KvStore } from '@kuralle/platform/interface'` resolves; `import { createMemoryBindings } from '@kuralle/platform/memory'` resolves; same for `cloudflare` and `node`. Verified by a temp file under `apps/server/` doing the imports and `bun run check-types`. Revert the temp file before commit.
5. **One-shot contract test green:** `bun -F @kuralle/platform test` runs `contract.test.ts`. Every port has at least one happy and one failure assertion. Output captured in `S0-06-contract-test.txt`.
6. **Hexagonal-import lint rule fires** on a deliberate violation in `packages/api/src/index.ts` (e.g., `import { createCloudflareBindings } from '@kuralle/platform/cloudflare'`). Captured in `S0-06-lint-violation.txt`. Revert the deliberate edit before commit.
7. **`bun run check-types` green workspace-wide.** `bun run lint` green (after revert). `bun -F web test` still green (no regressions to apps/web).
8. **No `--no-verify`, no `@ts-ignore`, no silent catch.**
9. **No invented port shape.** If `HEXAGONAL_ARCHITECTURE.md §2` doesn't fully specify a sub-shape (e.g., `LlmProviderClient`), use the most conservative honest typing (`unknown` + a comment) and surface in commit body.

---

## 5. Definition of Done (universal)

- [ ] Atomic commit `[S0-06] platform ports + memory adapter + hexagonal-import lint`.
- [ ] `bun run check-types` green.
- [ ] `bun run lint` green.
- [ ] `bun -F @kuralle/platform test` green.
- [ ] Two artifacts present.
- [ ] Subpath imports verified (and the verification temp file reverted).

---

## 6. What NOT to do

- Do not invent port shapes beyond what HEXAGONAL §2 / INTERFACE_DESIGNS §5 specify. Use `unknown` + a comment if the doc is silent.
- Do not implement real Cloudflare or Node adapters. Stubs only — they throw at runtime; types are honest.
- Do not install `@ariaflowagents/core` in S0. Use the `SessionStore` placeholder shape.
- Do not split `@kuralle/platform` into four separate workspace packages. The PLAN.md §0 decision is one package with subpath exports.
- Do not modify `apps/web`, `apps/server`, or any other `packages/*` outside `packages/platform/`. Sole exception: `eslint.config.mjs` for the rule append, plus `package.json`/`turbo.json` for workspace wiring.
- Do not skip the contract test. Behavioral coverage of the memory adapter is the gate.

---

## 7. Demo artifact

`sprints/sprint-0/artifacts/S0-06-contract-test.txt` + `S0-06-lint-violation.txt`.

---

## 8. How to report back

Commit body:
- DoD checklist.
- Files changed.
- Where you used `unknown` vs concrete shapes (cite line numbers).
- The `SessionStore` placeholder marker; commitment to flip to a real re-export in S2.
- One paragraph "considered but didn't do" — e.g., "considered fleshing out `LlmProviderClient` to match OpenAI / Anthropic SDK union; deferred to S2 when LLM gateway is exercised."

---

## 9. If you get stuck

- If `vitest` isn't installed at the workspace root, install it as a workspace devDependency (`vitest@^2.x` or whatever's latest stable; check `bun pm view vitest version`).
- If subpath exports don't resolve cleanly under `tsc -b`, set `"moduleResolution": "bundler"` in the package's tsconfig (TS 5.0+ syntax) — it should already be set in the base config; verify.
- If the placeholder `SessionStore` shape causes a downstream type error in `MessagingRuntimeHost` or `VoiceRuntimeHost`, narrow the placeholder to whatever shape the runtime-host port actually consumes (e.g., a method-bag interface). Document.
- If aria-flow is somehow already installed (it shouldn't be at S0), still use the placeholder — S0-06 doesn't add it to the dep graph.
- If `bun run lint` (post-S0-05) doesn't recognize the new package, the flat config likely needs a `files` glob update; extend the existing `files` patterns rather than overriding them.

You are the IC. Sincere work is the only kind we ship.
