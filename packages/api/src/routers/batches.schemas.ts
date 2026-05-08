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
    concurrency: z.number().int().nullable(),
    totalRecipients: z.number().int(),
    completed: z.number().int().nullable(),
    booked: z.number().int().nullable(),
    failed: z.number().int().nullable(),
    costUsd: z.number().nullable(),
    recoveredRevenueUsd: z.number().nullable(),
    createdByUserId: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
  })
  .strict();
