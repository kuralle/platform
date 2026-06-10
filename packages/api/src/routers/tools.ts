import { z } from "zod";
import { withWorkspace } from "@kuralle/core";
import { toolSchema } from "./tools.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { cursorInput, cursorListOutput } from "../list-pagination";

const listInput = z
  .object({
    workspaceId: z.string(),
  })
  .merge(cursorInput);

const listOutput = cursorListOutput(toolSchema);

export const toolsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const page = await repos.tools.findManyByWorkspace({
        cursor: input.cursor ?? null,
        limit: input.limit,
      });
      return {
        items: page.items.map((tool) => ({
          ...tool,
          status: tool.status ?? "active",
        })),
        cursor: page.cursor,
      };
    }),
};
