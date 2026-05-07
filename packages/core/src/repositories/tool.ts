import { and, eq, isNull, desc } from "drizzle-orm";
import type { RepoDb } from "./types.js";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { WorkspaceScopeViolation } from "../errors.js";

export interface Tool {
  id: string;
  workspaceId: string | null;
  name: string;
  displayName: string | null;
  description: string | null;
  kind: string;
  catalogProviderId: string | null;
  externalToolKey: string | null;
  inputSchema: unknown;
  outputSchema: unknown;
  config: unknown;
  status: string | null;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface ToolInsert {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  kind: string;
  catalogProviderId?: string;
  externalToolKey?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  config?: unknown;
  status?: string;
}

export interface ToolUpdate {
  name?: string;
  displayName?: string;
  description?: string;
  kind?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  config?: unknown;
  status?: string;
  lastValidatedAt?: Date;
}

function toDomain(row: typeof schema.tools.$inferSelect): Tool {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    kind: row.kind,
    catalogProviderId: row.catalogProviderId,
    externalToolKey: row.externalToolKey,
    inputSchema: row.inputSchema,
    outputSchema: row.outputSchema,
    config: row.config,
    status: row.status,
    lastValidatedAt: row.lastValidatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function cacheKey(workspaceId: string, id: string): string {
  return `repo:tool:${workspaceId}:${id}`;
}

export class ToolRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<Tool | null> {
    return this.kv.getOrCompute(cacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.tools)
        .where(
          and(
            eq(schema.tools.id, id),
            eq(schema.tools.workspaceId, this.workspaceId),
            isNull(schema.tools.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation(
          "tool",
          row.id,
          this.workspaceId,
          row.workspaceId ?? "<null>",
        );
      }
      return toDomain(row);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Tool[]> {
    const limit = opts?.limit ?? 50;
    const rows = await this.db
      .select()
      .from(schema.tools)
      .where(
        and(
          eq(schema.tools.workspaceId, this.workspaceId),
          isNull(schema.tools.deletedAt),
        ),
      )
      .orderBy(desc(schema.tools.updatedAt))
      .limit(limit);

    return rows.map(toDomain);
  }

  async insert(input: ToolInsert): Promise<Tool> {
    const [row] = await this.db
      .insert(schema.tools)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        name: input.name,
        displayName: input.displayName ?? null,
        description: input.description ?? null,
        kind: input.kind,
        catalogProviderId: input.catalogProviderId ?? null,
        externalToolKey: input.externalToolKey ?? null,
        inputSchema: input.inputSchema as Record<string, unknown> | null ?? null,
        outputSchema: input.outputSchema as Record<string, unknown> | null ?? null,
        config: (input.config ?? {}) as Record<string, unknown>,
        status: input.status ?? "active",
      })
      .returning();

    if (!row) throw new Error("ToolRepository.insert: no row returned");
    await this.kv.delete(cacheKey(this.workspaceId, row.id));
    return toDomain(row);
  }

  async update(id: string, patch: ToolUpdate): Promise<Tool> {
    const [row] = await this.db
      .update(schema.tools)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.tools.id, id),
          eq(schema.tools.workspaceId, this.workspaceId),
        ),
      )
      .returning();

    if (!row) throw new Error("ToolRepository.update: no row returned");

    await this.kv.delete(cacheKey(this.workspaceId, id));
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(schema.tools)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.tools.id, id),
          eq(schema.tools.workspaceId, this.workspaceId),
        ),
      );

    await this.kv.delete(cacheKey(this.workspaceId, id));
  }
}
