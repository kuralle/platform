import { z } from "zod";
import { voices } from "@kuralle/db/schema/voices";
import { publicProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string().nullable().optional(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(z.unknown()),
  cursor: z.string().nullable(),
});

export const voicesRouter = {
  list: publicProcedure
    .input(listInput)
    .output(listOutput)
    .handler(
      (): {
        items: (typeof voices.$inferSelect)[];
        cursor: string | null;
      } => {
        return { items: [], cursor: null };
      },
    ),
};
