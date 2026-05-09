import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { agentsRouter } from "./agents";
import { conversationsRouter } from "./conversations";
import { channelsRouter } from "./channels";
import { kbRouter } from "./kb";
import { toolsRouter } from "./tools";
import { batchesRouter } from "./batches";
import { webhooksRouter } from "./webhooks";
import { secretsRouter } from "./secrets";
import { voicesRouter } from "./voices";
import { complianceRouter } from "./compliance";
import { receiptsRouter } from "./receipts";
import { workspaceRouter } from "./workspace";
import { widgetRouter } from "./widget";
import { onboardingRouter } from "./onboarding";
import { homeRouter } from "./home";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  agents: agentsRouter,
  conversations: conversationsRouter,
  channels: channelsRouter,
  kb: kbRouter,
  tools: toolsRouter,
  batches: batchesRouter,
  webhooks: webhooksRouter,
  secrets: secretsRouter,
  voices: voicesRouter,
  compliance: complianceRouter,
  receipts: receiptsRouter,
  workspace: workspaceRouter,
  widget: widgetRouter,
  onboarding: onboardingRouter,
  home: homeRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
