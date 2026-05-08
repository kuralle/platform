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

const WORKSPACE_ID = "org_w1_wid";
const USER_ID = "user_w1_wid";

describe("widget router", () => {
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

  it("get returns null then update creates row", async () => {
    const context = ctx();
    const first = await callProcedure(
      appRouter.widget.get,
      { workspaceId: WORKSPACE_ID },
      context,
    );
    expect(first).toBeNull();

    const w = await callProcedure<{ modality: string; feedbackEnabled: boolean | null }>(
      appRouter.widget.update,
      { workspaceId: WORKSPACE_ID, modality: "voice", feedbackEnabled: true },
      context,
    );
    expect(w.modality).toBe("voice");
    expect(w.feedbackEnabled).toBe(true);
  });

  it("rejects non-members on update", async () => {
    await expect(
      callProcedure(
        appRouter.widget.update,
        { workspaceId: WORKSPACE_ID, modality: "chat" },
        {
          ...ctx(),
          session: {
            user: {
              id: "x",
              name: "X",
              email: "x@x",
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              image: null,
              systemRole: "user",
            },
            session: {
              id: "sx",
              token: "tx",
              userId: "x",
              expiresAt: new Date(Date.now() + 60_000),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
