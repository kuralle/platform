/**
 * L1-1 keystone workerd tests: production MessagingDO deps factory drives the
 * real Kuralle runtime loop with DB-backed agent graph loading.
 */
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import {
  agentVersions,
  agents,
  channelConnections,
  channelEndpoints,
  conversations,
  messagingThreads,
  organization,
} from "@kuralle/db/schema";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@kuralle/db/schema";
import { eq, sql } from "drizzle-orm";
import type { MessagingEvent } from "@kuralle/runtime";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MessagingDO } from "../durable-objects/MessagingDO.js";
import type { MessagingDoEnv } from "../durable-objects/deps.js";
import {
  createHandoffTestModel,
  createPongTestModel,
} from "./test-models.js";

const NEON_DATABASE_URL = process.env.DATABASE_URL;
if (!NEON_DATABASE_URL) {
  throw new Error("DATABASE_URL is required for slo-do-assistant-turn tests");
}

const WORKSPACE_ID = "org_l1_do_assistant";
const CONNECTION_ID = "chc_l1_do";
const ENDPOINT_ID = "ce_l1_do";

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

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

function pongIr(name: string, modelName = "pong-model") {
  return {
    ...BASE_IR_FIELDS,
    name,
    description: name,
    instructions: "Reply EXACTLY: PONG",
    model: { provider: "test", name: modelName },
    subagentAttachments: {},
  };
}

