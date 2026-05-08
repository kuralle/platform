import { createContext } from "@kuralle/api/context";
import { appRouter } from "@kuralle/api/routers/index";
import { createAuth } from "@kuralle/auth";
import { createDb, type Db } from "@kuralle/db";
import { env } from "@kuralle/env/server";
import { MemoryKvStore } from "@kuralle/platform/memory";
import { getEnvSync } from "./env.js";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { Pool } from "@neondatabase/serverless";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createMetaWebhookApp } from "./webhooks/meta.js";
import { MessagingDO } from "./durable-objects/MessagingDO.js";

type AppEnv = { Variables: { db: Db; pool: Pool } };

const kvStore = new MemoryKvStore();

const app = new Hono<AppEnv>();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// Per-request neon-serverless Pool. WebSocket connections cannot outlive a
// single request handler, so the Pool is created here and disposed via
// `executionCtx.waitUntil(pool.end())` after the response is sent.
app.use("/*", async (c, next) => {
  const { db, pool } = createDb();
  c.set("db", db);
  c.set("pool", pool);
  await next();
  c.executionCtx.waitUntil(pool.end());
});

app.on(["POST", "GET"], "/api/auth/*", (c) =>
  createAuth(c.var.db).handler(c.req.raw),
);
app.route("/webhooks/meta", createMetaWebhookApp({ kvStore }));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({
    context: c,
    db: c.var.db,
    kvStore,
    env: getEnvSync(),
  });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

export default app;
export { MessagingDO };
