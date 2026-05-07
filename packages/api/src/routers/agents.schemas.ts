import { z } from "zod";

/**
 * Mirrors `agents.$inferSelect` column-for-column.
 */
export const agentSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    status: z.string(),
    activeVersionId: z.string().nullable(),
    authorUserId: z.string().nullable(),
    metadata: z.unknown().nullable(),
    createdAt: z.date(),
    updatedAt: z.date().nullable(),
    deletedAt: z.date().nullable(),
  })
  .strict();

/**
 * Mirrors `agentVersions.$inferSelect` column-for-column.
 */
export const agentVersionSchema = z
  .object({
    id: z.string(),
    agentId: z.string(),
    versionNumber: z.number().int(),
    versionKind: z.string(),
    parentVersionId: z.string().nullable(),
    changeSummary: z.string().nullable(),
    changedFields: z.array(z.string()).default([]),
    publishedByUserId: z.string().nullable(),
    publishedAt: z.date().nullable(),
    snapshot: z.unknown(),
    bundleStorageKey: z.string().nullable(),
    bundleHash: z.string().nullable(),
    bundleStatus: z.string().nullable(),
    bundleSizeBytes: z.number().int().nullable(),
    builderVersion: z.string().nullable(),
    builtAt: z.date().nullable(),
  })
  .strict();

/** Compound type returned by `agents.get`. */
export const agentWithVersionSchema = z
  .object({
    agent: agentSchema,
    activeVersion: agentVersionSchema.nullable(),
  })
  .strict();

/** Alias — `agents.history` returns the same shape as a single version. */
export const agentHistoryItemSchema = agentVersionSchema;
