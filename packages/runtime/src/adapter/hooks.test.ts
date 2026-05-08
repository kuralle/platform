import { describe, it, expect, beforeEach } from "vitest";
import { MemoryMessageQueue } from "@kuralle/platform/memory";
import { buildHarnessHooks, emitCallerTurn } from "./hooks.js";
import type { HarnessHooksDeps } from "./hooks.js";
import type { MessagingEvent } from "./events.js";
import type { RunContext, ToolCallRecord } from "@ariaflowagents/core";
import type { ConsumeMessage } from "@kuralle/platform/interface";

/** Fixed clock so timestamps are deterministic. */
const FIXED_CLOCK = new Date("2026-05-08T12:00:00Z");

/** Minimal RunContext stub. Only fields accessed by hooks are populated. */
function makeContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    session: {
      id: "sess_test",
      userId: "user_test",
      createdAt: FIXED_CLOCK,
      updatedAt: FIXED_CLOCK,
      messages: [],
      workingMemory: {},
      currentAgent: "ag_main",
      agentStates: {},
      handoffHistory: [],
    },
    agentId: "ag_main",
    stepCount: 0,
    totalTokens: 0,
    handoffStack: [],
    startTime: FIXED_CLOCK.getTime(),
    consecutiveErrors: 0,
    toolCallHistory: [],
    ...overrides,
  } as unknown as RunContext;
}

