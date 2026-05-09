import { and, count, desc, eq, gte, isNotNull, isNull, lt, sum } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { RepoDb } from "./types.js";

export interface MonthlyRollupByKind {
  kind: string;
  count: number;
  totalCostUsd: number;
}

export interface MonthlyRollup {
  totalCallsCount: number;
  totalCostUsd: number;
  byKind: MonthlyRollupByKind[];
}

export interface MonthlyUsageReport extends MonthlyRollup {
  byAgent: { agentId: string; count: number; totalCostUsd: number }[];
}

export class UsageRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
  ) {}

  private monthBounds(year: number, month: number): { start: Date; end: Date } {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    return { start, end };
  }

  async getMonthlyRollup(opts: {
    workspaceId?: string;
    year: number;
    month: number;
  }): Promise<MonthlyRollup> {
    if (opts.workspaceId !== undefined && opts.workspaceId !== this.workspaceId) {
      throw new Error("UsageRepository.getMonthlyRollup: workspace scope mismatch");
    }
    const { start, end } = this.monthBounds(opts.year, opts.month);
    const base = and(
      eq(schema.usageEvents.workspaceId, this.workspaceId),
      gte(schema.usageEvents.occurredAt, start),
      lt(schema.usageEvents.occurredAt, end),
    );

    const [totals] = await this.db
      .select({
        totalCallsCount: count(),
        totalCostUsd: sum(schema.usageEvents.totalCostUsd),
      })
      .from(schema.usageEvents)
      .where(base);

    const byKindRows = await this.db
      .select({
        kind: schema.usageEvents.kind,
        count: count(),
        totalCostUsd: sum(schema.usageEvents.totalCostUsd),
      })
      .from(schema.usageEvents)
      .where(base)
      .groupBy(schema.usageEvents.kind);

    return {
      totalCallsCount: Number(totals?.totalCallsCount ?? 0),
      totalCostUsd: Number(totals?.totalCostUsd ?? 0),
      byKind: byKindRows.map((r) => ({
        kind: r.kind,
        count: Number(r.count),
        totalCostUsd: Number(r.totalCostUsd ?? 0),
      })),
    };
  }

  async getMonthlyUsageReport(opts: {
    year: number;
    month: number;
  }): Promise<MonthlyUsageReport> {
    const rollup = await this.getMonthlyRollup({
      year: opts.year,
      month: opts.month,
    });
    const { start, end } = this.monthBounds(opts.year, opts.month);
    const base = and(
      eq(schema.usageEvents.workspaceId, this.workspaceId),
      gte(schema.usageEvents.occurredAt, start),
      lt(schema.usageEvents.occurredAt, end),
      isNotNull(schema.usageEvents.agentId),
    );

    const byAgentRows = await this.db
      .select({
        agentId: schema.usageEvents.agentId,
        count: count(),
        totalCostUsd: sum(schema.usageEvents.totalCostUsd),
      })
      .from(schema.usageEvents)
      .where(base)
      .groupBy(schema.usageEvents.agentId);

    return {
      ...rollup,
      byAgent: byAgentRows.flatMap((r) =>
        r.agentId
          ? [
              {
                agentId: r.agentId,
                count: Number(r.count),
                totalCostUsd: Number(r.totalCostUsd ?? 0),
              },
            ]
          : [],
      ),
    };
  }

  async getDashboardStats(): Promise<{
    liveCalls: number;
    todayCalls: number;
    weeklyTrend: { count: number; deltaPct: number | null };
    recentConversations: Array<{
      id: string;
      agentId: string | null;
      participantId: string | null;
      startedAt: Date;
    }>;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [liveRow] = await this.db
      .select({ count: count() })
      .from(schema.conversations)
      .innerJoin(schema.voiceCalls, eq(schema.voiceCalls.conversationId, schema.conversations.id))
      .where(
        and(
          eq(schema.conversations.workspaceId, this.workspaceId),
          isNull(schema.conversations.endedAt),
        ),
      );
    const liveCalls = Number(liveRow?.count ?? 0);

    const [todayRow] = await this.db
      .select({ count: count() })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.workspaceId, this.workspaceId),
          gte(schema.conversations.startedAt, todayStart),
        ),
      );
    const todayCalls = Number(todayRow?.count ?? 0);

    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = thisWeekStart;

    const [thisWeekRow] = await this.db
      .select({ count: count() })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.workspaceId, this.workspaceId),
          gte(schema.conversations.startedAt, thisWeekStart),
        ),
      );
    const thisWeekCount = Number(thisWeekRow?.count ?? 0);

    const [lastWeekRow] = await this.db
      .select({ count: count() })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.workspaceId, this.workspaceId),
          gte(schema.conversations.startedAt, lastWeekStart),
          lt(schema.conversations.startedAt, lastWeekEnd),
        ),
      );
    const lastWeekCount = Number(lastWeekRow?.count ?? 0);
    const deltaPct = lastWeekCount === 0 ? null : ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100;

    const recentRows = await this.db
      .select({
        id: schema.conversations.id,
        agentId: schema.conversations.agentId,
        participantId: schema.conversations.participantId,
        startedAt: schema.conversations.startedAt,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.workspaceId, this.workspaceId))
      .orderBy(desc(schema.conversations.startedAt))
      .limit(6);

    return {
      liveCalls,
      todayCalls,
      weeklyTrend: { count: thisWeekCount, deltaPct },
      recentConversations: recentRows.map((r) => ({
        id: r.id,
        agentId: r.agentId,
        participantId: r.participantId,
        startedAt: r.startedAt,
      })),
    };
  }
}
