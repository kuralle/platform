import { z } from "zod";
import { withWorkspace } from "@kuralle/core";
import { widgetConfigSchema } from "./widget.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember, assertWorkspaceRole } from "../workspace-access";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const updateInput = workspaceIdInput.extend({
  modality: z.enum(["voice", "chat", "both"]).optional(),
  theme: z.unknown().optional(),
  strings: z.unknown().optional(),
  vars: z.unknown().optional(),
  feedbackEnabled: z.boolean().optional(),
  termsUrl: z.string().nullable().optional(),
});

export const widgetRouter = {
  get: protectedProcedure
    .input(workspaceIdInput)
    .output(widgetConfigSchema.nullable())
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      return await repos.widget.getByWorkspace();
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(widgetConfigSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceRole(context, input.workspaceId, "admin");
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      return await repos.widget.upsertConfig({
        modality: input.modality,
        theme: input.theme,
        strings: input.strings,
        vars: input.vars,
        feedbackEnabled: input.feedbackEnabled,
        termsUrl: input.termsUrl,
      });
    }),
};
