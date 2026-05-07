import { z } from "zod";

/** Mirrors `complianceEvaluations.$inferSelect` column-for-column. */
export const complianceEvaluationSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    regulation: z.string(),
    passed: z.boolean().nullable(),
    failures: z.unknown().nullable(),
    evaluatedAt: z.date(),
  })
  .strict();
