import { z } from "zod";
import { eq } from "drizzle-orm";
import { createAuth } from "@kuralle/auth";
import { withWorkspace } from "@kuralle/core";
import { organization, onboardingStates } from "@kuralle/db/schema";
import {
  onboardingCompleteOutputSchema,
  onboardingStateSchema,
  onboardingStepSchema,
} from "./onboarding.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { headersForBetterAuthApi } from "../better-auth-headers";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const advanceInput = workspaceIdInput.extend({
  step: onboardingStepSchema,
});

const completeInput = workspaceIdInput.extend({
  vertical: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().optional(),
});

export const onboardingRouter = {
  get: protectedProcedure
    .input(workspaceIdInput)
    .output(onboardingStateSchema.nullable())
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      return await repos.onboarding.getState();
    }),

  advance: protectedProcedure
    .input(advanceInput)
    .output(onboardingStateSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      return await repos.onboarding.advanceStep(input.step);
    }),

  complete: protectedProcedure
    .input(completeInput)
    .output(onboardingCompleteOutputSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      void input.phone;

      await createAuth(context.db).api.updateOrganization({
        headers: headersForBetterAuthApi(context),
        body: {
          organizationId: input.workspaceId,
          data: { name: input.name },
        },
      });

      await context.db.transaction(async (tx) => {
        await tx
          .update(organization)
          .set({
            vertical: input.vertical,
            updatedAt: new Date(),
          })
          .where(eq(organization.id, input.workspaceId));

        const [existing] = await tx
          .select()
          .from(onboardingStates)
          .where(eq(onboardingStates.workspaceId, input.workspaceId))
          .limit(1);

        const now = new Date();
        if (existing) {
          await tx
            .update(onboardingStates)
            .set({
              currentStep: "done",
              completedAt: now,
              vertical: input.vertical,
              updatedAt: now,
            })
            .where(eq(onboardingStates.workspaceId, input.workspaceId));
        } else {
          await tx.insert(onboardingStates).values({
            workspaceId: input.workspaceId,
            currentStep: "done",
            completedAt: now,
            vertical: input.vertical,
            updatedAt: now,
          });
        }
      });

      return {
        workspaceId: input.workspaceId,
        organizationUpdated: true as const,
      };
    }),
};
