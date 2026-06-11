/**
 * L1-3 outbound WhatsApp workerd tests: assistant turn output is delivered
 * through OutboundPipeline + windowGuard with a fake WhatsApp client.
 */
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { neon } from "@neondatabase/serverless";
import type { InteractiveMessage, PlatformClient, SendResult } from "@kuralle-agents/messaging";
import type { WindowStore, WindowState } from "@kuralle-agents/messaging";
import { WhatsAppFormatConverter } from "@kuralle-agents/messaging-meta/whatsapp";
import {
  agentVersions,
  agents,
  channelConnections,
  channelEndpoints,
  conversationTurns,
  conversations,
  messagingThreads,
  organization,
  secrets,
} from "@kuralle/db/schema";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@kuralle/db/schema";
import { eq, sql } from "drizzle-orm";
import type { MessagingEvent } from "@kuralle/runtime";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MessagingDO } from "../durable-objects/MessagingDO.js";
import type { ConversationPlatformEvent } from "../durable-objects/delivery-events.js";
import { isDeliveryEvent } from "../durable-objects/delivery-events.js";
import type { MessagingDoEnv, WhatsAppSender } from "../durable-objects/deps.js";
import { createPongTestModel } from "./test-models.js";

const NEON_DATABASE_URL = process.env.DATABASE_URL;
if (!NEON_DATABASE_URL) {
  throw new Error("DATABASE_URL is required for slo-do-outbound-whatsapp tests");
}

const WORKSPACE_ID = "org_l1_do_outbound";
const CONNECTION_ID = "chc_l1_outbound";
const ENDPOINT_ID = "ce_l1_outbound";
const SECRET_ID = "sec_l1_outbound";

type SeedDb = ReturnType<typeof drizzle<typeof schema>>;

type CapturedOutbound =
  | { kind: "text"; to: string; text: string }
  | { kind: "interactive"; to: string; interactive: InteractiveMessage };

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

function createCapturingWhatsAppClient(
  captured: CapturedOutbound[],
): PlatformClient {
  const formatConverter = new WhatsAppFormatConverter();
  return {
    platform: "whatsapp",
    formatConverter,
    sendText: async (to: string, text: string): Promise<SendResult> => {
      captured.push({ kind: "text", to, text });
      return {
        messageId: `wamid.fake-text-${captured.length}`,
        threadId: to,
        timestamp: new Date(),
      };
    },
    sendInteractive: async (
      to: string,
      interactive: InteractiveMessage,
    ): Promise<SendResult> => {
      captured.push({ kind: "interactive", to, interactive });
      return {
        messageId: `wamid.fake-interactive-${captured.length}`,
        threadId: to,
        timestamp: new Date(),
      };
    },
    sendMedia: async (to: string): Promise<SendResult> => ({
      messageId: "wamid.fake-media",
      threadId: to,
      timestamp: new Date(),
    }),
    sendTypingIndicator: async () => {},
    onMessage: () => {},
    onStatus: () => {},
    onReaction: () => {},
    handleWebhook: async () => new Response("OK"),
  };
}

class ClosedWindowStore implements WindowStore {
  async get(): Promise<WindowState> {
    return { open: false, expiresAt: new Date(Date.now() - 60_000) };
  }
  async recordInbound(): Promise<void> {}
  async recordExpiry(): Promise<void> {}
}

async function resetWorkspaceData(db: SeedDb, workspaceId: string): Promise<void> {
  // Settle + retry: the in-memory queue projector can insert usage rows
  // between deletes (same pattern as launch-gate.e2e.test.ts).
  for (let attempt = 0; ; attempt++) {
    await new Promise((r) => setTimeout(r, 150));
    try {
      await resetWorkspaceDataOnce(db, workspaceId);
      return;
    } catch (e) {
      const code =
        (e as { code?: string }).code ??
        ((e as { cause?: { code?: string } }).cause?.code);
      if (attempt >= 2 || code !== "23503") throw e;
    }
  }
}

