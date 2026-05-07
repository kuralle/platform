import { z } from "zod";
import { agents } from "@kuralle/db/schema/agents";
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

export const agentsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(
      (): { items: (typeof agents.$inferSelect)[]; cursor: string | null } => {
        return { items: [], cursor: null };
      },
    ),
};