async function resetWorkspaceData(db: SeedDb, workspaceId: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM runtime_sessions WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(messagingThreads).where(eq(messagingThreads.workspaceId, workspaceId));
  await db.delete(conversations).where(eq(conversations.workspaceId, workspaceId));
  await db.delete(channelEndpoints).where(eq(channelEndpoints.workspaceId, workspaceId));
  await db.delete(channelConnections).where(eq(channelConnections.workspaceId, workspaceId));
  // FK order: agents.activeVersionId references agent_versions — detach first.
  await db.execute(
    sql`UPDATE agents SET active_version_id = NULL WHERE workspace_id = ${workspaceId}`,
  );
  await db.delete(agentVersions).where(
    sql`agent_id IN (SELECT id FROM agents WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(agents).where(eq(agents.workspaceId, workspaceId));
}

async function seedWorkspace(db: SeedDb, workspaceId: string): Promise<void> {
  await db
    .insert(organization)
    .values({
      id: workspaceId,
      name: `Test Workspace ${workspaceId}`,
      slug: `test-${workspaceId}`,
      environment: "sandbox",
      region: "us-east-1",
      complianceMode: "none",
      isPersonal: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

async function seedChannelGraph(
  db: SeedDb,
  attachedAgentId: string,
  conversationId: string,
  waId: string,
) {
  await db.insert(channelConnections).values({
    id: CONNECTION_ID,
    workspaceId: WORKSPACE_ID,
    channelKind: "whatsapp",
    provider: "meta-whatsapp-cloud",
    displayName: "DO assistant test",
    status: "connected",
    config: {},
  });
  await db.insert(channelEndpoints).values({
    id: ENDPOINT_ID,
    workspaceId: WORKSPACE_ID,
    connectionId: CONNECTION_ID,
    channelKind: "whatsapp",
    identifier: "999101",
    attachedAgentId,
  });
  const threadKey = `whatsapp:${waId}`;
  await db.insert(conversations).values({
    id: conversationId,
    workspaceId: WORKSPACE_ID,
    channelKind: "whatsapp",
    channelEndpointId: ENDPOINT_ID,
    threadKey,
    startedAt: new Date(),
  });
  await db.insert(messagingThreads).values({
    workspaceId: WORKSPACE_ID,
    threadKey,
    channelEndpointId: ENDPOINT_ID,
    lastConversationId: conversationId,
  });
}

async function seedSingleAgent(
  db: SeedDb,
  ids: {
    agentId: string;
    versionId: string;
    conversationId: string;
    waId: string;
  },
) {
  await db.insert(agents).values({
    id: ids.agentId,
    workspaceId: WORKSPACE_ID,
    status: "published",
    activeVersionId: null,
  });
  await db.insert(agentVersions).values({
    id: ids.versionId,
    agentId: ids.agentId,
    versionNumber: 1,
    snapshot: pongIr("Pong Agent"),
    publishedAt: new Date(),
  });
  await db
    .update(agents)
    .set({ activeVersionId: ids.versionId })
    .where(eq(agents.id, ids.agentId));
  await seedChannelGraph(db, ids.agentId, ids.conversationId, ids.waId);
}

function configureProdDepsEnv(
  collected: MessagingEvent[],
  resolveModel: ReturnType<typeof createPongTestModel>,
) {
  const workerEnv = env as unknown as MessagingDoEnv & {
    MESSAGING_DO: DurableObjectNamespace<MessagingDO>;
  };
  workerEnv.DATABASE_URL = NEON_DATABASE_URL;
  delete workerEnv.__messagingDODeps;
  workerEnv.__messagingDoDepsOverrides = {
    resolveModel,
    emitEvents: async (_conversationId, events) => {
      collected.push(...events);
    },
  };
  return workerEnv;
}

describe("L1-1 MessagingDO assistant turn via production deps", () => {
  let db: SeedDb;

  beforeAll(() => {
    db = drizzle(neon(NEON_DATABASE_URL), { schema });
  });

  beforeEach(async () => {
    await resetWorkspaceData(db, WORKSPACE_ID);
    await seedWorkspace(db, WORKSPACE_ID);
  });

  it("runs the real runtime loop and emits an assistant turn with PONG", async () => {
    const agentId = "ag_l1_do_pong";
    const versionId = "av_l1_do_pong";
    const conversationId = "cv_l1_do_pong";
    const waId = "94771114455";
    await seedSingleAgent(db, { agentId, versionId, conversationId, waId });

    const collected: MessagingEvent[] = [];
    const workerEnv = configureProdDepsEnv(collected, createPongTestModel());
    const doStub = workerEnv.MESSAGING_DO.get(
      workerEnv.MESSAGING_DO.idFromName(`whatsapp:${waId}`),
    );

    const response = await doStub.fetch("https://test.local/internal/inbound", {
      method: "POST",
      body: JSON.stringify({
        waId,
        threadKey: `whatsapp:${waId}`,
        conversationId,
        workspaceId: WORKSPACE_ID,
        channelEndpointId: ENDPOINT_ID,
        text: "ping",
        messageId: "wamid.l1-pong-1",
      }),
    });
    expect(response.status).toBe(200);
    if (response.status !== 200) {
      throw new Error(`inbound failed: ${response.status} ${await response.text()}`);
    }

    const assistantTurn = collected.find(
      (event): event is Extract<MessagingEvent, { kind: "turn.end" }> =>
        event.kind === "turn.end" && event.payload.speaker === "assistant",
    );
    expect(assistantTurn?.payload.fullText).toBe("PONG");

    await runInDurableObject(doStub, async (instance) => {
      const messages =
        (
          instance as MessagingDO & {
            messages?: Array<{ role: string; parts?: Array<{ text?: string }> }>;
          }
        ).messages ?? [];
      const assistantText = messages
        .filter((message) => message.role === "assistant")
        .flatMap((message) => message.parts ?? [])
        .map((part) => part.text ?? "")
        .join("");
      expect(assistantText).toContain("PONG");
    });
  });

  it("handoffs to a subagent and persists the subagent PONG reply", async () => {
    const rootAgentId = "ag_l1_do_root";
    const subAgentId = "ag_l1_do_sub";
    const rootVersionId = "av_l1_do_root";
    const subVersionId = "av_l1_do_sub";
    const conversationId = "cv_l1_do_handoff";
    const waId = "94771115566";

    await db.insert(agents).values([
      {
        id: rootAgentId,
        workspaceId: WORKSPACE_ID,
        status: "published",
        activeVersionId: null,
      },
      {
        id: subAgentId,
        workspaceId: WORKSPACE_ID,
        status: "published",
        activeVersionId: null,
      },
    ]);
    await db.insert(agentVersions).values([
      {
        id: rootVersionId,
        agentId: rootAgentId,
        versionNumber: 1,
        snapshot: {
          ...BASE_IR_FIELDS,
          name: "Router",
          description: "Router",
          instructions: "Hand off to the specialist immediately",
          model: { provider: "test", name: "handoff-root" },
          subagentAttachments: {
            [subAgentId]: {},
          },
        },
        publishedAt: new Date(),
      },
      {
        id: subVersionId,
        agentId: subAgentId,
        versionNumber: 1,
        snapshot: pongIr("Subagent", "pong-subagent"),
        publishedAt: new Date(),
      },
    ]);
    await db
      .update(agents)
      .set({ activeVersionId: rootVersionId })
      .where(eq(agents.id, rootAgentId));
    await db
      .update(agents)
      .set({ activeVersionId: subVersionId })
      .where(eq(agents.id, subAgentId));
    await seedChannelGraph(db, rootAgentId, conversationId, waId);

    const collected: MessagingEvent[] = [];
    const workerEnv = configureProdDepsEnv(
      collected,
      createHandoffTestModel(subAgentId),
    );
    const doStub = workerEnv.MESSAGING_DO.get(
      workerEnv.MESSAGING_DO.idFromName(`whatsapp:${waId}`),
    );

    const response = await doStub.fetch("https://test.local/internal/inbound", {
      method: "POST",
      body: JSON.stringify({
        waId,
        threadKey: `whatsapp:${waId}`,
        conversationId,
        workspaceId: WORKSPACE_ID,
        channelEndpointId: ENDPOINT_ID,
        text: "route me",
        messageId: "wamid.l1-handoff-1",
      }),
    });
    expect(response.status).toBe(200);
    if (response.status !== 200) {
      throw new Error(`inbound failed: ${response.status} ${await response.text()}`);
    }

    const assistantTurn = collected.find(
      (event): event is Extract<MessagingEvent, { kind: "turn.end" }> =>
        event.kind === "turn.end" && event.payload.speaker === "assistant",
    );
    expect(assistantTurn?.payload.fullText).toBe("PONG");
  });
});
