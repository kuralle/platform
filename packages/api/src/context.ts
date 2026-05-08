import { createAuth } from "@kuralle/auth";
import type * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Context as HonoContext } from "hono";

export type ApiDb = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

export interface ServerEnv {
  META_APP_ID: string;
  META_APP_SECRET: string;
  META_SYSTEM_USER_TOKEN: string;
  META_VERIFY_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  PUBLIC_BASE_URL: string;
}

export type CreateContextOptions = {
  context: HonoContext;
  db: ApiDb;
  kvStore: KvStore;
  env: ServerEnv;
};

export async function createContext({ context, db, kvStore, env }: CreateContextOptions) {
  const session = await createAuth().api.getSession({
    headers: context.req.raw.headers,
  });
  return {
    auth: null,
    session,
    db,
    kvStore,
    env,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
