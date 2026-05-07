import { createAuth } from "@kuralle/auth";
import type * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Context as HonoContext } from "hono";

export type ApiDb = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

export type CreateContextOptions = {
  context: HonoContext;
  db: ApiDb;
  kvStore: KvStore;
};

export async function createContext({ context, db, kvStore }: CreateContextOptions) {
  const session = await createAuth().api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    session,
    db,
    kvStore,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
