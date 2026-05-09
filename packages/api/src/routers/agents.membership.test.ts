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
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_ag_mb";
const USER_ID = "user_ag_mb";

describe("agents membership guard", () => {
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

  it("list rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(
        appRouter.agents.list,
        { workspaceId: WORKSPACE_ID, limit: 20 },
        {
          ...ctx(),
          session: {
            user: {
              id: "stranger",
              name: "S",
              email: "s@s",
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              image: null,
              systemRole: "user",
            },
            session: {
              id: "s2",
              token: "t2",
              userId: "stranger",
              expiresAt: new Date(Date.now() + 60_000),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("list allows members", async () => {
    const result = await callProcedure<{ items: unknown[] }>(
      appRouter.agents.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      ctx(),
    );
    expect(Array.isArray(result.items)).toBe(true);
  });
});
