import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as { dimensions: number }).dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value.slice(1, -1).split(",").map(Number);
  },
});

export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    folder: text("folder"),
    name: text("name").notNull(),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    storageKey: text("storage_key"),
    contentText: text("content_text"),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status").default("indexing").notNull(),
    ragIndexed: boolean("rag_indexed").default(false),
    embeddingModel: text("embedding_model"),
    autoSync: boolean("auto_sync").default(false),
    lastSyncedAt: timestamp("last_synced_at"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("kb_documents_workspace_folder_idx").on(
      table.workspaceId,
      table.folder,
    ),
    index("kb_documents_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("kb_chunks_document_ordinal_idx").on(
      table.documentId,
      table.ordinal,
    ),
  ],
);

export const kbDocumentsRelations = relations(kbDocuments, ({ many }) => ({
  chunks: many(kbChunks),
}));

export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  document: one(kbDocuments, {
    fields: [kbChunks.documentId],
    references: [kbDocuments.id],
  }),
}));
