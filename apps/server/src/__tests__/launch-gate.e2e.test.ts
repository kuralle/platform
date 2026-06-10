/**
 * L4-1 launch gate: full product loop via API setup, signed Meta webhooks,
 * real MessagingDO + projector + outbound capture. Stub model only — no live keys.
 */
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { createDb } from "@kuralle/db";
import * as schema from "@kuralle/db/schema";
import {
  agentVersions,
  agents,
  channelConnections,
  channelEndpoints,
  conversationTurns,
  conversations,
  member,
  messagingThreads,
  organization,
  secrets,
  user,
} from "@kuralle/db/schema";
import { appRouter } from "@kuralle/api/routers/index";
import type { Context } from "@kuralle/api/context";
import { MemoryKvStore } from "@kuralle/platform/memory";
import type { InteractiveMessage, PlatformClient, SendResult } from "@kuralle-agents/messaging";
import { WhatsAppFormatConverter } from "@kuralle-agents/messaging-meta/whatsapp";
import {
  messagingEventSchema,
  projectConversationEvent,
} from "@kuralle/runtime";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { MessagingDO } from "../durable-objects/MessagingDO.js";
import type { ConversationPlatformEvent } from "../durable-objects/delivery-events.js";
import { isDeliveryEvent } from "../durable-objects/delivery-events.js";
import type { MessagingDoEnv, WhatsAppSender } from "../durable-objects/deps.js";
import { createMetaWebhookApp } from "../webhooks/meta.js";
import {
  metaWebhookButtonReply,
  metaWebhookInbound,
} from "../webhooks/meta-fixtures.js";
import { createLaunchGateTestModel } from "./test-models.js";
import { makeTestContext } from "./test-context.js";

vi.mock("@kuralle/runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@kuralle/runtime")>();
  return {
    ...original,
    createMetaWhatsAppClient: vi.fn(() => ({ graphApi: {} })),
    listPhoneNumbers: vi.fn(async () => [
      {
        id: "999303",
        displayPhoneNumber: "+1 555 303 0000",
        qualityRating: "GREEN",
      },
    ]),
    subscribeApp: vi.fn(),
    unsubscribeApp: vi.fn(),
  };
});

const NEON_DATABASE_URL = process.env.DATABASE_URL;
if (!NEON_DATABASE_URL) {
  throw new Error("DATABASE_URL is required for launch-gate tests");
}

const WORKSPACE_ID = "org_l4_launch_gate";
const ADMIN_ID = "user_l4_launch_admin";
const APP_SECRET = "test_secret_l4";
const PHONE_NUMBER_ID = "999303";
const WA_ID_MAIN = "94774445566";
const WA_ID_CLOSED = "94774447788";
// Remote Neon + workerd DO overhead dominates stub-model time; still catches
// order-of-magnitude regressions (see per-turn ms logged in test output).
const LAUNCH_GATE_P95_MS = 20_000;

type SeedDb = ReturnType<typeof createDb>["db"];

type CapturedOutbound =
  | { kind: "text"; to: string; text: string }
  | { kind: "interactive"; to: string; interactive: InteractiveMessage };

type ProcedureLike = {
  "~orpc": {
    handler: (opts: { input: unknown; context: Context }) => Promise<unknown>;
  };
};

