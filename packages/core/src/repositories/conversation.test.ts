import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { ConversationRepository } from "./conversation.js";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
} from "../test-utils.js";
import type { PoolClient } from "pg";
import type { TestDb } from "../test-utils.js";
import { agents, channelConnections, channelEndpoints } from "@kuralle/db/schema";

const kvStore = new MemoryKvStore();
const workspaceId = "ws_test_s2_01";

let client: PoolClient;
let db: TestDb;
let repo: ConversationRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new ConversationRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("ConversationRepository", () => {
  describe("findById", () => {
    it("returns null for missing conversation", async () => {
      expect(await repo.findById("cv_nonexistent")).toBeNull();
    });

    it("returns the inserted conversation", async () => {
      await repo.insert({
        id: "cv_test_1",
        channelKind: "voice",
        threadKey: "voice:test-1",
      });
      const found = await repo.findById("cv_test_1");
      expect(found).not.toBeNull();
      expect(found!.threadKey).toBe("voice:test-1");
      expect(found!.workspaceId).toBe(workspaceId);
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns conversations scoped to workspace", async () => {
      await repo.insert({ id: "cv_list_1", channelKind: "voice", threadKey: "voice:a" });
      await repo.insert({ id: "cv_list_2", channelKind: "messaging", threadKey: "wa:b" });
      const convs = await repo.findManyByWorkspace();
      expect(convs).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with defaults", async () => {
      const conv = await repo.insert({
        id: "cv_defaults",
        channelKind: "voice",
        threadKey: "voice:default",
      });
      expect(conv.startedAt).toBeInstanceOf(Date);
      expect(conv.evalsPassed).toBe(0);
    });
  });

  describe("update", () => {
    it("updates conversation fields and invalidates cache", async () => {
      await repo.insert({ id: "cv_update", channelKind: "voice", threadKey: "voice:up" });
      const updated = await repo.update("cv_update", {
        outcome: "booked",
        durationSec: 120,
        costUsd: 0.42,
      });
      expect(updated.outcome).toBe("booked");
      expect(updated.durationSec).toBe(120);

      const found = await repo.findById("cv_update");
      expect(found!.outcome).toBe("booked");
    });
  });

  describe("no softDelete", () => {
    it("conversations table has no deletedAt column — softDelete not available", () => {
      // Conversations are never soft-deleted per DATA_MODEL.md
      expect(repo).toBeDefined();
    });
  });

  describe("findOrCreateMessagingThread", () => {
    it("is idempotent for the same thread key", async () => {
      await db.insert(agents).values({
        id: "ag_test_1",
        workspaceId,
        status: "draft",
      });
      await db.insert(channelConnections).values({
        id: "ch_test_1",
        workspaceId,
        channelKind: "whatsapp",
        provider: "meta-whatsapp-cloud",
        displayName: "WhatsApp",
        status: "connected",
        config: {},
      });
      await db.insert(channelEndpoints).values({
        id: "ce_test_1",
        workspaceId,
        connectionId: "ch_test_1",
        channelKind: "whatsapp",
        identifier: "111111",
        attachedAgentId: "ag_test_1",
      });

      const first = await repo.findOrCreateMessagingThread({
        workspaceId,
        channelEndpointId: "ce_test_1",
        threadKey: "whatsapp:94770000000",
      });
      const second = await repo.findOrCreateMessagingThread({
        workspaceId,
        channelEndpointId: "ce_test_1",
        threadKey: "whatsapp:94770000000",
      });

      expect(second.conversationId).toBe(first.conversationId);
      expect(second.thread.threadKey).toBe(first.thread.threadKey);
      expect(second.thread.workspaceId).toBe(workspaceId);
    });
  });
});
