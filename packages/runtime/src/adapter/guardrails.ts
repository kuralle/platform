import { generateObject } from "ai";
import type { AgentIR } from "@kuralle/core";
import type { ValidationCapability } from "@kuralle-agents/core";
import type {
  InputProcessor,
  OutputProcessor,
} from "@kuralle-agents/core/types";
import { z } from "zod";
import type { AgentConfigOpts } from "./agent-config.js";
import { inferProviderFromModelName } from "./model-provider.js";
import type { AdapterLogger } from "./logger.js";

type GuardrailNode = AgentIR["guardrailGraph"]["nodes"][number];

const guardrailEvaluationSchema = z.object({
  triggered: z.boolean(),
  rationale: z.union([z.string(), z.null()]),
  redacted: z.union([z.string(), z.null()]),
});

type GuardrailEvaluation = z.infer<typeof guardrailEvaluationSchema>;

export interface GuardrailBuildResult {
  inputProcessors: InputProcessor[];
  outputProcessors: OutputProcessor[];
  validationCapabilities: ValidationCapability[];
}

async function evaluateGuardrail(
  node: GuardrailNode,
  text: string,
  resolveModel: AgentConfigOpts["resolveModel"],
  logger: AdapterLogger,
  abortSignal?: AbortSignal,
): Promise<GuardrailEvaluation | null> {
  try {
    const provider = inferProviderFromModelName(node.evaluationModel);
    const model = resolveModel(provider, node.evaluationModel);
    const { object } = await generateObject({
      model,
      schema: guardrailEvaluationSchema,
      temperature: 0,
      abortSignal,
      system: [
        "You are a policy evaluator. Apply the policy below to the user-provided text.",
        "Respond with triggered=true only when the policy is clearly violated.",
        "When redaction is requested and triggered, provide redacted text that removes the violation.",
        "Policy:",
        node.prompt,
      ].join("\n"),
      prompt: text,
    });
    return object;
  } catch (error) {
    logger.warn("adapter: guardrail evaluator failed open", {
      guardrailId: node.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function mapInputTrigger(
  node: GuardrailNode,
  evaluation: GuardrailEvaluation,
  original: string,
  logger: AdapterLogger,
): import("@kuralle-agents/core/types").InputProcessorResult {
  if (!evaluation.triggered) {
    return { action: "allow" };
  }

  const rationale = evaluation.rationale ?? node.name;

  switch (node.onTrigger) {
    case "block":
      return {
        action: "block",
        reason: rationale,
        message: rationale,
      };
    case "redact": {
      const redacted = evaluation.redacted ?? original;
      if (!evaluation.redacted) {
        logger.warn("adapter: guardrail redact requested but model returned no redaction", {
          guardrailId: node.id,
        });
        return { action: "allow" };
      }
      return { action: "modify", input: redacted };
    }
    case "flag":
      logger.warn("adapter: guardrail flagged", {
        guardrailId: node.id,
        guardrailName: node.name,
        rationale,
        direction: node.direction,
      });
      return { action: "allow" };
    case "escalate":
      return {
        action: "block",
        reason: `escalation-requested: ${rationale}`,
        message: `escalation-requested: ${rationale}`,
      };
    default:
      return { action: "allow" };
  }
}

function mapOutputTrigger(
  node: GuardrailNode,
  evaluation: GuardrailEvaluation,
  logger: AdapterLogger,
): import("@kuralle-agents/core/types").OutputProcessorResult {
  if (!evaluation.triggered) {
    return { action: "allow" };
  }

  const rationale = evaluation.rationale ?? node.name;

  switch (node.onTrigger) {
    case "block":
      return {
        action: "block",
        reason: rationale,
        message: rationale,
      };
    case "redact": {
      if (!evaluation.redacted) {
        logger.warn("adapter: guardrail redact requested but model returned no redaction", {
          guardrailId: node.id,
        });
        return { action: "allow" };
      }
      return { action: "modify", text: evaluation.redacted };
    }
    case "flag":
      logger.warn("adapter: guardrail flagged", {
        guardrailId: node.id,
        guardrailName: node.name,
        rationale,
        direction: node.direction,
      });
      return { action: "allow" };
    default:
      return { action: "allow" };
  }
}

function createEscalateValidationCapability(
  node: GuardrailNode,
  resolveModel: AgentConfigOpts["resolveModel"],
  logger: AdapterLogger,
): ValidationCapability {
  return {
    name: node.id,
    validate: async ({ assistantOutput, abortSignal }) => {
      const evaluation = await evaluateGuardrail(
        node,
        assistantOutput,
        resolveModel,
        logger,
        abortSignal,
      );
      if (!evaluation?.triggered) {
        return { decision: "continue", confidence: 1 };
      }
      const rationale = evaluation.rationale ?? node.name;
      return {
        decision: "escalate",
        confidence: 1,
        rationale,
        escalationReason: "safety-block",
      };
    },
  };
}

export function createIrGuardrailProcessor(
  node: GuardrailNode,
  resolveModel: AgentConfigOpts["resolveModel"],
  logger: AdapterLogger,
): {
  inputProcessor?: InputProcessor;
  outputProcessor?: OutputProcessor;
  validationCapability?: ValidationCapability;
} {
  const appliesToInput =
    node.direction === "input" || node.direction === "both";
  const appliesToOutput =
    node.direction === "output" || node.direction === "both";
  const escalateOnOutput =
    node.onTrigger === "escalate" &&
    (node.direction === "output" || node.direction === "both");

  const result: {
    inputProcessor?: InputProcessor;
    outputProcessor?: OutputProcessor;
    validationCapability?: ValidationCapability;
  } = {};

  if (appliesToInput && !(node.onTrigger === "escalate" && node.direction === "output")) {
    result.inputProcessor = {
      id: node.id,
      name: node.name,
      description: `Guardrail: ${node.name} (${node.direction})`,
      process: async ({ input, context }) => {
        const evaluation = await evaluateGuardrail(
          node,
          input,
          resolveModel,
          logger,
          context.abortSignal,
        );
        if (!evaluation) {
          return { action: "allow" };
        }
        return mapInputTrigger(node, evaluation, input, logger);
      },
    };
  }

  if (appliesToOutput && !escalateOnOutput) {
    result.outputProcessor = {
      id: node.id,
      name: node.name,
      description: `Guardrail: ${node.name} (${node.direction})`,
      process: async ({ text, context }) => {
        const evaluation = await evaluateGuardrail(
          node,
          text,
          resolveModel,
          logger,
          context.abortSignal,
        );
        if (!evaluation) {
          return { action: "allow" };
        }
        return mapOutputTrigger(node, evaluation, logger);
      },
    };
  }

  if (escalateOnOutput) {
    result.validationCapability = createEscalateValidationCapability(
      node,
      resolveModel,
      logger,
    );
  }

  return result;
}

export function buildGuardrailProcessors(
  ir: AgentIR,
  opts: Pick<AgentConfigOpts, "resolveModel"> & { logger: AdapterLogger },
): GuardrailBuildResult {
  const inputProcessors: InputProcessor[] = [];
  const outputProcessors: OutputProcessor[] = [];
  const validationCapabilities: ValidationCapability[] = [];

  const nodes = [...ir.guardrailGraph.nodes]
    .filter((node) => node.enabled)
    .sort((a, b) => a.ordinal - b.ordinal);

  for (const node of nodes) {
    const artifacts = createIrGuardrailProcessor(
      node,
      opts.resolveModel,
      opts.logger,
    );
    if (artifacts.inputProcessor) {
      inputProcessors.push(artifacts.inputProcessor);
    }
    if (artifacts.outputProcessor) {
      outputProcessors.push(artifacts.outputProcessor);
    }
    if (artifacts.validationCapability) {
      validationCapabilities.push(artifacts.validationCapability);
    }
  }

  return { inputProcessors, outputProcessors, validationCapabilities };
}
