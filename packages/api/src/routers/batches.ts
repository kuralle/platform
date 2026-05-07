import { z } from "zod";
import { batchSchema } from "./batches.schemas";
import { protectedProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(batchSchema),
  cursor: z.string().nullable(),
}).strict();

export const batchesRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async () => {
      return { items: [], cursor: null };
    }),
};
