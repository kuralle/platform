# Gate Brief — `S0-06` platform ports + memory adapter + hexagonal-import lint

> **You are pi/kimi-k2.6, the spec + code-quality gate.** IC was `pi`/`deepseek-v4-pro`, committed at `a73efc2`. Your output is a markdown report only. No code changes, no commits. **This is the largest scope IC of the sprint** — 37 new files, 8 ports, contract tests, lint rule. Read carefully.

---

## 1. Context

- **Story:** `S0-06` — platform ports + memory adapter + hexagonal-import lint.
- **IC commit:** `a73efc2` — `[S0-06] platform ports + memory adapter + hexagonal-import lint`.
- **Brief:** `sprints/sprint-0/brief-S0-06.md`.
- **Spec:** `HEXAGONAL_ARCHITECTURE.md §2` (eight ports, verbatim) + `INTERFACE_DESIGNS_RuntimeHost.md §5` (RuntimePlatform synthesis) + `§A.2(d)` (~28 LOC in-memory messaging RuntimeHost reference).
- **IC transcript:** `.handoff/result-S0-06.txt`.
- **Diff:** `git show a73efc2` — read every file.

## 2. Spec gates to verify

Walk every AC in `brief-S0-06.md §4` (criteria 1–9). For each, evidence + status.

**Specific things to verify rigorously:**

1. **AC #1 — `interface.ts` defines all eight ports verbatim from HEXAGONAL §2.** Read `packages/platform/src/interface.ts` line by line. Compare each interface signature to:
   - HEXAGONAL §2.1 `KvStore` — methods `get<T>`, `set<T>`, `delete`, `getOrCompute<T>`. Verify exact method signatures and generics.
   - HEXAGONAL §2.2 `BlobStore`, `BlobPutOpts`, `BlobListResult`. Verify `get` returns `Uint8Array | null`, `put` accepts `Uint8Array | ReadableStream`.
   - HEXAGONAL §2.3 `MessageQueue`, `PublishOpts`, `ConsumeMessage<T>`, `ConsumeOpts`, `ConsumerHandle`. Verify shapes.
   - HEXAGONAL §2.4 `RuntimePlatform` (with `voice`, `messaging`, `diagnostics`).
   - INTERFACE_DESIGNS §5 `VoiceRuntimeHost` (`acquireHost`, `attachSession`, `openSupervisorTap`, `watch`, `beginDrain`).
   - INTERFACE_DESIGNS §5 `MessagingRuntimeHost` (`resolveActor`, `dispatch`, `openConversationLog`, `watch`, `evictionPlan`).
   - INTERFACE_DESIGNS §5 `RuntimePlatformDiagnostics` (`listHosts`, `selfCheck`, `rehydrateHost`).
   - INTERFACE_DESIGNS §5 `RuntimeFailure` discriminated union (`noproc`, `timeout`, `compliance`, `platform` with `cf`/`fly`/`k8s` sub-discriminator).
   - HEXAGONAL §2.5 `SessionStore` — pi's commit body says it uses `__aria_marker` placeholder. Verify and confirm the brief permits this pending S2.
   - HEXAGONAL §2.6 `AuthAdapter`, `ResolvedSession`. Verify roles `'owner' | 'admin' | 'member' | 'viewer'`.
   - HEXAGONAL §2.7 `ActorHost`, `ActorRef<T>`, `ActorClass`, `ActorState`. Verify type-level wiring.
   - HEXAGONAL §2.8 `LlmGateway`, `LlmProviderClient`. Pi's commit body says `LlmProviderClient` is `__llm_placeholder`. Verify and confirm brief permits.

2. **AC #2 — Memory adapter implements every port.** Read each file in `packages/platform/src/memory/`. Verify:
   - Map-backed for KvStore.
   - Single-flight `getOrCompute` (Map of in-flight Promises per key).
   - MessageQueue idempotency-key dedup.
   - RuntimeHost messaging follows `INTERFACE_DESIGNS §A.2(d)` reference (~28 LOC).
   - All eight ports plumbed in `index.ts`'s `createMemoryBindings()`.

