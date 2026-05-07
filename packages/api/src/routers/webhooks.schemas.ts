import { z } from "zod";

/** Mirrors `webhooks.$inferSelect` column-for-column. */
export const webhookSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    url: z.string(),
    events: z.array(z.string()),
    signingSecret: z.string(),
    active: z.boolean(),
    createdAt: z.date(),
  })
  .strict();
