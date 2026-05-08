import { and, eq, isNull, desc, sql } from "drizzle-orm";
import type { RepoDb } from "./types.js";
import * as schema from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { WorkspaceScopeViolation } from "../errors.js";

export interface KbDocument {
  id: string;
  workspaceId: string;
  folder: string | null;
  name: string;
  source: string;
  sourceUrl: string | null;
  storageKey: string | null;
  contentText: string | null;
  sizeBytes: number;
  status: string;
  ragIndexed: boolean;
  embeddingModel: string | null;
  autoSync: boolean;
  lastSyncedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  deletedAt: Date | null;
}

export interface KbDocumentInsert {
  id: string;
  folder?: string;
  name: string;
  source: string;
  sourceUrl?: string;
  storageKey?: string;
  contentText?: string;
  sizeBytes: number;
  status?: string;
  embeddingModel?: string;
  createdByUserId?: string;
}

export interface KbDocumentUpdate {
  folder?: string;
  name?: string;
  status?: string;
  ragIndexed?: boolean;
  autoSync?: boolean;
  lastSyncedAt?: Date;
  contentText?: string;
}

export interface KbChunk {
  id: string;
  documentId: string;
  ordinal: number;
  content: string;
  embedding: number[] | null;
  tokenCount: number | null;
  createdAt: Date;
}

export interface KbChunkInsert {
  id: string;
  documentId: string;
  ordinal: number;
  content: string;
  embedding?: number[] | null;
  tokenCount?: number;
}

function toDomain(row: typeof schema.kbDocuments.$inferSelect): KbDocument {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    folder: row.folder,
    name: row.name,
    source: row.source,
    sourceUrl: row.sourceUrl,
    storageKey: row.storageKey,
    contentText: row.contentText,
    sizeBytes: row.sizeBytes,
    status: row.status,
    ragIndexed: row.ragIndexed ?? false,
    embeddingModel: row.embeddingModel,
    autoSync: row.autoSync ?? false,
    lastSyncedAt: row.lastSyncedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toChunkDomain(
  row: typeof schema.kbChunks.$inferSelect,
): KbChunk {
  return {
    id: row.id,
    documentId: row.documentId,
    ordinal: row.ordinal,
    content: row.content,
    embedding: row.embedding,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
  };
}

function docCacheKey(workspaceId: string, id: string): string {
  return `repo:kb_document:${workspaceId}:${id}`;
}

function chunkCacheKey(workspaceId: string, id: string): string {
  return `repo:kb_chunk:${workspaceId}:${id}`;
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
    // invalid cursor → first page
  }
  return null;
}

export class KbDocumentRepository {
  constructor(
    private readonly db: RepoDb,
    private readonly workspaceId: string,
    private readonly kv: KvStore,
  ) {}

