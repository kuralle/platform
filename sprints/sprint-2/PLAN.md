# Sprint 2 — Plan

**Sprint name:** Editor IR pipeline
**Sprint goal (one sentence):** Owner-Operator can edit and publish an agent through C2/C3/C8, which writes a real `agent_versions.snapshot`, runs the synchronous projection worker, swaps `agents.activeVersionId`, and shows "Saved → Publishing → Live" in the sticky bar — sub-second from click to live (`USER_JOURNEYS.md §2` SLO #2).
**Sprint window:** 2026-05-07 → 2026-05-08 (single-session sprint, condensed from WBS-default 1-week cadence)
**Author (main session):** Claude Opus 4.7 (1M context) · 2026-05-07

---

## 1. Stories

Five stories. Per-story flow per memory `feedback_per_story_kimi_review.md`: brief → `pi/deepseek-v4-pro` IC bg → atomic `[S2-{nn}]` commit → `pi/kimi-k2.6` gate bg → manager `[S2-{nn}-fix]` → next IC.

S2 introduces two new workspace packages — `@kuralle/core` (repositories + Zod IR) and `@kuralle/runtime` (projector worker + ACL anchor for S3+). Both are scaffolded inside their own stories (S2-01 scaffolds core; S2-02 scaffolds runtime); neither pollutes root devDeps (memory rule).

### `S2-01` — Repository pattern in `@kuralle/core` + KvStore identity-map cache

**Description:** Scaffold a new workspace package `packages/core/` and ship the repository layer specified in WBS S2-01. Repositories: `AgentRepository`, `AgentVersionRepository`, `KbDocumentRepository`, `ToolRepository`, `ChannelRepository`, `ConversationRepository`. Each is constructed with `(db, workspaceId, kvStore)` via a `withWorkspace(workspaceId)` factory exported from `packages/core/src/repositories/index.ts`. Raw `db.select()` is forbidden in `packages/api/src/routers/**` (new ESLint `no-restricted-imports` rule on `drizzle-orm` from inside `packages/api/`). Repositories accept the `KvStore` port from `@kuralle/platform/interface` for an identity-map cache per `HEXAGONAL_ARCHITECTURE.md §5` (Fowler PoEAA): every `findById(id)` consults `kv.getOrCompute('repo:agent:<workspaceId>:<id>', ...)` with a 60-second TTL; mutating methods (`insert`/`update`/`delete`) emit `kv.delete` for the affected keys synchronously **inside the same transaction's success path** (i.e., after `tx.commit()`).

**Acceptance criteria** (numbered, in priority order):
1. `packages/core/` exists as a workspace package with its own `package.json` (declaring `drizzle-orm`, `@kuralle/db`, `@kuralle/platform`, `zod`, `@kuralle/config` deps; NO root devDep changes), `tsconfig.json` (extends `@kuralle/config/tsconfig.base.json`), `vitest.config.ts`, and `src/index.ts` re-exporting the public surface.
2. Six repositories at `packages/core/src/repositories/{agent,agent-version,kb-document,tool,channel,conversation}.ts`; each exports a class with explicit method types (`findById`, `findManyByWorkspace`, `insert`, `update`, `softDelete` where soft-delete applies). All public methods take `workspaceId` implicitly via the factory closure — never as a parameter.
3. `withWorkspace(db, workspaceId, kvStore)` factory at `packages/core/src/repositories/index.ts` returns an object `{ agents, agentVersions, kb, tools, channels, conversations }` of bound repository instances.
4. Identity-map cache: `findById` hits `kv.getOrCompute` with key `repo:<resource>:<workspaceId>:<id>` and TTL 60 s. On cache miss, the DB row is materialised through `Repository.toDomain(row)` BEFORE storage (so cache holds domain objects, not raw Drizzle rows). On `insert`/`update`/`softDelete`, the affected key is deleted **after** the underlying DB write completes.
5. ESLint rule (`no-restricted-imports` on `drizzle-orm` and `@kuralle/db/schema/**` from `packages/api/src/routers/**`) is added to the existing `eslint.config.mjs`. Rule fires in CI on a deliberate violation in `packages/api/src/routers/agents.ts` (test in a throw-away branch, then revert).
6. `packages/core/src/repositories/agent.test.ts` (and one for each of the other five) tests every repository against the **memory adapter** from S0-06 (memory `KvStore` + an in-memory Drizzle equivalent — IC may use `drizzle-orm/pg-proxy` against an in-process pglite OR a dedicated test database; choice documented in commit body). Each test covers happy-path `findById` cache miss → hit → invalidation-on-update.
7. `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test` green; the new package is picked up by `turbo` (root `turbo.json` task graph).
8. Append-only **app-layer guard** in `AgentVersionRepository.update()` throws `AppendOnlyViolation` (a typed error class) — defense-in-depth alongside the S1-02 Postgres trigger; the trigger is the canonical enforcement, the guard is the friendly error surface.

**Files expected to be created or modified:**
- `packages/core/package.json` (new)
- `packages/core/tsconfig.json` (new)
- `packages/core/vitest.config.ts` (new)
- `packages/core/src/index.ts` (new) — public re-exports
- `packages/core/src/repositories/index.ts` (new) — `withWorkspace` factory
- `packages/core/src/repositories/{agent,agent-version,kb-document,tool,channel,conversation}.ts` (new, 6 files)
- `packages/core/src/repositories/{agent,agent-version,kb-document,tool,channel,conversation}.test.ts` (new, 6 files — happy + failure path each)
- `packages/core/src/errors.ts` (new) — `AppendOnlyViolation`, `WorkspaceScopeViolation`
- `eslint.config.mjs` — add `no-restricted-imports` rule for routers
- Root `turbo.json` — verify `@kuralle/core` is part of the build/test/lint graph (workspaces glob is already `packages/*` so no edit needed; verify only)
- `package.json` (root) — DO NOT add deps; only the workspace catalog touch if a new shared dep is needed (none expected)

**Test fixtures:** in-memory KvStore from `@kuralle/platform/memory` (already shipped in S0-06). DB substrate either pglite (`pglite-drizzle`) or local Postgres (`postgres://kuralle:kuralle@localhost:5432/kuralle_dev`) — IC verifies which actually runs cleanly in `bun -F @kuralle/core test` and documents the choice. Preference: pglite, so the test is hermetic. If pglite can't host pgvector / partitions, fall back to local pg with a per-test schema reset.

**Demo artifact:** `sprints/sprint-2/artifacts/S2-01-repo-cache-trace.txt` — `bun -F @kuralle/core test --reporter verbose` output showing the `findById → cache miss → cache hit → update → cache invalidated → next findById = miss` trace for `AgentRepository`.

### `S2-02` — `AgentIR` Zod schema + synchronous projection worker in `@kuralle/runtime`

**Description:** Scaffold a new workspace package `packages/runtime/` and ship two artifacts inside it. (a) `packages/core/src/schemas/agent-ir.ts` (in `@kuralle/core` because the IR is a domain shape, not a runtime concern — repositories consume it) — a Zod schema matching the `agent_versions.snapshot` shape locked in `DATA_MODEL.md §5:347-365` verbatim (the IC must paste the cited lines into the brief and tick each field). (b) `packages/runtime/src/projector/agent.ts` — a synchronous projection worker that, given a freshly-written `agent_versions` row + its `AgentIR`, writes `agent_tool_attachments`, `agent_kb_attachments`, `agent_guardrails`, `agent_eval_criteria`, `workflow_nodes_projection`, `workflow_edges_projection` in a **single transaction with the version insert** (the function takes a `Drizzle` transaction handle, not a `db` connection; the orchestration of opening the transaction is S2-03's job in `agents.publish`). Per WBS risk: schema accommodates async via `agent_versions.projectionsReady` (deferred to v2); S2 does the synchronous variant.

**Acceptance criteria** (numbered, in priority order):
1. `packages/runtime/` exists as a workspace package with its own `package.json` (declaring `@kuralle/db`, `@kuralle/core`, `drizzle-orm`, `zod` deps; NO root devDep changes), `tsconfig.json`, `vitest.config.ts`, `src/index.ts`.
2. `AgentIR` Zod schema at `packages/core/src/schemas/agent-ir.ts` matches `DATA_MODEL.md §5:347-365` field-for-field. The file header cites the exact line range. Each top-level field has a `// §5:NNN` line-citation comment so future-readers (and the gate) can verify.
3. `AgentIR.parse` rejects unknown fields (`.strict()`); the schema is exported as both the Zod object and the inferred TypeScript type (`type AgentIR = z.infer<typeof agentIRSchema>`).
4. `projectAgent(tx, agentVersionId, ir)` at `packages/runtime/src/projector/agent.ts` accepts a Drizzle transaction, the new `agent_versions.id`, and a parsed `AgentIR`; returns `{ toolAttachments: number, kbAttachments: number, guardrails: number, evalCriteria: number, workflowNodes: number, workflowEdges: number }` row counts on success.
5. **Round-trip property test** at `packages/runtime/src/projector/agent.test.ts`: generate (via `fast-check`) a valid `AgentIR`, serialize to snapshot JSON, insert `agent_versions` + run `projectAgent` against it, then read the projection rows back + the snapshot, reconstruct the IR, assert structural equality with the original. 50 generated cases minimum.
6. **Latency assertion**: same test file measures p95 over 100 fixed-IR projections (a representative `AgentIR` with 5 tools / 3 KB docs / 4 guardrails / 6 eval criteria / 8 workflow nodes / 10 edges) and asserts ≤ 200 ms on the test substrate (local pg per S2-01 decision). The threshold matches WBS S2-02 DoD; the ≤ 100 ms in Postgres target is documented as a stretch goal, not gated.
7. The projector emits **no platform imports** — only `drizzle-orm`, `@kuralle/db/schema/agents`, `@kuralle/core/schemas/agent-ir`, `zod`. ESLint hexagonal-import rule (S0-06) verifies.
8. `bun run check-types`, `bun run lint`, `bun -F @kuralle/core test`, `bun -F @kuralle/runtime test` green.

**Files expected to be created or modified:**
- `packages/runtime/package.json` (new)
- `packages/runtime/tsconfig.json` (new)
- `packages/runtime/vitest.config.ts` (new)
- `packages/runtime/src/index.ts` (new)
- `packages/runtime/src/projector/agent.ts` (new)
- `packages/runtime/src/projector/agent.test.ts` (new)
- `packages/core/src/schemas/agent-ir.ts` (new)
- `packages/core/src/schemas/agent-ir.test.ts` (new) — schema-only tests (parse/reject)
- `packages/core/src/index.ts` — re-export `AgentIR` and `agentIRSchema`

**Test fixtures:** `packages/runtime/src/projector/__fixtures__/calderon-dispatcher-ir.json` — a known-good `AgentIR` for the Calderon HVAC dispatcher (from the S1-06 seed shape; IC reads `packages/db/scripts/seed-calderon.ts` to derive). `fast-check` for property-based generation.

**Demo artifact:** `sprints/sprint-2/artifacts/S2-02-projector-latency.txt` — vitest reporter output showing the 100-iteration p95 ≤ 200 ms.

### `S2-03` — `agents.{publish, autoSave, list, get, history}` oRPC procedures + OpenAPI cleanup across all 11 routers

**Description:** Wire the five agent procedures through `AgentRepository` + `AgentVersionRepository` + the projector. `agents.publish` accepts `{ workspaceId, agentId, ir: AgentIR }`, validates the IR with Zod, opens a Drizzle transaction, inserts a new `agent_versions` row with `versionKind='publish'`, runs `projectAgent(tx, ...)` synchronously, swaps `agents.activeVersionId` to the new version id, commits — all in one transaction. `agents.autoSave` accepts the same input shape, inserts `agent_versions` with `versionKind='auto_save'` only — no projection, no pointer swap. `agents.list` returns paginated agents (cursor-based, `(workspaceId, updatedAt DESC)` index). `agents.get` returns `{ agent, activeVersion: agent_versions | null }` for a given `agentId`. `agents.history` returns the version list for an `agentId` ordered `publishedAt DESC` with pagination.

**Scope expansion (per user direction 2026-05-07):** This story also folds in `BL-S1-OPENAPI-ITEM-SCHEMAS` — the existing 11 list routers (`agents`, `conversations`, `channels`, `kb`, `tools`, `batches`, `webhooks`, `secrets`, `voices`, `compliance`, `receipts`) replace `z.array(z.unknown())` outputs with explicit Zod schemas mirroring each Drizzle row type. For each router, the schema lives at `packages/api/src/routers/{resource}.schemas.ts` — derived from `<table>.$inferSelect` via Zod-from-Drizzle-row patterns; sensitive columns (e.g., `secrets.ciphertext`) are explicitly omitted. The regenerated `apps/server/openapi.json` shows full row-shapes everywhere instead of `anyOf [{}, null]`.

**Acceptance criteria** (numbered, in priority order):
1. Five procedures on `agentsRouter`: `list` (existing, expanded), `get`, `publish`, `autoSave`, `history`. Each has explicit Zod input + output schemas; `publish` and `autoSave` are mutations (oRPC procedures; not queries).
2. `agents.publish` is **transactional**: insert version → project → swap pointer all happen in the same Drizzle transaction. A failure at any step rolls back the version insert and leaves `agents.activeVersionId` unchanged.
3. The projector is fired from `agents.publish` only when `versionKind='publish'`; `autoSave` skips it. Same router file, two distinct codepaths — both sharing the version-insert helper but diverging at projection.
4. **Cache invalidation** (per user direction): on `publish`, after `tx.commit()` succeeds, invoke `kv.delete('repo:agent:<workspaceId>:<agentId>')` and `kv.delete('repo:agent_version:<workspaceId>:<newVersionId>')`. Repository tests in S2-01 already verify the delete-after-write contract; this story verifies the integration in an oRPC test.
5. **Integration test** at `apps/server/src/__tests__/agents.publish.test.ts` (or similar — IC determines the existing test convention) — wires up an in-process oRPC server against pglite/local-pg + memory KvStore, calls `agents.publish` with a fixture IR, then `agents.list` + `agents.get` + `agents.history` and asserts the new version is visible.
6. **OpenAPI scope expansion**: every list router has an explicit Zod row-shape schema; `apps/server/openapi.json` regenerated; `bun -F server gen:openapi --check` green; `git diff apps/server/openapi.json` shows full row schemas (not `{}`) for every list operation. The 11 schema files are reviewable in isolation.
7. `packages/api-client/src/schema.d.ts` regenerated and committed.
8. ESLint rule from S2-01 (`no-direct-drizzle-from-routers`) does NOT fire on the updated routers — every DB access goes through the repository layer.
9. `bun run check-types`, `bun run lint`, `bun -F server test`, OpenAPI drift gate green.

**Files expected to be created or modified:**
- `packages/api/src/routers/agents.ts` — expand to 5 procedures, all going through `AgentRepository` + `AgentVersionRepository` + `projectAgent`
- `packages/api/src/routers/agents.schemas.ts` (new) — `agentSchema`, `agentVersionSchema`, derived from Drizzle row types
- `packages/api/src/routers/{conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.schemas.ts` (new, 10 files) — Zod row schemas
- `packages/api/src/routers/{conversations,channels,kb,tools,batches,webhooks,secrets,voices,compliance,receipts}.ts` — replace `z.array(z.unknown())` with `z.array(<resourceSchema>)`
- `apps/server/openapi.json` — regenerated (DO NOT hand-edit)
- `packages/api-client/src/schema.d.ts` — regenerated
- `apps/server/src/__tests__/agents.publish.test.ts` (or path per existing conventions) (new) — integration test
- `packages/api/package.json` — add `@kuralle/core`, `@kuralle/runtime` deps

**Test fixtures:** Calderon HVAC dispatcher IR from S2-02's `__fixtures__`. In-process oRPC server against pglite/local-pg + memory KvStore.

**Demo artifact:** `sprints/sprint-2/artifacts/S2-03-openapi-diff.txt` — `git diff apps/server/openapi.json | head -100` showing both the new `agents.publish` operation (full schema) and one previously-`{}` list output now showing a full row schema.

### `S2-04` — Editor wiring (C2/C3/C8 + sticky save bar) + 5-resource hooks

**Description:** Wire the editor screens to real data. `apps/web/src/hooks/api/agents.ts` gains four new exports: `useAgent(agentId)` (single agent + active version), `useAgentPublish()` (mutation), `useAgentAutoSave()` (mutation), `useAgentHistory(agentId)` (paginated list). C1 (`_app.agents.index.tsx`), C2 (`_app.agents.$agentId.behavior.tsx`), C3 (`_app.agents.$agentId.models.tsx`), C8 (`_app.agents.$agentId.compliance.tsx`) replace mock data with hook calls. Editor holds **one `AgentIR` document** in TanStack Query state (or a co-located `useReducer` keyed by `agentId`); each tab edits a slice. **Auto-save fires every 30 s debounced** when the IR diff is non-empty. **Publish opens a confirmation modal** with copy from `USER_JOURNEYS.md §4` ("X live calls will see the new version after this call ends"), then fires `useAgentPublish()`. The sticky bar shows `Saved → Publishing → Live` reflecting the mutation lifecycle.

**Scope expansion (per user direction 2026-05-07):** This story also folds in `BL-S1-WIRE-REMAINING-HOOKS`. Five additional read-only hook modules: `apps/web/src/hooks/api/{conversations,channels,kb,telephony,phone-numbers}.ts`. Each exports a `useResourceList()` query wrapper around its respective `<resource>.list` procedure (mutations defer to their respective sprints). The corresponding screens (B1 home `_app.index.tsx`, F1 conversations `_app.conversations.index.tsx`, `_app.knowledge.index.tsx`, `/telephony`, `/phone-numbers`) replace mock imports with the real hooks. The forbidden-mock-import lint rule is verified across all replaced screens.

**Acceptance criteria** (numbered, in priority order):
1. `apps/web/src/hooks/api/agents.ts` exports `useAgents`, `useAgent`, `useAgentPublish`, `useAgentAutoSave`, `useAgentHistory`. Each uses `$api.agents.<procedure>.useQuery` / `useMutation` (per AMENDMENT-001). No `client.agents.x` direct imports.
2. C2 (`_app.agents.$agentId.behavior.tsx`) renders the agent's `instructions` / `firstMessage` from `useAgent(agentId)`. Edits write to a local `AgentIR` reducer state. C3 (`models.tsx`) renders the model + voice picker from the same IR; C8 (`compliance.tsx`) renders the compliance config slice.
3. Auto-save: a `useDebouncedEffect` (or equivalent — IC verifies what's already in the codebase) fires `useAgentAutoSave().mutate(ir)` 30 s after the last IR change; cancelled if a `publish` fires first.
4. Publish modal: clicking the "Publish" CTA in the sticky bar opens a confirmation dialog with the `USER_JOURNEYS.md §4` copy verbatim ("X live calls will see the new version after this call ends" — IC reads §4 to find the exact quote). Confirming fires `useAgentPublish().mutate({...})`. The sticky bar transitions `Idle → Publishing → Live` reflecting `mutation.status`.
5. **Vitest + happy-dom click-through test** at `apps/web/src/__tests__/editor-publish-flow.test.tsx` (per user decision 2026-05-07; NOT Playwright). MSW intercepts `/rpc/agents.publish`, returns a fake new version. Test renders C2, types a new prompt, advances `vi.useFakeTimers()` 30s, asserts an `agents.autoSave` request was made; clicks Publish, confirms in the modal, asserts `agents.publish` request fired and the sticky bar text reads "Live". This replaces the WBS-default Playwright test; the trade-off is documented in the test file header.
6. **Five additional hook modules** at `apps/web/src/hooks/api/{conversations,channels,kb,telephony,phone-numbers}.ts` each export the read-only `use<Resource>List()` wrapper. (Naming: `useConversations`, `useChannels`, `useKb`, `useTelephony`, `usePhoneNumbers` — matches the WBS HANDOFF and BL-S1-WIRE-REMAINING-HOOKS list.)
7. Five screens replace mock imports: B1 (home), F1 (conversations index), `_app.knowledge.index.tsx`, `_app.telephony.index.tsx` (path TBD; IC greps), `_app.phone-numbers.index.tsx` (path TBD).
8. `apps/web/src/lib/mocks/{agents,conversations,knowledge,numbers}.ts` — IC may reduce these to empty re-exports if no consumer remains; preferred is to keep the file, just stop importing it from production screens. The `forbidden-mock-import` rule should make the test unambiguous.
9. **No oRPC client imports outside `apps/web/src/hooks/api/**`** — verified by ESLint passing across the new screen edits.
10. `bun run check-types`, `bun run lint`, `bun -F web test` green; the existing 38 web tests still pass.

**Files expected to be created or modified:**
- `apps/web/src/hooks/api/agents.ts` — extend with 4 new hooks
- `apps/web/src/hooks/api/agents.test.tsx` — extend with happy-path tests for each new hook (MSW)
- `apps/web/src/hooks/api/{conversations,channels,kb,telephony,phone-numbers}.ts` (new, 5 files)
- `apps/web/src/hooks/api/{conversations,channels,kb,telephony,phone-numbers}.test.tsx` (new, 5 files)
- `apps/web/src/routes/_app.agents.$agentId.behavior.tsx` (C2)
- `apps/web/src/routes/_app.agents.$agentId.models.tsx` (C3)
- `apps/web/src/routes/_app.agents.$agentId.compliance.tsx` (C8)
- `apps/web/src/routes/_app.agents.$agentId.tsx` — sticky bar + publish modal
- `apps/web/src/routes/_app.agents.index.tsx` — C1, may already use `useAgents` from S1-05; verify
- `apps/web/src/routes/_app.index.tsx` (B1)
- `apps/web/src/routes/_app.conversations.index.tsx` (F1)
- `apps/web/src/routes/_app.knowledge.index.tsx`
- `apps/web/src/routes/_app.telephony.index.tsx` (path TBD by IC grep)
- `apps/web/src/routes/_app.phone-numbers.index.tsx` (path TBD by IC grep)
- `apps/web/src/__tests__/editor-publish-flow.test.tsx` (new) — click-through test
- `apps/web/src/lib/mocks/*.ts` — leave files; remove imports from production screens

**Test fixtures:** Calderon HVAC dispatcher `AgentIR` from S2-02's `__fixtures__`, accessed via MSW handlers in the test file.

**Demo artifact:** `sprints/sprint-2/artifacts/S2-04-editor-flow.txt` — `bun -F web test` reporter-verbose output showing the click-through test passing the `Idle → Publishing → Live` transition. If `git diff --stat apps/web/src/lib/mocks/` is interesting, attach that too.

### `S2-05` — Sub-second publish SLO test

**Description:** Integration test that asserts the WBS S2-02 / `USER_JOURNEYS.md §2` SLO #2: 100 sequential publishes of a representative `AgentIR` against local Postgres complete with **p95 ≤ 1 s** wall-clock from oRPC request to `agents.activeVersionId` swap visible. The test runs against the in-process oRPC server from S2-03's integration test setup. Captured into `sprints/sprint-2/artifacts/publish-slo.txt`. Failure mode (p95 > 1 s) is wired to a `usage_events` insert with `kind='slo_violation'` and `payload={ slo: 'agent.publish.p95', observed_ms, threshold_ms: 1000 }` — instrumentation only; alerting comes later. Per WBS S2-05 DoD.

**Acceptance criteria** (numbered, in priority order):
1. `apps/server/src/__tests__/agents.publish.slo.test.ts` (or per existing conventions) — runs 100 publishes sequentially, captures wall-clock per call, asserts p95 ≤ 1 s.
2. SLO holds against local Postgres. If it fails, the test instructs the IC to **stop and flag to the user** (per the kickoff prompt's project-specific blocker rule); the IC does NOT silently relax the threshold or skip the test.
3. The same test exercises the failure-mode instrumentation: when a publish takes longer than 1 s (force this in a separate test by injecting a `await sleep(1100)` into the projector via a test-only hook), a `usage_events` row with `kind='slo_violation'` is written. The injection point is documented; the production path has no `sleep`.
4. Captured artifact at `sprints/sprint-2/artifacts/publish-slo.txt` shows the full latency histogram (min, p50, p95, p99, max) and the SLO assertion result.
5. `bun run check-types`, `bun run lint`, the SLO test green.

**Files expected to be created or modified:**
- `apps/server/src/__tests__/agents.publish.slo.test.ts` (new)
- `packages/runtime/src/projector/agent.ts` — add a test-only injection seam if needed for #3 (gated behind a `__TEST_ONLY__` symbol export; production callers cannot reach it)

**Test fixtures:** Calderon HVAC dispatcher `AgentIR`. Local Postgres (per memory rule — no docker).

**Demo artifact:** `sprints/sprint-2/artifacts/publish-slo.txt` — the SLO histogram output.

---

## 2. Universal DoD checklist (per story)

Copy this checklist into every story brief. The story is not closed until every box is ticked.

- [ ] Schema/contract matches the cited `DATA_MODEL.md` / `HEXAGONAL_ARCHITECTURE.md` / `USER_JOURNEYS.md` section verbatim — no improvisation.
- [ ] `bun -F @kuralle/db db:migrate` (if migration touched) applies cleanly against local Postgres (`postgres://kuralle:kuralle@localhost:5432/kuralle_dev`).
- [ ] `bun run check-types --force` green workspace-wide.
- [ ] `bun run lint` green (forbidden-mock-import + hexagonal-import + hook-wrapper + no-direct-drizzle-from-routers rules — story-applicable subset).
- [ ] If story changed routers: `bun -F server gen:openapi --check` green and committed `openapi.json` diff is intentional.
- [ ] If story changed `apps/web`: `bun -F web test` green; existing tests still pass.
- [ ] If story added a new package: appears in `turbo` graph; `bun -F <pkg> test` green; package README explains the public surface.
- [ ] Demo artifact captured into `sprints/sprint-2/artifacts/S2-{nn}-*` and referenced in the commit body.
- [ ] Atomic commit with subject `[S2-{nn}] {short title}` — IC commits before exiting; manager owns `[S2-{nn}-fix]`.
- [ ] No `--no-verify`, no `@ts-ignore`, no `try/except: pass`, no shortcuts. No root-package.json devDep additions.
- [ ] Per-story gate (`pi/kimi-k2.6`) verdict captured in `sprints/sprint-2/gate-S2-{nn}.md`; manager fix-pass commit lands every Apply-now item.

---

## 3. Test plan

| Story | Layer | Test type | Fixtures |
|-------|-------|-----------|----------|
| S2-01 | unit | repository against memory KvStore + pglite/local-pg (cache miss → hit → invalidation) | per-test schema reset |
| S2-01 | rule | ESLint rule fires on direct `drizzle-orm` import in `packages/api/src/routers/**` | throw-away violation branch |
| S2-02 | property | round-trip: AgentIR → snapshot insert → projection rows → reconstruct → equal | fast-check, 50+ cases |
| S2-02 | latency | p95 over 100 projections of representative IR ≤ 200 ms | local pg / pglite |
| S2-03 | integration | `agents.publish` → `list` → `get` → `history` round-trip, version visible | in-process oRPC + pglite/local-pg + memory KvStore |
| S2-03 | drift | `bun -F server gen:openapi --check` green; full row schemas everywhere | (no fixture) |
| S2-04 | hook unit | each new hook (5 agents + 5 read-only) MSW-tested for happy path | MSW |
| S2-04 | click-through | C2 edit → 30s timer → autosave fires → click Publish → modal → confirm → sticky bar reads "Live" | Vitest + happy-dom + MSW + `vi.useFakeTimers()` |
| S2-05 | SLO | 100 sequential publishes, p95 ≤ 1 s | local pg |
| S2-05 | failure mode | injected slow projection writes `usage_events.kind='slo_violation'` | local pg |

What we will NOT test in this sprint, and why each is safe:
- **No Playwright tests.** Per user decision 2026-05-07: stay on Vitest + happy-dom + MSW. The trade-off — happy-dom can't catch real-browser-only quirks — is accepted; r1/r2 review is the safety net for UI semantics.
- **No async projection worker.** WBS S2-02 explicitly defers it (`agent_versions.projectionsReady` is the seam; BL-04 in WBS §250 is the trigger condition).
- **No production Workers / Neon-HTTP transport tests.** Codegen Gate-Partial from S0 still stands; CF/Neon credentials still unprovisioned. Local Postgres remains the substrate.
- **No RLS policy tests.** Deferred to S5 per `DATA_MODEL.md §3`. Workspace-scope is enforced at the repository factory level (`withWorkspace`), not yet at the DB level.
- **No mutation hooks for the 5 read-only resources** (S2-04 scope expansion). Only `use<Resource>List()` queries; mutations land in their respective sprints (S3 conversations/channels, etc.).

---

## 4. Demo plan

**Demo:** A 90-second screen recording captured into `sprints/sprint-2/artifacts/sprint-2-demo.mov`. Workspace admin opens C2 for the Calderon HVAC dispatcher (seeded in S1-06), edits the first message, watches the sticky bar transition `Idle → Saved` after auto-save, clicks Publish, sees the confirmation modal with the `§4` copy ("live calls will see the new version after this call ends"), confirms, sees the sticky bar transition `Publishing → Live` in under a second, then opens C1 and observes the version number tick up. Persona: **Workspace Admin** — trust moment "I changed something and shipped it without paging an engineer." A tail-of-the-recording snapshot shows `bun -F server test` running the SLO test green at p95 ≤ 1 s.

---

## 5. Risks specific to this sprint

| Risk | Detection signal | Mitigation |
|------|------------------|------------|
| Synchronous projection latency exceeds 200 ms p95 when guardrail+workflow lists grow (WBS §156). | S2-02 latency test fails on the representative IR. | Accept ≤ 200 ms target; the 100 ms stretch goal is non-gating. Schema already accommodates async via `agent_versions.projectionsReady` (BL-04) — escalate to user, not silent skip. |
| `AgentIR` Zod schema diverges from `DATA_MODEL.md §5:347-365` (WBS §157). | S2-02 round-trip property test fails on a generated IR with a field missing from the snapshot path. | Schema file cites §5:347-365 line-by-line in comments; gate brief explicitly checks each field. |
| `apps/web` regressions when mocks are partially replaced (WBS §158). | Existing 38 web tests fail post-S2-04. | Replace mock imports only where the hook exists; leave files in place. Rerun the existing test suite after every screen edit. |
| Drift CI fails on S2-03 because OpenAPI emit order changes when 11 resource-schemas land. | `bun -F server gen:openapi --check` red after IC commit. | The S0 generator already sorts keys; if drift, IC reads the generator and verifies sort-stability before claiming done. |
| pglite cannot host `pgvector` / partition tables, breaking S2-01 / S2-02 tests. | `bun -F @kuralle/core test` fails on `CREATE EXTENSION vector` or partition DDL. | Fall back to local Postgres with per-test schema reset (slower but hermetic enough); IC documents the fallback in commit body. |
| Cache invalidation race: a `findById` between `tx.commit()` and `kv.delete(...)` returns stale data. | S2-01 repo test catches with a deliberate ordering test. | Sequence: commit → delete → return. The window is microseconds (single-process); for v1 acceptable. Note: in S5 with multi-instance deploys, cache becomes a distributed concern — flag to BL when applicable. |
| `vi.useFakeTimers()` doesn't compose cleanly with TanStack Query's internals (debounce + retry). | S2-04 click-through test flakes. | Either advance timers AND call `await queryClient.flushPromises()`-style helper, or replace fake-timer with explicit `setTimeout`-mocked debounce. IC documents the path taken. |
| Five read-only-hook screens accidentally bypass `apps/web/src/hooks/api/**` (e.g., a screen uses `client.x.useQuery` directly). | ESLint forbidden-import rule fires. | Treat as a story blocker, not a yellow finding — the rule is the contract. |

---

## 6. Open questions

Decided pre-sprint via AskUserQuestion (2026-05-07):
- S2-04 hook scope: **Fold all 5 read-only hooks in** (BL-S1-WIRE-REMAINING-HOOKS).
- S2-03 OpenAPI scope: **All 11 routers get full Zod row-schemas** (BL-S1-OPENAPI-ITEM-SCHEMAS).
- S2-04 click-through stack: **Vitest + happy-dom + MSW** — no Playwright in S2.
- S2-01 cache strategy: **Wire identity-map cache + invalidate-on-publish.**

Still ambiguous (will resolve in-flight; flag to user if blocking):
- **Test substrate**: pglite vs. local-pg for `@kuralle/core` and `@kuralle/runtime` test runs. IC determines which actually works against pgvector + partitions; documents in commit body. Default preference: pglite for hermeticity; local-pg fallback if pgvector won't load.
- **Test-only seam in projector** (S2-05 #3): how to inject a controlled latency without polluting production code. Default: a dependency-injected `clock` parameter with default `Date.now`; production never overrides. IC verifies whether this is the right shape or there's a simpler hook.
- **Sticky bar component**: whether `_app.agents.$agentId.tsx` already has a sticky bar component or if S2-04 must scaffold one. IC greps first; reuses if exists. If the component must be built from scratch, IC matches the visual style of existing chrome (no design system rework in this sprint).
