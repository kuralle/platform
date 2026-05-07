# Amendment 004 — Optional `workflow` top-level key on `agent_versions.snapshot`

**Status:** Accepted
**Date:** 2026-05-07
**Affects:** `DATA_MODEL.md §5:347-365` (snapshot shape); `DATA_MODEL.md §6:443-478` (workflow projection tables); `packages/core/src/schemas/agent-ir.ts`; `packages/runtime/src/projector/agent.ts`.
**Author:** Sprint 2 manager; surfaced by S2-02 `pi/deepseek-v4-pro` IC and `pi/kimi-k2.6` gate (finding F01); ratified by user decision 2026-05-07.

---

## What changed

`DATA_MODEL.md §5:347-365` originally listed only `workflowAttachments: Record<wfId, { description? }>` as a workflow-related field on `agent_versions.snapshot`. The snapshot also carries (via this amendment) an optional top-level `workflow` key:

```ts
workflow?: {
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
}
```

where `WorkflowNode` and `WorkflowEdge` are the row shapes of `workflow_nodes_projection` and `workflow_edges_projection` (per `DATA_MODEL.md §6:443-478`). The two fields cooperate:

- `workflowAttachments[wfId]` is a thin metadata record (description, etc.) keyed by external workflow id — for cross-references to a separate `workflows` table that may exist post-MVP.
- `workflow.nodes` / `workflow.edges` is the **inline** node-and-edge graph that the projector materializes into `workflow_nodes_projection` and `workflow_edges_projection` when an agent is published.

For S2 (and v1.0), agents own their workflow graph inline via `workflow.nodes/edges`; `workflowAttachments` is the seam for the future `workflows` master table (post-MVP).

## Why

1. **The projection contract requires it.** `DATA_MODEL.md §6` defines `workflow_nodes_projection` and `workflow_edges_projection` as projection tables that the projector worker writes on publish. With only `workflowAttachments` (which is a thin Record<wfId, {description?}>), the projector has no node/edge data to project. The `workflow` key is the data source.
2. **Inline node/edge data matches the editor UX.** `USER_JOURNEYS.md §4` describes the C7 Workflow tab as a node-graph editor. The user authors nodes and edges in-place; the IR carries them as part of the agent version. There is no separate "workflow library" to reference yet (BL-04 / post-MVP).
3. **Optional preserves backward compatibility.** Agents without a workflow tab (the dispatcher in S1-06's Calderon HVAC seed has no workflow yet) simply omit the key. The projector skips both projection tables when the key is absent.
4. **§6 already specifies the projection tables.** The amendment formalizes what `DATA_MODEL.md §6:443-478` implicitly required — making the snapshot field that feeds the projector explicit in §5.

## What did NOT change

- `workflowAttachments` (`§5:354`) is unchanged in shape. It remains the seam for a future `workflows` master table.
- `workflow_nodes_projection` and `workflow_edges_projection` table shapes (per `§6`) are unchanged.
- The projector's transactional semantics are unchanged (synchronous write inside the publish transaction).
- The IR's `.strict()` discipline is unchanged — `workflow` is added to the strict shape, not via passthrough.

## Concrete edits applied with this amendment

1. **`packages/core/src/schemas/agent-ir.ts`** — `agentIRSchema` adds `workflow: workflowSchema.optional()`. `workflowSchema` is a new `.strictObject({ nodes: WorkflowNode[], edges: WorkflowEdge[] }).strict()`. Header docstring cites AMENDMENT-004 and §6:443-478.
2. **`packages/runtime/src/projector/agent.ts`** — workflow projection branches (`projectAgent` step 5 + 6) iterate over `ir.workflow?.nodes ?? []` and `ir.workflow?.edges ?? []`; missing key writes zero rows. Inline comment cites AMENDMENT-004.
3. **`DATA_MODEL.md §5:347-365`** — annotated inline with the AMENDMENT-004 reference indicating the optional `workflow` key. (Layered annotation, not a wholesale rewrite.)

## Resolution path forward

If/when the project ships a master `workflows` table (likely beyond v1.0, when agents share a library of reusable workflows across the workspace), `workflowAttachments` becomes the FK-style seam: `Record<wfId, { description?, version? }>` referencing the master rows. The inline `workflow.nodes/edges` would then be deprecated for those agents that opt into shared workflows; agents with bespoke flows continue to embed the graph inline. This amendment is forward-compatible with that future shape.

## Footnote on §5 vs §6 separation

`DATA_MODEL.md §5` is the agent + snapshot RFC; `§6` is the workflow + projection RFC. The IR's `workflow` field bridges the two — it sits in the snapshot but is shaped by `§6`. Future readers of `§5:347-365` should treat the AMENDMENT-004 annotation as a forwarding pointer to `§6:443-478` for the precise node/edge shapes.
