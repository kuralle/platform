import { count, eq, sql } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";

import type { RepoDb } from "./types.js";

export type HealthPayload =
  | { db: "ok"; dlqDepth: number; ts: string }
  | { db: "down"; error: string; ts: string };

export async function healthCheck(db: RepoDb): Promise<HealthPayload> {
  const ts = new Date().toISOString();
  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    return {
      db: "down",
      error: e instanceof Error ? e.message : String(e),
      ts,
    };
  }
  try {
    const rows = await db
      .select({ c: count() })
      .from(schema.turnEventsDlq)
      .where(eq(schema.turnEventsDlq.resolved, false));
    return { db: "ok", dlqDepth: Number(rows[0]?.c ?? 0), ts };
  } catch (e) {
    return {
      db: "down",
      error: e instanceof Error ? e.message : String(e),
      ts,
    };
  }
}
