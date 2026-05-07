# Spec + Code-Quality Gate — `S0-06` platform ports + memory adapter + hexagonal-import lint

> Gate worker: pi / kimi-k2.6. IC worker: pi / deepseek-v4-pro.  
> Verdict: **yellow**.

---

## 1. Spec adherence

| AC | Status | Evidence |
|---|---|---|
| **#1** — `interface.ts` defines all eight ports verbatim from HEXAGONAL §2 + RuntimePlatform synthesis | **Partial** | All ports present and match spec **except** `ActorRef<T>.call` return type: IC uses `(...a: never[]) => Promise<infer R>` where HEXAGONAL §2.7 specifies `(...a: any[]) => Promise<infer R>`. `check-types` still passes, but it is a verbatim deviation. `SessionStore` placeholder (`__aria_marker`) and `LlmProviderClient` placeholder (`__llm_placeholder`) are both documented in commit body and brief permits them. |
| **#2** — Memory adapter implements every port | **Met** | `packages/platform/src/memory/index.ts:createMemoryBindings()` returns all eight ports. Map-backed `KvStore`, `BlobStore`, `MessageQueue`, `RuntimePlatform`, `SessionStore`, `AuthAdapter`, `ActorHost`, `LlmGateway`. |
| **#3** — Cloudflare and Node adapters compile as stubs | **Met** | Every method body throws `"not-implemented (s0 stub; lands in S3-S5)"` (CF) or `"not-implemented (s0 stub; lands in S5)"` (Node). Return shapes are honest — types match the port interfaces. |
| **#4** — Subpath exports work | **Met** | `packages/platform/package.json` exports map has `./interface`, `./memory`, `./cloudflare`, `./node`. No `apps/server/` code in diff — temp file was reverted as claimed. |
| **#5** — Contract test green | **Partial** | `contract.test.ts` contains 48 assertions (63 `expect(` calls) covering every port with happy + failure paths. **However**, vitest picks up both `src/memory/contract.test.ts` and `dist/src/memory/contract.test.js`, so `bun -F @kuralle/platform test` reports **96 tests in 2 files** instead of 48 in 1. Needs a `vitest.config.ts` excluding `dist/`. |
| **#6** — Hexagonal-import lint fires | **Met** | `eslint.config.mjs` adds `no-restricted-imports` for `packages/{core,api,db,runtime}/**` blocking `@kuralle/platform/cloudflare` and `@kuralle/platform/node`. Artifact `S0-06-lint-violation.txt` shows the rule firing on a deliberate violation in `packages/api/src/index.ts`. Reverted cleanly — current `bun run lint` is green (0 errors, 1 pre-existing warning in `packages/env`). |
| **#7** — `bun run check-types` green workspace-wide | **Met** | Verified live: all 11 packages pass. `turbo.json` `test` task has `dependsOn: ["^build"]` + `inputs: ["$TURBO_DEFAULT$"]` + `outputs: []`. |
| **#8** — No `--no-verify`, no `@ts-ignore`, no silent catch | **Missed** | No `@ts-ignore` or `--no-verify` found. **However**, `packages/platform/src/memory/message-queue.ts:102` contains `.catch(() => {})` — a silent catch on consumer handler promises. This violates the explicit "no silent catch" commitment. |
| **#9** — No invented port shape | **Met** | `SessionStore` and `LlmProviderClient` use placeholder markers. Both are documented in commit body with S2 commitment. No `any` found in `packages/platform/src/`. |

---

## 2. Port-by-port verbatim audit

