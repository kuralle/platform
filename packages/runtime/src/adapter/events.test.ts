import { describe, it, expect } from "vitest";
import { messagingEventSchema } from "./events.js";
import type { MessagingEvent } from "./events.js";

const header = {
  conversationId: "cv_test123",
  sequenceNumber: 1,
  occurredAt: new Date("2026-05-08T12:00:00Z"),
};

describe("messagingEventSchema", () => {
  it("parses agent.start", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "agent.start",
      payload: { agentId: "ag_main" },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses agent.end (success)", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "agent.end",
      payload: { agentId: "ag_main", success: true },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses agent.end (failure with error)", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "agent.end",
      payload: { agentId: "ag_main", success: false, error: "timeout" },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses step.start", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "step.start",
      payload: { step: 0, agentId: "ag_main" },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses step.end", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "step.end",
      payload: {
        step: 0,
        agentId: "ag_main",
        finishReason: "stop",
        tokensUsed: 123,
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses tool.call", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "tool.call",
      payload: {
        turnId: "turn_1",
        toolCallId: "call_abc",
        toolName: "lookup_customer",
        args: { phone: "+1234567890" },
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses tool.result (success, no extraction)", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "tool.result",
      payload: {
        turnId: "turn_1",
        toolCallId: "call_abc",
        toolName: "lookup_customer",
        success: true,
        durationMs: 45,
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
    if (result.success) {
      const p = result.data.payload as Record<string, unknown>;
      expect(p.extraction).toBeUndefined();
    }
  });

  it("parses tool.result with extraction payload (__flow_transition)", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "tool.result",
      payload: {
        turnId: "turn_1",
        toolCallId: "call_xyz",
        toolName: "continue_to_booking",
        success: true,
        durationMs: 32,
        extraction: {
          targetNode: "book",
          data: { customerName: "Sarah", appointmentDate: "Next Tuesday" },
        },
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
    if (result.success) {
      const p = result.data.payload as Record<string, unknown>;
      const ext = p.extraction as Record<string, unknown>;
      expect(ext.targetNode).toBe("book");
      expect(ext.data).toEqual({
        customerName: "Sarah",
        appointmentDate: "Next Tuesday",
      });
    }
  });

  it("parses tokens.updated with full FINDINGS shape", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "tokens.updated",
      payload: {
        turnId: "turn_1",
        turn: 1,
        nodeId: "greet",
        inputTokens: 565,
        outputTokens: 23,
        totalTokens: 588,
        cacheReadTokens: 0,
        model: "gpt-4o-mini",
        latencyMs: 1220,
        cumulativeInputTokens: 565,
        cumulativeOutputTokens: 23,
        cumulativeTotalTokens: 588,
        contextUtilization: 0.0044140625,
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses turn.end (assistant)", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "turn.end",
      payload: {
        turnId: "turn_1",
        messageId: "wamid_abc123",
        fullText: "Hello, how can I help you?",
        speaker: "assistant",
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  it("parses turn.end (caller)", () => {
    const ev: MessagingEvent = {
      ...header,
      kind: "turn.end",
      payload: {
        turnId: "turn_2",
        messageId: "wamid_xyz",
        fullText: "I need help with my HVAC",
        speaker: "caller",
      },
    };
    const result = messagingEventSchema.safeParse(ev);
    expect(result.success).toBe(true);
  });

  // ── rejection tests ──────────────────────────────────────────

  it("rejects unknown kind", () => {
    const result = messagingEventSchema.safeParse({
      ...header,
      kind: "bogus.event",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required header field 'conversationId'", () => {
    const result = messagingEventSchema.safeParse({
      kind: "agent.start",
      sequenceNumber: 1,
      occurredAt: new Date(),
      payload: { agentId: "ag_main" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required payload field (agentId on agent.start)", () => {
    const result = messagingEventSchema.safeParse({
      ...header,
      kind: "agent.start",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra fields on payload (.strict())", () => {
    const result = messagingEventSchema.safeParse({
      ...header,
      kind: "agent.start",
      payload: { agentId: "ag_main", bogusField: "nope" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects tokens.updated missing required field inputTokens", () => {
    const result = messagingEventSchema.safeParse({
      ...header,
      kind: "tokens.updated",
      payload: {
        turn: 1,
        // missing inputTokens
        outputTokens: 23,
        totalTokens: 588,
        latencyMs: 1220,
        cumulativeInputTokens: 565,
        cumulativeOutputTokens: 23,
        cumulativeTotalTokens: 588,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects turn.end with invalid speaker enum", () => {
    const result = messagingEventSchema.safeParse({
      ...header,
      kind: "turn.end",
      payload: {
        messageId: "wamid_abc",
        fullText: "Hello",
        speaker: "system",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects step.end with negative tokensUsed", () => {
    const result = messagingEventSchema.safeParse({
      ...header,
      kind: "step.end",
      payload: {
        step: 0,
        agentId: "ag_main",
        finishReason: "stop",
        tokensUsed: -1,
      },
    });
    expect(result.success).toBe(false);
  });
});