/** Collects all events published to the queue into an array. */
async function collectEvents(
  queue: MemoryMessageQueue,
  topic: string,
): Promise<MessagingEvent[]> {
  const events: MessagingEvent[] = [];
  const handle = queue.consume<MessagingEvent>(
    topic,
    async (msg: ConsumeMessage<MessagingEvent>) => {
      events.push(msg.payload);
      await msg.ack();
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  await handle.stop();
  return events;
}

/** Helper: get first event, asserting it exists. */
function first<T>(arr: T[]): T {
  expect(arr).toHaveLength(1);
  return arr[0]!;
}

describe("buildHarnessHooks", () => {
  let queue: MemoryMessageQueue;
  let deps: HarnessHooksDeps;

  beforeEach(() => {
    queue = new MemoryMessageQueue();
    deps = {
      queue,
      conversationId: "cv_test_3turn",
      clock: () => FIXED_CLOCK,
    };
  });

  it("emits agent.start on onAgentStart", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onAgentStart?.(makeContext(), "ag_main");

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("agent.start");
    expect(ev.payload).toEqual({ agentId: "ag_main" });
    expect(ev.sequenceNumber).toBe(1);
    expect(ev.conversationId).toBe("cv_test_3turn");
  });

  it("emits agent.end on onAgentEnd", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onAgentEnd?.(makeContext(), "ag_main");

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("agent.end");
    expect(ev.payload).toEqual({ agentId: "ag_main", success: true });
  });

  it("emits step.start on onStepStart", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onStepStart?.(makeContext(), 2);

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("step.start");
    expect(ev.payload).toEqual({ step: 2, agentId: "ag_main" });
  });

  it("emits step.end on onStepEnd", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onStepEnd?.(makeContext(), 1, {
      text: "Hello",
      toolCalls: [],
      finishReason: "stop",
      tokensUsed: 156,
    });

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("step.end");
    expect(ev.payload).toEqual({
      step: 1,
      agentId: "ag_main",
      finishReason: "stop",
      tokensUsed: 156,
      text: "Hello",
      handoffTo: undefined,
    });
  });

  it("emits tool.call on onToolCall", async () => {
    const hooks = buildHarnessHooks(deps);
    const call: ToolCallRecord = {
      toolCallId: "call_abc",
      toolName: "lookup_customer",
      args: { phone: "+123" },
      success: true,
      timestamp: FIXED_CLOCK.getTime(),
    };
    await hooks.onToolCall?.(makeContext(), call);

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("tool.call");
    expect(ev.payload).toEqual({
      turnId: expect.any(String),
      toolCallId: "call_abc",
      toolName: "lookup_customer",
      args: { phone: "+123" },
    });
  });

  it("emits tool.result (no extraction) on onToolResult", async () => {
    const hooks = buildHarnessHooks(deps);
    const call: ToolCallRecord = {
      toolCallId: "call_abc",
      toolName: "lookup_customer",
      args: { phone: "+123" },
      result: { found: true },
      success: true,
      timestamp: FIXED_CLOCK.getTime(),
      durationMs: 45,
    };
    await hooks.onToolResult?.(makeContext(), call);

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("tool.result");
    const p = ev.payload as Record<string, unknown>;
    expect(p.toolCallId).toBe("call_abc");
    expect(p.turnId).toEqual(expect.any(String));
    expect(p.toolName).toBe("lookup_customer");
    expect(p.success).toBe(true);
    expect(p.durationMs).toBe(45);
    expect(p.extraction).toBeUndefined();
  });

  it("emits tool.result with extraction when __flow_transition is true", async () => {
    const hooks = buildHarnessHooks(deps);
    const call: ToolCallRecord = {
      toolCallId: "call_xyz",
      toolName: "continue_to_booking",
      args: { customerName: "Sarah" },
      result: {
        __flow_transition: true,
        targetNode: "book",
        data: { customerName: "Sarah", appointmentDate: "Next Tuesday" },
      },
      success: true,
      timestamp: FIXED_CLOCK.getTime(),
      durationMs: 32,
    };
    await hooks.onToolResult?.(makeContext(), call);

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("tool.result");
    const p = ev.payload as Record<string, unknown>;
    expect(p.extraction).toEqual({
      targetNode: "book",
      data: { customerName: "Sarah", appointmentDate: "Next Tuesday" },
    });
  });

  it("emits tokens.updated on onTokensUpdate", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onTokensUpdate?.(makeContext(), {
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
    });

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("tokens.updated");
    expect(ev.payload).toEqual({
      turnId: expect.any(String),
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
    });
  });

  it("emits turn.end for assistant messages via onMessage", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onMessage?.(makeContext(), {
      role: "assistant",
      content: "Hello, how can I help you?",
      id: "msg_001",
    } as unknown as Parameters<NonNullable<typeof hooks.onMessage>>[1]);

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("turn.end");
    expect(ev.payload).toEqual({
      turnId: expect.any(String),
      messageId: "msg_001",
      fullText: "Hello, how can I help you?",
      speaker: "assistant",
    });
  });

  it("does NOT emit turn.end for user messages via onMessage", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onMessage?.(makeContext(), {
      role: "user",
      content: "Hi there",
    } as unknown as Parameters<NonNullable<typeof hooks.onMessage>>[1]);

    const events = await collectEvents(queue, "messaging-events");
    expect(events).toHaveLength(0);
  });

  it("does NOT emit turn.end for assistant message without stable id", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onMessage?.(makeContext(), {
      role: "assistant",
      content: "No id",
    } as unknown as Parameters<NonNullable<typeof hooks.onMessage>>[1]);
    const events = await collectEvents(queue, "messaging-events");
    expect(events).toHaveLength(0);
  });

  it("emits caller turn through emitCallerTurn helper", async () => {
    await emitCallerTurn({
      queue,
      conversationId: "cv_test_3turn",
      sequenceNumber: 17,
      turnId: "turn_caller",
      messageId: "user_msg_1",
      fullText: "Hello from caller",
      occurredAt: FIXED_CLOCK,
    });
    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("turn.end");
    expect(ev.sequenceNumber).toBe(17);
    expect(ev.payload).toEqual({
      turnId: "turn_caller",
      messageId: "user_msg_1",
      fullText: "Hello from caller",
      speaker: "caller",
    });
  });

  it("emits agent.end with success=false+error on onEnd failure", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onEnd?.(makeContext(), {
      success: false,
      error: new Error("Model timeout"),
    });

    const events = await collectEvents(queue, "messaging-events");
    const ev = first(events);
    expect(ev.kind).toBe("agent.end");
    expect(ev.payload).toEqual({
      agentId: "ag_main",
      success: false,
      error: "Model timeout",
    });
  });

  it("does NOT emit on onEnd when success is true", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onEnd?.(makeContext(), { success: true });

    const events = await collectEvents(queue, "messaging-events");
    expect(events).toHaveLength(0);
  });

  it("sequenceNumber is strictly increasing across hook calls", async () => {
    const hooks = buildHarnessHooks(deps);
    await hooks.onAgentStart?.(makeContext(), "ag_main");
    await hooks.onStepStart?.(makeContext(), 0);
    await hooks.onStepEnd?.(makeContext(), 0, {
      text: "ok",
      toolCalls: [],
      finishReason: "stop",
      tokensUsed: 100,
    });
    await hooks.onAgentEnd?.(makeContext(), "ag_main");
    await hooks.onTokensUpdate?.(makeContext(), {
      turn: 1,
      inputTokens: 100,
      outputTokens: 10,
      totalTokens: 110,
      latencyMs: 500,
      cumulativeInputTokens: 100,
      cumulativeOutputTokens: 10,
      cumulativeTotalTokens: 110,
    });

    const events = await collectEvents(queue, "messaging-events");
    expect(events).toHaveLength(5);
    const seqs = events.map((e) => e.sequenceNumber);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });

  it("emits 22 events for the 3-turn fixture matching FINDINGS counts", async () => {
    const hooks = buildHarnessHooks(deps);
    const ctx = makeContext();

    // Turn 1: greeting — text-only, no tools
    await hooks.onAgentStart?.(ctx, "ag_main");
    await hooks.onStepStart?.(ctx, 0);
    await hooks.onStepEnd?.(ctx, 0, {
      text: "Sure! How can I help you today?",
      toolCalls: [],
      finishReason: "stop",
      tokensUsed: 588,
    });
    await hooks.onTokensUpdate?.(ctx, {
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
      contextUtilization: 0.0044,
    });
    await hooks.onAgentEnd?.(ctx, "ag_main");
    await hooks.onMessage?.(ctx, {
      role: "assistant",
      content: "Sure! How can I help you today?",
      id: "msg_t1",
    } as unknown as Parameters<NonNullable<typeof hooks.onMessage>>[1]);

    // Turn 2: name collection — 1 tool call (lookup_customer)
    await hooks.onAgentStart?.(ctx, "ag_main");
    await hooks.onStepStart?.(ctx, 1);
    const toolCall1: ToolCallRecord = {
      toolCallId: "call_001",
      toolName: "lookup_customer",
      args: { name: "Sarah" },
      success: true,
      timestamp: FIXED_CLOCK.getTime(),
    };
    await hooks.onToolCall?.(ctx, toolCall1);
    await hooks.onToolResult?.(ctx, {
      ...toolCall1,
      result: { found: true, customerId: "cust_42" },
      durationMs: 45,
    });
    await hooks.onStepEnd?.(ctx, 1, {
      text: "",
      toolCalls: [toolCall1],
      finishReason: "tool-calls",
      tokensUsed: 320,
    });
    await hooks.onTokensUpdate?.(ctx, {
      turn: 2,
      nodeId: "book",
      inputTokens: 890,
      outputTokens: 18,
      totalTokens: 908,
      latencyMs: 980,
      cumulativeInputTokens: 1455,
      cumulativeOutputTokens: 41,
      cumulativeTotalTokens: 1496,
      contextUtilization: 0.0117,
    });
    await hooks.onAgentEnd?.(ctx, "ag_main");
    await hooks.onMessage?.(ctx, {
      role: "assistant",
      content: "Thanks, Sarah! What date works for your appointment?",
      id: "msg_t2",
    } as unknown as Parameters<NonNullable<typeof hooks.onMessage>>[1]);

    // Turn 3: booking — tool call with __flow_transition extraction
    await hooks.onAgentStart?.(ctx, "ag_main");
    await hooks.onStepStart?.(ctx, 2);
    const toolCall2: ToolCallRecord = {
      toolCallId: "call_002",
      toolName: "continue_to_booking",
      args: { customerName: "Sarah", appointmentDate: "Next Tuesday" },
      success: true,
      timestamp: FIXED_CLOCK.getTime(),
    };
    await hooks.onToolCall?.(ctx, toolCall2);
    await hooks.onToolResult?.(ctx, {
      ...toolCall2,
      result: {
        __flow_transition: true,
        targetNode: "book",
        data: {
          customerName: "Sarah",
          appointmentDate: "Next Tuesday at 10am",
        },
      },
      durationMs: 32,
    });
    await hooks.onStepEnd?.(ctx, 2, {
      text: "",
      toolCalls: [toolCall2],
      finishReason: "tool-calls",
      tokensUsed: 0,
    });
    await hooks.onTokensUpdate?.(ctx, {
      turn: 3,
      nodeId: "book",
      inputTokens: 1020,
      outputTokens: 35,
      totalTokens: 1055,
      latencyMs: 1340,
      cumulativeInputTokens: 2475,
      cumulativeOutputTokens: 76,
      cumulativeTotalTokens: 2551,
      contextUtilization: 0.0199,
    });
    await hooks.onAgentEnd?.(ctx, "ag_main");
    await hooks.onMessage?.(ctx, {
      role: "assistant",
      content:
        "You're all booked for Next Tuesday at 10am, Sarah! We'll see you then.",
      id: "msg_t3",
    } as unknown as Parameters<NonNullable<typeof hooks.onMessage>>[1]);

    const events = await collectEvents(queue, "messaging-events");
    expect(events).toHaveLength(22);

    // Turn 1 (6): agent.start, step.start, step.end, tokens.updated, agent.end, turn.end
    // Turn 2 (8): + tool.call, tool.result
    // Turn 3 (8): + tool.call, tool.result
    const kinds = events.map((e) => e.kind);
    expect(kinds.filter((k) => k === "agent.start")).toHaveLength(3);
    expect(kinds.filter((k) => k === "agent.end")).toHaveLength(3);
    expect(kinds.filter((k) => k === "step.start")).toHaveLength(3);
    expect(kinds.filter((k) => k === "step.end")).toHaveLength(3);
    expect(kinds.filter((k) => k === "tool.call")).toHaveLength(2);
    expect(kinds.filter((k) => k === "tool.result")).toHaveLength(2);
    expect(kinds.filter((k) => k === "tokens.updated")).toHaveLength(3);
    expect(kinds.filter((k) => k === "turn.end")).toHaveLength(3);

    // Sequence numbers strictly increasing 1..22
    const seqs = events.map((e) => e.sequenceNumber);
    for (let i = 0; i < seqs.length; i++) {
      expect(seqs[i]).toBe(i + 1);
    }

    // Turn 3 tool.result carries extraction payload
    const turn3Result = events.find(
      (e) =>
        e.kind === "tool.result" &&
        (e.payload as Record<string, unknown>).toolCallId === "call_002",
    );
    expect(turn3Result).toBeDefined();
    const p = turn3Result!.payload as Record<string, unknown>;
    expect(p.extraction).toEqual({
      targetNode: "book",
      data: {
        customerName: "Sarah",
        appointmentDate: "Next Tuesday at 10am",
      },
    });
  });
});
