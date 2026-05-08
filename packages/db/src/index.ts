import { Pool } from "@neondatabase/serverless";
import { env } from "@kuralle/env/server";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: Pool;
}

// neon-serverless Pool is required for real transactions inside Cloudflare
// Workers. neon-http supports neither — see drizzle issues #1802 / #1823.
// Pool must be created and disposed per request via `ctx.waitUntil(pool.end())`
// because WebSocket connections cannot outlive a single request handler.
export function createDb(connectionString?: string): DbHandle {
  const pool = new Pool({
    connectionString: connectionString ?? env.DATABASE_URL,
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
