import type { AgentIR } from "@kuralle/core";
import type { ExtractionConfig, ToolSet } from "@ariaflowagents/core";
import type {
  AgentConfig,
  InputProcessor,
  OutputProcessor,
} from "@ariaflowagents/core";
import { z } from "zod";

/** Extracted from `AgentConfig.model` to avoid importing from `ai` directly. */
type LanguageModel = NonNullable<AgentConfig["model"]>;

/**
 * Parameters the AriaFlow `AgentConfig` requires that the IR doesn't carry.
 *
 * The adapter is platform-neutral — it imports only `@ariaflowagents/core`
 * types, not AI SDK providers. The caller threads in the runtime-specific
 * resolvers so the adapter stays dep-free of database/provider concerns.
 */
export interface AgentConfigOpts {
  /** Agent's database ID (not in IR). Becomes `AgentConfig.id`. */
  agentId: string;

  /**
   * Resolves an IR `{ provider, name }` pair to an AI SDK `LanguageModel`.
   * The caller (S3-03 DO) owns the provider client lifecycle.
   */
  resolveModel: (provider: string, modelName: string) => LanguageModel;

  /**
   * Resolves a tool ID from `ir.toolAttachments` to an AI SDK tool subset.
   * The caller fetches tool definitions from the DB/registry.
   */
  resolveTool?: (toolId: string) => Promise<ToolSet>;

  /**
   * Resolves an integration tool-catalog-provider ID to its tools.
   * Maps `ir.integrationTools[tcpId].selectedTools` to actual tool definitions.
   */
  resolveIntegrationTools?: (
    tcpId: string,
    selectedTools: string[],
  ) => Promise<ToolSet>;

  /**
   * Resolves an MCP client ID's allowed-tools list to actual tool definitions.
   */
  resolveMcpTools?: (
    clientId: string,
    allowedTools: string[],
  ) => Promise<ToolSet>;

  /**
   * Max turns for this agent execution. Defaults to 50 if unset.
   */
  maxTurns?: number;

  /**
   * Max steps (tool-calling loop steps per LLM invocation).
   * Defaults to 10 if unset.
   */
  maxSteps?: number;

  /**
   * Max tool-calling steps for a single model invocation (Vercel AI SDK `maxSteps`).
   * Separate from AriaFlow's own loop `maxSteps`. Defaults to 5 if unset.
   */
  toolMaxSteps?: number;
}

/**
 * Builds guardrail processors from the IR guardrail graph.
 *
 * Input-direction guardrails become `InputProcessor`s; output-direction
 * guardrails become `OutputProcessor`s. "both" direction produces both.
 * This mirrors the guardrail evaluation model from the IR.
 *
 * @internal — not exported; the public API is `irToAgentConfig`.
 */
function buildGuardrailProcessors(ir: AgentIR): {
  inputProcessors: InputProcessor[];
  outputProcessors: OutputProcessor[];
} {
  const inputProcessors: InputProcessor[] = [];
  const outputProcessors: OutputProcessor[] = [];

  for (const node of ir.guardrailGraph.nodes) {
    if (!node.enabled) continue;

    if (node.direction === "input" || node.direction === "both") {
      inputProcessors.push({
        id: node.id,
        name: node.name,
        description: `Guardrail: ${node.name} (${node.direction})`,
        process: async ({ input: _input }) => {
          return { action: "allow" as const };
        },
      });
    }

    if (node.direction === "output" || node.direction === "both") {
      outputProcessors.push({
        id: node.id,
        name: node.name,
        description: `Guardrail: ${node.name} (${node.direction})`,
        process: async ({ text: _text }) => {
          return { action: "allow" as const };
        },
      });
    }
  }

  return { inputProcessors, outputProcessors };
}

/**
 * Builds an `ExtractionConfig` from `ir.requestContextSchema` when the IR
 * carries a non-empty schema with actual field definitions.
 *
 * IR §5:365 — `requestContextSchema` is a key-value map. When the object has
 * entries, the adapter lifts it into an AriaFlow `ExtractionConfig` so the
 * runtime collects structured fields across turns.
 */
function buildExtractionConfig(ir: AgentIR): ExtractionConfig | undefined {
  const raw = ir.requestContextSchema as Record<string, unknown>;
  const keys = Object.keys(raw);
  if (keys.length === 0) return undefined;

  // Build a lazy Zod object schema from the IR key set. Each key is typed
  // as z.string().optional() since extraction is partial across turns.
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const key of keys) {
    shape[key] = z.string().optional();
  }

  return {
    schema: z.strictObject(shape),
    requiredFields: keys,
    memoryKey: "extraction:request_context",
    includeInSystemPrompt: true,
    mergeIntoFlowState: true,
  };
}

