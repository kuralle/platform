import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
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
import { organization } from "@kuralle/db/schema";
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_w1_ws";
const USER_ID = "user_w1_ws";

describe("workspace router", () => {
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

  it("get returns organization fields", async () => {
    const w = await callProcedure<{ workspaceId: string; slug: string }>(
      appRouter.workspace.get,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );
    expect(w.workspaceId).toBe(WORKSPACE_ID);
    expect(w.slug).toContain(WORKSPACE_ID);
  });

  it("update sets vertical via Drizzle without touching better-auth", async () => {
    const context = ctx();
    const updated = await callProcedure<{ vertical: string | null }>(
      appRouter.workspace.update,
      { workspaceId: WORKSPACE_ID, vertical: "legal" },
      context,
    );
    expect(updated.vertical).toBe("legal");

    const rows = await db
      .select({ vertical: organization.vertical })
      .from(organization)
      .where(eq(organization.id, WORKSPACE_ID))
      .limit(1);
    expect(rows[0]?.vertical).toBe("legal");
  });

  it("rejects non-members", async () => {
    const context = ctx();
    await expect(
      callProcedure(appRouter.workspace.get, { workspaceId: WORKSPACE_ID }, {
        ...context,
        session: {
          user: {
            id: "nope",
            name: "N",
            email: "n@n",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            image: null,
            systemRole: "user",
          },
          session: {
            id: "s2",
            token: "t2",
            userId: "nope",
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
