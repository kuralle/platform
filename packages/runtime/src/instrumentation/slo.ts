import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { usageEvents } from "@kuralle/db/schema";
import type * as schema from "@kuralle/db/schema";

/** Database handle accepted by this helper (matches ApiDb / RepoDb). */
type AnyPgDb = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

/**
 * Record an SLO violation in `usage_events`.
 *
 * Called by oRPC procedure handlers after a measured operation exceeds the
 * latency threshold. The `usage_events` table has no `payload` jsonb column,
 * so only `kind='slo_violation'`, `quantity=observedMs`, and FK context are
 * stored. Adding a `payload jsonb` column would allow `sloName` and
 * `thresholdMs` to be stored independently — tracked as a future migration.
 */
export async function recordSloViolation(
  db: AnyPgDb,
  params: {
    workspaceId: string;
    agentId: string;
    agentVersionId: string;
    observedMs: number;
  },
): Promise<void> {
  await db.insert(usageEvents).values({
    id: `ue_${crypto.randomUUID().slice(0, 12)}`,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    agentVersionId: params.agentVersionId,
    kind: "slo_violation",
    quantity: params.observedMs,
    occurredAt: new Date(),
  });
}
