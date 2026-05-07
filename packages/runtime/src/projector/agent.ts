import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { AgentIR } from "@kuralle/core";

/** Schema type for table operations (insert/select from projection tables). */
type TablesRelational = ExtractTablesWithRelations<typeof schema>;

/**
 * Row-count result from `projectAgent`.
 * Deterministic order matches insertion order.
 */
export interface ProjectionCounts {
  toolAttachments: number;
  kbAttachments: number;
  guardrails: number;
  evalCriteria: number;
  workflowNodes: number;
  workflowEdges: number;
}

/**
 * Synchronous projection worker.
 *
 * Given a Drizzle transaction handle (opened + committed by the caller),
 * the new `agent_versions.id`, and a parsed `AgentIR`, writes all six
 * projection tables in deterministic order:
 *
 * 1. `agent_tool_attachments`
 * 2. `agent_kb_attachments`
 * 3. `agent_guardrails`
 * 4. `agent_eval_criteria`
 * 5. `workflow_nodes_projection`
 * 6. `workflow_edges_projection`
 *
 * Returns row counts. Does NOT open or commit the transaction.
 * Any insert failure causes the caller's transaction to roll back.
 *
 * Note on eval_criteria fields not in the IR:
 * `name`, `description`, `kind`, `rubric` are not present in
 * `scorerAttachments : Record<criterionId, {weight, samplingRate}>` (per §5:360).
 * The projector uses `criterionId` as `name`, empty-string defaults for
 * `description`/`rubric`, and `kind = 'success'`. This is flagged as a
 * DATA_MODEL.md ambiguity — the projection table expects these fields
 * but the IR snapshot does not carry them. Future sprints may add a
 * master `eval_criteria` table or expand the IR.
 */
export async function projectAgent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: PgTransaction<any, any, TablesRelational>,
  agentVersionId: string,
  ir: AgentIR,
): Promise<ProjectionCounts> {
  let toolAttachments = 0;
  let kbAttachments = 0;
  let guardrails = 0;
  let evalCriteria = 0;
  let workflowNodes = 0;
  let workflowEdges = 0;

  // ── 1. agent_tool_attachments ────────────────────────────────
  const toolRows: (typeof schema.agentToolAttachments.$inferInsert)[] = [];

  for (const [toolId, attachment] of Object.entries(ir.toolAttachments)) {
    toolRows.push({
      agentVersionId,
      toolId,
      source: "native",
      config: { description: attachment.description, rules: attachment.rules },
    });
  }
  for (const [tcpId, integration] of Object.entries(ir.integrationTools)) {
    toolRows.push({
      agentVersionId,
      toolId: tcpId,
      source: "integration",
      config: { selectedTools: integration.selectedTools },
    });
  }
  for (const [clientId, mcp] of Object.entries(ir.mcpClientAttachments)) {
    toolRows.push({
      agentVersionId,
      toolId: clientId,
      source: "mcp",
      config: { allowedTools: mcp.allowedTools },
    });
  }
  // Also emit subagent attachments as tool rows (source "subagent")
  for (const [agentId] of Object.entries(ir.subagentAttachments)) {
    toolRows.push({
      agentVersionId,
      toolId: agentId,
      source: "subagent",
      config: {},
    });
  }

  if (toolRows.length > 0) {
    await tx.insert(schema.agentToolAttachments).values(toolRows);
    toolAttachments = toolRows.length;
  }

  // ── 2. agent_kb_attachments ───────────────────────────────────
  if (ir.kbAttachments.length > 0) {
    const kbRows = ir.kbAttachments.map((kb) => ({
      agentVersionId,
      documentId: kb.documentId,
    }));
    await tx.insert(schema.agentKbAttachments).values(kbRows);
    kbAttachments = kbRows.length;
  }

  // ── 3. agent_guardrails ───────────────────────────────────────
  if (ir.guardrailGraph.nodes.length > 0) {
    const guardrailRows = ir.guardrailGraph.nodes.map((node) => ({
      id: node.id,
      agentVersionId,
      name: node.name,
      direction: node.direction,
      evaluationModel: node.evaluationModel,
      prompt: node.prompt,
      onTrigger: node.onTrigger,
      enabled: node.enabled,
      ordinal: node.ordinal,
    }));
    await tx.insert(schema.agentGuardrails).values(guardrailRows);
    guardrails = guardrailRows.length;
  }

  // ── 4. agent_eval_criteria ────────────────────────────────────
  if (Object.keys(ir.scorerAttachments).length > 0) {
    const evalRows = Object.entries(ir.scorerAttachments).map(
      ([criterionId, scorer], index) => ({
        id: criterionId,
        agentVersionId,
        name: criterionId,
        description: "",
        kind: "success" as const,
        rubric: "",
        weight: scorer.weight,
        ordinal: index + 1,
      }),
    );
    await tx.insert(schema.agentEvalCriteria).values(evalRows);
    evalCriteria = evalRows.length;
  }

  // ── 5. workflow_nodes_projection ──────────────────────────────
  if (ir.workflow && ir.workflow.nodes.length > 0) {
    const nodeRows = ir.workflow.nodes.map((node) => ({
      agentVersionId,
      nodeId: node.nodeId,
      kind: node.kind,
      title: node.title,
      positionX: node.positionX ?? null,
      positionY: node.positionY ?? null,
    }));
    await tx.insert(schema.workflowNodesProjection).values(nodeRows);
    workflowNodes = nodeRows.length;
  }

  // ── 6. workflow_edges_projection ──────────────────────────────
  if (ir.workflow && ir.workflow.edges.length > 0) {
    const edgeRows = ir.workflow.edges.map((edge, index) => ({
      id: `we_${agentVersionId}_${index}`,
      agentVersionId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      conditionType: edge.conditionType ?? null,
      conditionLabel: edge.conditionLabel ?? null,
    }));
    await tx.insert(schema.workflowEdgesProjection).values(edgeRows);
    workflowEdges = edgeRows.length;
  }

  return {
    toolAttachments,
    kbAttachments,
    guardrails,
    evalCriteria,
    workflowNodes,
    workflowEdges,
  };
}
