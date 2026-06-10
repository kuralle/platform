import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateObject } from "ai";
import type { AgentIR } from "@kuralle/core";
import {
  createIrGuardrailProcessor,
  buildGuardrailProcessors,
} from "./guardrails.js";
import { noopAdapterLogger } from "./logger.js";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

type LanguageModel = NonNullable<
  import("@kuralle-agents/core").AgentConfig["model"]
>;

const modelStub = {} as unknown as LanguageModel;
const resolveModel = () => modelStub;
const logger = noopAdapterLogger();

type GuardrailNode = AgentIR["guardrailGraph"]["nodes"][number];

function node(
  overrides: Partial<GuardrailNode> & Pick<GuardrailNode, "id" | "onTrigger" | "direction">,
): GuardrailNode {
  return {
    name: overrides.id,
    evaluationModel: "gpt-4o-mini",
    prompt: "policy",
    enabled: true,
    ordinal: 1,
    ...overrides,
  };
}

const mockedGenerateObject = vi.mocked(generateObject);

beforeEach(() => {
  mockedGenerateObject.mockReset();
});

describe("createIrGuardrailProcessor", () => {
  it("maps block onTrigger to input block", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "PII found", redacted: null },
    } as never);

    const { inputProcessor } = createIrGuardrailProcessor(
      node({ id: "gr_block", onTrigger: "block", direction: "input" }),
      resolveModel,
      logger,
    );
    expect(inputProcessor).toBeDefined();
    const result = await inputProcessor!.process({
      input: "card 4111",
      messages: [],
      context: {},
    });
    expect(result).toEqual({
      action: "block",
      reason: "PII found",
      message: "PII found",
    });
  });

  it("maps redact onTrigger to output modify when redacted text is returned", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        triggered: true,
        rationale: "pricing",
        redacted: "Contact us for pricing.",
      },
    } as never);

    const { outputProcessor } = createIrGuardrailProcessor(
      node({ id: "gr_redact", onTrigger: "redact", direction: "output" }),
      resolveModel,
      logger,
    );
    const result = await outputProcessor!.process({
      text: "It costs $500",
      messages: [],
      context: {},
    });
    expect(result).toEqual({
      action: "modify",
      text: "Contact us for pricing.",
    });
  });

  it("allows output redact when model returns no redacted text", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "pricing", redacted: null },
    } as never);

    const { outputProcessor } = createIrGuardrailProcessor(
      node({ id: "gr_redact_empty", onTrigger: "redact", direction: "output" }),
      resolveModel,
      logger,
    );
    const result = await outputProcessor!.process({
      text: "It costs $500",
      messages: [],
      context: {},
    });
    expect(result).toEqual({ action: "allow" });
  });

  it("maps flag onTrigger to allow", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "profanity", redacted: null },
    } as never);

    const { inputProcessor } = createIrGuardrailProcessor(
      node({ id: "gr_flag", onTrigger: "flag", direction: "input" }),
      resolveModel,
      logger,
    );
    const result = await inputProcessor!.process({
      input: "bad words",
      messages: [],
      context: {},
    });
    expect(result).toEqual({ action: "allow" });
  });

  it("maps escalate on input to block with escalation-requested prefix", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "human needed", redacted: null },
    } as never);

    const { inputProcessor } = createIrGuardrailProcessor(
      node({ id: "gr_esc_input", onTrigger: "escalate", direction: "input" }),
      resolveModel,
      logger,
    );
    const result = await inputProcessor!.process({
      input: "help",
      messages: [],
      context: {},
    });
    expect(result.action).toBe("block");
    expect(result.reason).toBe("escalation-requested: human needed");
  });

  it("maps escalate on output to ValidationCapability", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { triggered: true, rationale: "unsafe output", redacted: null },
    } as never);

    const { outputProcessor, validationCapability } = createIrGuardrailProcessor(
      node({ id: "gr_esc_output", onTrigger: "escalate", direction: "output" }),
      resolveModel,
      logger,
    );
    expect(outputProcessor).toBeUndefined();
    expect(validationCapability).toBeDefined();

    const decision = await validationCapability!.validate({
      session: {} as never,
      userMessage: "hi",
      assistantOutput: "unsafe",
      toolCallsMade: [],
      knowledgeCitations: [],
      state: {},
    });
    expect(decision).toMatchObject({
      decision: "escalate",
      escalationReason: "safety-block",
      rationale: "unsafe output",
    });
  });

  it("fails open when generateObject throws", async () => {
    mockedGenerateObject.mockRejectedValue(new Error("model down"));

    const { inputProcessor } = createIrGuardrailProcessor(
      node({ id: "gr_failopen", onTrigger: "block", direction: "input" }),
      resolveModel,
      logger,
    );
    const result = await inputProcessor!.process({
      input: "anything",
      messages: [],
      context: {},
    });
    expect(result).toEqual({ action: "allow" });
  });
});

describe("buildGuardrailProcessors", () => {
  it("sorts enabled nodes by ordinal and skips disabled", () => {
    const ir = {
      guardrailGraph: {
        nodes: [
          node({
            id: "second",
            onTrigger: "flag",
            direction: "input",
            ordinal: 2,
          }),
          node({
            id: "first",
            onTrigger: "flag",
            direction: "input",
            ordinal: 1,
          }),
          node({
            id: "disabled",
            onTrigger: "block",
            direction: "input",
            enabled: false,
            ordinal: 0,
          }),
        ],
        edges: [],
      },
    } as unknown as AgentIR;

    const built = buildGuardrailProcessors(ir, { resolveModel, logger });
    expect(built.inputProcessors.map((p) => p.id)).toEqual(["first", "second"]);
  });
});
