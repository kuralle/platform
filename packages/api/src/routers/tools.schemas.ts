import { z } from "zod";

/** Mirrors `tools.$inferSelect` column-for-column. */
export const toolSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string().nullable(),
    name: z.string(),
    displayName: z.string().nullable(),
    description: z.string().nullable(),
    kind: z.string(),
    catalogProviderId: z.string().nullable(),
    externalToolKey: z.string().nullable(),
    inputSchema: z.unknown().nullable(),
    outputSchema: z.unknown().nullable(),
    config: z.unknown(),
    status: z.string(),
    lastValidatedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable(),
  })
  .strict();
