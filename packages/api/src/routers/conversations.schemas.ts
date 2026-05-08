import { z } from "zod";

/** Mirrors `conversations.$inferSelect` column-for-column. */
export const conversationSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    agentId: z.string().nullable(),
    agentVersionId: z.string().nullable(),
    bundleHash: z.string().nullable(),
    channelKind: z.string(),
    channelEndpointId: z.string().nullable(),
    threadKey: z.string(),
    direction: z.string().nullable(),
    participantId: z.string().nullable(),
    participantName: z.string().nullable(),
    startedAt: z.date(),
    endedAt: z.date().nullable(),
    durationSec: z.number().int().nullable(),
    outcome: z.string().nullable(),
    recordingStorageKey: z.string().nullable(),
    costUsd: z.number().nullable(),
    evalsPassed: z.number().int().default(0),
    evalsTotal: z.number().int().default(0),
    topics: z.array(z.string()).default([]),
    metadata: z.unknown().nullable(),
    deploymentId: z.string().nullable(),
    turnsArchiveKey: z.string().nullable(),
    guardrailEventsArchiveKey: z.string().nullable(),
  })
  .strict();

export const conversationTurnSchema = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    ordinal: z.number().int(),
    speaker: z.string().nullable(),
    text: z.string(),
    messageId: z.string().nullable(),
    mediaPayload: z.unknown().nullable(),
    deliveryStatus: z.string().nullable(),
    statusUpdatedAt: z.date().nullable(),
    timestampSec: z.number().int(),
    evalVerdict: z.string().nullable(),
    workflowNodeId: z.string().nullable(),
    tokensInput: z.number().int().nullable(),
    tokensOutput: z.number().int().nullable(),
    latencyMs: z.number().int().nullable(),
    contextUtilization: z.number().nullable(),
    modelUsed: z.string().nullable(),
    createdAt: z.date(),
  })
  .strict();

export const conversationToolCallSchema = z
  .object({
    id: z.string(),
    turnId: z.string(),
    toolId: z.string().nullable(),
    toolName: z.string(),
    input: z.unknown().nullable(),
    output: z.unknown().nullable(),
    durationMs: z.number().int().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.date(),
  })
  .strict();

export const conversationExtractedFieldSchema = z
  .object({
    conversationId: z.string(),
    label: z.string(),
    value: z.string().nullable(),
  })
  .strict();

export const conversationEvalSchema = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    criterionId: z.string().nullable(),
    rubricSnapshot: z.string(),
    score: z.number().nullable(),
    passed: z.boolean().nullable(),
    details: z.unknown().nullable(),
    scoredAt: z.date(),
  })
  .strict();

export const conversationDetailSchema = z
  .object({
    conversation: conversationSchema,
    turns: z.array(conversationTurnSchema),
    toolCalls: z.array(conversationToolCallSchema),
    extractedFields: z.array(conversationExtractedFieldSchema),
    evals: z.array(conversationEvalSchema),
  })
  .strict();

export const conversationLiveEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("turn.added"),
      payload: conversationTurnSchema,
    })
    .strict(),
]);

export const conversationLivePollingSchema = z
  .object({
    kind: z.literal("polling"),
    sinceSequence: z.number().int(),
    nextSequence: z.number().int(),
    items: z.array(conversationTurnSchema),
  })
  .strict();