| Port | File(s) | Verdict | Notes |
|---|---|---|---|
| **KvStore** §2.1 | `interface.ts:1–12` / `memory/kv-store.ts` | ✅ | Signatures match verbatim. Single-flight `getOrCompute` uses `Map<string, Promise<unknown>>` for in-flight tracking. TTL expiry logic is correct. |
| **BlobStore** §2.2 | `interface.ts:14–34` / `memory/blob-store.ts` | ✅ | `get` returns `Uint8Array \| null`, `put` accepts `Uint8Array \| ReadableStream`. `signedUrl` returns `memory://` URL. ReadableStream consumption logic is correct. |
| **MessageQueue** §2.3 | `interface.ts:36–71` / `memory/message-queue.ts` | ⚠️ | Interface matches verbatim. Idempotency-key dedup uses `Set<string>` per topic and correctly drops duplicates. **Implementation flaw**: `drain()` fires handlers without `await`, then checks `acked`/`nacked` synchronously. If a handler acks after its first `await`, the message is incorrectly requeued. Also silently catches handler errors (`.catch(() => {})`). |
| **RuntimePlatform** §2.4 + INTERFACE_DESIGNS §5 | `interface.ts:73–270` / `memory/runtime-host.ts` | ✅ | `VoiceRuntimeHost`, `MessagingRuntimeHost`, `RuntimePlatformDiagnostics`, `RuntimeFailure` discriminated union all match synthesis sketch exactly. Memory messaging host follows §A.2(d) Map-backed pattern (~28 LOC equivalent). `VoiceMediaChannel`, `VoiceSessionTap` shapes are conservative and correct. |
| **SessionStore** §2.5 | `interface.ts:272–275` / `memory/session-store.ts` | ✅ | Placeholder `__aria_marker` as permitted by brief. Memory impl asserts the marker. |
| **AuthAdapter** §2.6 | `interface.ts:277–297` / `memory/auth-adapter.ts` | ✅ | `ResolvedSession.role` is `'owner' \| 'admin' \| 'member' \| 'viewer'`. Widget token uses base64-of-JSON (not cryptographic, noted as acceptable for memory). |
| **ActorHost** §2.7 | `interface.ts:299–320` / `memory/actor-host.ts` | ⚠️ | `ActorHost`, `ActorClass`, `ActorState` match verbatim. `ActorRef<T>.call` **deviates**: IC writes `(...a: never[]) => Promise<infer R>` instead of spec's `(...a: any[]) => Promise<infer R>`. It still compiles and passes tests, but it is not line-for-line. `blockConcurrencyWhile` is implemented as a Promise chain per actor — correct. |
| **LlmGateway** §2.8 | `interface.ts:322–334` / `memory/llm-gateway.ts` | ✅ | `LlmProviderClient` uses `__llm_placeholder` marker with `provider` discriminator. Documented in commit body. `checkQuota` returns `{ allowed: true }`. |

---

## 3. Code quality

### `packages/platform/src/interface.ts`
- Pure type definitions only. No imports from `@cloudflare/workers-types` or adapter packages. ✅
- `unknown` used at boundaries (`VoiceMediaChannel.pushControl`, `MessagingDispatchInput.event.payload`) — appropriate. ✅

### `packages/platform/src/memory/`
- No Node-specific or CF-specific dependencies. `ReadableStream` in `blob-store.ts` is a web standard — acceptable. ✅
- `AuthAdapter.addSession()` is a test-helper not on the port interface — fine for memory adapter. ✅
- No `any`, no debug logs. ✅
- **Bug**: `message-queue.ts:102` silent catch + synchronous ack/nack check race. See §5.

