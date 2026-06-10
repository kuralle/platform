import type { AgentConfigOpts } from "@kuralle/runtime";

type LanguageModel = ReturnType<AgentConfigOpts["resolveModel"]>;

type ModelBehavior =
  | { kind: "text"; text: string }
  | {
      kind: "handoff";
      targetAgentId: string;
      reason?: string;
    };

function buildStream(behavior: ModelBehavior): ReadableStream<unknown> {
  const textId = "text-1";
  const toolCallId = "tool-1";

  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });

      if (behavior.kind === "text") {
        controller.enqueue({ type: "text-start", id: textId });
        controller.enqueue({
          type: "text-delta",
          id: textId,
          delta: behavior.text,
        });
        controller.enqueue({ type: "text-end", id: textId });
        controller.enqueue({
          type: "finish",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        });
        controller.close();
        return;
      }

      controller.enqueue({
        type: "tool-call",
        toolCallId,
        toolName: "transfer_to_agent",
        input: {
          targetAgentId: behavior.targetAgentId,
          reason: behavior.reason ?? "route to specialist",
        },
      });
      controller.enqueue({
        type: "finish",
        finishReason: "tool-calls",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      controller.close();
    },
  });
}

function createDeterministicModel(
  provider: string,
  modelId: string,
  behavior: ModelBehavior,
): LanguageModel {
  const finishUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

  return {
    specificationVersion: "v2",
    provider,
    modelId,
    supportedUrls: {},
    async doGenerate() {
      if (behavior.kind === "text") {
        return {
          content: [{ type: "text", text: behavior.text }],
          finishReason: "stop",
          usage: finishUsage,
          warnings: [],
        };
      }

      return {
        content: [
          {
            type: "tool-call",
            toolCallId: "tool-1",
            toolName: "transfer_to_agent",
            input: {
              targetAgentId: behavior.targetAgentId,
              reason: behavior.reason ?? "route to specialist",
            },
          },
        ],
        finishReason: "tool-calls",
        usage: finishUsage,
        warnings: [],
      };
    },
    async doStream() {
      return { stream: buildStream(behavior) };
    },
  } as LanguageModel;
}

export function createPongTestModel(): AgentConfigOpts["resolveModel"] {
  return (_provider, modelName) =>
    createDeterministicModel("test", modelName, {
      kind: "text",
      text: "PONG",
    });
}

export function createHandoffTestModel(
  handoffTargetId: string,
  subagentModelName = "pong-subagent",
): AgentConfigOpts["resolveModel"] {
  return (_provider, modelName) => {
    if (modelName === subagentModelName) {
      return createDeterministicModel("test", modelName, {
        kind: "text",
        text: "PONG",
      });
    }
    return createDeterministicModel("test", modelName, {
      kind: "handoff",
      targetAgentId: handoffTargetId,
    });
  };
}
