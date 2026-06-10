import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { conversations } from "@kuralle/db/schema";
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
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_cv_pg";
const USER_ID = "user_cv_pg";

describe("conversations.list pagination", () => {
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

    await db.insert(conversations).values([
      {
        id: "cv_pg_1",
        workspaceId: WORKSPACE_ID,
        channelKind: "whatsapp",
        threadKey: "whatsapp:pg:1",
        startedAt: new Date("2026-01-01T00:00:03.000Z"),
      },
      {
        id: "cv_pg_2",
        workspaceId: WORKSPACE_ID,
        channelKind: "whatsapp",
        threadKey: "whatsapp:pg:2",
        startedAt: new Date("2026-01-01T00:00:02.000Z"),
      },
      {
        id: "cv_pg_3",
        workspaceId: WORKSPACE_ID,
        channelKind: "whatsapp",
        threadKey: "whatsapp:pg:3",
        startedAt: new Date("2026-01-01T00:00:01.000Z"),
      },
    ]);
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

  it("returns two pages via cursor", async () => {
    const page1 = await callProcedure<{
      items: { id: string }[];
      cursor: string | null;
    }>(
      appRouter.conversations.list,
      { workspaceId: WORKSPACE_ID, limit: 2 },
      ctx(),
    );

    expect(page1.items.map((row) => row.id)).toEqual(["cv_pg_1", "cv_pg_2"]);
    expect(page1.cursor).toBeTruthy();

    const page2 = await callProcedure<{
      items: { id: string }[];
      cursor: string | null;
    }>(
      appRouter.conversations.list,
      {
        workspaceId: WORKSPACE_ID,
        limit: 2,
        cursor: page1.cursor,
      },
      ctx(),
    );

    expect(page2.items.map((row) => row.id)).toEqual(["cv_pg_3"]);
    expect(page2.cursor).toBeNull();
  });
});
