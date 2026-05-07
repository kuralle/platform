import { z } from "zod";
import { secrets } from "@kuralle/db/schema/secrets";
import { protectedProcedure } from "../index";

const listInput = z.object({
  workspaceId: z.string(),
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

type SecretSafeRow = Pick<
  (typeof secrets.$inferSelect),
  | "id"
  | "workspaceId"
  | "name"
  | "scope"
  | "agentId"
  | "createdByUserId"
  | "createdAt"
  | "rotatedAt"
  | "lastUsedAt"
>;

const listOutput = z.object({
  items: z.array(z.unknown()),
  cursor: z.string().nullable(),
});

export const secretsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(
      (): { items: SecretSafeRow[]; cursor: string | null } => {
        return { items: [], cursor: null };
      },
    ),
};
