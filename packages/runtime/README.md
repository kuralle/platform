# @kuralle/runtime

Synchronous projection worker for the Kuralle agent platform.

## Public surface

### `projectAgent(tx, agentVersionId, ir)`

Given a Drizzle transaction handle, a new `agent_versions.id`, and a parsed
`AgentIR`, writes six projection tables in the same transaction:

1. `agent_tool_attachments`
2. `agent_kb_attachments`
3. `agent_guardrails`
4. `agent_eval_criteria`
5. `workflow_nodes_projection`
6. `workflow_edges_projection`

Returns row counts: `{ toolAttachments, kbAttachments, guardrails, evalCriteria, workflowNodes, workflowEdges }`.

The projector does **not** open or commit the transaction — the caller owns
transaction lifecycle. A failure at any insert rolls back the caller's
transaction.

## Architecture

Part of the Kuralle hexagonal architecture (`HEXAGONAL_ARCHITECTURE.md`).
The `packages/runtime/src/projector/` directory contains the synchronous
projection worker. The `packages/runtime/src/adapter/` directory is
reserved for Sprint 3's AriaFlow Anti-Corruption Layer — do not add
files there in Sprint 2.

## Testing

```bash
bun -F @kuralle/runtime test
```

Tests require a local Postgres at `postgres://kuralle:kuralle@localhost:5432/kuralle_dev`.
Uses `@kuralle/core/test-utils` for the test substrate (S2-01 convention).
