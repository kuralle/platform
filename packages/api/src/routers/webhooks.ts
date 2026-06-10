import { z } from "zod";
import { webhookSchema } from "./webhooks.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { cursorInput, cursorListOutput } from "../list-pagination";

const listInput = z
  .object({
    workspaceId: z.string(),
  })
  .merge(cursorInput);

const listOutput = cursorListOutput(webhookSchema);

export const webhooksRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      return { items: [], cursor: null };
    }),
};
