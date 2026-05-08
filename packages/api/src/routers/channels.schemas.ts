import { z } from "zod";

/** Mirrors `channel_connections.$inferSelect` column-for-column. */
export const channelConnectionSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    channelKind: z.string(),
    provider: z.string(),
    displayName: z.string(),
    status: z.string(),
    credentialsSecretId: z.string().nullable(),
    config: z.unknown(),
    capabilities: z.array(z.string()),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable(),
  })
  .strict();

/** Mirrors `channel_endpoints.$inferSelect` column-for-column. */
export const channelEndpointSchema = z
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

/** A phone number returned by the Meta connector wizard. */
export const availablePhoneNumberSchema = z
  .object({
    phoneNumberId: z.string(),
    displayPhoneNumber: z.string(),
    qualityRating: z.string().optional(),
  })
  .strict();
