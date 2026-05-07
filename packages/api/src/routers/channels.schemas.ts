import { z } from "zod";

/** Mirrors `channelEndpoints.$inferSelect` column-for-column. */
export const channelSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    connectionId: z.string(),
    channelKind: z.string(),
    identifier: z.string(),
    displayName: z.string().nullable(),
    attachedAgentId: z.string().nullable(),
    attachedAgentVersionId: z.string().nullable(),
    routingRulesId: z.string().nullable(),
    publicWebhookUrl: z.string().nullable(),
    publicStreamUrl: z.string().nullable(),
    metadata: z.unknown().nullable(),
    createdAt: z.date(),
    releasedAt: z.date().nullable(),
  })
  .strict();
