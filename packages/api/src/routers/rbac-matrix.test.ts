import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

vi.mock("@kuralle/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@kuralle/runtime")>();
  return {
    ...actual,
    createMetaWhatsAppClient: vi.fn(() => ({})),
    listPhoneNumbers: vi.fn(async () => []),
    subscribeApp: vi.fn(async () => {}),
    unsubscribeApp: vi.fn(async () => {}),
  };
});

const WORKSPACE_ID = "org_rbac_mx";
const VIEWER_ID = "user_rbac_viewer";
const MEMBER_ID = "user_rbac_member";
const ADMIN_ID = "user_rbac_admin";

const PUBLISH_IR = {
  name: "RBAC Agent",
  description: "",
  instructions: "Hi",
  model: { provider: "openai" as const, name: "gpt-4o", temperature: 0.4 },
  defaultOptions: {},
  toolAttachments: {},
  workflowAttachments: {},
  subagentAttachments: {},
  integrationTools: {},
  mcpClientAttachments: {},
  kbAttachments: [],
  guardrailGraph: { nodes: [], edges: [] },
  scorerAttachments: {},
  voiceConfig: {
    pipelineMode: "stt-llm-tts" as const,
    ttsModel: "cartesia-sonic-3",
    ttsVoiceId: "v_aurora",
    sttModel: "deepgram-nova-3-monolingual",
    sttLanguage: "en",
  },
  channelConfig: {},
  complianceConfig: {
    retentionDays: 90,
    redactionPatterns: [],
    disclosureScript: "",
  },
  requestContextSchema: {},
};

describe("rbac matrix", () => {
  let db: TestDb;
  let client: PoolClient;
  let kvStore: MemoryKvStore;
  let adminAgentId: string;

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
      userId: VIEWER_ID,
      email: `${VIEWER_ID}@test.local`,
      role: "viewer",
    });
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId: MEMBER_ID,
      email: `${MEMBER_ID}@test.local`,
      role: "member",
    });
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId: ADMIN_ID,
      email: `${ADMIN_ID}@test.local`,
      role: "admin",
    });

    const created = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(ADMIN_ID),
    );
    adminAgentId = created.agentId;
  });

  function ctx(userId: string): Context {
    return {
      auth: null,
      session: {
        user: {
          id: userId,
          name: "T",
          email: `${userId}@test`,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
          systemRole: "user",
        },
        session: {
          id: `s_${userId}`,
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
        META_APP_ID: "app_test",
        META_APP_SECRET: "secret_test",
        META_SYSTEM_USER_TOKEN: "token_test",
        META_VERIFY_TOKEN: "",
        META_PHONE_NUMBER_ID: "",
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
      requestHeaders: new Headers(),
    };
  }

  it("viewer is blocked from agents.publish", async () => {
    await expect(
      callProcedure(appRouter.agents.publish, {
        workspaceId: WORKSPACE_ID,
        agentId: adminAgentId,
        ir: PUBLISH_IR,
      }, ctx(VIEWER_ID)),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Requires workspace role: admin",
    });
  });

  it("member is blocked from channels.connect", async () => {
    await expect(
      callProcedure(appRouter.channels.connect, {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Test",
      }, ctx(MEMBER_ID)),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Requires workspace role: admin",
    });
  });

  it("admin is allowed to channels.connect", async () => {
    const result = await callProcedure<{ connectionId: string }>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Test",
      },
      ctx(ADMIN_ID),
    );
    expect(result.connectionId).toMatch(/^chc_/);
  });
});
