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
import { loadAgentIrFromDb } from "../durable-objects/deps.js";

const WORKSPACE_ID = "org_l1_load_agent_ir";
const ROOT_AGENT_ID = "ag_l1_root";
const VERSION_ID = "av_l1_root_v1";
const CONNECTION_ID = "chc_l1";
const ENDPOINT_ID = "ce_l1";
const CONVERSATION_ID = "cv_l1_load_agent_ir";

const MINIMAL_IR = {
  name: "Pong Agent",
  description: "Replies PONG",
  instructions: "Reply EXACTLY: PONG",
  model: { provider: "openai", name: "gpt-4o-mini" },
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

async function seedPublishedAgent(db: TestDb, activeVersionId: string | null) {
  await db.insert(agents).values({
    id: ROOT_AGENT_ID,
    workspaceId: WORKSPACE_ID,
    status: "published",
    activeVersionId: null,
  });
  if (activeVersionId) {
    await db.insert(agentVersions).values({
      id: activeVersionId,
      agentId: ROOT_AGENT_ID,
      versionNumber: 1,
      snapshot: MINIMAL_IR,
      publishedAt: new Date(),
    });
    await db
      .update(agents)
      .set({ activeVersionId })
      .where(eq(agents.id, ROOT_AGENT_ID));
  }
}

async function seedConversationGraph(db: TestDb, endpointAgentId: string | null) {
  await db.insert(channelConnections).values({
    id: CONNECTION_ID,
    workspaceId: WORKSPACE_ID,
    channelKind: "whatsapp",
    provider: "meta-whatsapp-cloud",
    displayName: "L1 test",
    status: "connected",
    config: {},
  });
  await db.insert(channelEndpoints).values({
    id: ENDPOINT_ID,
    workspaceId: WORKSPACE_ID,
    connectionId: CONNECTION_ID,
    channelKind: "whatsapp",
    identifier: "999001",
    attachedAgentId: endpointAgentId,
  });
  await db.insert(conversations).values({
    id: CONVERSATION_ID,
    workspaceId: WORKSPACE_ID,
    channelKind: "whatsapp",
    channelEndpointId: ENDPOINT_ID,
    threadKey: "whatsapp:94771112233",
    startedAt: new Date(),
  });
  await db.insert(messagingThreads).values({
    workspaceId: WORKSPACE_ID,
    threadKey: "whatsapp:94771112233",
    channelEndpointId: ENDPOINT_ID,
    lastConversationId: CONVERSATION_ID,
  });
}

describe("createMessagingDoDeps.loadAgentIr", () => {
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
  });

  afterAll(async () => {
    await releaseTestDb(client);
    await closePool();
  });

  it("loads thread → endpoint → agent → active version snapshot", async () => {
    await seedPublishedAgent(db, VERSION_ID);
    await seedConversationGraph(db, ROOT_AGENT_ID);

    const resolved = await loadAgentIrFromDb(db as unknown as Db, CONVERSATION_ID);

    expect(resolved).toEqual({
      agentId: ROOT_AGENT_ID,
      ir: MINIMAL_IR,
    });
  });

  it("returns null when the conversation has no channel endpoint", async () => {
    await seedPublishedAgent(db, VERSION_ID);
    await db.insert(conversations).values({
      id: CONVERSATION_ID,
      workspaceId: WORKSPACE_ID,
      channelKind: "whatsapp",
      channelEndpointId: null,
      threadKey: "whatsapp:94771112233",
      startedAt: new Date(),
    });

    await expect(loadAgentIrFromDb(db as unknown as Db, CONVERSATION_ID)).resolves.toBeNull();
  });

  it("returns null when the agent has no active version", async () => {
    await seedPublishedAgent(db, null);
    await seedConversationGraph(db, ROOT_AGENT_ID);

    await expect(loadAgentIrFromDb(db as unknown as Db, CONVERSATION_ID)).resolves.toBeNull();
  });

  it("returns null for an unknown conversation id", async () => {
    await expect(loadAgentIrFromDb(db as unknown as Db, "cv_missing")).resolves.toBeNull();
  });
});
