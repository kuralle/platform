import { neon } from "@neondatabase/serverless";
import * as schema from "@kuralle/db/schema/auth";
import { drizzle } from "drizzle-orm/neon-http";
import { createKuralleBetterAuth } from "./create-kuralle-auth";

function requireEnv(key: keyof NodeJS.ProcessEnv): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`${String(key)} is required for Better Auth CLI / codegen`);
  }
  return value;
}

function optionalEnv(key: keyof NodeJS.ProcessEnv, fallback: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value;
}

const sql = neon(requireEnv("DATABASE_URL"));
const db = drizzle(sql, { schema });

export const auth = createKuralleBetterAuth(db, {
  corsOrigin: optionalEnv("CORS_ORIGIN", "http://localhost:5173"),
  betterAuthSecret: requireEnv("BETTER_AUTH_SECRET"),
  betterAuthUrl: requireEnv("BETTER_AUTH_URL"),
});
