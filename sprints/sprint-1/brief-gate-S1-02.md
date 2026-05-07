# Spec + Code-Quality Gate — `S1-02` Agents two-row split + projections

> **Gate worker:** `pi/kimi-k2.6`. **IC was:** `pi/deepseek-v4-pro`. You are peer-IC, NOT adversarial. Output a markdown report at `sprints/sprint-1/gate-S1-02.md`. Do NOT commit. Do NOT modify source.

---

## 1. Context

**Story:** `S1-02` — Agents two-row split + projections.

**Inputs:**
1. `sprints/sprint-1/brief-S1-02.md` — the contract (15 ACs).
2. `sprints/sprint-1/PLAN.md` § `S1-02`.
3. `.handoff/result-S1-02.txt` — IC transcript.
4. The diff: `git show f18e8ff`. Read every file the IC created or modified.
5. Reference docs: `DATA_MODEL.md §5` (lines 307-443), `§6` (workflow projections, 463-496), `§15` (cross-cutting, 1196-1245), `§18` step 3.
6. Migration files: `packages/db/src/migrations/0004_round_calypso.sql`, `0005_s1_02_meta.sql`.
7. Artifacts: `sprints/sprint-1/artifacts/S1-02-trigger.txt`, `S1-02-tables.txt`.
8. Schema files: `packages/db/src/schema/agents.ts`, `index.ts` (the new re-export).
9. The S1-01 gate report (`sprints/sprint-1/gate-S1-01.md`) — for the project-specific gate pattern (CHECK constraints on enum-text columns, partial-index miss pattern, `relations()` precedent).
10. The committed Postgres state — re-run `bun packages/db/scripts/smoke-S1-02.ts` (already proven 14/14 by the IC).

---

## 2. Your job

### 2.1 Spec adherence — walk every brief AC 1-15

For each:
- Met / partial / missed. Cite file:line.
- If partial: what's missing?
- If missed: did the commit body honestly disclose it?

**Project-specific spec gates** (apply across S1-02 too — these are sprint-1 standing rules from gate-S1-01):

A. **CHECK constraints on enum-text columns (BL-S0-02 spirit)**: every new enum-text column should have a CHECK matching the §5/§6 enum tuples. Specifically check:
   - `agent_versions.versionKind` IN `('auto_save','manual_save','publish')` per §5:338. (Brief AC 3 says yes — verify.)
   - `agent_versions.bundleStatus` IN `('pending','building','ready','failed')` per §5:370.
   - `agents.status` IN `('draft','published','archived')` per §5:315.
   - `agent_tool_attachments.source` IN `('native','workflow','subagent','integration','mcp')` per §5:398. (Brief AC 9 says yes.)
   - `agent_guardrails.direction` IN `('input','output','both')` per §5:417. (Brief AC 9.)
   - `agent_guardrails.onTrigger` IN `('block','redact','flag','escalate')` per §5:420. (Brief AC 9.)
   - `agent_eval_criteria.kind` IN `('success','data','safety')` per §5:431. (Brief AC 9.)
   - `workflow_nodes_projection.kind` IN `('subagent','extraction','dispatch','transfer-agent','transfer-number','end')` per §6:474. (Brief AC 10.)
   - `workflow_edges_projection.conditionType` IN `('llm','expression','none')` per §6:488. (Brief AC 10.)

B. **Partial indexes**: the `agents` `(workspaceId, deletedAt) WHERE deletedAt IS NULL` partial index per §5:323 — present?

C. **Append-only trigger**: §5:382-387 explains drafts/auto-saves; the trigger must NOT block legitimate INSERT or DELETE. Trigger fires only `BEFORE UPDATE`. Verify in `0004_*.sql` or `0005_*.sql`.

D. **Mutual-FK chicken-and-egg**: `agents.activeVersionId` is nullable per AC 2; `agent_versions.agentId` references agents. Migration order matters — `agents` must be createable before any `agent_versions` row. Verify the IC's order works on from-scratch replay (the smoke covers this).

E. **`relations()` precedent**: every new table file should declare relations to match the auth.ts/voices.ts (post-fix-pass) precedent. Verify `agents.ts` has relations for each table.

F. **No `catch (e: any)`**: lint should still be 0 errors / 1 pre-existing warning. The IC says lint is green; verify no NEW warnings vs. post-S1-01-fix state.

G. **Snapshot file shape**: the IC committed `0004_snapshot.json` (~2785 lines). Verify it's drizzle-kit's auto-emit, not a hand-edit (hand-edits to snapshots are an anti-pattern).

H. **Hand-authored migration in `0005_s1_02_meta.sql`**: the IC says it carries the trigger, partial index, CHECKs, composite PKs. Verify each statement is grounded in the spec (no improvisation) and that the SQL syntax is valid Postgres 15.

### 2.2 Code quality

- **Naming**: TS exports camelCase (`agents`, `agentVersions`); SQL columns snake_case. Verify.
- **Type tightness**: `AnyPgColumn` annotations on circular FKs — does the IC use the documented pattern (`(): AnyPgColumn => ...`)? Any unjustified `any` casts?
- **Idiomatic patterns**: `relations()` per table; `pgTable(name, columns, (table) => [indexes])` shape.
- **Smells**: dead branches, copy-paste between projection-table definitions, magic numbers (versionNumber starts at 1 — implicit; document?).
- **Comments**: WHY-only. Flag any WHAT comments.
- **Test quality**: smoke runner — does each PASS actually assert distinct behavior? Does it cover the trigger + the dedup unique + the projection chain end-to-end?

---

## 3. Output

Write **`sprints/sprint-1/gate-S1-02.md`** with the standard sections from `sprints/templates/STORY-BRIEF-GATE.md` §3:
1. Spec adherence table (15 ACs + project-specific A-H).
2. File-list adherence table.
3. Wiring + demo artifact.
4. Code quality bullets (one per file or "clean").
5. Honest summary paragraph.
6. Recommended action: `Ready for fix-pass` / `Needs IC re-fire` / `Ambiguous — manager owns`.
7. **Apply-now items** — numbered, file:line, surgical fix description. The manager will apply each one before firing S1-03.

Verdict at the top: green / yellow / red.

---

## 4. What NOT to do

- No code edits — markdown only.
- No commit.
- No adversarial framing — that's r2's job at sprint level.
- No bikeshedding. Flag only project-rule, RFC-§, or §2.2 rubric violations.
- Don't duplicate the brief — reference ACs by number.
- Don't skip a suspicious file — read line by line.

---

## 5. Tone

Calm, peer-IC, on-team. Make the manager's r1 faster, not redundant.
