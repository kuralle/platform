import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import * as schema from "@kuralle/db/schema";
import type { AgentIR } from "@kuralle/core";

/** Schema type for table operations (insert/select from projection tables). */
type TablesRelational = ExtractTablesWithRelations<typeof schema>;

/** Driver-typed transaction handle this projector accepts. */
export type AgentProjectionTx =
  | PgTransaction<NeonHttpQueryResultHKT, typeof schema, TablesRelational>
  | PgTransaction<NodePgQueryResultHKT, typeof schema, TablesRelational>;

/**
 * Test-only injection seam for SLO violation testing (S2-05).
 *
 * Production code never touches this variable — it stays at 0 and the
 * projector runs at full speed. Tests set it to force a controlled delay
 * so the publish handler's wall-clock measurement exceeds the 1 s SLO
 * threshold, triggering a `usage_events` slo_violation row.
 *
 * Using a module-level variable instead of a `clock` parameter avoids
 * polluting the production call signature — the publish handler's
 * `project` callback (`(tx, vid) => projectAgent(tx, vid, ir)`) already
 * closes over the IR and doesn't thread extra arguments.
 */
let __injectedDelayMs = 0;

/** Set a delay (in ms) that `projectAgent` will await before returning. */
export function __setProjectorDelay(ms: number): void {
  __injectedDelayMs = ms;
}

/** Reset the injection seam (called in test teardown). */
export function __resetProjectorDelay(): void {
  __injectedDelayMs = 0;
}

function injectableDelay(): Promise<void> {
  if (__injectedDelayMs > 0) {
    return new Promise<void>((r) => setTimeout(r, __injectedDelayMs));
  }
  return Promise.resolve();
}

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
 * Note on eval_criteria fields:
 * AMENDMENT-003 expanded `scorerAttachments` (§5:360) with optional `name?`,
 * `description?`, `kind?`, `rubric?` so the projector can carry editor-authored
 * content into `agent_eval_criteria`. When the IR omits a field, the projector
 * falls back to defensible defaults (`name = criterionId`, `description = ""`,
 * `kind = "success"`, `rubric = ""`) for backward-compat with pre-amendment
 * snapshots. See `sprints/AMENDMENT-003.md`.
 */
export async function projectAgent(
  tx: AgentProjectionTx,
  agentVersionId: string,
  ir: AgentIR,
): Promise<ProjectionCounts> {
  // Test-only injection point: production runs immediately; tests set
  // __injectedDelayMs via __setProjectorDelay() for S2-05.
  await injectableDelay();

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
  // AMENDMENT-003: read per-criterion fields from IR; fall back to defaults
  // for backward-compat with pre-amendment snapshots.
  if (Object.keys(ir.scorerAttachments).length > 0) {
    const evalRows = Object.entries(ir.scorerAttachments).map(
      ([criterionId, scorer], index) => ({
        id: criterionId,
        agentVersionId,
        name: scorer.name ?? criterionId,
        description: scorer.description ?? "",
        kind: scorer.kind ?? "success",
        rubric: scorer.rubric ?? "",
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
