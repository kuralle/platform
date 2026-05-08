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

const WORKSPACE_ID = "org_w1_bat";
const USER_ID = "user_w1_bat";

describe("batches router", () => {
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

  it("create → list → get", async () => {
    const context = ctx();
    const { batchId } = await callProcedure<{ batchId: string }>(
      appRouter.batches.create,
      {
        workspaceId: WORKSPACE_ID,
        name: "Outreach",
        channelKind: "voice",
        vertical: "home-services",
        totalRecipients: 100,
      },
      context,
    );

    const listed = await callProcedure<{ items: { id: string }[] }>(
      appRouter.batches.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      context,
    );
    expect(listed.items.some((b) => b.id === batchId)).toBe(true);

    const got = await callProcedure<{ batch: { id: string }; recipientsSummary: { total: number } }>(
      appRouter.batches.get,
      { workspaceId: WORKSPACE_ID, batchId },
      context,
    );
    expect(got.batch.id).toBe(batchId);
    expect(got.recipientsSummary.total).toBe(0);
  });

  it("get returns NOT_FOUND for other workspace scope", async () => {
    const context = ctx();
    const { batchId } = await callProcedure<{ batchId: string }>(
      appRouter.batches.create,
      {
        workspaceId: WORKSPACE_ID,
        name: "B",
        channelKind: "voice",
        vertical: "appointment-services",
        totalRecipients: 1,
      },
      context,
    );

    await expect(
      callProcedure(
        appRouter.batches.get,
        { workspaceId: "org_other_workspace", batchId },
        {
          ...context,
          session: {
            ...context.session!,
            user: { ...context.session!.user, id: "someone_else" },
            session: { ...context.session!.session, userId: "someone_else" },
          },
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
