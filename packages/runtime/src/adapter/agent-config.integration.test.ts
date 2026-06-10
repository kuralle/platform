import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import type { AgentIR } from "@kuralle/core";
import { irToAgentConfig } from "./agent-config.js";
import type { AnyTool } from "@kuralle-agents/core";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

type LanguageModel = NonNullable<
  import("@kuralle-agents/core").AgentConfig["model"]
>;

const modelStub = {} as unknown as LanguageModel;
const mockedGenerateObject = vi.mocked(generateObject);

function stubTool(name: string): AnyTool {
  return {
    name,
    description: `Tool ${name}`,
    execute: async () => ({ ok: true }),
  };
}

function minimalIr(guardrailNodes: AgentIR["guardrailGraph"]["nodes"]): AgentIR {
  return {
    name: "Integration Agent",
    description: "test",
    instructions: "test",
    model: { provider: "openai", name: "gpt-4o" },
    defaultOptions: {},
    toolAttachments: { tool_ping: {} },
    workflowAttachments: {},
    subagentAttachments: {},
    integrationTools: {},
    mcpClientAttachments: {},
    kbAttachments: [],
    guardrailGraph: { nodes: guardrailNodes, edges: [] },
    scorerAttachments: {},
    voiceConfig: {
      pipelineMode: "stt-llm-tts",
      ttsModel: "cartesia",
      ttsVoiceId: "v_test",
      sttModel: "deepgram",
    },
    channelConfig: {},
    complianceConfig: {
      retentionDays: 30,
      redactionPatterns: [],
      disclosureScript: "disclosure",
    },
    requestContextSchema: {},
  };
}

beforeEach(() => {
  mockedGenerateObject.mockReset();
});

describe("irToAgentConfig integration — guardrails and tools", () => {
  it("assembles one guard per onTrigger, prompt-injection floor, validate, and tool", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: false, rationale: null, redacted: null },
    } as never);

    const ir = minimalIr([
      {
        id: "gr_block",
        name: "Block",
        direction: "input",
        evaluationModel: "gpt-4o-mini",
        prompt: "block policy",
        onTrigger: "block",
        enabled: true,
        ordinal: 1,
      },
      {
        id: "gr_redact",
        name: "Redact",
        direction: "output",
        evaluationModel: "gpt-4o-mini",
        prompt: "redact policy",
        onTrigger: "redact",
        enabled: true,
        ordinal: 2,
      },
      {
        id: "gr_flag",
        name: "Flag",
        direction: "input",
        evaluationModel: "gpt-4o-mini",
        prompt: "flag policy",
        onTrigger: "flag",
        enabled: true,
        ordinal: 3,
      },
      {
        id: "gr_escalate",
        name: "Escalate",
        direction: "output",
        evaluationModel: "gpt-4o-mini",
        prompt: "escalate policy",
        onTrigger: "escalate",
        enabled: true,
        ordinal: 4,
      },
    ]);

    const config = await irToAgentConfig(ir, {
      agentId: "ag_integration",
      resolveModel: () => modelStub,
      resolveTool: async (toolId) => ({ [toolId]: stubTool(toolId) }),
      logger: { warn: () => {} },
    });

    const inputIds = config.guardrails?.input?.map((p) => p.id) ?? [];
    expect(inputIds).toContain("prompt-injection-guard");
    expect(inputIds).toContain("gr_block");
    expect(inputIds).toContain("gr_flag");

    const outputIds = config.guardrails?.output?.map((p) => p.id) ?? [];
    expect(outputIds).toContain("gr_redact");
    expect(outputIds).not.toContain("gr_escalate");

    expect(config.validate).toHaveLength(1);
    expect(config.validate?.[0]?.name).toBe("gr_escalate");
    expect(config.tools?.tool_ping).toBeDefined();
    expect(config.tools?.tool_ping?.execute).toBeTypeOf("function");
  });

  it("PII-style redact guard rewrites output text", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        triggered: true,
        rationale: "card number",
        redacted: "Card ending in [REDACTED]",
      },
    } as never);

    const ir = minimalIr([
      {
        id: "gr_pii_redact",
        name: "PII Redact",
        direction: "output",
        evaluationModel: "gpt-4o-mini",
        prompt: "redact card numbers",
        onTrigger: "redact",
        enabled: true,
        ordinal: 1,
      },
    ]);

    const config = await irToAgentConfig(ir, {
      agentId: "ag_redact",
      resolveModel: () => modelStub,
      logger: { warn: () => {} },
    });

    const processor = config.guardrails?.output?.find((p) => p.id === "gr_pii_redact");
    const result = await processor!.process({
      text: "Your card is 4111111111111111",
      messages: [],
      context: {},
    });
    expect(result).toEqual({
      action: "modify",
      text: "Card ending in [REDACTED]",
    });
  });

  it("block guard blocks input", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "blocked content", redacted: null },
    } as never);

    const ir = minimalIr([
      {
        id: "gr_block_only",
        name: "Block Only",
        direction: "input",
        evaluationModel: "gpt-4o-mini",
        prompt: "block",
        onTrigger: "block",
        enabled: true,
        ordinal: 1,
      },
    ]);

    const config = await irToAgentConfig(ir, {
      agentId: "ag_block",
      resolveModel: () => modelStub,
      logger: { warn: () => {} },
    });

    const processor = config.guardrails?.input?.find((p) => p.id === "gr_block_only");
    const result = await processor!.process({
      input: "bad input",
      messages: [],
      context: {},
    });
    expect(result.action).toBe("block");
  });

  it("escalate guard validate() returns escalate decision when triggered", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "needs human", redacted: null },
    } as never);

    const ir = minimalIr([
      {
        id: "gr_esc",
        name: "Escalate",
        direction: "output",
        evaluationModel: "gpt-4o-mini",
        prompt: "escalate",
        onTrigger: "escalate",
        enabled: true,
        ordinal: 1,
      },
    ]);

    const config = await irToAgentConfig(ir, {
      agentId: "ag_esc",
      resolveModel: () => modelStub,
      logger: { warn: () => {} },
    });

    const decision = await config.validate![0]!.validate({
      session: {} as never,
      userMessage: "help",
      assistantOutput: "unsafe",
      toolCallsMade: [],
      knowledgeCitations: [],
      state: {},
    });
    expect(decision).toMatchObject({
      decision: "escalate",
      escalationReason: "safety-block",
    });
  });
});
