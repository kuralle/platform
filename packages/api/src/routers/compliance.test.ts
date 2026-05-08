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

const WORKSPACE_ID = "org_w1_comp";
const USER_ID = "user_w1_comp";

describe("compliance router", () => {
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

  it("getPosture returns defaults when row missing", async () => {
    const p = await callProcedure<{ workspaceId: string; hipaa: null | string }>(
      appRouter.compliance.getPosture,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );
    expect(p.workspaceId).toBe(WORKSPACE_ID);
    expect(p.hipaa).toBeNull();
  });

  it("updatePosture then getPosture returns stored values", async () => {
    const context = ctx();
    await callProcedure(appRouter.compliance.updatePosture, {
      workspaceId: WORKSPACE_ID,
      hipaa: "active",
      details: { note: "x" },
    }, context);

    const p = await callProcedure<{ hipaa: string | null }>(
      appRouter.compliance.getPosture,
      { workspaceId: WORKSPACE_ID },
      context,
    );
    expect(p.hipaa).toBe("active");
  });
});
