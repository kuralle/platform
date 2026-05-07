import { z } from "zod";
import { voiceSchema } from "./voices.schemas";
import { publicProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string().nullable().optional(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(voiceSchema),
  cursor: z.string().nullable(),
});

export const voicesRouter = {
  list: publicProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async () => {
      return { items: [], cursor: null };
    }),
};