3. **AC #3 — Cloudflare and Node adapters compile as stubs.** Read each file. Verify:
   - Types are honest (return shape matches port).
   - Methods throw `not-implemented` at runtime.
   - `createCloudflareBindings(env)` and `createNodeBindings()` return objects with the correct types.

4. **AC #4 — Subpath exports work.** `packages/platform/package.json` exports map. Verify the four subpaths: `./interface`, `./memory`, `./cloudflare`, `./node`. Pi's commit body says "Subpath exports resolved through temp file in apps/server (reverted)" — confirm the temp file is NOT in the diff (i.e., reverted).

5. **AC #5 — Contract test green.** Read `packages/platform/src/memory/contract.test.ts`. Verify:
   - Every port has at least one happy-path and one failure-path assertion.
   - 48 assertions = 8 ports × ~6 assertions average. Reasonable coverage.
   - Run `bun -F @kuralle/platform test` and confirm output (verify the artifact captures it).

6. **AC #6 — Hexagonal-import lint fires.** Read `eslint.config.mjs` for the new rule. Verify:
   - Forbidden imports: `@kuralle/platform/cloudflare` and `@kuralle/platform/node`.
   - Scope: `packages/{core,api,db,runtime}/**`.
   - Allowed: `@kuralle/platform/interface` (and presumably `@kuralle/platform/memory` — check).
   - The deliberate-violation artifact `S0-06-lint-violation.txt` should show error firing then revert.

7. **AC #7 — `bun run check-types` green workspace-wide.** Verify by running it.

8. **AC #8 — No `--no-verify`, no `@ts-ignore`, no silent catch.** Grep the diff.

9. **AC #9 — No invented port shape.** For any place pi used `unknown` or a placeholder marker, verify it's documented in the commit body.

## 3. Code-quality + project-rule checks

- `packages/platform/src/interface.ts` should not import from `@cloudflare/workers-types` or any adapter package. Pure type definitions only.
- `packages/platform/src/cloudflare/` files may import `@cloudflare/workers-types` (CF-specific) but should NOT import from `@kuralle/platform/node` or `@kuralle/platform/memory`.
- `packages/platform/src/node/` files may import from Node stdlib only (e.g., `node:crypto`, `node:fs`) but should not import CF-specific.
- `packages/platform/src/memory/` files should be pure JS/TS (no Node-specific or CF-specific deps). They run in any environment.
- Type tightness: no `any` (or comment justifying it). `unknown` only at boundaries.
- `vitest` was added to workspace catalog — verify the version pin matches latest stable (or current).
- `turbo.json` `test` task: should have `dependsOn: ["^build"]` per the brief, plus `inputs: ["$TURBO_DEFAULT$"]` and `outputs: []`.
- Pi's claim "Subpath exports resolved through temp file in apps/server (reverted)" — verify no apps/server code change in the diff.
- No leftover debug logs / placeholder tests / `expect(true)`.
- Memory adapter idempotency-key dedup: verify the implementation is correct (should NOT requeue duplicates).

## 4. Output

Write `sprints/sprint-0/gate-S0-06.md` with these sections:

```md
# Spec + Code-Quality Gate — `S0-06` platform ports + memory adapter + hexagonal-import lint

> Gate worker: pi / kimi-k2.6. IC worker: pi / deepseek-v4-pro.
> Verdict: green | yellow | red.

## 1. Spec adherence
(table — each AC met / partial / missed with file:line evidence)

## 2. Port-by-port verbatim audit
(8 rows, one per port — each compared to HEXAGONAL §2.X)

## 3. Code quality
(bullet list per file group)

## 4. Hexagonal-import lint rule
- Pattern correctness
- Coverage of `core/`, `api/`, `db/`, `runtime/`
- Allowed paths verified
- Deliberate-violation artifact authentic?

## 5. Apply-now items for manager fix-pass commit
- ...

## 6. Carry-forwards
- LlmProviderClient placeholder S2 unblock
- SessionStore re-export S2 unblock
- ...

## 7. Honest summary

## 8. Recommended action
- Ready for r1 / Needs IC fix / Ambiguous spec
```

Verdict: green | yellow | red.

## 5. Tone

Calm, on-team. Use context7 if uncertain about any library API. The manager reads your report alongside the diff.
