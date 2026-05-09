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
import type { PoolClient, TestDb } from "@kuralle/core/test-utils";
import * as schema from "@kuralle/db/schema";
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_w1_home";
const USER_ID = "user_w1_home";

describe("home router", () => {
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

  it("dashboard returns zeros for fresh workspace", async () => {
    const r = await callProcedure<{
      liveCalls: number;
      todayCalls: number;
      weeklyTrend: { count: number; deltaPct: number | null };
      recentConversations: unknown[];
    }>(
      appRouter.home.dashboard,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    expect(r.liveCalls).toBe(0);
    expect(r.todayCalls).toBe(0);
    expect(r.weeklyTrend.count).toBe(0);
    expect(r.weeklyTrend.deltaPct).toBeNull();
    expect(r.recentConversations).toHaveLength(0);
  });

  it("dashboard counts today calls and weekly trend", async () => {
    await db.insert(schema.conversations).values([
      {
        id: "cv_home_1",
        workspaceId: WORKSPACE_ID,
        channelKind: "voice",
        threadKey: "tk_1",
        startedAt: new Date(),
      },
      {
        id: "cv_home_2",
        workspaceId: WORKSPACE_ID,
        channelKind: "voice",
        threadKey: "tk_2",
        startedAt: new Date(),
      },
    ]);

    const r = await callProcedure<{
      liveCalls: number;
      todayCalls: number;
      weeklyTrend: { count: number; deltaPct: number | null };
      recentConversations: Array<{ id: string }>;
    }>(
      appRouter.home.dashboard,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    expect(r.todayCalls).toBe(2);
    expect(r.weeklyTrend.count).toBe(2);
    expect(r.weeklyTrend.deltaPct).toBeNull();
    expect(r.recentConversations).toHaveLength(2);
  });

  it("dashboard counts live calls via voice_calls join", async () => {
    await db.insert(schema.conversations).values({
      id: "cv_live_1",
      workspaceId: WORKSPACE_ID,
      channelKind: "voice",
      threadKey: "tk_live",
      startedAt: new Date(),
    });
    await db.insert(schema.voiceCalls).values({
      conversationId: "cv_live_1",
      callerId: "caller_1",
    });

    const r = await callProcedure<{ liveCalls: number }>(
      appRouter.home.dashboard,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    expect(r.liveCalls).toBe(1);
  });

  it("dashboard computes weekly delta", async () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset - 3);

    await db.insert(schema.conversations).values([
      // Last week
      {
        id: "cv_lw_1",
        workspaceId: WORKSPACE_ID,
        channelKind: "voice",
        threadKey: "tk_lw1",
        startedAt: lastWeekDate,
      },
      // This week (today)
      {
        id: "cv_tw_1",
        workspaceId: WORKSPACE_ID,
        channelKind: "voice",
        threadKey: "tk_tw1",
        startedAt: new Date(),
      },
      {
        id: "cv_tw_2",
        workspaceId: WORKSPACE_ID,
        channelKind: "voice",
        threadKey: "tk_tw2",
        startedAt: new Date(),
      },
    ]);

    const r = await callProcedure<{
      weeklyTrend: { count: number; deltaPct: number | null };
    }>(
      appRouter.home.dashboard,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    expect(r.weeklyTrend.count).toBe(2);
    // deltaPct = (2 - 1) / 1 * 100 = 100
    expect(r.weeklyTrend.deltaPct).toBe(100);
  });
});
