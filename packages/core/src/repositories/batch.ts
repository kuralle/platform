import { and, desc, eq, sql } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import type { RepoDb } from "./types.js";
import { WorkspaceScopeViolation } from "../errors.js";

export interface Batch {
  id: string;
  workspaceId: string;
  name: string;
  agentId: string | null;
  channelKind: string;
  channelEndpointId: string | null;
  vertical: string;
  status: string;
  scheduledFor: Date | null;
  concurrency: number | null;
  totalRecipients: number;
  completed: number | null;
  booked: number | null;
  failed: number | null;
  costUsd: number | null;
  recoveredRevenueUsd: number | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface BatchInsert {
  id: string;
  name: string;
  agentId?: string | null;
  channelKind: string;
  channelEndpointId?: string | null;
  vertical: string;
  status?: string;
  scheduledFor?: Date | null;
  concurrency?: number | null;
  totalRecipients: number;
  createdByUserId?: string | null;
}

export interface BatchRecipientsSummary {
  byStatus: Record<string, number>;
  total: number;
}

interface KeysetCursor {
  u: string;
  i: string;
}

function encodeCursor(c: KeysetCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (
      parsed &&
      typeof parsed === "object" &&
      "u" in parsed &&
      "i" in parsed &&
      typeof (parsed as KeysetCursor).u === "string" &&
      typeof (parsed as KeysetCursor).i === "string"
    ) {
      return parsed as KeysetCursor;
    }
  } catch {
    // invalid cursor
  }
  return null;
}

function toDomain(row: typeof schema.batches.$inferSelect): Batch {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    agentId: row.agentId,
    channelKind: row.channelKind,
    channelEndpointId: row.channelEndpointId,
    vertical: row.vertical,
    status: row.status,
    scheduledFor: row.scheduledFor,
    concurrency: row.concurrency,
    totalRecipients: row.totalRecipients,
    completed: row.completed,
    booked: row.booked,
    failed: row.failed,
    costUsd: row.costUsd,
    recoveredRevenueUsd: row.recoveredRevenueUsd,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class BatchRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
  ) {}

  async findById(id: string): Promise<Batch | null> {
    const rows = await this.db
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.id, id),
          eq(schema.batches.workspaceId, this.workspaceId),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.workspaceId !== this.workspaceId) {
      throw new WorkspaceScopeViolation(
        "batch",
        row.id,
        this.workspaceId,
        row.workspaceId,
      );
    }
    return toDomain(row);
  }

  async findByWorkspace(opts: {
    cursor?: string | null;
    limit?: number;
    status?: string;
  }): Promise<{ items: Batch[]; cursor: string | null }> {
    const limit = opts.limit ?? 50;
    const conditions = [eq(schema.batches.workspaceId, this.workspaceId)];
    if (opts.status !== undefined) {
      conditions.push(eq(schema.batches.status, opts.status));
    }

    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      conditions.push(
        sql`(${schema.batches.updatedAt}, ${schema.batches.id}) < (${decoded.u}, ${decoded.i})`,
      );
    }

    const rows = await this.db
      .select()
      .from(schema.batches)
      .where(and(...conditions))
      .orderBy(desc(schema.batches.updatedAt), desc(schema.batches.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const cursor =
      hasMore && last
        ? encodeCursor({
            u: (last.updatedAt ?? new Date()).toISOString(),
            i: last.id,
          })
        : null;

    return { items: page.map(toDomain), cursor };
  }

  async create(input: BatchInsert): Promise<Batch> {
    const [row] = await this.db
      .insert(schema.batches)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        name: input.name,
        agentId: input.agentId ?? null,
        channelKind: input.channelKind,
        channelEndpointId: input.channelEndpointId ?? null,
        vertical: input.vertical,
        status: input.status ?? "scheduled",
        scheduledFor: input.scheduledFor ?? null,
        concurrency: input.concurrency ?? 8,
        totalRecipients: input.totalRecipients,
        createdByUserId: input.createdByUserId ?? null,
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("BatchRepository.create: no row returned");
    return toDomain(row);
  }

  async getStatus(batchId: string): Promise<BatchRecipientsSummary | null> {
    const batch = await this.findById(batchId);
    if (!batch) return null;

    const rows = await this.db
      .select({
        status: schema.batchRecipients.status,
        c: sql<number>`count(*)::int`,
      })
      .from(schema.batchRecipients)
      .innerJoin(
        schema.batches,
        eq(schema.batchRecipients.batchId, schema.batches.id),
      )
      .where(
        and(
          eq(schema.batchRecipients.batchId, batchId),
          eq(schema.batches.workspaceId, this.workspaceId),
        ),
      )
      .groupBy(schema.batchRecipients.status);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of rows) {
      byStatus[r.status] = r.c;
      total += r.c;
    }
    return { byStatus, total };
  }
}
