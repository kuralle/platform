import { createMiddleware } from "hono/factory";

import { runWithRequestLog } from "../logger.js";

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const incoming = c.req.header("x-request-id");
  const id =
    incoming?.trim() && incoming.trim().length > 0
      ? incoming.trim()
      : `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  c.set("requestId", id);
  await runWithRequestLog(id, async () => {
    await next();
  });
  c.header("x-request-id", id);
});
