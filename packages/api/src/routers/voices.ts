import { z } from "zod";
import { voiceSchema } from "./voices.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { cursorInput, cursorListOutput } from "../list-pagination";

const listInput = z
  .object({
    workspaceId: z.string().nullable().optional(),
  })
  .merge(cursorInput);

const listOutput = cursorListOutput(voiceSchema);

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
