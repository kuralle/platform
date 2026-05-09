import { z } from "zod";

const recentConversationSchema = z
  .object({
    id: z.string(),
    agentId: z.string().nullable(),
    participantId: z.string().nullable(),
    startedAt: z.date(),
  })
  .strict();

export const dashboardInputSchema = z
  .object({
    workspaceId: z.string(),
  })
  .strict();

export const dashboardOutputSchema = z
  .object({
    liveCalls: z.number().int(),
    todayCalls: z.number().int(),
    weeklyTrend: z.object({
      count: z.number().int(),
      deltaPct: z.number().nullable(),
    }),
    recentConversations: z.array(recentConversationSchema),
  })
  .strict();
