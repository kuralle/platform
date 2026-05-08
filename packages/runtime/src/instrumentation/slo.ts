import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { usageEvents } from "@kuralle/db/schema";
import type * as schema from "@kuralle/db/schema";

/** Database handle accepted by this helper (matches ApiDb / RepoDb). */
type AnyPgDb = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

/** SLO threshold for `agents.publish` per USER_JOURNEYS.md §2 SLO #2. */
export const SLO_PUBLISH_THRESHOLD_MS = 1000;

/** SLO name written into `usage_events.payload.slo`. */
export const SLO_PUBLISH_NAME = "agent.publish.p95" as const;
export const SLO_PROJECTOR_LAG_THRESHOLD_MS = 1000;
export const SLO_PROJECTOR_LAG_NAME = "projector.lag.p95" as const;

/**
 * Record an SLO violation in `usage_events`.
 *
 * Called by oRPC procedure handlers after a measured operation exceeds the
 * latency threshold. Per AMENDMENT-005 the `usage_events` table carries an
 * optional `payload jsonb` column for non-billing event kinds; `slo_violation`
 * rows store the full SLO context there ({ slo, observedMs, thresholdMs }),
 * with `quantity` mirroring observedMs for index-friendly aggregation.
 */
export async function recordSloViolation(
  db: AnyPgDb,
  params: {
    workspaceId: string;
    agentId: string;
    agentVersionId: string;
    observedMs: number;
    /** Defaults to `SLO_PUBLISH_NAME`. */
    slo?: string;
    /** Defaults to `SLO_PUBLISH_THRESHOLD_MS`. */
    thresholdMs?: number;
  },
): Promise<void> {
  const slo = params.slo ?? SLO_PUBLISH_NAME;
  const thresholdMs = params.thresholdMs ?? SLO_PUBLISH_THRESHOLD_MS;
  await db.insert(usageEvents).values({
    id: `ue_${crypto.randomUUID().slice(0, 12)}`,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    agentVersionId: params.agentVersionId,
    kind: "slo_violation",
    quantity: params.observedMs,
    payload: {
      slo,
      observedMs: params.observedMs,
      thresholdMs,
    },
    occurredAt: new Date(),
  });
}
