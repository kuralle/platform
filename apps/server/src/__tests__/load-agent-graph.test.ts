import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  seedWorkspace,
  closePool,
} from "@kuralle/core/test-utils";
import type { PoolClient, TestDb } from "@kuralle/core/test-utils";
import {
  agentVersions,
  agents,
  channelConnections,
  channelEndpoints,
  conversations,
  messagingThreads,
} from "@kuralle/db/schema";
import { eq } from "drizzle-orm";
import type { Db } from "@kuralle/db";
import { loadAgentGraphFromDb } from "../durable-objects/deps.js";

const WORKSPACE_ID = "org_l1_load_agent_graph";
const ROOT_AGENT_ID = "ag_l1_router";
const SUB_AGENT_ID = "ag_l1_sub";
const ROOT_VERSION_ID = "av_l1_router_v1";
const SUB_VERSION_ID = "av_l1_sub_v1";
const CONNECTION_ID = "chc_l1_graph";
const ENDPOINT_ID = "ce_l1_graph";
const CONVERSATION_ID = "cv_l1_graph";

const BASE_IR_FIELDS = {
  defaultOptions: {},
  toolAttachments: {},
  workflowAttachments: {},
  integrationTools: {},
  mcpClientAttachments: {},
  kbAttachments: [],
  guardrailGraph: { nodes: [], edges: [] },
  scorerAttachments: {},
  voiceConfig: {
    pipelineMode: "stt-llm-tts",
    ttsModel: "cartesia-sonic-3",
    ttsVoiceId: "v_test",
    sttModel: "deepgram-nova-3-monolingual",
  },
  channelConfig: {},
  complianceConfig: {
    retentionDays: 90,
    redactionPatterns: [],
    disclosureScript: "",
  },
  requestContextSchema: {},
};

const ROOT_IR = {
  ...BASE_IR_FIELDS,
  name: "Router",
  description: "Routes to subagent",
  instructions: "Hand off immediately",
  model: { provider: "test", name: "handoff-root" },
  subagentAttachments: {
    [SUB_AGENT_ID]: {},
  },
};

const SUB_IR = {
  ...BASE_IR_FIELDS,
  name: "Subagent",
  description: "Specialist",
  instructions: "Reply EXACTLY: PONG",
  model: { provider: "test", name: "pong-subagent" },
  subagentAttachments: {},
};

describe("createMessagingDoDeps.loadAgentGraph", () => {
  let db: TestDb;
  let client: PoolClient;

  beforeAll(async () => {
    const created = await createTestDb();
    db = created.db;
    client = created.client;
  });

  beforeEach(async () => {
    await resetSchema(client, WORKSPACE_ID);
    await seedWorkspace(db, { id: WORKSPACE_ID });

    await db.insert(agents).values([
      {
        id: ROOT_AGENT_ID,
        workspaceId: WORKSPACE_ID,
        status: "published",
        activeVersionId: null,
      },
      {
        id: SUB_AGENT_ID,
        workspaceId: WORKSPACE_ID,
        status: "published",
        activeVersionId: null,
      },
    ]);
    await db.insert(agentVersions).values([
      {
        id: ROOT_VERSION_ID,
        agentId: ROOT_AGENT_ID,
        versionNumber: 1,
        snapshot: ROOT_IR,
        publishedAt: new Date(),
      },
      {
        id: SUB_VERSION_ID,
        agentId: SUB_AGENT_ID,
        versionNumber: 1,
        snapshot: SUB_IR,
        publishedAt: new Date(),
      },
    ]);
    await db
      .update(agents)
      .set({ activeVersionId: ROOT_VERSION_ID })
      .where(eq(agents.id, ROOT_AGENT_ID));
    await db
      .update(agents)
      .set({ activeVersionId: SUB_VERSION_ID })
      .where(eq(agents.id, SUB_AGENT_ID));
    await db.insert(channelConnections).values({
      id: CONNECTION_ID,
      workspaceId: WORKSPACE_ID,
      channelKind: "whatsapp",
      provider: "meta-whatsapp-cloud",
      displayName: "Graph test",
      status: "connected",
      config: {},
    });
    await db.insert(channelEndpoints).values({
      id: ENDPOINT_ID,
      workspaceId: WORKSPACE_ID,
      connectionId: CONNECTION_ID,
      channelKind: "whatsapp",
      identifier: "999002",
      attachedAgentId: ROOT_AGENT_ID,
    });
    await db.insert(conversations).values({
      id: CONVERSATION_ID,
      workspaceId: WORKSPACE_ID,
      channelKind: "whatsapp",
      channelEndpointId: ENDPOINT_ID,
      threadKey: "whatsapp:94771113344",
      startedAt: new Date(),
    });
    await db.insert(messagingThreads).values({
      workspaceId: WORKSPACE_ID,
      threadKey: "whatsapp:94771113344",
      channelEndpointId: ENDPOINT_ID,
      lastConversationId: CONVERSATION_ID,
    });
  });

  afterAll(async () => {
    await releaseTestDb(client);
    await closePool();
  });

  it("loads the root agent and subagent attachments transitively", async () => {
    const graph = await loadAgentGraphFromDb(db as unknown as Db, CONVERSATION_ID);

    expect(graph).not.toBeNull();
    expect(graph!.defaultAgentId).toBe(ROOT_AGENT_ID);
    expect(graph!.agents.map((entry) => entry.agentId).sort()).toEqual([
      ROOT_AGENT_ID,
      SUB_AGENT_ID,
    ]);
  });
});
