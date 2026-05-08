import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "./index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  seedWorkspaceMember,
  closePool,
} from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import * as schema from "@kuralle/db/schema";
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_w1_rec";
const USER_ID = "user_w1_rec";
const AGENT_ID = "ag_w1_rec";

describe("receipts router", () => {
  let db: TestDb;
  let client: PoolClient;
  let kvStore: MemoryKvStore;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    client = t.client;
  });

  afterAll(async () => {
    await releaseTestDb(client);
    await closePool();
  });

  beforeEach(async () => {
    kvStore = new MemoryKvStore();
    await resetSchema(client, WORKSPACE_ID);
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      email: `${USER_ID}@test.local`,
    });
    await db.insert(schema.agents).values({
      id: AGENT_ID,
      workspaceId: WORKSPACE_ID,
      status: "draft",
    });
  });

  function ctx(): Context {
    return {
      auth: null,
      session: {
        user: {
          id: USER_ID,
          name: "T",
          email: "t@t",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
          systemRole: "user",
        },
        session: {
          id: "s1",
          token: "tok",
          userId: USER_ID,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      db,
      kvStore,
      env: {
        META_APP_ID: "",
        META_APP_SECRET: "",
        META_SYSTEM_USER_TOKEN: "",
        META_VERIFY_TOKEN: "",
        META_PHONE_NUMBER_ID: "",
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
      requestHeaders: new Headers(),
    };
  }

  it("getMonthly aggregates usage_events in range", async () => {
    const context = ctx();
    await db.insert(schema.usageEvents).values([
      {
        id: "ue_1",
        workspaceId: WORKSPACE_ID,
        agentId: AGENT_ID,
        kind: "minutes",
        quantity: 1,
        totalCostUsd: 0.5,
        occurredAt: new Date(Date.UTC(2026, 0, 15, 12, 0, 0)),
      },
      {
        id: "ue_2",
        workspaceId: WORKSPACE_ID,
        agentId: AGENT_ID,
        kind: "minutes",
        quantity: 1,
        totalCostUsd: 0.25,
        occurredAt: new Date(Date.UTC(2026, 0, 20, 12, 0, 0)),
      },
    ]);

    const r = await callProcedure<{
      totalCalls: number;
      totalCostUsd: number;
      byKind: { kind: string; count: number }[];
      byAgent: { agentId: string; count: number }[];
    }>(
      appRouter.receipts.getMonthly,
      { workspaceId: WORKSPACE_ID, year: 2026, month: 1 },
      context,
    );

    expect(r.totalCalls).toBe(2);
    expect(r.totalCostUsd).toBeCloseTo(0.75, 5);
    expect(r.byKind.find((k) => k.kind === "minutes")?.count).toBe(2);
    expect(r.byAgent.find((a) => a.agentId === AGENT_ID)?.count).toBe(2);
  });

  it("getMonthly returns zeros when no events", async () => {
    const r = await callProcedure<{ totalCalls: number; byKind: unknown[] }>(
      appRouter.receipts.getMonthly,
      { workspaceId: WORKSPACE_ID, year: 2026, month: 2 },
      ctx(),
    );
    expect(r.totalCalls).toBe(0);
    expect(r.byKind).toHaveLength(0);
  });
});
