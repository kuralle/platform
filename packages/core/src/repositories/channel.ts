import { and, eq, isNull, desc } from "drizzle-orm";
import type { RepoDb } from "./types.js";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { WorkspaceScopeViolation } from "../errors.js";

export interface Channel {
  id: string;
  workspaceId: string;
  channelKind: string;
  provider: string;
  displayName: string;
  status: string;
  credentialsSecretId: string | null;
  config: unknown;
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface ChannelInsert {
  id: string;
  channelKind: string;
  provider: string;
  displayName: string;
  status?: string;
  credentialsSecretId?: string;
  config?: unknown;
  capabilities?: string[];
}

export interface ChannelUpdate {
  displayName?: string;
  status?: string;
  config?: unknown;
  capabilities?: string[];
}

function toDomain(
  row: typeof schema.channelConnections.$inferSelect,
): Channel {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelKind: row.channelKind,
    provider: row.provider,
    displayName: row.displayName,
    status: row.status,
    credentialsSecretId: row.credentialsSecretId,
    config: row.config,
    capabilities: row.capabilities ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function cacheKey(workspaceId: string, id: string): string {
  return `repo:channel:${workspaceId}:${id}`;
}

export class ChannelRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<Channel | null> {
    return this.kv.getOrCompute(cacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.channelConnections)
        .where(
          and(
            eq(schema.channelConnections.id, id),
            eq(schema.channelConnections.workspaceId, this.workspaceId),
            isNull(schema.channelConnections.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation("channel", row.id, this.workspaceId, row.workspaceId);
      }
      return toDomain(row);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Channel[]> {
    const limit = opts?.limit ?? 50;
    const rows = await this.db
      .select()
      .from(schema.channelConnections)
      .where(
        and(
          eq(schema.channelConnections.workspaceId, this.workspaceId),
          isNull(schema.channelConnections.deletedAt),
        ),
      )
      .orderBy(desc(schema.channelConnections.updatedAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async insert(input: ChannelInsert): Promise<Channel> {
    const [row] = await this.db
      .insert(schema.channelConnections)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        channelKind: input.channelKind,
        provider: input.provider,
        displayName: input.displayName,
        status: input.status ?? "connected",
        credentialsSecretId: input.credentialsSecretId ?? null,
        config: (input.config ?? {}) as Record<string, unknown>,
        capabilities: input.capabilities ?? [],
      })
      .returning();

    if (!row) throw new Error("ChannelRepository.insert: no row returned");
    await this.kv.delete(cacheKey(this.workspaceId, row.id));
    return toDomain(row);
  }

  async update(id: string, patch: ChannelUpdate): Promise<Channel> {
    const [row] = await this.db
      .update(schema.channelConnections)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.channelConnections.id, id),
          eq(schema.channelConnections.workspaceId, this.workspaceId),
        ),
      )
      .returning();

    if (!row) throw new Error("ChannelRepository.update: no row returned");

    await this.kv.delete(cacheKey(this.workspaceId, id));
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(schema.channelConnections)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.channelConnections.id, id),
          eq(schema.channelConnections.workspaceId, this.workspaceId),
        ),
      );

    await this.kv.delete(cacheKey(this.workspaceId, id));
  }
}