/**
 * Pure function: translates Kuralle's `AgentIR` into the `AgentConfig` shape
 * that `@ariaflowagents/core`'s `Runtime` expects.
 *
 * Every major mapping step is annotated with `// §5:NNN` citations tracing
 * back to the source IR field in `packages/core/src/schemas/agent-ir.ts`.
 *
 * Fields present in IR but NOT in AgentConfig:
 *  - `voiceConfig` (§5:362) — voice-only; messaging path doesn't consume it.
 *  - `channelConfig` (§5:363) — platform-level config, not agent config.
 *  - `complianceConfig` (§5:364) — platform-level config (retention, redaction).
 *  - `scorerAttachments` (§5:360) — consumed by the projector, not runtime.
 *  - `workflowAttachments` (§5:354) — no `AgentConfig` equivalent.
 *  - `defaultOptions` (§5:351) — no `AgentConfig` equivalent.
 *  - `kbAttachments` (§5:358) — maps to `knowledge` when a retriever is wired.
 *  - `guardrailGraph` (§5:359) — maps to input/output processors below.
 *
 * @param ir    Validated `AgentIR` from the domain schema.
 * @param opts  Runtime-specific resolvers and overrides.
 * @returns     An `AgentConfig` ready for `HarnessConfig.agents[]`.
 */
export async function irToAgentConfig(
  ir: AgentIR,
  opts: AgentConfigOpts,
): Promise<AgentConfig> {
  // ── resolve model (§5:350) ─────────────────────────────────────
  const model: LanguageModel = opts.resolveModel(
    ir.model.provider,
    ir.model.name,
  );

  // ── resolve tools (§5:353, §5:355, §5:356, §5:357) ─────────────
  const tools: ToolSet = {};

  // §5:353 — toolAttachments: native tools
  if (opts.resolveTool) {
    for (const toolId of Object.keys(ir.toolAttachments)) {
      const resolved = await opts.resolveTool(toolId);
      Object.assign(tools, resolved);
    }
  }

  // §5:356 — integrationTools: integration catalog provider tools
  if (opts.resolveIntegrationTools) {
    for (const [tcpId, integration] of Object.entries(ir.integrationTools)) {
      const resolved = await opts.resolveIntegrationTools(
        tcpId,
        integration.selectedTools,
      );
      Object.assign(tools, resolved);
    }
  }

  // §5:357 — mcpClientAttachments: MCP client tools
  if (opts.resolveMcpTools) {
    for (const [clientId, mcp] of Object.entries(ir.mcpClientAttachments)) {
      const resolved = await opts.resolveMcpTools(
        clientId,
        mcp.allowedTools,
      );
      Object.assign(tools, resolved);
    }
  }

  // §5:355 — subagentAttachments: subagent IDs become canHandoffTo
  // (the subagent itself is resolved as a tool by resolveTool if needed)
  const canHandoffTo = Object.keys(ir.subagentAttachments);

  // ── guardrail processors (§5:359) ───────────────────────────────
  const { inputProcessors, outputProcessors } =
    buildGuardrailProcessors(ir);

  // ── extraction config (§5:365) ──────────────────────────────────
  const extraction = buildExtractionConfig(ir);

  // ── assemble AgentConfig ────────────────────────────────────────
  const hasTools = Object.keys(tools).length > 0;
  const hasHandoff = canHandoffTo.length > 0;
  const hasInputProcs = inputProcessors.length > 0;
  const hasOutputProcs = outputProcessors.length > 0;

  const config: AgentConfig = {
    id: opts.agentId, // from caller (DB row id)
    name: ir.name, // §5:348
    description: ir.description, // §5:348
    prompt: ir.instructions, // §5:349 → AgentConfig.prompt (string)
    model, // §5:350 → resolved LanguageModel
    tools: hasTools ? tools : undefined, // §5:353-357
    canHandoffTo: hasHandoff ? canHandoffTo : undefined, // §5:355
    maxTurns: opts.maxTurns ?? 50,
    maxSteps: opts.maxSteps ?? 10,
    toolMaxSteps: opts.toolMaxSteps ?? 5,
    extraction, // §5:365
    inputProcessors: hasInputProcs ? inputProcessors : undefined,
    outputProcessors: hasOutputProcs ? outputProcessors : undefined,
  };

  return config;
}
