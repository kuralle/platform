import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import * as schema from "@kuralle/db/schema";
import { ToolRepository } from "./tool.js";
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
let repo: ToolRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new ToolRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("ToolRepository", () => {
  describe("findById", () => {
    it("returns null for missing tool", async () => {
      expect(await repo.findById("t_nonexistent")).toBeNull();
    });

    it("returns the inserted tool", async () => {
      await repo.insert({
        id: "t_test_1",
        name: "weather_api",
        kind: "webhook",
      });
      const found = await repo.findById("t_test_1");
      expect(found).not.toBeNull();
      expect(found!.name).toBe("weather_api");
      expect(found!.workspaceId).toBe(workspaceId);
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns tools scoped to workspace", async () => {
      await repo.insert({ id: "t_list_1", name: "tool_a", kind: "webhook" });
      await repo.insert({ id: "t_list_2", name: "tool_b", kind: "mcp" });
      const tools = await repo.findManyByWorkspace();
      expect(tools).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with default status active", async () => {
      const tool = await repo.insert({
        id: "t_defaults",
        name: "default_tool",
        kind: "system",
      });
      expect(tool.status).toBe("active");
    });
  });

  describe("update", () => {
    it("updates tool fields and invalidates cache", async () => {
      await repo.insert({ id: "t_update", name: "old_name", kind: "client" });
      const updated = await repo.update("t_update", {
        name: "new_name",
        displayName: "New Name",
      });
      expect(updated.name).toBe("new_name");
      expect(updated.displayName).toBe("New Name");

      const found = await repo.findById("t_update");
      expect(found!.name).toBe("new_name");
    });
  });

  describe("findByCatalogProviderAndExternalKey", () => {
    it("returns a catalog tool by provider and external key", async () => {
      await db.insert(schema.toolCatalogProviders).values({
        id: "tcp_crm",
        workspaceId,
        kind: "mcp-custom",
        displayName: "CRM",
        mcpServerUrl: "https://example.com/mcp",
      });

      await repo.insert({
        id: "t_catalog_1",
        name: "crm.get_customer",
        kind: "mcp",
        catalogProviderId: "tcp_crm",
        externalToolKey: "get_customer",
      });
      const found = await repo.findByCatalogProviderAndExternalKey(
        "tcp_crm",
        "get_customer",
      );
      expect(found?.id).toBe("t_catalog_1");
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and invalidates cache", async () => {
      await repo.insert({ id: "t_to_delete", name: "del_me", kind: "webhook" });
      expect(await repo.findById("t_to_delete")).not.toBeNull();

      await repo.softDelete("t_to_delete");
      expect(await repo.findById("t_to_delete")).toBeNull();
    });
  });
});
