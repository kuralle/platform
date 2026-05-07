import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { ChannelRepository } from "./channel.js";
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
let repo: ChannelRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new ChannelRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("ChannelRepository", () => {
  describe("findById", () => {
    it("returns null for missing channel", async () => {
      expect(await repo.findById("ch_nonexistent")).toBeNull();
    });

    it("returns the inserted channel", async () => {
      await repo.insert({
        id: "ch_test_1",
        channelKind: "voice",
        provider: "twilio-native",
        displayName: "Test Voice",
      });
      const found = await repo.findById("ch_test_1");
      expect(found).not.toBeNull();
      expect(found!.displayName).toBe("Test Voice");
      expect(found!.workspaceId).toBe(workspaceId);
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns channels scoped to workspace", async () => {
      await repo.insert({ id: "ch_list_1", channelKind: "voice", provider: "twilio", displayName: "A" });
      await repo.insert({ id: "ch_list_2", channelKind: "whatsapp", provider: "twilio", displayName: "B" });
      const channels = await repo.findManyByWorkspace();
      expect(channels).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with default status connected", async () => {
      const channel = await repo.insert({
        id: "ch_defaults",
        channelKind: "voice",
        provider: "twilio-native",
        displayName: "Defaults",
      });
      expect(channel.status).toBe("connected");
    });
  });

  describe("update", () => {
    it("updates channel fields and invalidates cache", async () => {
      await repo.insert({ id: "ch_update", channelKind: "voice", provider: "twilio", displayName: "Old" });
      const updated = await repo.update("ch_update", {
        displayName: "Updated",
        status: "connected",
      });
      expect(updated.displayName).toBe("Updated");
      expect(updated.status).toBe("connected");

      const found = await repo.findById("ch_update");
      expect(found!.displayName).toBe("Updated");
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and invalidates cache", async () => {
      await repo.insert({ id: "ch_to_delete", channelKind: "voice", provider: "twilio", displayName: "Del" });
      expect(await repo.findById("ch_to_delete")).not.toBeNull();

      await repo.softDelete("ch_to_delete");
      expect(await repo.findById("ch_to_delete")).toBeNull();
    });
  });
});
