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

const WORKSPACE_ID = "org_w1_kb";
const USER_ID = "user_w1_kb";

describe("kb router", () => {
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

  function ctx(session: Context["session"]): Context {
    return {
      auth: null,
      session,
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

  it("create → list → get → delete round-trip", async () => {
    const context = ctx({
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
    });

    const empty = await callProcedure<{ items: unknown[]; cursor: null | string }>(
      appRouter.kb.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      context,
    );
    expect(empty.items).toHaveLength(0);

    const { docId } = await callProcedure<{ docId: string }>(
      appRouter.kb.create,
      {
        workspaceId: WORKSPACE_ID,
        name: "Doc",
        sourceType: "file",
        sizeBytes: 10,
      },
      context,
    );

    const listed = await callProcedure<{ items: { id: string }[] }>(
      appRouter.kb.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      context,
    );
    expect(listed.items.some((d) => d.id === docId)).toBe(true);

    const got = await callProcedure<{ id: string; name: string }>(
      appRouter.kb.get,
      { workspaceId: WORKSPACE_ID, docId },
      context,
    );
    expect(got.name).toBe("Doc");

    await callProcedure(appRouter.kb.delete, { workspaceId: WORKSPACE_ID, docId }, context);

    await expect(
      callProcedure(appRouter.kb.get, { workspaceId: WORKSPACE_ID, docId }, context),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects when caller is not a workspace member", async () => {
    const context = ctx({
      user: {
        id: "other_user",
        name: "O",
        email: "o@o",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
        systemRole: "user",
      },
      session: {
        id: "s2",
        token: "tok2",
        userId: "other_user",
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await expect(
      callProcedure(appRouter.kb.list, { workspaceId: WORKSPACE_ID, limit: 20 }, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when session has no user (membership guard)", async () => {
    const context = ctx(null);
    await expect(
      callProcedure(appRouter.kb.list, { workspaceId: WORKSPACE_ID, limit: 20 }, context),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
