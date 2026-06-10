import { z } from "zod";
import { createAuth } from "@kuralle/auth";
import { withWorkspace } from "@kuralle/core";
import {
  onboardingCompleteOutputSchema,
  onboardingStateSchema,
  onboardingStepSchema,
} from "./onboarding.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember, assertWorkspaceRole } from "../workspace-access";
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
      await assertWorkspaceRole(context, input.workspaceId, "admin");
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
      await assertWorkspaceRole(context, input.workspaceId, "admin");
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      // Step 1: better-auth owns organization.name → goes through its API
      // (signed cookie auth). Not inside the repo's transaction because the
      // auth API is HTTP-shaped, not SQL-shaped.
      await createAuth(context.db).api.updateOrganization({
        headers: headersForBetterAuthApi(context),
        body: {
          organizationId: input.workspaceId,
          data: { name: input.name },
        },
      });

      // Step 2: organization.vertical + onboarding_states upsert atomically
      // via the repo's internal transaction. If a phone was provided, a
      // channel_endpoints row is created in the same transaction.
      await repos.onboarding.markComplete(input.vertical, input.phone);

      return {
        workspaceId: input.workspaceId,
        organizationUpdated: true as const,
      };
    }),
};
