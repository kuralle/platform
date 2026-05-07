import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { AgentRepository } from "./agent.js";
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
const WS_B = "ws_test_s2_01_b";

let client: PoolClient;
let db: TestDb;
let repo: AgentRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new AgentRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
  // Ensure workspace B org also exists
  await client.query(
    `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, is_personal, created_at, updated_at)
     VALUES ($1, 'Workspace B', 'ws-b', 'sandbox', 'us-east-1', 'none', false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [WS_B],
  );
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("AgentRepository", () => {
  describe("findById", () => {
    it("returns null for missing agent", async () => {
      expect(await repo.findById("ag_nonexistent")).toBeNull();
    });

    it("returns the inserted agent", async () => {
      const agent = await repo.insert({
        id: "ag_test_1",
        status: "draft",
      });
      expect(agent.id).toBe("ag_test_1");
      const found = await repo.findById("ag_test_1");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("ag_test_1");
      expect(found!.status).toBe("draft");
      expect(found!.workspaceId).toBe(workspaceId);
    });

    it("does not return soft-deleted agents", async () => {
      await repo.insert({ id: "ag_deleted", status: "draft" });
      await repo.softDelete("ag_deleted");
      expect(await repo.findById("ag_deleted")).toBeNull();
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns agents scoped to the workspace", async () => {
      await repo.insert({ id: "ag_list_1", status: "draft" });
      await repo.insert({ id: "ag_list_2", status: "published" });

      const agents = await repo.findManyByWorkspace();
      expect(agents).toHaveLength(2);
    });

    it("respects limit", async () => {
      for (let i = 0; i < 5; i++) {
        await repo.insert({ id: `ag_limit_${i}`, status: "draft" });
      }
      const agents = await repo.findManyByWorkspace({ limit: 2 });
      expect(agents).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with default status", async () => {
      const agent = await repo.insert({ id: "ag_defaults" });
      expect(agent.status).toBe("draft");
      expect(agent.workspaceId).toBe(workspaceId);
    });
  });

  describe("update", () => {
    it("updates agent fields", async () => {
      await repo.insert({ id: "ag_update", status: "draft" });
      const updated = await repo.update("ag_update", {
        status: "published",
        metadata: { key: "value" },
      });
      expect(updated.status).toBe("published");
      expect(updated.metadata).toEqual({ key: "value" });
    });

    it("invalidates cache after update", async () => {
      await repo.insert({ id: "ag_cache_inv", status: "draft" });

      // First findById: cache miss, DB hit
      const first = await repo.findById("ag_cache_inv");
      expect(first).not.toBeNull();
      expect(first!.status).toBe("draft");

      // Update changes the status
      await repo.update("ag_cache_inv", { status: "published" });

      // Next findById: cache was invalidated, must hit DB again
      const second = await repo.findById("ag_cache_inv");
      expect(second).not.toBeNull();
      expect(second!.status).toBe("published");
    });
  });

  describe("softDelete", () => {
    it("sets deletedAt and invalidates cache", async () => {
      await repo.insert({ id: "ag_to_delete", status: "draft" });
      expect(await repo.findById("ag_to_delete")).not.toBeNull();

      await repo.softDelete("ag_to_delete");
      expect(await repo.findById("ag_to_delete")).toBeNull();

      // It's still in the DB but findById filters it out
      const raw = await db.query.agents.findFirst({
        where: (agents, { eq }) => eq(agents.id, "ag_to_delete"),
      });
      expect(raw).not.toBeNull();
      expect(raw!.deletedAt).not.toBeNull();
    });
  });

  describe("workspace scope", () => {
    it("returns 0 rows for agents in another workspace", async () => {
      // Insert an agent into workspace B directly
      const repoB = new AgentRepository(db, WS_B, kvStore);
      await repoB.insert({ id: "ag_ws_b", status: "draft" });

      // Our repo (workspace A) should not find it
      expect(await repo.findById("ag_ws_b")).toBeNull();
    });
  });
});
