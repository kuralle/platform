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
import { onboardingStates, organization } from "@kuralle/db/schema";
import type { Context } from "../context";
import { callProcedure } from "./test-call";
import { signUpWithCookieHeaders } from "../test-helpers/auth-test-helpers";
import type { InferSelectModel } from "drizzle-orm";
import { session as sessionTable } from "@kuralle/db/schema";

const WORKSPACE_ID = "org_w1_onb";

function testSessionContext(
  userId: string,
  email: string,
  row: InferSelectModel<typeof sessionTable>,
): NonNullable<Context["session"]> {
  return {
    user: {
      id: userId,
      name: "U",
      email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      systemRole: "user",
    },
    session: {
      id: row.id,
      token: row.token,
      userId: row.userId,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      activeOrganizationId: row.activeOrganizationId,
    },
  };
}

describe("onboarding router", () => {
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
  });

  function baseContext(session: Context["session"], requestHeaders: Headers): Context {
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
      requestHeaders,
    };
  }

  it("advance creates state", async () => {
    const { userId, requestHeaders, session: sessRow } = await signUpWithCookieHeaders(db);
    const email = `${userId}@test.local`;
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId,
      email,
    });

    const context = baseContext(testSessionContext(userId, email, sessRow), requestHeaders);

    const st = await callProcedure<{ currentStep: string }>(
      appRouter.onboarding.advance,
      { workspaceId: WORKSPACE_ID, step: "name" },
      context,
    );
    expect(st.currentStep).toBe("name");
  });

  it("complete updates org and onboarding row (better-auth + tx)", async () => {
    const { userId, requestHeaders, session: sessRow } = await signUpWithCookieHeaders(db);
    const email = `${userId}@test.local`;
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId,
      email,
    });

    const context = baseContext(testSessionContext(userId, email, sessRow), requestHeaders);

    const out = await callProcedure<{ organizationUpdated: true }>(
      appRouter.onboarding.complete,
      {
        workspaceId: WORKSPACE_ID,
        vertical: "retail",
        name: "Renamed Workspace",
      },
      context,
    );
    expect(out.organizationUpdated).toBe(true);

    const [orgRow] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, WORKSPACE_ID))
      .limit(1);
    expect(orgRow?.vertical).toBe("retail");
    expect(orgRow?.name).toBe("Renamed Workspace");

    const [ob] = await db
      .select()
      .from(onboardingStates)
      .where(eq(onboardingStates.workspaceId, WORKSPACE_ID))
      .limit(1);
    expect(ob?.currentStep).toBe("done");
    expect(ob?.vertical).toBe("retail");
  });

  it("rejects complete for non-member", async () => {
    const { userId, requestHeaders, session: sessRow } = await signUpWithCookieHeaders(db);
    const context = baseContext(testSessionContext(userId, `${userId}@t`, sessRow), requestHeaders);

    await expect(
      callProcedure(appRouter.onboarding.complete, {
        workspaceId: WORKSPACE_ID,
        vertical: "x",
        name: "N",
      }, context),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
