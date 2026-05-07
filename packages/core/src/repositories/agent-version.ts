import { and, eq, isNull, desc } from "drizzle-orm";
import type { RepoDb } from "./types.js";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { AppendOnlyViolation, WorkspaceScopeViolation } from "../errors.js";

export interface AgentVersion {
  id: string;
  agentId: string;
  versionNumber: number;
  versionKind: string;
  parentVersionId: string | null;
  changeSummary: string | null;
  changedFields: string[];
  publishedByUserId: string | null;
  publishedAt: Date | null;
  snapshot: unknown;
  bundleStorageKey: string | null;
  bundleHash: string | null;
  bundleStatus: string | null;
  bundleSizeBytes: number | null;
  builderVersion: string | null;
  builtAt: Date | null;
}

export interface AgentVersionInsert {
  id: string;
  agentId: string;
  versionNumber: number;
  versionKind?: string;
  parentVersionId?: string;
  changeSummary?: string;
  changedFields?: string[];
  publishedByUserId?: string;
  publishedAt?: Date;
  snapshot: unknown;
}

function toDomain(row: typeof schema.agentVersions.$inferSelect): AgentVersion {
  return {
    id: row.id,
    agentId: row.agentId,
    versionNumber: row.versionNumber,
    versionKind: row.versionKind,
    parentVersionId: row.parentVersionId,
    changeSummary: row.changeSummary,
    changedFields: row.changedFields ?? [],
    publishedByUserId: row.publishedByUserId,
    publishedAt: row.publishedAt,
    snapshot: row.snapshot,
    bundleStorageKey: row.bundleStorageKey,
    bundleHash: row.bundleHash,
    bundleStatus: row.bundleStatus,
    bundleSizeBytes: row.bundleSizeBytes,
    builderVersion: row.builderVersion,
    builtAt: row.builtAt,
  };
}

function cacheKey(workspaceId: string, id: string): string {
  return `repo:agent_version:${workspaceId}:${id}`;
}

export class AgentVersionRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<AgentVersion | null> {
    return this.kv.getOrCompute(cacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select({
          agent_versions: schema.agentVersions,
          agent_workspace_id: schema.agents.workspaceId,
        })
        .from(schema.agentVersions)
        .innerJoin(schema.agents, eq(schema.agentVersions.agentId, schema.agents.id))
        .where(
          and(
            eq(schema.agentVersions.id, id),
            eq(schema.agents.workspaceId, this.workspaceId),
            isNull(schema.agents.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.agent_workspace_id !== this.workspaceId) {
        throw new WorkspaceScopeViolation(
          "agent_version",
          row.agent_versions.id,
          this.workspaceId,
          row.agent_workspace_id,
        );
      }
      return toDomain(row.agent_versions);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<AgentVersion[]> {
    const limit = opts?.limit ?? 50;

    const rows = await this.db
      .select({ agent_versions: schema.agentVersions })
      .from(schema.agentVersions)
      .innerJoin(schema.agents, eq(schema.agentVersions.agentId, schema.agents.id))
      .where(
        and(
          eq(schema.agents.workspaceId, this.workspaceId),
          isNull(schema.agents.deletedAt),
        ),
      )
      .orderBy(desc(schema.agentVersions.publishedAt))
      .limit(limit);

    return rows.map((r) => toDomain(r.agent_versions));
  }

  async findByAgentId(agentId: string, opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<AgentVersion[]> {
    const limit = opts?.limit ?? 50;

    const rows = await this.db
      .select({ agent_versions: schema.agentVersions })
      .from(schema.agentVersions)
      .innerJoin(schema.agents, eq(schema.agentVersions.agentId, schema.agents.id))
      .where(
        and(
          eq(schema.agentVersions.agentId, agentId),
          eq(schema.agents.workspaceId, this.workspaceId),
          isNull(schema.agents.deletedAt),
        ),
      )
      .orderBy(desc(schema.agentVersions.publishedAt))
      .limit(limit);

    return rows.map((r) => toDomain(r.agent_versions));
  }

  async insert(input: AgentVersionInsert): Promise<AgentVersion> {
    const [row] = await this.db
      .insert(schema.agentVersions)
      .values({
        id: input.id,
        agentId: input.agentId,
        versionNumber: input.versionNumber,
        versionKind: input.versionKind ?? "manual_save",
        parentVersionId: input.parentVersionId ?? null,
        changeSummary: input.changeSummary ?? null,
        changedFields: input.changedFields ?? [],
        publishedByUserId: input.publishedByUserId ?? null,
        // Omit publishedAt when undefined so the DB defaultNow() applies for publish
        // rows. Auto-save callers explicitly set null when they want no timestamp.
        ...(input.publishedAt !== undefined && { publishedAt: input.publishedAt }),
        snapshot: input.snapshot as Record<string, unknown>,
      })
      .returning();

    if (!row) throw new Error("AgentVersionRepository.insert: no row returned");
    await this.kv.delete(cacheKey(this.workspaceId, row.id));
    return toDomain(row);
  }

  /** Always throws — agent_versions rows are append-only per DATA_MODEL.md §15. */
  async update(_id: string, _patch: Record<string, unknown>): Promise<never> {
    throw new AppendOnlyViolation();
  }
}
