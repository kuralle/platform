import { z } from "zod";
import { channelSchema } from "./channels.schemas";
import { protectedProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listOutput = z.object({
  items: z.array(channelSchema),
  cursor: z.string().nullable(),
});

export const channelsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async () => {
      return { items: [], cursor: null };
    }),
};
