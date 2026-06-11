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
const VIEWER_ID = "user_w1_viewer";

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
      role: "admin",
    });
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId: VIEWER_ID,
      email: `${VIEWER_ID}@test.local`,
      role: "viewer",
    });
  });

  function ctx(userId = USER_ID): Context {
    return {
      auth: null,
      session: {
        user: {
          id: userId,
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
          userId,
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

  it("get returns embedKey null and serverUrl before enable", async () => {
    const first = await callProcedure<{
      embedKey: string | null;
      serverUrl: string;
      modality: string;
    }>(appRouter.widget.get, { workspaceId: WORKSPACE_ID }, ctx());
    expect(first.embedKey).toBeNull();
    expect(first.serverUrl).toBe("http://localhost:3000");
    expect(first.modality).toBe("both");
  });

  it("enable is idempotent and get returns embedKey after enable", async () => {
    const context = ctx();
    const first = await callProcedure<{ embedKey: string; endpointId: string }>(
      appRouter.widget.enable,
      { workspaceId: WORKSPACE_ID },
      context,
    );
    expect(first.embedKey).toMatch(/^wk_[A-Za-z0-9]{24}$/);

    const second = await callProcedure<{ embedKey: string; endpointId: string }>(
      appRouter.widget.enable,
      { workspaceId: WORKSPACE_ID },
      context,
    );
    expect(second.embedKey).toBe(first.embedKey);
    expect(second.endpointId).toBe(first.endpointId);

    const got = await callProcedure<{ embedKey: string | null; serverUrl: string }>(
      appRouter.widget.get,
      { workspaceId: WORKSPACE_ID },
      context,
    );
    expect(got.embedKey).toBe(first.embedKey);
    expect(got.serverUrl).toBe("http://localhost:3000");
  });

  it("update creates config row with embedKey and serverUrl", async () => {
    const context = ctx();
    await callProcedure(appRouter.widget.enable, { workspaceId: WORKSPACE_ID }, context);

    const w = await callProcedure<{
      modality: string;
      feedbackEnabled: boolean | null;
      embedKey: string | null;
      serverUrl: string;
    }>(
      appRouter.widget.update,
      { workspaceId: WORKSPACE_ID, modality: "voice", feedbackEnabled: true },
      context,
    );
    expect(w.modality).toBe("voice");
    expect(w.feedbackEnabled).toBe(true);
    expect(w.embedKey).toMatch(/^wk_/);
    expect(w.serverUrl).toBe("http://localhost:3000");
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

  it("viewer cannot enable widget", async () => {
    await expect(
      callProcedure(
        appRouter.widget.enable,
        { workspaceId: WORKSPACE_ID },
        ctx(VIEWER_ID),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
