import { z } from "zod";

/** Mirrors `voices.$inferSelect` column-for-column. */
export const voiceSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string().nullable(),
    externalId: z.string().nullable(),
    provider: z.string(),
    name: z.string(),
    language: z.string(),
    style: z.string().nullable(),
    isCloned: z.boolean(),
    previewUrl: z.string().nullable(),
    createdAt: z.date(),
  })
  .strict();
