import { z } from "zod";
import { withWorkspace } from "@kuralle/core";
import { compliancePostureSchema } from "./compliance.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const updateInput = workspaceIdInput.extend({
  hipaa: z.string().nullable().optional(),
  ferpa: z.string().nullable().optional(),
  tcpa: z.string().nullable().optional(),
  euAiAct: z.string().nullable().optional(),
  details: z.unknown().optional(),
});

export const complianceRouter = {
  getPosture: protectedProcedure
    .input(workspaceIdInput)
    .output(compliancePostureSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const row = await repos.compliance.getPosture();
      return {
        workspaceId: input.workspaceId,
        hipaa: row?.hipaa ?? null,
        ferpa: row?.ferpa ?? null,
        tcpa: row?.tcpa ?? null,
        euAiAct: row?.euAiAct ?? null,
        evaluatedAt: row?.evaluatedAt ?? null,
        details: row?.details ?? null,
      };
    }),

  updatePosture: protectedProcedure
    .input(updateInput)
    .output(compliancePostureSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const row = await repos.compliance.upsertPosture({
        hipaa: input.hipaa,
        ferpa: input.ferpa,
        tcpa: input.tcpa,
        euAiAct: input.euAiAct,
        details: input.details,
      });
      return {
        workspaceId: row.workspaceId,
        hipaa: row.hipaa,
        ferpa: row.ferpa,
        tcpa: row.tcpa,
        euAiAct: row.euAiAct,
        evaluatedAt: row.evaluatedAt,
        details: row.details,
      };
    }),
};
