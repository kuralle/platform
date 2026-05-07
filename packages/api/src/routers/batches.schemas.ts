import { z } from "zod";

/** Mirrors `batches.$inferSelect` column-for-column. */
export const batchSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    agentId: z.string().nullable(),
    channelKind: z.string(),
    channelEndpointId: z.string().nullable(),
    vertical: z.string(),
    status: z.string(),
    scheduledFor: z.date().nullable(),
    concurrency: z.number().int(),
    totalRecipients: z.number().int(),
    completed: z.number().int(),
    booked: z.number().int(),
    failed: z.number().int(),
    costUsd: z.number(),
    recoveredRevenueUsd: z.number(),
    createdByUserId: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
  })
  .strict();
