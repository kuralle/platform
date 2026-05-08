import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { ComplianceRepository } from "./compliance.js";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
} from "../test-utils.js";
import type { PoolClient } from "pg";
import type { TestDb } from "../test-utils.js";

const workspaceId = "ws_comp_test";

let client: PoolClient;
let db: TestDb;
let repo: ComplianceRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new ComplianceRepository(db, workspaceId);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("ComplianceRepository", () => {
  it("getPosture null then upsert", async () => {
    expect(await repo.getPosture()).toBeNull();
    const p = await repo.upsertPosture({ hipaa: "active" });
    expect(p.hipaa).toBe("active");
    const again = await repo.upsertPosture({ ferpa: "inactive" });
    expect(again.hipaa).toBe("active");
    expect(again.ferpa).toBe("inactive");
  });
});
