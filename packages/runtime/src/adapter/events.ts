import { z } from "zod";

// ── per-variant payload sub-schemas (.strict() on every one) ──────────

const agentStartPayloadSchema = z
  .strictObject({
    agentId: z.string(),
  })
  .strict();

const agentEndPayloadSchema = z
  .strictObject({
    agentId: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
    /** Full text accumulated by the runtime (source for turn.end payload). */
    fullText: z.string().optional(),
  })
  .strict();

const stepStartPayloadSchema = z
  .strictObject({
    step: z.number().int().min(0),
    agentId: z.string(),
  })
  .strict();

const stepEndPayloadSchema = z
  .strictObject({
    step: z.number().int().min(0),
    agentId: z.string(),
    finishReason: z.string(),
    tokensUsed: z.number().int().min(0),
    text: z.string().optional(),
    handoffTo: z.string().optional(),
  })
  .strict();

const toolCallPayloadSchema = z
  .strictObject({
    /**
     * Logical turn id, threaded by the adapter so the projector associates
     * tool calls with the CORRECT turn even when `tool.call` arrives before
     * `turn.end`. Same id flows through tool.result + tokens.updated + turn.end.
     * Per kimi gate fix-pass for [S3-fix] (S3-04 was using `latestTurn` lookup
     * which returned the previous turn for in-flight tool calls).
     */
    turnId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  })
  .strict();

/**
 * Extraction sub-payload for tool-result events where
 * `result.__flow_transition === true` per FINDINGS.
 */
const extractionPayloadSchema = z
  .strictObject({
    targetNode: z.string(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const toolResultPayloadSchema = z
  .strictObject({
    turnId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    success: z.boolean(),
    durationMs: z.number().int().min(0).optional(),
    error: z.string().optional(),
    /**
     * When `result.__flow_transition === true`, the extraction payload
     * rides on the tool-result. Only present for transition tools.
     */
    extraction: extractionPayloadSchema.optional(),
  })
  .strict();

/**
 * Payload shape for tokens.updated events.
 * Matches `TurnUsage` from `@kuralle-agents/core/dist/types/telemetry.d.ts`
 * byte-for-byte per FINDINGS.
 */
const tokensUpdatedPayloadSchema = z
  .strictObject({
    turnId: z.string(),
    turn: z.number().int().min(0),
    nodeId: z.string().optional(),
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
    totalTokens: z.number().int().min(0),
    cacheReadTokens: z.number().int().min(0).optional(),
    model: z.string().optional(),
    latencyMs: z.number().int().min(0),
    cumulativeInputTokens: z.number().int().min(0),
    cumulativeOutputTokens: z.number().int().min(0),
    cumulativeTotalTokens: z.number().int().min(0),
    contextUtilization: z.number().min(0).max(1).optional(),
  })
  .strict();

const turnEndPayloadSchema = z
  .strictObject({
    turnId: z.string(),
    /**
     * Platform message ID for projector dedup. Sourced from the
     * hook-side message, not stream text-deltas.
     */
    messageId: z.string(),
    /** Full text of the turn, from the hook (not accumulated deltas). */
    fullText: z.string(),
    speaker: z.enum(["caller", "assistant"]),
  })
  .strict();

// ── discriminated-union event schema ──────────────────────────────────

export const messagingEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("agent.start"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: agentStartPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("agent.end"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: agentEndPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("step.start"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: stepStartPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("step.end"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: stepEndPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("tool.call"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: toolCallPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("tool.result"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: toolResultPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("tokens.updated"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: tokensUpdatedPayloadSchema,
  }),
  z.strictObject({
    kind: z.literal("turn.end"),
    conversationId: z.string(),
    sequenceNumber: z.number().int().min(1),
    occurredAt: z.date(),
    payload: turnEndPayloadSchema,
  }),
]);

/** Inferred type of a MessagingEvent from the Zod schema. */
export type MessagingEvent = z.infer<typeof messagingEventSchema>;
