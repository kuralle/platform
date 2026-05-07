import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { KbDocumentRepository } from "./kb-document.js";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
} from "../test-utils.js";
import type { PoolClient } from "pg";
import type { TestDb } from "../test-utils.js";

const kvStore = new MemoryKvStore();
const workspaceId = "ws_test_s2_01";

let client: PoolClient;
let db: TestDb;
let repo: KbDocumentRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new KbDocumentRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("KbDocumentRepository", () => {
  describe("findById", () => {
    it("returns null for missing document", async () => {
      expect(await repo.findById("kb_nonexistent")).toBeNull();
    });

    it("returns the inserted document", async () => {
      await repo.insert({
        id: "kb_test_1",
        name: "test.pdf",
        source: "file",
        sizeBytes: 1024,
      });
      const found = await repo.findById("kb_test_1");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("test.pdf");
      expect(found!.workspaceId).toBe(workspaceId);
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns documents scoped to workspace", async () => {
      await repo.insert({ id: "kb_list_1", name: "a.pdf", source: "file", sizeBytes: 100 });
      await repo.insert({ id: "kb_list_2", name: "b.pdf", source: "file", sizeBytes: 200 });
      const docs = await repo.findManyByWorkspace();
      expect(docs).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with default status indexing", async () => {
      const doc = await repo.insert({
        id: "kb_defaults",
        name: "doc.txt",
        source: "file",
        sizeBytes: 500,
      });
      expect(doc.status).toBe("indexing");
    });
  });

  describe("update", () => {
    it("updates document fields and invalidates cache", async () => {
      await repo.insert({ id: "kb_update", name: "old.pdf", source: "file", sizeBytes: 100 });
      const updated = await repo.update("kb_update", {
        name: "new.pdf",
        status: "ready",
      });
      expect(updated.name).toBe("new.pdf");
      expect(updated.status).toBe("ready");

      // Cache should be invalidated; re-fetch gets new data
      const found = await repo.findById("kb_update");
      expect(found!.name).toBe("new.pdf");
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and invalidates cache", async () => {
      await repo.insert({ id: "kb_to_delete", name: "del.pdf", source: "file", sizeBytes: 100 });
      expect(await repo.findById("kb_to_delete")).not.toBeNull();

      await repo.softDelete("kb_to_delete");
      expect(await repo.findById("kb_to_delete")).toBeNull();
    });
  });

  describe("chunks (vector round-trip — BL-S1-VECTOR-ROUNDTRIP-TEST)", () => {
    it("round-trips a populated 1024-dim vector embedding", async () => {
      await repo.insert({ id: "kb_vec_doc", name: "vec.pdf", source: "file", sizeBytes: 100 });

      const embedding = Array.from({ length: 1024 }, (_, i) => i * 0.001);
      const chunk = await repo.insertChunk({
        id: "kbc_vec_1",
        documentId: "kb_vec_doc",
        ordinal: 1,
        content: "test chunk",
        embedding,
      });

      // Verify round-trip: the embedding array matches structurally.
      // pgvector stores floats; compare with tolerance for floating-point precision.
      expect(chunk.embedding).not.toBeNull();
      expect(chunk.embedding!).toHaveLength(1024);
      for (let i = 0; i < 1024; i++) {
        expect(chunk.embedding![i]).toBeCloseTo(embedding[i]!, 5);
      }

      // Fetch via findChunkById to confirm persistence with tolerance
      const found = await repo.findChunkById("kbc_vec_1");
      expect(found).not.toBeNull();
      expect(found!.embedding).not.toBeNull();
      expect(found!.embedding!).toHaveLength(1024);
      for (let i = 0; i < 1024; i++) {
        expect(found!.embedding![i]).toBeCloseTo(embedding[i]!, 5);
      }
    });

    it("handles null embedding without crash", async () => {
      await repo.insert({ id: "kb_null_doc", name: "null_vec.pdf", source: "file", sizeBytes: 100 });

      const chunk = await repo.insertChunk({
        id: "kbc_null_1",
        documentId: "kb_null_doc",
        ordinal: 1,
        content: "no embedding",
        embedding: null,
      });

      expect(chunk.embedding).toBeNull();

      // Fetch via findChunkById — must not crash on null embedding
      const found = await repo.findChunkById("kbc_null_1");
      expect(found).not.toBeNull();
      expect(found!.embedding).toBeNull();
    });
  });
});
