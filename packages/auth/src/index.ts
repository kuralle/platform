import { createDb } from "@kuralle/db";
import { env } from "@kuralle/env/server";
import { createKuralleBetterAuth } from "./create-kuralle-auth";

export function createAuth() {
  const db = createDb();

  return createKuralleBetterAuth(db, {
    corsOrigin: env.CORS_ORIGIN,
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    betterAuthUrl: env.BETTER_AUTH_URL,
  });
}
