import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { UsageRepository } from "./usage.js";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
} from "../test-utils.js";
import type { PoolClient } from "pg";
import type { TestDb } from "../test-utils.js";
import * as schema from "@kuralle/db/schema";

const workspaceId = "ws_usage_test";
const agentId = "ag_usage";

let client: PoolClient;
let db: TestDb;
let repo: UsageRepository;

beforeAll(async () => {
  const t = await createTestDb();
  client = t.client;
  db = t.db;
  repo = new UsageRepository(db, workspaceId);
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
  await db.insert(schema.agents).values({
    id: agentId,
    workspaceId,
    status: "draft",
  });
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("UsageRepository", () => {
  it("getMonthlyRollup sums costs and groups by kind", async () => {
    await db.insert(schema.usageEvents).values([
      {
        id: "u1",
        workspaceId,
        agentId,
        kind: "minutes",
        quantity: 1,
        totalCostUsd: 1,
        occurredAt: new Date(Date.UTC(2026, 2, 1, 0, 0, 0)),
      },
      {
        id: "u2",
        workspaceId,
        agentId,
        kind: "minutes",
        quantity: 2,
        totalCostUsd: 2,
        occurredAt: new Date(Date.UTC(2026, 2, 15, 0, 0, 0)),
      },
    ]);

    const r = await repo.getMonthlyRollup({ year: 2026, month: 3 });
    expect(r.totalCallsCount).toBe(2);
    expect(r.totalCostUsd).toBe(3);
    expect(r.byKind).toHaveLength(1);
  });

  it("getMonthlyUsageReport includes byAgent", async () => {
    await db.insert(schema.usageEvents).values({
      id: "u3",
      workspaceId,
      agentId,
      kind: "minutes",
      quantity: 1,
      totalCostUsd: 0.1,
      occurredAt: new Date(Date.UTC(2026, 4, 10, 0, 0, 0)),
    });
    const r = await repo.getMonthlyUsageReport({ year: 2026, month: 5 });
    expect(r.byAgent.some((a) => a.agentId === agentId)).toBe(true);
  });
});
