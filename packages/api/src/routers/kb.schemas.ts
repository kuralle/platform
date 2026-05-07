import { z } from "zod";

/**
 * Mirrors `kbDocuments.$inferSelect`.
 *
 * `embedding` (pgvector) is deliberately omitted — vectors are not transported
 * over the wire in list output. If a per-chunk detail endpoint needs the vector
 * later, it will be a separate sprint with its own schema.
 */
export const kbDocumentSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    folder: z.string().nullable(),
    name: z.string(),
    source: z.string(),
    sourceUrl: z.string().nullable(),
    storageKey: z.string().nullable(),
    contentText: z.string().nullable(),
    sizeBytes: z.number().int(),
    status: z.string(),
    ragIndexed: z.boolean(),
    embeddingModel: z.string().nullable(),
    autoSync: z.boolean(),
    lastSyncedAt: z.date().nullable(),
    createdByUserId: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable(),
  })
  .strict();