async function resetWorkspaceDataOnce(db: SeedDb, workspaceId: string): Promise<void> {
  await db.execute(sql`DELETE FROM usage_events WHERE workspace_id = ${workspaceId}`);
  await db.execute(
    sql`DELETE FROM runtime_sessions WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(conversationTurns).where(
    sql`conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(messagingThreads).where(eq(messagingThreads.workspaceId, workspaceId));
  await db.execute(sql`DELETE FROM usage_events WHERE workspace_id = ${workspaceId}`);
  await db.delete(conversations).where(eq(conversations.workspaceId, workspaceId));
  await db.delete(channelEndpoints).where(eq(channelEndpoints.workspaceId, workspaceId));
  await db.delete(channelConnections).where(eq(channelConnections.workspaceId, workspaceId));
  await db.delete(secrets).where(eq(secrets.workspaceId, workspaceId));
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
  await db.insert(secrets).values({
    id: SECRET_ID,
    workspaceId: WORKSPACE_ID,
    name: "meta_credentials",
    ciphertext: Buffer.from(
      JSON.stringify({
        appSecret: "test-app-secret",
        systemUserToken: "test-access-token",
      }),
    ),
    kmsKeyId: "none",
    scope: "workspace",
  });
  await db.insert(channelConnections).values({
    id: CONNECTION_ID,
    workspaceId: WORKSPACE_ID,
    channelKind: "whatsapp",
    provider: "meta-whatsapp-cloud",
    displayName: "Outbound test",
    status: "connected",
    credentialsSecretId: SECRET_ID,
    config: {},
  });
  await db.insert(channelEndpoints).values({
    id: ENDPOINT_ID,
    workspaceId: WORKSPACE_ID,
    connectionId: CONNECTION_ID,
    channelKind: "whatsapp",
    identifier: "999202",
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
    snapshot?: ReturnType<typeof pongIr>;
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
    snapshot: ids.snapshot ?? pongIr("Pong Agent"),
    publishedAt: new Date(),
  });
  await db
    .update(agents)
    .set({ activeVersionId: ids.versionId })
    .where(eq(agents.id, ids.agentId));
  await seedChannelGraph(db, ids.agentId, ids.conversationId, ids.waId);
}

function configureProdDepsEnv(
  collected: ConversationPlatformEvent[],
  captured: CapturedOutbound[],
  resolveModel: ReturnType<typeof createPongTestModel>,
  options?: { closedWindow?: boolean },
) {
  const workerEnv = env as unknown as MessagingDoEnv & {
    MESSAGING_DO: DurableObjectNamespace<MessagingDO>;
  };
  workerEnv.DATABASE_URL = NEON_DATABASE_URL;
  delete workerEnv.__messagingDODeps;
  const fakeSender: WhatsAppSender = {
    client: createCapturingWhatsAppClient(captured),
    phoneNumberId: "999202",
  };
  workerEnv.__messagingDoDepsOverrides = {
    resolveModel,
    emitEvents: async (_conversationId, events) => {
      collected.push(...events);
    },
    createWhatsAppSender: async () => fakeSender,
  };
  return { workerEnv, closedWindow: options?.closedWindow ?? false };
}

describe("L1-3 MessagingDO outbound WhatsApp delivery", () => {
  let db: SeedDb;

  beforeAll(() => {
    db = drizzle(neon(NEON_DATABASE_URL), { schema });
  });

  beforeEach(async () => {
    await resetWorkspaceData(db, WORKSPACE_ID);
    await seedWorkspace(db, WORKSPACE_ID);
  });

  it("delivers the assistant PONG reply when the messaging window is open", async () => {
    const agentId = "ag_l1_out_pong";
    const versionId = "av_l1_out_pong";
    const conversationId = "cv_l1_out_pong";
    const waId = "94772223344";
    await seedSingleAgent(db, { agentId, versionId, conversationId, waId });

    const collected: ConversationPlatformEvent[] = [];
    const captured: CapturedOutbound[] = [];
    const { workerEnv } = configureProdDepsEnv(
      collected,
      captured,
      createPongTestModel(),
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
        text: "ping",
        messageId: "wamid.l1-out-pong-1",
      }),
    });
    expect(response.status).toBe(200);

    const assistantTurn = collected.find(
      (event): event is Extract<MessagingEvent, { kind: "turn.end" }> =>
        event.kind === "turn.end" && event.payload.speaker === "assistant",
    );
    expect(assistantTurn?.payload.fullText).toBe("PONG");

    expect(captured).toEqual([
      expect.objectContaining({
        kind: "text",
        to: waId,
        text: "PONG",
      }),
    ]);

    const sentEvent = collected.find(
      (event) => isDeliveryEvent(event) && event.kind === "delivery.sent",
    );
    expect(sentEvent).toBeDefined();
    if (sentEvent && isDeliveryEvent(sentEvent)) {
      expect(sentEvent.payload.outboundMessageId).toMatch(/^wamid\.fake-text-/);
    }
  });

  it("defers outbound delivery when the messaging window is closed", async () => {
    const agentId = "ag_l1_out_closed";
    const versionId = "av_l1_out_closed";
    const conversationId = "cv_l1_out_closed";
    const waId = "94773334455";
    await seedSingleAgent(db, { agentId, versionId, conversationId, waId });

    const collected: ConversationPlatformEvent[] = [];
    const captured: CapturedOutbound[] = [];
    const { workerEnv } = configureProdDepsEnv(
      collected,
      captured,
      createPongTestModel(),
      { closedWindow: true },
    );
    const doStub = workerEnv.MESSAGING_DO.get(
      workerEnv.MESSAGING_DO.idFromName(`whatsapp:${waId}`),
    );

    await runInDurableObject(doStub, async (instance) => {
      (instance as MessagingDO).setWindowStoreForTests(new ClosedWindowStore());
    });

    const response = await doStub.fetch("https://test.local/internal/inbound", {
      method: "POST",
      body: JSON.stringify({
        waId,
        threadKey: `whatsapp:${waId}`,
        conversationId,
        workspaceId: WORKSPACE_ID,
        channelEndpointId: ENDPOINT_ID,
        text: "ping",
        messageId: "wamid.l1-out-closed-1",
      }),
    });
    expect(response.status).toBe(200);

    expect(captured).toHaveLength(0);
    const deferred = collected.find(
      (event) => isDeliveryEvent(event) && event.kind === "delivery.deferred",
    );
    expect(deferred).toBeDefined();
    if (deferred && isDeliveryEvent(deferred)) {
      expect(deferred.payload.reason).toBe("window-closed");
    }
  });

});
