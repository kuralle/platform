import { describe, it, expect } from "vitest";
import { irToAgentConfig } from "./agent-config.js";
import type { AgentConfigOpts } from "./agent-config.js";
import type { AgentIR } from "@kuralle/core";
import calderonIR from "../projector/__fixtures__/calderon-dispatcher-ir.json";

/** Extracted from AgentConfig.model to avoid importing from `ai`. */
type LanguageModel = NonNullable<
  import("@ariaflowagents/core").AgentConfig["model"]
>;
/** Extracted from AgentConfig.tools to avoid importing from `ai`. */
type ToolSet = NonNullable<
  import("@ariaflowagents/core").AgentConfig["tools"]
>;

const modelStub = {} as unknown as LanguageModel;

const defaultOpts: AgentConfigOpts = {
  agentId: "ag_test_calderon",
  resolveModel: () => modelStub,
  resolveTool: async (toolId: string) => {
    return { [toolId]: { description: `Tool: ${toolId}` } } as unknown as ToolSet;
  },
  resolveIntegrationTools: async (_tcpId, selectedTools) => {
    const result: Record<string, unknown> = {};
    for (const t of selectedTools) {
      result[t] = { description: `Integration tool: ${t}` };
    }
    return result as unknown as ToolSet;
  },
  resolveMcpTools: async (_clientId, allowedTools) => {
    const result: Record<string, unknown> = {};
    for (const t of allowedTools) {
      result[t] = { description: `MCP tool: ${t}` };
    }
    return result as unknown as ToolSet;
  },
};

describe("irToAgentConfig", () => {
  it("produces an AgentConfig from the Calderon dispatcher IR fixture", async () => {
    const ir = calderonIR as unknown as AgentIR;
    const config = await irToAgentConfig(ir, defaultOpts);

    // §5:348 — name + description
    expect(config.name).toBe(ir.name);
    expect(config.description).toBe(ir.description);

    // §5:349 — instructions → prompt
    expect(config.prompt).toBe(ir.instructions);

    // §5:350 — model resolved
    expect(config.model).toBeDefined();

    // Required keys
    expect(config.id).toBe(defaultOpts.agentId);

    // §5:353 — toolAttachments (5 native tools) resolved
    const nativeToolCount = Object.keys(ir.toolAttachments).length;
    expect(nativeToolCount).toBe(5);

    // §5:356 — integrationTools (1 tcp with 3 selectedTools)
    // §5:357 — mcpClientAttachments (1 mcp with 3 allowedTools)
    const toolKeys = Object.keys(config.tools ?? {});
    // 5 native + 3 integration + 3 mcp = 11
    expect(toolKeys.length).toBe(11);

    // §5:355 — subagentAttachments (1 subagent)
    const subagentCount = Object.keys(ir.subagentAttachments).length;
    expect(subagentCount).toBe(1);
    expect(config.canHandoffTo).toHaveLength(1);
    expect(config.canHandoffTo).toEqual(["ag_calderon_intake"]);

    // §5:359 — guardrailGraph: 4 nodes
    expect(ir.guardrailGraph.nodes).toHaveLength(4);
    // 2 input-direction (gr_pii_input, gr_profanity_both)
    // 3 output-direction (gr_pricing_output, gr_profanity_both, gr_tcpa_output)
    expect(config.inputProcessors).toBeDefined();
    expect(config.outputProcessors).toBeDefined();
    // "both" direction guardrails produce both an input and output processor
    expect(config.inputProcessors?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(config.outputProcessors?.length ?? 0).toBeGreaterThanOrEqual(1);

    // §5:365 — requestContextSchema (empty in fixture → no extraction config)
    expect(Object.keys(ir.requestContextSchema)).toHaveLength(0);
    expect(config.extraction).toBeUndefined();

    // §6 — workflow: 8 nodes, 10 edges (not mapped to AgentConfig)
    // The AgentConfig is a base config, not a FlowAgentConfig. Workflow
    // nodes/edges are consumed by the projector, not the runtime adapter.
    expect(ir.workflow?.nodes).toHaveLength(8);
    expect(ir.workflow?.edges).toHaveLength(10);

    // scorerAttachments: 6 criteria (not mapped to AgentConfig)
    // Consumed by the projector for agent_eval_criteria rows.
    expect(Object.keys(ir.scorerAttachments)).toHaveLength(6);

    // voiceConfig (not mapped — messaging path)
    expect(ir.voiceConfig.pipelineMode).toBe("stt-llm-tts");
  });

  it("produces extraction config when requestContextSchema has entries", async () => {
    const ir = {
      ...(calderonIR as unknown as AgentIR),
      requestContextSchema: {
        customerName: {} as Record<string, unknown>,
        appointmentDate: {} as Record<string, unknown>,
      } as Record<string, Record<string, unknown>>,
    };
    const config = await irToAgentConfig(ir, defaultOpts);
    expect(config.extraction).toBeDefined();
    expect(config.extraction!.requiredFields).toEqual([
      "customerName",
      "appointmentDate",
    ]);
  });

  it("defaults maxTurns/maxSteps/toolMaxSteps when opts omit them", async () => {
    const ir = calderonIR as unknown as AgentIR;
    const config = await irToAgentConfig(ir, {
      agentId: "ag_defaults",
      resolveModel: () => modelStub,
    });
    expect(config.maxTurns).toBe(50);
    expect(config.maxSteps).toBe(10);
    expect(config.toolMaxSteps).toBe(5);
  });

  it("respects explicit maxTurns/maxSteps/toolMaxSteps from opts", async () => {
    const ir = calderonIR as unknown as AgentIR;
    const config = await irToAgentConfig(ir, {
      agentId: "ag_custom",
      resolveModel: () => modelStub,
      maxTurns: 3,
      maxSteps: 5,
      toolMaxSteps: 2,
    });
    expect(config.maxTurns).toBe(3);
    expect(config.maxSteps).toBe(5);
    expect(config.toolMaxSteps).toBe(2);
  });

  it("skips disabled guardrail nodes", async () => {
    const ir = {
      ...(calderonIR as unknown as AgentIR),
      guardrailGraph: {
        nodes: [
          {
            id: "gr_enabled",
            name: "Enabled Guard",
            direction: "input" as const,
            evaluationModel: "gpt-4o-mini",
            prompt: "check",
            onTrigger: "block" as const,
            enabled: true,
            ordinal: 1,
          },
          {
            id: "gr_disabled",
            name: "Disabled Guard",
            direction: "output" as const,
            evaluationModel: "gpt-4o-mini",
            prompt: "check",
            onTrigger: "flag" as const,
            enabled: false,
            ordinal: 2,
          },
        ],
        edges: [],
      },
    };
    const config = await irToAgentConfig(ir, defaultOpts);
    // Only the enabled guardrail produces a processor
    expect(config.inputProcessors).toHaveLength(1);
    expect(config.inputProcessors?.[0]?.id).toBe("gr_enabled");
    expect(config.outputProcessors ?? []).toHaveLength(0);
  });
});
