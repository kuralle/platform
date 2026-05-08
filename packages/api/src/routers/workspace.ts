import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { createAuth } from "@kuralle/auth";
import { organization } from "@kuralle/db/schema";
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
      const rows = await context.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          vertical: organization.vertical,
          environment: organization.environment,
          region: organization.region,
          complianceMode: organization.complianceMode,
        })
        .from(organization)
        .where(eq(organization.id, input.workspaceId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
      }
      return {
        workspaceId: row.id,
        name: row.name,
        slug: row.slug,
        vertical: row.vertical ?? null,
        environment: row.environment ?? null,
        region: row.region ?? null,
        complianceMode: row.complianceMode ?? null,
      };
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(workspaceSettingsSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      if (input.name !== undefined) {
        // better-auth's organization plugin persists name/slug/logo/metadata; custom
        // Drizzle columns (vertical, environment, region, complianceMode) are updated
        // below because they are real Postgres columns outside that narrow surface.
        await createAuth(context.db).api.updateOrganization({
          headers: headersForBetterAuthApi(context),
          body: {
            organizationId: input.workspaceId,
            data: { name: input.name },
          },
        });
      }

      const drizzlePatch: Partial<typeof organization.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.vertical !== undefined) drizzlePatch.vertical = input.vertical;
      if (input.environment !== undefined) {
        drizzlePatch.environment = input.environment;
      }
      if (input.region !== undefined) drizzlePatch.region = input.region;
      if (input.complianceMode !== undefined) {
        drizzlePatch.complianceMode = input.complianceMode;
      }

      if (
        input.vertical !== undefined ||
        input.environment !== undefined ||
        input.region !== undefined ||
        input.complianceMode !== undefined
      ) {
        await context.db
          .update(organization)
          .set(drizzlePatch)
          .where(eq(organization.id, input.workspaceId));
      }

      const rows = await context.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          vertical: organization.vertical,
          environment: organization.environment,
          region: organization.region,
          complianceMode: organization.complianceMode,
        })
        .from(organization)
        .where(eq(organization.id, input.workspaceId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new ORPCError("NOT_FOUND", { message: "Workspace not found" });
      }
      return {
        workspaceId: row.id,
        name: row.name,
        slug: row.slug,
        vertical: row.vertical ?? null,
        environment: row.environment ?? null,
        region: row.region ?? null,
        complianceMode: row.complianceMode ?? null,
      };
    }),
};
