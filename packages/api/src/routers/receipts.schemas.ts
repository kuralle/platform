import { z } from "zod";

/**
 * Mirrors `monthlyReceipts.$inferSelect`.
 *
 * `pdfStorageKey` is exposed (R2 key for signed URL fetch in S5) but the PDF
 * body is never transported — the frontend fetches a signed URL separately.
 */
export const monthlyReceiptSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    month: z.string(),
    recoveredRevenueUsd: z.number(),
    costUsd: z.number(),
    roiMultiplier: z.number(),
    comparisonDeltaPct: z.number().nullable(),
    perAgent: z.unknown(),
    publishedAt: z.date(),
    pdfStorageKey: z.string().nullable(),
  })
  .strict();

const usageBreakdownRowSchema = z
  .object({
    kind: z.string(),
    count: z.number().int(),
    totalCostUsd: z.number(),
  })
  .strict();

const usageByAgentRowSchema = z
  .object({
    agentId: z.string(),
    count: z.number().int(),
    totalCostUsd: z.number(),
  })
  .strict();

export const monthlyUsageReportSchema = z
  .object({
    workspaceId: z.string(),
    year: z.number().int(),
    month: z.number().int().min(1).max(12),
    totalCalls: z.number().int(),
    totalCostUsd: z.number(),
    byKind: z.array(usageBreakdownRowSchema),
    byAgent: z.array(usageByAgentRowSchema),
  })
  .strict();
