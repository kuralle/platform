import { z } from "zod";
import { tools } from "@kuralle/db/schema/tools";
import { protectedProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(z.unknown()),
  cursor: z.string().nullable(),
});

export const toolsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(
      (): {
        items: (typeof tools.$inferSelect)[];
        cursor: string | null;
      } => {
        return { items: [], cursor: null };
      },
    ),
};