const PUBLISH_IR_V1 = {
  name: "Launch Gate Agent",
  description: "v1",
  instructions: "Reply with REPLY_V1 sentinel",
  model: { provider: "test" as const, name: "launch-gate-v1" },
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
    ttsVoiceId: "v_test",
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

const PUBLISH_IR_V2 = {
  ...PUBLISH_IR_V1,
  description: "v2",
  instructions: "Reply with REPLY_V2 sentinel",
  model: { provider: "test" as const, name: "launch-gate-v2" },
};

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

async function callProcedure<T>(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<T> {
  const def = (procedure as ProcedureLike)["~orpc"];
  return def.handler({ input, context }) as Promise<T>;
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

async function resetWorkspaceData(db: SeedDb, workspaceId: string): Promise<void> {
  await db.execute(sql`DELETE FROM usage_events WHERE workspace_id = ${workspaceId}`);
  await db.execute(
    sql`DELETE FROM runtime_sessions WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(conversationTurns).where(
    sql`conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(messagingThreads).where(eq(messagingThreads.workspaceId, workspaceId));
  await db.delete(conversations).where(eq(conversations.workspaceId, workspaceId));
  await db.delete(channelEndpoints).where(eq(channelEndpoints.workspaceId, workspaceId));
  await db.delete(channelConnections).where(eq(channelConnections.workspaceId, workspaceId));
  await db.delete(secrets).where(eq(secrets.workspaceId, workspaceId));
  await db.delete(member).where(eq(member.organizationId, workspaceId));
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

async function seedAdminMember(db: SeedDb): Promise<void> {
  await db
    .insert(user)
    .values({
      id: ADMIN_ID,
      name: "Launch Admin",
      email: `${ADMIN_ID}@test.local`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
  await db
    .insert(member)
    .values({
      id: `m_${ADMIN_ID}_${WORKSPACE_ID}`,
      organizationId: WORKSPACE_ID,
      userId: ADMIN_ID,
      role: "admin",
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

describe("L4-1 launch gate full product loop", () => {
  let db: SeedDb;
  let kvStore: MemoryKvStore;
  let apiContext: Context;
  let webhookApp: Hono;
  let activeVersion: "v1" | "v2" = "v1";
  let collected: ConversationPlatformEvent[] = [];
  let captured: CapturedOutbound[] = [];

  beforeAll(() => {
    const handle = createDb(NEON_DATABASE_URL);
    db = handle.db;
    handle.pool.on("error", () => {});
  });

  beforeEach(async () => {
    activeVersion = "v1";
    collected = [];
    captured = [];
    kvStore = new MemoryKvStore();

    await resetWorkspaceData(db, WORKSPACE_ID);
    await seedWorkspace(db, WORKSPACE_ID);
    await seedAdminMember(db);

    apiContext = makeTestContext(db, kvStore, ADMIN_ID, {
      META_APP_ID: "app_l4",
      META_APP_SECRET: APP_SECRET,
      META_SYSTEM_USER_TOKEN: "token_l4",
      META_VERIFY_TOKEN: "verify_l4",
      PUBLIC_BASE_URL: "http://localhost:3000",
    });

    webhookApp = new Hono();
    webhookApp.use("*", async (c, next) => {
      c.set("db", db);
      await next();
    });
    webhookApp.route("/webhooks/meta", createMetaWebhookApp({ kvStore }));
  });

  function configureWorkerEnv() {
    const workerEnv = env as unknown as MessagingDoEnv & {
      MESSAGING_DO: DurableObjectNamespace<MessagingDO>;
    };
    workerEnv.DATABASE_URL = NEON_DATABASE_URL;
    delete workerEnv.__messagingDODeps;
    const fakeSender: WhatsAppSender = {
      client: createCapturingWhatsAppClient(captured),
      phoneNumberId: PHONE_NUMBER_ID,
    };
    workerEnv.__messagingDoDepsOverrides = {
      resolveModel: createLaunchGateTestModel(() => activeVersion),
      emitEvents: async (_conversationId, events) => {
        collected.push(...events);
      },
      createWhatsAppSender: async () => fakeSender,
    };
    return workerEnv;
  }

  async function projectCollectedEvents(conversationId: string): Promise<void> {
    const conversationRows = await db
      .select({
        workspaceId: conversations.workspaceId,
        agentId: conversations.agentId,
        channelEndpointId: conversations.channelEndpointId,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const conversation = conversationRows[0];
    if (!conversation) {
      throw new Error(`Missing conversation row for ${conversationId}`);
    }

    const pending = collected.splice(0, collected.length);
    for (const event of pending) {
      const parsed = messagingEventSchema.safeParse(event);
      if (!parsed.success) continue;
      await db.transaction(async (tx) => {
        await projectConversationEvent(tx, parsed.data, {
          workspaceId: conversation.workspaceId,
          agentId: conversation.agentId,
          channelEndpointId: conversation.channelEndpointId,
        });
      });
    }
  }

  async function setupViaApi(): Promise<{
    agentId: string;
    endpointId: string;
    connectionId: string;
  }> {
    const { agentId } = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      apiContext,
    );

    await callProcedure(
      appRouter.agents.publish,
      {
        workspaceId: WORKSPACE_ID,
        agentId,
        ir: PUBLISH_IR_V1,
      },
      apiContext,
    );

    const { connectionId } = await callProcedure<{ connectionId: string }>(
      appRouter.channels.connect,
      {
        workspaceId: WORKSPACE_ID,
        provider: "meta-whatsapp-cloud",
        displayName: "Launch Gate WhatsApp",
        appSecret: APP_SECRET,
        accessToken: "token_l4",
      },
      apiContext,
    );

    const { endpointId } = await callProcedure<{ endpointId: string }>(
      appRouter.channels.endpoints.attach,
      {
        workspaceId: WORKSPACE_ID,
        connectionId,
        phoneNumberId: PHONE_NUMBER_ID,
        agentId,
      },
      apiContext,
    );

    return { agentId, endpointId, connectionId };
  }

  async function postSignedWebhook(
    fixture: { rawBody: string; signature: string },
    workerEnv: ReturnType<typeof configureWorkerEnv>,
  ): Promise<Response> {
    return webhookApp.request(
      "http://localhost/webhooks/meta",
      {
        method: "POST",
        body: fixture.rawBody,
        headers: {
          "X-Hub-Signature-256": fixture.signature,
          "content-type": "application/json",
        },
      },
      {
        META_VERIFY_TOKEN: "verify_l4",
        META_APP_SECRET: APP_SECRET,
        MESSAGING_DO: workerEnv.MESSAGING_DO,
      },
    );
  }

  async function waitForAssistantTurn(
    conversationId: string,
    text: string,
    timeoutMs = 8_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await db
        .select()
        .from(conversationTurns)
        .where(
          and(
            eq(conversationTurns.conversationId, conversationId),
            eq(conversationTurns.speaker, "agent"),
            eq(conversationTurns.text, text),
          ),
        )
        .limit(1);
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for assistant turn "${text}" on ${conversationId}`);
  }

  async function waitForCallerTurn(
    conversationId: string,
    text: string,
    timeoutMs = 8_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await db
        .select()
        .from(conversationTurns)
        .where(
          and(
            eq(conversationTurns.conversationId, conversationId),
            eq(conversationTurns.speaker, "caller"),
            eq(conversationTurns.text, text),
          ),
        )
        .limit(1);
      if (rows.length > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for caller turn "${text}" on ${conversationId}`);
  }

  async function resolveConversationId(waId: string): Promise<string> {
    const threads = await db
      .select()
      .from(messagingThreads)
      .where(eq(messagingThreads.threadKey, `whatsapp:${waId}`))
      .limit(1);
    const conversationId = threads[0]?.lastConversationId;
    if (!conversationId) {
      throw new Error("Expected messaging thread with conversation id");
    }
    return conversationId;
  }

  it(
    "create → publish → connect → three signed webhook turns with p95 latency under CI bound",
    async () => {
      const latencies: number[] = [];
      const { agentId } = await setupViaApi();
      const workerEnv = configureWorkerEnv();

      const turn1 = metaWebhookInbound({
        appSecret: APP_SECRET,
        phoneNumberId: PHONE_NUMBER_ID,
        waId: WA_ID_MAIN,
        messageId: "wamid.l4-turn-1",
        text: "hello launch gate",
      });
      const t1 = performance.now();
      expect((await postSignedWebhook(turn1, workerEnv)).status).toBe(200);
      const conversationId = await resolveConversationId(WA_ID_MAIN);
      await projectCollectedEvents(conversationId);
      latencies.push(performance.now() - t1);
      await waitForAssistantTurn(conversationId, "REPLY_V1");
      expect(captured).toContainEqual(
        expect.objectContaining({ kind: "text", to: WA_ID_MAIN, text: "REPLY_V1" }),
      );

      const turn2 = metaWebhookButtonReply({
        appSecret: APP_SECRET,
        phoneNumberId: PHONE_NUMBER_ID,
        waId: WA_ID_MAIN,
        messageId: "wamid.l4-turn-2",
        buttonTitle: "Option A",
      });
      const t2 = performance.now();
      expect((await postSignedWebhook(turn2, workerEnv)).status).toBe(200);
      await projectCollectedEvents(conversationId);
      latencies.push(performance.now() - t2);
      await waitForCallerTurn(conversationId, "Option A");
      await waitForAssistantTurn(conversationId, "ACK_OPTION_A");
      expect(captured).toContainEqual(
        expect.objectContaining({
          kind: "text",
          to: WA_ID_MAIN,
          text: "ACK_OPTION_A",
        }),
      );

      await callProcedure(
        appRouter.agents.publish,
        {
          workspaceId: WORKSPACE_ID,
          agentId,
          ir: PUBLISH_IR_V2,
        },
        apiContext,
      );
      activeVersion = "v2";

      const turn3 = metaWebhookInbound({
        appSecret: APP_SECRET,
        phoneNumberId: PHONE_NUMBER_ID,
        waId: WA_ID_MAIN,
        messageId: "wamid.l4-turn-3",
        text: "after republish",
      });
      const t3 = performance.now();
      expect((await postSignedWebhook(turn3, workerEnv)).status).toBe(200);
      await projectCollectedEvents(conversationId);
      latencies.push(performance.now() - t3);
      await waitForAssistantTurn(conversationId, "REPLY_V2");
      expect(captured).toContainEqual(
        expect.objectContaining({ kind: "text", to: WA_ID_MAIN, text: "REPLY_V2" }),
      );

      const sorted = [...latencies].sort((a, b) => a - b);
      const p95 = percentile(sorted, 0.95);
      console.log(
        JSON.stringify({
          launchGate: "latency",
          perTurnMs: latencies,
          p95Ms: p95,
          thresholdMs: LAUNCH_GATE_P95_MS,
        }),
      );
      expect(p95).toBeLessThan(LAUNCH_GATE_P95_MS);
    },
    120_000,
  );

  it("defers outbound delivery when the messaging window is closed", async () => {
    await setupViaApi();
    const workerEnv = configureWorkerEnv();
    const doStub = workerEnv.MESSAGING_DO.get(
      workerEnv.MESSAGING_DO.idFromName(`whatsapp:${WA_ID_CLOSED}`),
    );

    class ClosedWindowStore {
      async get() {
        return { open: false, expiresAt: new Date(Date.now() - 60_000) };
      }
      async recordInbound() {}
      async recordExpiry() {}
    }

    await runInDurableObject(doStub, async (instance) => {
      (instance as MessagingDO).setWindowStoreForTests(new ClosedWindowStore());
    });

    const inbound = metaWebhookInbound({
      appSecret: APP_SECRET,
      phoneNumberId: PHONE_NUMBER_ID,
      waId: WA_ID_CLOSED,
      messageId: "wamid.l4-closed",
      text: "window closed ping",
    });
    expect((await postSignedWebhook(inbound, workerEnv)).status).toBe(200);

    const conversationId = await resolveConversationId(WA_ID_CLOSED);

    expect(captured).toHaveLength(0);
    const deferred = collected.find(
      (event) => isDeliveryEvent(event) && event.kind === "delivery.deferred",
    );
    expect(deferred).toBeDefined();
    if (deferred && isDeliveryEvent(deferred)) {
      expect(deferred.payload.reason).toBe("window-closed");
    }

    await projectCollectedEvents(conversationId);
    await waitForAssistantTurn(conversationId, "REPLY_V1");
  });
});
