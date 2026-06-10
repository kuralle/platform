import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
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

const WORKSPACE_ID = "org_ch_mb";
const USER_ID = "user_ch_mb";

const PUBLISH_IR = {
  name: "Channel Test Agent",
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

function strangerSession(): Context["session"] {
  return {
    user: {
      id: "stranger_ch",
      name: "S",
      email: "s@s",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      systemRole: "user",
    },
    session: {
      id: "s_ch_st",
      token: "t2",
      userId: "stranger_ch",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

describe("channels membership guard", () => {
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

  async function createPublishedAgent(workspaceId: string) {
    const { agentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId },
      ctx(memberSession),
    );
    await callProcedure(
      appRouter.agents.publish,
      { workspaceId, agentId, ir: PUBLISH_IR },
      ctx(memberSession),
    );
    return agentId;
  }

  const memberSession: Context["session"] = {
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
      id: "s_ch_m",
      token: "tok",
      userId: USER_ID,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  it("list rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(
        appRouter.channels.list,
        { workspaceId: WORKSPACE_ID, limit: 20 },
        ctx(strangerSession()),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("list allows members", async () => {
    const result = await callProcedure<{ items: unknown[] }>(
      appRouter.channels.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      ctx(memberSession),
    );
    expect(Array.isArray(result.items)).toBe(true);
  });

  it("connect rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(appRouter.channels.connect, {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Test",
      }, ctx(strangerSession())),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("connect allows workspace owners (admin+)", async () => {
    const result = await callProcedure<{ connectionId: string }>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Test",
      },
      ctx(memberSession),
    );
    expect(result.connectionId).toMatch(/^chc_/);
  });

  it("endpoints.list rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(appRouter.channels.endpoints.list, {
        workspaceId: WORKSPACE_ID,
        connectionId: "chc_x",
      }, ctx(strangerSession())),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("endpoints.list allows members", async () => {
    const result = await callProcedure<{ items: unknown[] }>(
      appRouter.channels.endpoints.list,
      {
        workspaceId: WORKSPACE_ID,
        connectionId: "chc_x",
      },
      ctx(memberSession),
    );
    expect(result.items).toEqual([]);
  });

  it("endpoints.listByKind rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(appRouter.channels.endpoints.listByKind, {
        workspaceId: WORKSPACE_ID,
        kind: "whatsapp",
      }, ctx(strangerSession())),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("endpoints.listByKind allows members", async () => {
    const result = await callProcedure<{ items: unknown[] }>(
      appRouter.channels.endpoints.listByKind,
      {
        workspaceId: WORKSPACE_ID,
        kind: "whatsapp",
      },
      ctx(memberSession),
    );
    expect(result.items).toEqual([]);
  });

  it("endpoints.attach rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(appRouter.channels.endpoints.attach, {
        workspaceId: WORKSPACE_ID,
        connectionId: "chc_x",
        phoneNumberId: "pn_1",
        agentId: "ag_test",
      }, ctx(strangerSession())),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("endpoints.attach allows members", async () => {
    const agentId = await createPublishedAgent(WORKSPACE_ID);

    const { connectionId } = await callProcedure<{ connectionId: string }>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Conn",
      },
      ctx(memberSession),
    );

    const result = await callProcedure<{ endpointId: string }>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId,
        phoneNumberId: "pn_attach",
        agentId,
      },
      ctx(memberSession),
    );
    expect(result.endpointId).toMatch(/^che_/);
  });

  it("endpoints.detach rejects non-members with FORBIDDEN", async () => {
    await expect(
      callProcedure(appRouter.channels.endpoints.detach, {
        workspaceId: WORKSPACE_ID,
        endpointId: "che_x",
      }, ctx(strangerSession())),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("endpoints.detach allows members", async () => {
    const agentId = await createPublishedAgent(WORKSPACE_ID);

    const { connectionId } = await callProcedure<{ connectionId: string }>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Conn2",
      },
      ctx(memberSession),
    );

    const { endpointId } = await callProcedure<{ endpointId: string }>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId,
        phoneNumberId: "pn_detach",
        agentId,
      },
      ctx(memberSession),
    );

    const result = await callProcedure<{ released: boolean }>(
      appRouter.channels.endpoints.detach,
      {
        workspaceId: WORKSPACE_ID,
        endpointId,
      },
      ctx(memberSession),
    );
    expect(result.released).toBe(true);
  });
});
