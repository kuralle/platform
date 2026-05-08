import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { createAuth } from "@kuralle/auth";
import { withWorkspace } from "@kuralle/core";
import { workspaceSettingsSchema } from "./workspace.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { headersForBetterAuthApi } from "../better-auth-headers";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const updateInput = workspaceIdInput.extend({
  name: z.string().min(1).optional(),
  vertical: z.string().nullable().optional(),
  environment: z.string().optional(),
  region: z.string().optional(),
  complianceMode: z.string().optional(),
});

export const workspaceRouter = {
  get: protectedProcedure
    .input(workspaceIdInput)
    .output(workspaceSettingsSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const settings = await repos.workspace.getSettings();
      if (!settings) {
        throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
      }
      return settings;
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(workspaceSettingsSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      // better-auth's organization plugin owns name/slug/logo/metadata; the
      // kuralle-specific additionalFields (vertical/environment/region/
      // complianceMode) are real Postgres columns updated via the repo.
      if (input.name !== undefined) {
        await createAuth(context.db).api.updateOrganization({
          headers: headersForBetterAuthApi(context),
          body: {
            organizationId: input.workspaceId,
            data: { name: input.name },
          },
        });
      }

      await repos.workspace.updateCustomFields({
        vertical: input.vertical,
        environment: input.environment,
        region: input.region,
        complianceMode: input.complianceMode,
      });

      const settings = await repos.workspace.getSettings();
      if (!settings) {
        throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
      }
      return settings;
    }),
};
