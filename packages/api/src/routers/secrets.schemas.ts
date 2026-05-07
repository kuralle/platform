import { z } from "zod";

/**
 * Mirrors `secrets.$inferSelect`.
 *
 * `ciphertext` is deliberately omitted — secret material never leaves the
 * server (per DATA_MODEL.md §11). The `bytea` column is only accessible
 * server-side during credential hydration.
 */
export const secretSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    // ciphertext omitted — secret material never leaves the server
    kmsKeyId: z.string(),
    scope: z.string(),
    agentId: z.string().nullable(),
    lastUsedAt: z.date().nullable(),
    createdByUserId: z.string().nullable(),
    createdAt: z.date(),
    rotatedAt: z.date().nullable(),
  })
  .strict();
