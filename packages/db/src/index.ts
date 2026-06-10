import { Pool as NeonPool } from "@neondatabase/serverless";
import { env } from "@kuralle/env/server";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";

import * as schema from "./schema";

// Both drivers produce a PgDatabase over the same schema; `Db` is the query
// surface every consumer types against (select/insert/transaction…).
export type Db = NeonDatabase<typeof schema>;

/** Minimal pool surface shared by neon-serverless and pg pools. */
export interface DisposablePool {
  end(): Promise<void>;
}

export interface DbHandle {
  db: Db;
  pool: DisposablePool;
}

/** The Cloudflare Hyperdrive binding surface we consume. */
export interface HyperdriveBinding {
  connectionString: string;
}

// neon-serverless Pool is required for real transactions inside Cloudflare
// Workers when talking to Neon DIRECTLY (neon-http supports neither — see
// drizzle issues #1802 / #1823). Pool must be created and disposed per request
// via `ctx.waitUntil(pool.end())` because WebSocket connections cannot outlive
// a single request handler.
export function createDb(connectionString?: string): DbHandle {
  const pool = new NeonPool({
    connectionString: connectionString ?? env.DATABASE_URL,
  });
  const db = drizzleNeon(pool, { schema });
  return { db, pool };
}

// Hyperdrive speaks native Postgres over Workers TCP (the Neon WebSocket
// driver does not support Hyperdrive) — node-postgres is the documented
// driver. Hyperdrive pools/caches server-side, so a per-request pg.Pool stays
// cheap; keep the same create/`ctx.waitUntil(pool.end())` lifecycle.
export function createHyperdriveDb(hyperdrive: HyperdriveBinding): DbHandle {
  const pool = new PgPool({
    connectionString: hyperdrive.connectionString,
    // One connection per request-scoped pool — Hyperdrive owns real pooling.
    max: 1,
  });
  // node-postgres and neon-serverless drizzle instances share the PgDatabase
  // query surface over the same schema; unify on `Db` for consumers.
  const db = drizzlePg(pool, { schema }) as unknown as Db;
  return { db, pool };
}

/**
 * Preferred constructor: Hyperdrive when the binding is present (deployed
 * Workers), direct Neon otherwise (local dev, tests, Node tooling).
 */
export function createDbFromEnv(bindings?: {
  HYPERDRIVE?: HyperdriveBinding;
}): DbHandle {
  if (bindings?.HYPERDRIVE?.connectionString) {
    return createHyperdriveDb(bindings.HYPERDRIVE);
  }
  return createDb();
}
