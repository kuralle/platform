import { z } from "zod";
import { secretSchema } from "./secrets.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { cursorInput, cursorListOutput } from "../list-pagination";

const listInput = z
  .object({
    workspaceId: z.string(),
  })
  .merge(cursorInput);

const listOutput = cursorListOutput(secretSchema);

export const secretsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      return { items: [], cursor: null };
    }),
};
