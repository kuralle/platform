import type { HarnessHooks, RunContext, ToolCallRecord } from "@ariaflowagents/core";
import type { MessageQueue } from "@kuralle/platform/interface";
import type { MessagingEvent } from "./events.js";

// ── deps ─────────────────────────────────────────────────────────

export interface HarnessHooksDeps {
  /** MessageQueue port instance (memory, CF Queue, or BullMQ). */
  queue: MessageQueue;
  /** Conversation ID for every emitted event header. */
  conversationId: string;
  /**
   * Clock for deterministic timestamps. Defaults to `() => new Date()`.
   * Tests override for deterministic asserts.
   */
  clock?: () => Date;
}

// ── helpers ──────────────────────────────────────────────────────

interface FlowTransitionResult {
  __flow_transition: boolean;
  targetNode?: string;
  data?: Record<string, unknown>;
}

function isFlowTransitionResult(
  result: unknown,
): result is FlowTransitionResult {
  if (typeof result !== "object" || result === null) return false;
  return (
    "__flow_transition" in result &&
    (result as FlowTransitionResult).__flow_transition === true
  );
}

function extractMessageContent(
  content: string | unknown[] | Array<{ type: string; text?: string }>,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "object" && part !== null && "text" in part) {
          return (part as { text: string }).text;
        }
        if (typeof part === "object" && part !== null && "type" in part) {
          if ((part as { type: string }).type === "text" && "text" in part) {
            return (part as { text: string }).text;
          }
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * Shard key for queue publication. The adapter publishes to a single virtual
 * key `messaging-events`. The caller (S3-03 DO) provides a sharding wrapper
 * that maps `conversationId` → `hash(conversationId) % 16` per the sink
 * architecture in DATA_MODEL.md §14.
 *
 * SEAM: S3-04's projector worker consumes from all 16 shards. The adapter
 * currently publishes to one key; the DO wraps this call with shard routing.
 * Documented in commit body — do not prematurely import S3-04 code.
 */
const QUEUE_TOPIC = "messaging-events";

// ── factory ───────────────────────────────────────────────────────

/**
 * Builds an AriaFlow-compatible `HarnessHooks` object whose hook impls
 * serialize runtime events into `MessagingEvent` discriminated-union
 * payloads and publish them to the `MessageQueue` port.
 *
 * Sequence numbering is monotonic per-`conversationId`, sourced from an
 * in-process counter the factory closure owns. The S3-03 DO's single-writer
 * guarantee makes this safe — no distributed counter needed.
 *
 * Each hook carries a `// FINDINGS:` comment citing the relevant line in
 * `scripts/sink-spike/FINDINGS.md` that justifies the event mapping.
 *
 * @param deps  Queue port, conversationId, optional clock override.
 * @returns     An object whose key names match AriaFlow's `HarnessHooks` verbatim.
 */
export function buildHarnessHooks(deps: HarnessHooksDeps): HarnessHooks {
  const { queue, conversationId } = deps;
  const clock = deps.clock ?? (() => new Date());

  // Monotonic counter per conversationId. Single-writer (DO) guarantee
  // per S3-03 means no distributed coordination is needed.
  let seq = 0;

  async function emit(
    kind: MessagingEvent["kind"],
    payload: MessagingEvent["payload"],
  ): Promise<void> {
    const event: MessagingEvent = {
      kind,
      conversationId,
      sequenceNumber: ++seq,
      occurredAt: clock(),
      payload,
    } as MessagingEvent;
    await queue.publish(QUEUE_TOPIC, event);
  }

  // Cache last assistant messageId for turn.end dedup
  let lastAssistantMessageId = "";

  const hooks: HarnessHooks = {
    // FINDINGS: onAgentStart → agent.start event.
    // Lifecycle hook; 1 event per agent activation.
    onAgentStart: async (_context: RunContext, agentId: string) => {
      await emit("agent.start", { agentId });
    },

    // FINDINGS: onAgentEnd → agent.end event.
    // Lifecycle hook; 1 event per agent deactivation.
    onAgentEnd: async (_context: RunContext, agentId: string) => {
      await emit("agent.end", {
        agentId,
        success: true,
      });
    },

    // FINDINGS: onStepStart → step.start event.
    // 1 event per step within an agent; ~3 steps/turn in the spike.
    onStepStart: async (context: RunContext, step: number) => {
      await emit("step.start", {
        step,
        agentId: context.agentId,
      });
    },

    // FINDINGS: onStepEnd → step.end event.
    // Carries finishReason + tokensUsed for cost-screen edge cases
    // (flow-only steps that cost nothing).
    onStepEnd: async (
      context: RunContext,
      step: number,
      result,
    ) => {
      await emit("step.end", {
        step,
        agentId: context.agentId,
        finishReason: result.finishReason,
        tokensUsed: result.tokensUsed,
        text: result.text,
        handoffTo: result.handoffTo,
      });
    },

    // FINDINGS: onToolCall → tool.call event.
    // 1 event per tool invocation. Stream gives same data; hook is durable.
    onToolCall: async (_context: RunContext, call: ToolCallRecord) => {
      await emit("tool.call", {
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        args: call.args,
      });
    },

    // FINDINGS: onToolResult → tool.result event.
    // When result.__flow_transition === true, unpacks the extraction payload
    // ({ targetNode, data }) inline. This is the extraction feed for the
    // projector's conversation_extracted_fields writer.
    onToolResult: async (_context: RunContext, call: ToolCallRecord) => {
      const payload: MessagingEvent extends { payload: infer P } ? P : never =
        {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          success: call.success,
          durationMs: call.durationMs,
          error: call.error?.message,
        } as unknown as MessagingEvent["payload"];

      // FINDINGS: tool-result extraction payload rides on __flow_transition === true
      if (isFlowTransitionResult(call.result)) {
        (payload as Record<string, unknown>).extraction = {
          targetNode: call.result.targetNode ?? "",
          data: call.result.data ?? {},
        };
      }

      await emit("tool.result", payload);
    },

    // FINDINGS: onTokensUpdate → tokens.updated event.
    // This is the exact shape usage_events rows derive from.
    // The projector (S3-04) reads these and writes usage_events rows.
    onTokensUpdate: async (_context, turn) => {
      await emit("tokens.updated", {
        turn: turn.turn,
        nodeId: turn.nodeId,
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        totalTokens: turn.totalTokens,
        cacheReadTokens: turn.cacheReadTokens,
        model: turn.model,
        latencyMs: turn.latencyMs,
        cumulativeInputTokens: turn.cumulativeInputTokens,
        cumulativeOutputTokens: turn.cumulativeOutputTokens,
        cumulativeTotalTokens: turn.cumulativeTotalTokens,
        contextUtilization: turn.contextUtilization,
      });
    },

    // FINDINGS: onMessage → turn.end event for assistant messages.
    // "conversation_turns.text should be sourced from onMessage (hook), not
    // from accumulated text-deltas" — text-delta double-emission bug.
    // The message content is the durable surface; stream text-deltas are
    // for live UI only.
    onMessage: async (context, message) => {
      const role = (message as { role: string }).role;
      if (role !== "assistant") return;

      const content = extractMessageContent(
        (message as { content: string | unknown[] }).content,
      );
      if (!content) return;

      // Dedup: avoid duplicate turn.end for the same assistant message
      const msgId =
        (message as { id?: string }).id ??
        `${context.session.id}-${Date.now()}`;
      if (msgId === lastAssistantMessageId) return;
      lastAssistantMessageId = msgId;

      await emit("turn.end", {
        messageId: msgId,
        fullText: content,
        speaker: "assistant",
      });
    },

    // FINDINGS: onEnd captures session-level completion with any errors.
    // This fires when the full stream call finishes — per-turn text is
    // captured by onMessage above.
    onEnd: async (context: RunContext, result) => {
      if (!result.success && result.error) {
        await emit("agent.end", {
          agentId: context.agentId,
          success: false,
          error: result.error.message,
        });
      }
    },
  };

  return hooks;
}
