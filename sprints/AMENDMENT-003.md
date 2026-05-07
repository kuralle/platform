# Amendment 003 — `scorerAttachments` IR shape expands with optional per-criterion fields

**Status:** Accepted
**Date:** 2026-05-07
**Affects:** `DATA_MODEL.md §5:360` (`scorerAttachments` field of `agent_versions.snapshot`); `packages/core/src/schemas/agent-ir.ts`; `packages/runtime/src/projector/agent.ts`; future S2-04 editor wiring for the C8 (Compliance / Eval) tab.
**Author:** Sprint 2 manager; surfaced by S2-02 `pi/deepseek-v4-pro` IC and `pi/kimi-k2.6` gate (finding F02); ratified by user decision 2026-05-07.

---

## What changed

`DATA_MODEL.md §5:360` originally specified:

```ts
scorerAttachments: Record<criterionId, { weight, samplingRate }>
```

The shape is now:

```ts
scorerAttachments: Record<criterionId, {
  weight: number,                          // §5:360 — original
  samplingRate: number,                    // §5:360 — original
  name?: string,                           // §5:360 — AMENDMENT-003
  description?: string,                    // §5:360 — AMENDMENT-003
  kind?: 'success' | 'data' | 'safety',    // §5:360 — AMENDMENT-003 — matches agent_eval_criteria.kind enum
  rubric?: string,                         // §5:360 — AMENDMENT-003
}>
```

All four added fields are optional. When omitted, the projector uses defensible defaults:
- `name` defaults to `criterionId` (the Record key).
- `description` defaults to `""` (empty string).
- `kind` defaults to `'success'`.
- `rubric` defaults to `""`.

The amendment is **append-only** to the IR contract — existing snapshots that lack the four new fields remain valid; reading them via the updated Zod schema parses without error and the projector falls back to defaults.

## Why

1. **The projection table `agent_eval_criteria` requires `name`, `description`, `kind`, `rubric`** (per `DATA_MODEL.md §5:425-437`). Without these in the IR, the projector either (a) hard-codes defaults and silently loses information, or (b) joins against a master `eval_criteria` table that does not exist in S2.
2. **Editor UX needs them.** The C8 (Compliance / Eval) tab in `USER_JOURNEYS.md §4` lets the workspace admin name a scorer ("PII redaction adherence"), describe it, set its kind ("safety"), and write a rubric. Without these fields in the IR, the editor cannot persist user-authored content.
3. **Avoiding a master table keeps S2 small.** A `workspace_eval_criteria` table would be a separate aggregate root with its own CRUD, joins, and FK constraints; that's S5+ scope. Inlining the fields in the IR matches the snapshot-as-source-of-truth pattern (`DATA_MODEL.md §5` "the snapshot is the source of truth").
4. **Optional preserves backward compatibility.** All four fields default to safe values; pre-AMENDMENT snapshots remain readable and projectable.

## What did NOT change

- The two original fields (`weight`, `samplingRate`) remain unchanged.
- `agent_eval_criteria` projection table schema is unchanged (S1-02 ground truth).
- The `agent_eval_criteria.weight` projection still reflects `scorerAttachments[id].weight`.
- The `agent_eval_criteria.ordinal` is still derived by the projector from iteration index (no IR-side ordering hint).
- `samplingRate` remains in IR but **is not projected** to `agent_eval_criteria` (the table has no `samplingRate` column). Reads use the snapshot for `samplingRate`.

## Concrete edits applied with this amendment

1. **`packages/core/src/schemas/agent-ir.ts`** — `scorerAttachmentSchema` extended with optional `name?`, `description?`, `kind?` (with `z.enum(['success','data','safety'])`), and `rubric?`. Header docstring updated to cite AMENDMENT-003.
2. **`packages/runtime/src/projector/agent.ts`** — `scorerAttachments` projection now reads `scorer.name ?? criterionId`, `scorer.description ?? ""`, `scorer.kind ?? "success"`, `scorer.rubric ?? ""`. Inline comment cites AMENDMENT-003.
3. **`packages/runtime/src/projector/agent.test.ts`** — `scorerAttachmentsArb` extended to optionally generate the four new fields; reconstruction reads them back from `agent_eval_criteria` rows; round-trip property test asserts they survive end-to-end.
4. **`DATA_MODEL.md §5:360`** — annotated inline with the AMENDMENT-003 reference (no shape rewrite needed; the optional fields layer cleanly on top of the original).

## Resolution path forward

If/when the project ships a master `workspace_eval_criteria` table (likely S5 alongside the compliance evaluator from `DATA_MODEL.md §12`), the IR's four optional fields can be deprecated in favor of FK joins. Until then, this amendment is the canonical shape.

## Footnote on the round-trip semantics

The IR field `scorerAttachments[id].samplingRate` does **not** round-trip via the projection table — it lives in the snapshot only. This is intentional: `agent_eval_criteria` is consumed at runtime by the supervisor / scorer pipeline, which doesn't need `samplingRate` (the editor reads it from the snapshot for the C8 tab; runtime consults it from the snapshot or an explicit per-call config). The S2-02 round-trip property test reads `samplingRate` from the snapshot during reconstruction; this is documented inline.
