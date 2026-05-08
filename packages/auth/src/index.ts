import { env } from "@kuralle/env/server";
import { createKuralleBetterAuth } from "./create-kuralle-auth";
import type { drizzleAdapter } from "better-auth/adapters/drizzle";

type AuthDb = Parameters<typeof drizzleAdapter>[0];

export function createAuth(db: AuthDb) {
  return createKuralleBetterAuth(db, {
    corsOrigin: env.CORS_ORIGIN,
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    betterAuthUrl: env.BETTER_AUTH_URL,
  });
}
