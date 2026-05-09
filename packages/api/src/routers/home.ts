import { withWorkspace } from "@kuralle/core";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { dashboardInputSchema, dashboardOutputSchema } from "./home.schemas";

export const homeRouter = {
  dashboard: protectedProcedure
    .input(dashboardInputSchema)
    .output(dashboardOutputSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      return repos.usage.getDashboardStats();
    }),
};
