import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { BatchRepository } from "./batch.js";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
} from "../test-utils.js";
import type { PoolClient } from "pg";
import type { TestDb } from "../test-utils.js";

const workspaceId = "ws_batch_test";

let client: PoolClient;
let db: TestDb;
let repo: BatchRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new BatchRepository(db, workspaceId);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("BatchRepository", () => {
  it("create and findById", async () => {
    const b = await repo.create({
      id: "bat_1",
      name: "Test",
      channelKind: "voice",
      vertical: "home-services",
      totalRecipients: 3,
    });
    expect(b.status).toBe("scheduled");
    const found = await repo.findById("bat_1");
    expect(found?.name).toBe("Test");
  });

  it("getStatus returns empty summary when no recipients", async () => {
    await repo.create({
      id: "bat_2",
      name: "R",
      channelKind: "voice",
      vertical: "education",
      totalRecipients: 0,
    });
    const s = await repo.getStatus("bat_2");
    expect(s?.total).toBe(0);
  });
});
