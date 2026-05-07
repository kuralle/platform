import { and, eq, isNull, desc, sql } from "drizzle-orm";
import type { NeonHttpQueryResultHKT } from "drizzle-orm/neon-http";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import type { RepoDb } from "./types.js";
import { WorkspaceScopeViolation } from "../errors.js";

type SchemaTables = ExtractTablesWithRelations<typeof schema>;
type AgentTx =
  | PgTransaction<NeonHttpQueryResultHKT, typeof schema, SchemaTables>
  | PgTransaction<NodePgQueryResultHKT, typeof schema, SchemaTables>;

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
    private readonly db: RepoDb,
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
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation("agent", row.id, this.workspaceId, row.workspaceId);
      }
      return toDomain(row);
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
    await this.kv.delete(cacheKey(this.workspaceId, row.id));
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

  /**
   * Transactional publish: insert version row, run projector, swap activeVersionId.
   * The projector callback receives the transaction handle so projection rows
   * are written atomically with the version insert + pointer swap.
   *
   * Caller is responsible for providing the new `versionId`.
   */
  async publishVersion(opts: {
    versionId: string;
    agentId: string;
    versionNumber: number;
    publishedByUserId: string | null;
    snapshot: unknown;
    project: (tx: AgentTx, versionId: string) => Promise<unknown>;
  }): Promise<{ versionId: string; activeVersionId: string }> {
    const current = await this.findById(opts.agentId);
    const parentVersionId = current?.activeVersionId ?? null;

    await this.db.transaction(async (tx) => {
      await tx.insert(schema.agentVersions).values({
        id: opts.versionId,
        agentId: opts.agentId,
        versionNumber: opts.versionNumber,
        versionKind: "publish",
        parentVersionId,
        publishedByUserId: opts.publishedByUserId ?? null,
        publishedAt: new Date(),
        snapshot: opts.snapshot as Record<string, unknown>,
      });

      await opts.project(tx, opts.versionId);

      await tx
        .update(schema.agents)
        .set({
          activeVersionId: opts.versionId,
          status: "published",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.agents.id, opts.agentId),
            eq(schema.agents.workspaceId, this.workspaceId),
          ),
        );
    });

    // F07: guard cache invalidation. The publish has already committed; a
    // KvStore outage should not poison the response. The 60s TTL bounds the
    // staleness if we drop a delete here.
    try {
      await this.kv.delete(cacheKey(this.workspaceId, opts.agentId));
      await this.kv.delete(
        `repo:agent_version:${this.workspaceId}:${opts.versionId}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[AgentRepository.publishVersion] cache invalidation failed for agent=${opts.agentId} version=${opts.versionId}: ${message}`,
      );
    }

    return { versionId: opts.versionId, activeVersionId: opts.versionId };
  }

  /**
   * Get the next version number for an agent. Used by publish and autoSave.
   */
  async nextVersionNumber(agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ max: sql<number>`COALESCE(MAX(${schema.agentVersions.versionNumber}), 0)` })
      .from(schema.agentVersions)
      .where(eq(schema.agentVersions.agentId, agentId));

    return (row?.max ?? 0) + 1;
  }
}
