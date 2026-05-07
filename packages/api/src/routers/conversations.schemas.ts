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
