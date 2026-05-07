import { z } from "zod";
import { kbDocumentSchema } from "./kb.schemas";
import { protectedProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(kbDocumentSchema),
  cursor: z.string().nullable(),
});

export const kbRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async () => {
      return { items: [], cursor: null };
    }),
};
