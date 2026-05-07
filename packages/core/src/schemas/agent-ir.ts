/**
 * AgentIR — the canonical snapshot shape stored in `agent_versions.snapshot` jsonb.
 *
 * Verbatin implementation of DATA_MODEL.md §5:347-365.
 * Every top-level field cites the §5 line it implements.
 * Project-clock date: 2026-05-07.
 *
 * A note on §5 / §6 overlap: §6:443-478 references `agent_versions.snapshot.workflow`
 * as the storage location for workflow node/edge data. The top-level `workflow` key
 * below is an extension from §6, not §5, and is optional (no workflow = no nodes/edges).
 */

import { z } from "zod";

// ── shared sub-schemas ──────────────────────────────────────────────

const toolAttachmentSchema = z
  .strictObject({
    description: z.string().optional(), // §5:353
    rules: z.string().optional(), // §5:353
  })
  .strict();

const workflowAttachmentSchema = z
  .strictObject({
    description: z.string().optional(), // §5:354
  })
  .strict();

const subagentAttachmentSchema = z
  .strictObject({
    description: z.string().optional(), // §5:355
  })
  .strict();

const integrationToolSchema = z
  .strictObject({
    selectedTools: z.array(z.string()), // §5:356
  })
  .strict();

const mcpClientAttachmentSchema = z
  .strictObject({
    allowedTools: z.array(z.string()), // §5:357
  })
  .strict();

const kbAttachmentSchema = z
  .strictObject({
    documentId: z.string(), // §5:358
  })
  .strict();

const guardrailNodeSchema = z
  .strictObject({
    id: z.string(),
    name: z.string(),
    direction: z.enum(["input", "output", "both"]),
    evaluationModel: z.string(),
    prompt: z.string(),
    onTrigger: z.enum(["block", "redact", "flag", "escalate"]),
    enabled: z.boolean(),
    ordinal: z.number().int(),
  })
  .strict();

const guardrailEdgeSchema = z
  .strictObject({
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    conditionType: z.enum(["llm", "expression", "none"]).optional(),
    conditionLabel: z.string().optional(),
  })
  .strict();

const guardrailGraphSchema = z
  .strictObject({
    nodes: z.array(guardrailNodeSchema),
    edges: z.array(guardrailEdgeSchema),
  })
  .strict();

const scorerAttachmentSchema = z
  .strictObject({
    weight: z.number().min(0), // §5:360
    samplingRate: z.number().min(0).max(1), // §5:360
  })
  .strict();

const modelSchema = z
  .strictObject({
    provider: z.string(), // §5:350
    name: z.string(), // §5:350
    temperature: z.number().min(0).max(2).optional(), // §5:350
  })
  .strict();

const voiceConfigSchema = z
  .strictObject({
    pipelineMode: z.string(), // §5:362
    ttsModel: z.string(), // §5:362
    ttsVoiceId: z.string(), // §5:362
    sttModel: z.string(), // §5:362
    sttLanguage: z.string().optional(), // §5:362
  })
  .strict();

const channelConfigSchema = z
  .record(z.string(), z.strictObject({}).passthrough())
  .default({});

const complianceConfigSchema = z
  .strictObject({
    retentionDays: z.number().int().min(1), // §5:364
    redactionPatterns: z.array(z.string()), // §5:364
    disclosureScript: z.string(), // §5:364
  })
  .strict();

const requestContextSchemaSchema = z
  .strictObject({})
  .passthrough()
  .default({});

// §6:443 — workflow node/edge projection shapes
const workflowNodeSchema = z
  .strictObject({
    nodeId: z.string(),
    kind: z.enum([
      "subagent",
      "extraction",
      "dispatch",
      "transfer-agent",
      "transfer-number",
      "end",
    ]),
    title: z.string(),
    positionX: z.number().int().optional(),
    positionY: z.number().int().optional(),
    extractionFields: z
      .array(
        z.strictObject({
          name: z.string(),
          type: z.string(),
          required: z.boolean().default(false),
          description: z.string().optional(),
          ordinal: z.number().int(),
        }).strict(),
      )
      .optional(),
  })
  .strict();

const workflowEdgeSchema = z
  .strictObject({
    sourceNodeId: z.string(),
    targetNodeId: z.string(),
    conditionType: z.enum(["llm", "expression", "none"]).optional(),
    conditionLabel: z.string().optional(),
  })
  .strict();

const workflowSchema = z
  .strictObject({
    nodes: z.array(workflowNodeSchema),
    edges: z.array(workflowEdgeSchema),
  })
  .strict();

// ── top-level AgentIR schema ────────────────────────────────────────

/**
 * `agent_versions.snapshot` Zod schema.
 * Implements DATA_MODEL.md §5:347-365 verbatim.
 * §6 `workflow` is included as an optional top-level key (see header note).
 */
export const agentIRSchema = z
  .strictObject({
    name: z.string(), // §5:348
    description: z.string(), // §5:348
    instructions: z.string(), // §5:349
    model: modelSchema, // §5:350
    defaultOptions: z.strictObject({}).passthrough().default({}), // §5:351
    toolAttachments: z.record(z.string(), toolAttachmentSchema).default({}), // §5:353
    workflowAttachments: z // §5:354
      .record(z.string(), workflowAttachmentSchema)
      .default({}),
    subagentAttachments: z // §5:355
      .record(z.string(), subagentAttachmentSchema)
      .default({}),
    integrationTools: z // §5:356
      .record(z.string(), integrationToolSchema)
      .default({}),
    mcpClientAttachments: z // §5:357
      .record(z.string(), mcpClientAttachmentSchema)
      .default({}),
    kbAttachments: z.array(kbAttachmentSchema).default([]), // §5:358
    guardrailGraph: guardrailGraphSchema, // §5:359
    scorerAttachments: z // §5:360
      .record(z.string(), scorerAttachmentSchema)
      .default({}),
    voiceConfig: voiceConfigSchema, // §5:362
    channelConfig: channelConfigSchema, // §5:363
    complianceConfig: complianceConfigSchema, // §5:364
    requestContextSchema: requestContextSchemaSchema, // §5:365
    // §6:443 — workflow node/edge data (separate from workflowAttachments)
    workflow: workflowSchema.optional(),
  })
  .strict();

/** Inferred TypeScript type from `agentIRSchema`. */
export type AgentIR = z.infer<typeof agentIRSchema>;
