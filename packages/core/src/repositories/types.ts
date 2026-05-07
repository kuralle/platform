import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@kuralle/db/schema";

/** Accepted by all repository constructors — both drivers share identical SQL methods. */
export type RepoDb =
  | NodePgDatabase<typeof schema>
  | NeonHttpDatabase<typeof schema>;
