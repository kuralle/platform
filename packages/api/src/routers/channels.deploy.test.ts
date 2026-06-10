import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import * as schema from "@kuralle/db/schema";
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

const WORKSPACE_ID = "org_ch_deploy";
const OTHER_WORKSPACE_ID = "org_ch_other";
const USER_ID = "user_ch_deploy";

describe("channels deploy surface", () => {
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
    await resetSchema(client, OTHER_WORKSPACE_ID);
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      email: `${USER_ID}@test.local`,
    });
    await seedWorkspaceMember(db, {
      workspaceId: OTHER_WORKSPACE_ID,
      userId: USER_ID,
      email: `${USER_ID}.other@test.local`,
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
          id: "s_ch_dep",
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
        META_APP_ID: "app_test",
        META_APP_SECRET: "secret_test",
        META_SYSTEM_USER_TOKEN: "token_test",
        META_VERIFY_TOKEN: "verify_test_token",
        META_PHONE_NUMBER_ID: "",
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
      requestHeaders: new Headers(),
    };
  }

  async function seedEndpoint(
    agentId: string,
    publish = true,
    agentName = "Seed Agent",
  ) {
    if (publish) {
      await callProcedure(
        appRouter.agents.publish,
        {
          workspaceId: WORKSPACE_ID,
          agentId,
          ir: {
            name: agentName,
            description: "",
            instructions: "Hi",
            model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
              pipelineMode: "stt-llm-tts",
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
          },
        },
        ctx(),
      );
    }

    const { connectionId } = await callProcedure<{ connectionId: string }>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Deploy Conn",
      },
      ctx(),
    );

    const { endpointId } = await callProcedure<{ endpointId: string }>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId,
        phoneNumberId: `pn_${crypto.randomUUID().slice(0, 8)}`,
        agentId,
      },
      ctx(),
    );

    return { connectionId, endpointId };
  }

  it("bindAgent updates endpoint binding for a published agent", async () => {
    const { agentId: firstAgentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    await callProcedure(
      appRouter.agents.publish,
      {
        workspaceId: WORKSPACE_ID,
        agentId: firstAgentId,
        ir: {
          name: "Published Agent",
          description: "",
          instructions: "Hi",
          model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
            pipelineMode: "stt-llm-tts",
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
        },
      },
      ctx(),
    );

    const { endpointId } = await seedEndpoint(firstAgentId);

    const { agentId: secondAgentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    await callProcedure(
      appRouter.agents.publish,
      {
        workspaceId: WORKSPACE_ID,
        agentId: secondAgentId,
        ir: {
          name: "Second Agent",
          description: "",
          instructions: "Hi",
          model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
            pipelineMode: "stt-llm-tts",
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
        },
      },
      ctx(),
    );

    const result = await callProcedure<{
      endpointId: string;
      agentId: string;
      agentVersionId: string;
    }>(
      appRouter.channels.bindAgent,
      {
        workspaceId: WORKSPACE_ID,
        endpointId,
        agentId: secondAgentId,
      },
      ctx(),
    );

    expect(result.endpointId).toBe(endpointId);
    expect(result.agentId).toBe(secondAgentId);
    expect(result.agentVersionId).toMatch(/^av_/);
  });

  it("bindAgent rejects unpublished agents with agent-not-published", async () => {
    const { agentId: publishedAgentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );
    const { endpointId } = await seedEndpoint(publishedAgentId);

    const { agentId: draftAgentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    await expect(
      callProcedure(appRouter.channels.bindAgent, {
        workspaceId: WORKSPACE_ID,
        endpointId,
        agentId: draftAgentId,
      }, ctx()),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "agent-not-published",
    });
  });

  it("endpoints.attach rejects unpublished agents with agent-not-published", async () => {
    const { agentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    await expect(seedEndpoint(agentId, false)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "agent-not-published",
    });
  });

  it("bindAgent rejects agents from another workspace", async () => {
    const { agentId: localAgentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    await callProcedure(
      appRouter.agents.publish,
      {
        workspaceId: WORKSPACE_ID,
        agentId: localAgentId,
        ir: {
          name: "Local",
          description: "",
          instructions: "Hi",
          model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
            pipelineMode: "stt-llm-tts",
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
        },
      },
      ctx(),
    );

    const { endpointId } = await seedEndpoint(localAgentId);

    const { agentId: foreignAgentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: OTHER_WORKSPACE_ID },
      ctx(),
    );

    await callProcedure(
      appRouter.agents.publish,
      {
        workspaceId: OTHER_WORKSPACE_ID,
        agentId: foreignAgentId,
        ir: {
          name: "Foreign",
          description: "",
          instructions: "Hi",
          model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
            pipelineMode: "stt-llm-tts",
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
        },
      },
      ctx(),
    );

    await expect(
      callProcedure(appRouter.channels.bindAgent, {
        workspaceId: WORKSPACE_ID,
        endpointId,
        agentId: foreignAgentId,
      }, ctx()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("status returns lastInboundAt after a seeded inbound", async () => {
    const { agentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    const { endpointId } = await seedEndpoint(agentId, true, "Status Agent");
    const inboundAt = new Date("2026-06-10T12:00:00.000Z");

    await db.insert(schema.messagingThreads).values({
      workspaceId: WORKSPACE_ID,
      threadKey: "whatsapp:15551234567",
      channelEndpointId: endpointId,
      lastInboundAt: inboundAt,
      windowExpiresAt: new Date(inboundAt.getTime() + 24 * 60 * 60 * 1000),
    });

    const status = await callProcedure<{
      receivingTraffic: boolean;
      lastInboundAt: Date | null;
      boundAgent: { id: string; name: string; activeVersionNumber: number } | null;
    }>(
      appRouter.channels.status,
      {
        workspaceId: WORKSPACE_ID,
        endpointId,
      },
      ctx(),
    );

    expect(status.receivingTraffic).toBe(true);
    expect(status.lastInboundAt).not.toBeNull();
    expect(status.boundAgent?.id).toBe(agentId);
    expect(status.boundAgent?.name).toBe("Status Agent");
  });

  it("webhookInfo returns the public webhook URL and masked verify token", async () => {
    const info = await callProcedure<{
      url: string;
      verifyTokenHint: string;
      instructions: string;
    }>(
      appRouter.channels.webhookInfo,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    expect(info.url).toBe("http://localhost:3000/webhooks/meta");
    expect(info.verifyTokenHint).toContain("••••");
    expect(info.instructions).toContain("24-hour");
  });
});
