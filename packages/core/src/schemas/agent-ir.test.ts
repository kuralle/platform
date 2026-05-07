import { describe, it, expect } from "vitest";
import { agentIRSchema } from "./agent-ir.js";

const validIR = {
  name: "Test Agent",
  description: "A test agent for schema validation",
  instructions: "Be helpful.",
  model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
  defaultOptions: {},
  toolAttachments: {},
  workflowAttachments: {},
  subagentAttachments: {},
  integrationTools: {},
  mcpClientAttachments: {},
  kbAttachments: [],
  guardrailGraph: { nodes: [], edges: [] },
  scorerAttachments: {},
  voiceConfig: {
    pipelineMode: "stt-llm-tts",
    ttsModel: "cartesia-sonic-3",
    ttsVoiceId: "v_aurora",
    sttModel: "deepgram-nova-3-monolingual",
    sttLanguage: "en",
  },
  channelConfig: {},
  complianceConfig: {
    retentionDays: 90,
    redactionPatterns: [],
    disclosureScript: "",
  },
  requestContextSchema: {},
};

describe("agentIRSchema", () => {
  it("parses a valid minimal AgentIR", () => {
    const result = agentIRSchema.safeParse(validIR);
    expect(result.success).toBe(true);
  });

  it("parses a valid AgentIR with optional workflow data (§6)", () => {
    const withWorkflow = {
      ...validIR,
      workflow: {
        nodes: [
          {
            nodeId: "n1",
            kind: "dispatch",
            title: "Dispatch",
            positionX: 100,
            positionY: 200,
          },
        ],
        edges: [
          {
            sourceNodeId: "n1",
            targetNodeId: "n2",
            conditionType: "none",
          },
        ],
      },
    };
    const result = agentIRSchema.safeParse(withWorkflow);
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields (strict)", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      bogusField: "should be rejected",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => "keys" in i && Array.isArray(i.keys) && i.keys.includes("bogusField"),
        ),
      ).toBe(true);
    }
  });

  it("rejects unknown fields in nested objects (strict)", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      model: {
        provider: "openai",
        name: "gpt-4o",
        temperature: 0.4,
        bogusNested: "should be rejected",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => "keys" in i && Array.isArray(i.keys) && i.keys.includes("bogusNested"),
        ),
      ).toBe(true);
    }
  });

  it("rejects missing required field 'name'", () => {
    const { ...noName } = validIR;
    delete (noName as Record<string, unknown>).name;
    const result = agentIRSchema.safeParse(noName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "name")).toBe(true);
    }
  });

  it("rejects missing required field 'guardrailGraph'", () => {
    const { ...noGuardrail } = validIR;
    delete (noGuardrail as Record<string, unknown>).guardrailGraph;
    const result = agentIRSchema.safeParse(noGuardrail);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "guardrailGraph"),
      ).toBe(true);
    }
  });

  it("applies defaults for optional Record fields", () => {
    const minimal = {
      name: "Minimal Agent",
      description: "desc",
      instructions: "do stuff",
      model: { provider: "openai", name: "gpt-4o" },
      voiceConfig: {
        pipelineMode: "stt-llm-tts",
        ttsModel: "cartesia-sonic-3",
        ttsVoiceId: "v_aurora",
        sttModel: "deepgram-nova-3-monolingual",
      },
      complianceConfig: {
        retentionDays: 90,
        redactionPatterns: [],
        disclosureScript: "",
      },
      guardrailGraph: { nodes: [], edges: [] },
    };
    const result = agentIRSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolAttachments).toEqual({});
      expect(result.data.kbAttachments).toEqual([]);
      expect(result.data.scorerAttachments).toEqual({});
      expect(result.data.defaultOptions).toEqual({});
    }
  });

  it("rejects scorerAttachments with invalid weight (negative)", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      scorerAttachments: {
        c1: { weight: -1, samplingRate: 0.5 },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects scorerAttachments with invalid samplingRate (> 1)", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      scorerAttachments: {
        c1: { weight: 1, samplingRate: 1.5 },
      },
    });
    expect(result.success).toBe(false);
  });

  it("parses guardrailGraph with fully populated nodes", () => {
    const withGuardrails = {
      ...validIR,
      guardrailGraph: {
        nodes: [
          {
            id: "gr1",
            name: "PII Check",
            direction: "both",
            evaluationModel: "gpt-4o-mini",
            prompt: "Check for PII in the text.",
            onTrigger: "block",
            enabled: true,
            ordinal: 1,
          },
          {
            id: "gr2",
            name: "Tone Check",
            direction: "output",
            evaluationModel: "gpt-4o-mini",
            prompt: "Check tone.",
            onTrigger: "flag",
            enabled: true,
            ordinal: 2,
          },
        ],
        edges: [
          {
            sourceNodeId: "gr1",
            targetNodeId: "gr2",
            conditionType: "none",
          },
        ],
      },
    };
    const result = agentIRSchema.safeParse(withGuardrails);
    expect(result.success).toBe(true);
  });

  it("rejects guardrailNode with unknown fields", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      guardrailGraph: {
        nodes: [
          {
            id: "gr1",
            name: "PII Check",
            direction: "both",
            evaluationModel: "gpt-4o-mini",
            prompt: "test",
            onTrigger: "block",
            enabled: true,
            ordinal: 1,
            bogusField: "nope",
          },
        ],
        edges: [],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => "keys" in i && Array.isArray(i.keys) && i.keys.includes("bogusField"),
        ),
      ).toBe(true);
    }
  });

  it("rejects guardrailNode with invalid direction enum", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      guardrailGraph: {
        nodes: [
          {
            id: "gr1",
            name: "PII Check",
            direction: "sideways",
            evaluationModel: "gpt-4o-mini",
            prompt: "test",
            onTrigger: "block",
            enabled: true,
            ordinal: 1,
          },
        ],
        edges: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid onTrigger enum", () => {
    const result = agentIRSchema.safeParse({
      ...validIR,
      guardrailGraph: {
        nodes: [
          {
            id: "gr1",
            name: "Test",
            direction: "input",
            evaluationModel: "gpt-4o-mini",
            prompt: "test",
            onTrigger: "explode",
            enabled: true,
            ordinal: 1,
          },
        ],
        edges: [],
      },
    });
    expect(result.success).toBe(false);
  });
});
