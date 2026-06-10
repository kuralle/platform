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

function extractLastUserMessage(options: { prompt?: unknown }): string {
  const prompt = options.prompt;
  if (!Array.isArray(prompt)) return "";
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (
      msg &&
      typeof msg === "object" &&
      "role" in msg &&
      (msg as { role: string }).role === "user"
    ) {
      const content = (msg as { content?: unknown }).content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter(
            (part): part is { type: "text"; text: string } =>
              typeof part === "object" &&
              part !== null &&
              (part as { type?: string }).type === "text" &&
              typeof (part as { text?: string }).text === "string",
          )
          .map((part) => part.text)
          .join("");
      }
    }
  }
  return "";
}

export function createLaunchGateTestModel(
  getActiveVersion: () => "v1" | "v2",
): AgentConfigOpts["resolveModel"] {
  return (_provider, modelName) => {
    const finishUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

    const resolveReply = (options: { prompt?: unknown }): string => {
      if (getActiveVersion() === "v2") {
        return "REPLY_V2";
      }
      const userText = extractLastUserMessage(options);
      if (userText === "Option A" || userText.includes("Option A")) {
        return "ACK_OPTION_A";
      }
      return "REPLY_V1";
    };

    return {
      specificationVersion: "v2",
      provider: "test",
      modelId: modelName,
      supportedUrls: {},
      async doGenerate(options) {
        const text = resolveReply(options);
        return {
          content: [{ type: "text", text }],
          finishReason: "stop",
          usage: finishUsage,
          warnings: [],
        };
      },
      async doStream(options) {
        const text = resolveReply(options);
        return { stream: buildStream({ kind: "text", text }) };
      },
    } as LanguageModel;
  };
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
