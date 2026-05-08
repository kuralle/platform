import { z } from "zod";
import { withWorkspace } from "@kuralle/core";
import { monthlyUsageReportSchema } from "./receipts.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";

const getMonthlyInput = z.object({
  workspaceId: z.string(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export const receiptsRouter = {
  getMonthly: protectedProcedure
    .input(getMonthlyInput)
    .output(monthlyUsageReportSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const report = await repos.usage.getMonthlyUsageReport({
        year: input.year,
        month: input.month,
      });
      return {
        workspaceId: input.workspaceId,
        year: input.year,
        month: input.month,
        totalCalls: report.totalCallsCount,
        totalCostUsd: report.totalCostUsd,
        byKind: report.byKind,
        byAgent: report.byAgent,
      };
    }),
};
