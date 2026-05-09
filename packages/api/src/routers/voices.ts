import { z } from "zod";
import { voiceSchema } from "./voices.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";

const listInput = z.object({
  workspaceId: z.string().nullable().optional(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(voiceSchema),
  cursor: z.string().nullable(),
}).strict();

export const voicesRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async ({ input, context }) => {
      if (input.workspaceId) {
        await assertWorkspaceMember(context, input.workspaceId);
      }
      return { items: [], cursor: null };
    }),
};
