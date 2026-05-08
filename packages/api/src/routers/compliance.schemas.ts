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

/** Mirrors `workspaceCompliancePosture` row (API view includes workspaceId always set). */
export const compliancePostureSchema = z
  .object({
    workspaceId: z.string(),
    hipaa: z.string().nullable(),
    ferpa: z.string().nullable(),
    tcpa: z.string().nullable(),
    euAiAct: z.string().nullable(),
    evaluatedAt: z.date().nullable(),
    details: z.unknown().nullable(),
  })
  .strict();