### `packages/platform/src/cloudflare/` + `src/node/`
- No cross-imports between CF/node/memory. All use `../interface.js`. ✅
- CF stubs say `lands in S3-S5`; Node stubs say `lands in S5`. Minor inconsistency, not a gate failure.
- `SessionStore` stubs implement the marker (don't throw) — acceptable since the port itself is a placeholder.

### `packages/platform/src/memory/contract.test.ts`
- 48 assertions across 8 ports. Happy + failure paths covered for all ports. ✅
- **Weak test**: `ActorHost > throws when calling unknown actor` (line ~390) actually tests method error propagation via `fail()`, not an unknown actor ID. The `makeRef` code does throw for missing actors, but that branch is untested.
- **Issue**: Tests run twice because `dist/` is not excluded from vitest's glob. Artifact captured 48 tests (run before `dist` existed); current runs show 96 tests in 2 files.

### Workspace wiring
- `vitest@4.1.5` in catalog — latest stable. ✅
- `turbo.json` `test` task correctly configured. ✅

---

## 4. Hexagonal-import lint rule

- **Pattern correctness**: `no-restricted-imports` scoped to `packages/{core,api,db,runtime}/**/*.{ts,tsx}` blocks `@kuralle/platform/cloudflare` and `@kuralle/platform/node`. ✅
- **Coverage**: `core/`, `api/`, `db/`, `runtime/` all in glob. `core` and `runtime` don't exist yet, but the rule will apply when they do. ✅
- **Allowed paths**: `@kuralle/platform/interface` is not in the forbidden group, so it resolves. `@kuralle/platform/memory` is also not forbidden — this is **arguably acceptable** (domain tests may legitimately use the memory adapter), though HEXAGONAL §6 rule 1 says domain code should only import `platform/interface.ts`. Not flagged as a hard failure since the brief's AC #6 only requires verifying cloudflare/node are blocked.
- **Deliberate-violation artifact**: `S0-06-lint-violation.txt` shows the rule firing on `packages/api/src/index.ts` with `createCloudflareBindings` import. The violation was reverted — current `bun run lint` is clean. Artifact is authentic. ✅

---

## 5. Apply-now items for manager fix-pass commit

1. **Fix `ActorRef<T>.call` return type** in `interface.ts:304` — change `(...a: never[]) => Promise<infer R>` to `(...a: any[]) => Promise<infer R>` to match HEXAGONAL §2.7 verbatim.
2. **Fix silent catch** in `memory/message-queue.ts:102` — replace `.catch(() => {})` with at minimum `.catch((err) => { console.error('Consumer handler error:', err); })` or emit to an error handler. Better: refactor `drain` to properly await handlers before checking ack/nack state.
3. **Fix message-queue drain race condition** — `drain()` must not check `acked`/`nacked` until after the handler promise settles. Otherwise handlers that ack after an `await` cause infinite requeue loops. A simple fix: track pending deliveries as Promises and `await` them (or use a microtask flush) before the requeue check.
4. **Add `vitest.config.ts`** to `packages/platform/` excluding `dist/` from test glob:
   ```ts
   import { defineConfig } from 'vitest/config';
   export default defineConfig({ test: { exclude: ['dist/**', 'node_modules/**'] } });
   ```
   Or change the `test` script to `vitest run --exclude dist`.
5. **Fix misleading ActorHost test** — replace the `throws when calling unknown actor` test with one that actually asserts a missing actor ID throws `Actor not found` (e.g., by manually constructing a ref or by clearing the internal map if testing internals).
6. **Align stub error messages** — consider making CF and Node stubs use the same `not-implemented (s0 stub)` message (optional polish).

---

## 6. Carry-forwards

- **`LlmProviderClient` placeholder** — S2 unblock. Commit body documents `__llm_placeholder` at `interface.ts:325`.
- **`SessionStore` re-export** — S2 unblock. Commit body documents `__aria_marker` at `interface.ts:272`. Will flip to `@ariaflowagents/core` re-export when aria-flow enters the dep graph.
- **`RuntimePlatform` physical implementations** — CF stubs land S3–S5, Node stubs land S5 per commit body.

---

## 7. Honest summary

The IC delivered the full structural scope: 37 files, 8 ports, memory adapter, CF/Node stubs, subpath exports, contract tests, lint rule, and workspace wiring. `check-types` and `lint` are green. The contract test covers every port with happy and failure assertions.

Three issues keep this from green:

1. **Verbatim deviation**: `ActorRef.call` changed `any[]` to `never[]` in the conditional type. It compiles, but the brief said "line-for-line. No edits, no improvisation."
2. **Silent catch**: `message-queue.ts` has `.catch(() => {})`, a direct violation of AC #8.
3. **Test hygiene**: vitest double-runs because `dist/` isn't excluded, and the message-queue implementation has a synchronous requeue race that happens to pass tests only because all test handlers ack before their first `await`.

All three are fixable in a single 10–15 minute fix-pass commit.

---

## 8. Recommended action

**Needs IC fix** (yellow → green after fix-pass).  
The manager should ask the IC (or a follow-up worker) to apply the 5 items in §5 and re-verify `bun -F @kuralle/platform test` reports exactly 48 tests in 1 file.
