import { and, eq, isNull, desc } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";

export interface Agent {
  id: string;
  workspaceId: string;
  status: string;
  activeVersionId: string | null;
  authorUserId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface AgentInsert {
  id: string;
  status?: string;
  authorUserId?: string;
  metadata?: unknown;
}

export interface AgentUpdate {
  status?: string;
  activeVersionId?: string | null;
  authorUserId?: string;
  metadata?: unknown;
}

function toDomain(row: typeof schema.agents.$inferSelect): Agent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    status: row.status,
    activeVersionId: row.activeVersionId,
    authorUserId: row.authorUserId,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function cacheKey(workspaceId: string, id: string): string {
  return `repo:agent:${workspaceId}:${id}`;
}

export class AgentRepository {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<Agent | null> {
    return this.kv.getOrCompute(cacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.agents)
        .where(
          and(
            eq(schema.agents.id, id),
            eq(schema.agents.workspaceId, this.workspaceId),
            isNull(schema.agents.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      return toDomain(rows[0]!);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Agent[]> {
    const limit = opts?.limit ?? 50;
    const conditions = [
      eq(schema.agents.workspaceId, this.workspaceId),
      isNull(schema.agents.deletedAt),
    ];

    const rows = await this.db
      .select()
      .from(schema.agents)
      .where(and(...conditions))
      .orderBy(desc(schema.agents.updatedAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async insert(input: AgentInsert): Promise<Agent> {
    const [row] = await this.db
      .insert(schema.agents)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        status: input.status ?? "draft",
        authorUserId: input.authorUserId ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();

    if (!row) throw new Error("AgentRepository.insert: no row returned");
    return toDomain(row);
  }

  async update(id: string, patch: AgentUpdate): Promise<Agent> {
    const [row] = await this.db
      .update(schema.agents)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agents.id, id),
          eq(schema.agents.workspaceId, this.workspaceId),
        ),
      )
      .returning();

    if (!row) throw new Error("AgentRepository.update: no row returned");

    await this.kv.delete(cacheKey(this.workspaceId, id));
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(schema.agents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.agents.id, id),
          eq(schema.agents.workspaceId, this.workspaceId),
        ),
      );

    await this.kv.delete(cacheKey(this.workspaceId, id));
  }
}
