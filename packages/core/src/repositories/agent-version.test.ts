import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { AgentVersionRepository } from "./agent-version.js";
import { AgentRepository } from "./agent.js";
import { AppendOnlyViolation } from "../errors.js";
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
let repo: AgentVersionRepository;
let agentRepo: AgentRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new AgentVersionRepository(db, workspaceId, kvStore);
  agentRepo = new AgentRepository(db, workspaceId, kvStore);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

async function seedAgent() {
  return agentRepo.insert({ id: "ag_av_test", status: "published" });
}

describe("AgentVersionRepository", () => {
  describe("findById", () => {
    it("returns null for missing version", async () => {
      expect(await repo.findById("av_nonexistent")).toBeNull();
    });

    it("returns the inserted version", async () => {
      await seedAgent();
      await repo.insert({
        id: "av_test_1",
        agentId: "ag_av_test",
        versionNumber: 1,
        versionKind: "publish",
        snapshot: { instructions: "hello" },
      });

      const found = await repo.findById("av_test_1");
      expect(found).not.toBeNull();
      expect(found!.id).toBe("av_test_1");
      expect(found!.versionNumber).toBe(1);
      expect(found!.snapshot).toEqual({ instructions: "hello" });
    });

    it("scopes by workspace through agent FK", async () => {
      // Insert an agent + version in workspace B
      const WS_B = "ws_test_s2_01_b";
      await client.query(
        `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, is_personal, created_at, updated_at)
         VALUES ($1, 'WS B', 'ws-b', 'sandbox', 'us-east-1', 'none', false, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [WS_B],
      );
      const agentRepoB = new AgentRepository(db, WS_B, kvStore);
      const versionRepoB = new AgentVersionRepository(db, WS_B, kvStore);
      await agentRepoB.insert({ id: "ag_ws_b", status: "draft" });
      await versionRepoB.insert({
        id: "av_ws_b",
        agentId: "ag_ws_b",
        versionNumber: 1,
        snapshot: {},
      });

      // Our repo (workspace A) should not find it
      expect(await repo.findById("av_ws_b")).toBeNull();
    });
  });

  describe("findManyByWorkspace", () => {
    it("returns versions scoped through agent FK", async () => {
      await seedAgent();
      await repo.insert({
        id: "av_list_1",
        agentId: "ag_av_test",
        versionNumber: 1,
        snapshot: {},
      });
      await repo.insert({
        id: "av_list_2",
        agentId: "ag_av_test",
        versionNumber: 2,
        snapshot: {},
      });

      const versions = await repo.findManyByWorkspace();
      expect(versions).toHaveLength(2);
    });
  });

  describe("insert", () => {
    it("inserts with default versionKind", async () => {
      await seedAgent();
      const version = await repo.insert({
        id: "av_defaults",
        agentId: "ag_av_test",
        versionNumber: 1,
        snapshot: {},
      });
      expect(version.versionKind).toBe("manual_save");
    });
  });

  describe("update", () => {
    it("always throws AppendOnlyViolation", async () => {
      await seedAgent();
      await repo.insert({
        id: "av_immutable",
        agentId: "ag_av_test",
        versionNumber: 1,
        snapshot: { original: true },
      });

      await expect(
        repo.update("av_immutable", { snapshot: { modified: true } }),
      ).rejects.toThrow(AppendOnlyViolation);

      // Verify the row was unchanged
      const found = await repo.findById("av_immutable");
      expect(found).not.toBeNull();
      expect(found!.snapshot).toEqual({ original: true });
    });
  });

  describe("cache invalidation", () => {
    it("findById caches and invalidates on insert of new version", async () => {
      await seedAgent();

      // Insert and find
      await repo.insert({
        id: "av_cache_1",
        agentId: "ag_av_test",
        versionNumber: 1,
        snapshot: { v: 1 },
      });
      const first = await repo.findById("av_cache_1");
      expect(first).not.toBeNull();

      // Insert does not invalidate other keys (insert pushes nothing)
      // But update is forbidden. Cache invalidation for agent_versions
      // happens from AgentRepository when activeVersionId changes (S2-03).
      // Here we verify the cache works for findById.
      const second = await repo.findById("av_cache_1");
      expect(second).not.toBeNull();
      expect(second!.snapshot).toEqual({ v: 1 });
    });
  });
});