  async findById(id: string): Promise<KbDocument | null> {
    return this.kv.getOrCompute(docCacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select()
        .from(schema.kbDocuments)
        .where(
          and(
            eq(schema.kbDocuments.id, id),
            eq(schema.kbDocuments.workspaceId, this.workspaceId),
            isNull(schema.kbDocuments.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.workspaceId !== this.workspaceId) {
        throw new WorkspaceScopeViolation("kb_document", row.id, this.workspaceId, row.workspaceId);
      }
      return toDomain(row);
    }, { ttlSeconds: 60 });
  }

  async findManyByWorkspace(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<KbDocument[]> {
    const { items } = await this.findByWorkspace({
      cursor: opts?.cursor ?? null,
      limit: opts?.limit,
    });
    return items;
  }

  /**
   * Keyset pagination on `(updatedAt DESC, id DESC)` (mirrors AgentRepository).
   */
  async findByWorkspace(opts: {
    workspaceId?: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ items: KbDocument[]; cursor: string | null }> {
    if (opts.workspaceId !== undefined && opts.workspaceId !== this.workspaceId) {
      throw new WorkspaceScopeViolation(
        "kb_document",
        "*",
        this.workspaceId,
        opts.workspaceId,
      );
    }
    const limit = opts.limit ?? 50;
    const conditions = [
      eq(schema.kbDocuments.workspaceId, this.workspaceId),
      isNull(schema.kbDocuments.deletedAt),
    ];

    const decoded = decodeCursor(opts.cursor);
    if (decoded) {
      conditions.push(
        sql`(${schema.kbDocuments.updatedAt}, ${schema.kbDocuments.id}) < (${decoded.u}, ${decoded.i})`,
      );
    }

    const rows = await this.db
      .select()
      .from(schema.kbDocuments)
      .where(and(...conditions))
      .orderBy(desc(schema.kbDocuments.updatedAt), desc(schema.kbDocuments.id))
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

  async create(input: KbDocumentInsert): Promise<KbDocument> {
    return this.insert(input);
  }

  async delete(id: string): Promise<void> {
    await this.softDelete(id);
  }

  async insert(input: KbDocumentInsert): Promise<KbDocument> {
    const [row] = await this.db
      .insert(schema.kbDocuments)
      .values({
        id: input.id,
        workspaceId: this.workspaceId,
        folder: input.folder ?? null,
        name: input.name,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        storageKey: input.storageKey ?? null,
        contentText: input.contentText ?? null,
        sizeBytes: input.sizeBytes,
        status: input.status ?? "indexing",
        embeddingModel: input.embeddingModel ?? null,
        createdByUserId: input.createdByUserId ?? null,
        updatedAt: new Date(),
      })
      .returning();

    if (!row) throw new Error("KbDocumentRepository.insert: no row returned");
    await this.kv.delete(docCacheKey(this.workspaceId, row.id));
    return toDomain(row);
  }

  async update(id: string, patch: KbDocumentUpdate): Promise<KbDocument> {
    const [row] = await this.db
      .update(schema.kbDocuments)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.kbDocuments.id, id),
          eq(schema.kbDocuments.workspaceId, this.workspaceId),
        ),
      )
      .returning();

    if (!row) throw new Error("KbDocumentRepository.update: no row returned");

    await this.kv.delete(docCacheKey(this.workspaceId, id));
    return toDomain(row);
  }

  async softDelete(id: string): Promise<void> {
    await this.db
      .update(schema.kbDocuments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.kbDocuments.id, id),
          eq(schema.kbDocuments.workspaceId, this.workspaceId),
        ),
      );

    await this.kv.delete(docCacheKey(this.workspaceId, id));
  }

  // ── Chunk methods ──────────────────────────────────────────

  async findChunkById(id: string): Promise<KbChunk | null> {
    return this.kv.getOrCompute(chunkCacheKey(this.workspaceId, id), async () => {
      const rows = await this.db
        .select({
          kb_chunks: schema.kbChunks,
          doc_workspace_id: schema.kbDocuments.workspaceId,
        })
        .from(schema.kbChunks)
        .innerJoin(
          schema.kbDocuments,
          eq(schema.kbChunks.documentId, schema.kbDocuments.id),
        )
        .where(
          and(
            eq(schema.kbChunks.id, id),
            eq(schema.kbDocuments.workspaceId, this.workspaceId),
            isNull(schema.kbDocuments.deletedAt),
          ),
        )
        .limit(1);

      if (rows.length === 0) return null;
      const row = rows[0]!;
      if (row.doc_workspace_id !== this.workspaceId) {
        throw new WorkspaceScopeViolation(
          "kb_chunk",
          row.kb_chunks.id,
          this.workspaceId,
          row.doc_workspace_id,
        );
      }
      return toChunkDomain(row.kb_chunks);
    }, { ttlSeconds: 60 });
  }

  async insertChunk(input: KbChunkInsert): Promise<KbChunk> {
    const [row] = await this.db
      .insert(schema.kbChunks)
      .values({
        id: input.id,
        documentId: input.documentId,
        ordinal: input.ordinal,
        content: input.content,
        embedding: input.embedding ?? null,
        tokenCount: input.tokenCount ?? null,
      })
      .returning();

    if (!row) throw new Error("KbDocumentRepository.insertChunk: no row returned");
    await this.kv.delete(chunkCacheKey(this.workspaceId, row.id));
    return toChunkDomain(row);
  }
}
