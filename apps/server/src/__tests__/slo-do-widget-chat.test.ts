/**
 * W1 widget ingress: public embed-key route → conversation DO `/agents/chat`.
 */
import { env } from "cloudflare:workers";
import { createDb } from "@kuralle/db";
import { appRouter } from "@kuralle/api/routers/index";
import type { Context } from "@kuralle/api/context";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  agentVersions,
  agents,
  channelEndpoints,
  conversationTurns,
  conversations,
  member,
  messagingThreads,
  organization,
  user,
} from "@kuralle/db/schema";
import * as schema from "@kuralle/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  messagingEventSchema,
  projectConversationEvent,
  type MessagingEvent,
} from "@kuralle/runtime";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MessagingDO } from "../durable-objects/MessagingDO.js";
import type { MessagingDoEnv } from "../durable-objects/deps.js";
import { createWidgetIngressApp } from "../widget/ingress.js";
import { makeTestContext } from "./test-context.js";
import { createPongTestModel } from "./test-models.js";

const NEON_DATABASE_URL = process.env.DATABASE_URL;
if (!NEON_DATABASE_URL) {
  throw new Error("DATABASE_URL is required for slo-do-widget-chat tests");
}

const WORKSPACE_ID = "org_w1_widget_chat";
const ADMIN_ID = "user_w1_widget_admin";
const VISITOR_ID = "visitor_abc12345";

type SeedDb = ReturnType<typeof createDb>["db"];

type ProcedureLike = {
  "~orpc": {
    handler: (opts: { input: unknown; context: Context }) => Promise<unknown>;
  };
};

const PUBLISH_IR = {
  name: "Widget Pong Agent",
  description: "Widget test agent",
  instructions: "Reply EXACTLY: PONG",
  model: { provider: "test", name: "pong-model" },
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

async function callProcedure<T>(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<T> {
  const def = (procedure as ProcedureLike)["~orpc"];
  return def.handler({ input, context }) as Promise<T>;
}

async function resetWorkspaceData(db: SeedDb, workspaceId: string): Promise<void> {
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
  await db.execute(
    sql`DELETE FROM runtime_sessions WHERE conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.delete(messagingThreads).where(eq(messagingThreads.workspaceId, workspaceId));
  await db.delete(conversationTurns).where(
    sql`conversation_id IN (SELECT id FROM conversations WHERE workspace_id = ${workspaceId})`,
  );
  await db.execute(sql`DELETE FROM usage_events WHERE workspace_id = ${workspaceId}`);
  await db.delete(conversations).where(eq(conversations.workspaceId, workspaceId));
  await db.delete(channelEndpoints).where(eq(channelEndpoints.workspaceId, workspaceId));
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
      name: "Widget Admin",
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

async function projectCollectedEvents(
  db: SeedDb,
  collected: MessagingEvent[],
  conversationId: string,
): Promise<void> {
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

async function chatViaPost(
  widgetApp: Hono,
  workerEnv: MessagingDoEnv & { MESSAGING_DO: DurableObjectNamespace<MessagingDO> },
  embedKey: string,
  visitorId: string,
  message: string,
): Promise<{ fullText: string; streamParts: Array<{ type: string; delta?: string }> }> {
  const response = await widgetApp.request(
    `http://localhost/widget/${embedKey}/chat?visitorId=${visitorId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, sessionId: visitorId }),
    },
    { MESSAGING_DO: workerEnv.MESSAGING_DO },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    fullText: string;
    streamParts: Array<{ type: string; delta?: string }>;
  };
}

describe("W1 widget ingress chat loop", () => {
  let db: SeedDb;
  let kvStore: MemoryKvStore;
  let apiContext: Context;
  let widgetApp: Hono;
  let collected: MessagingEvent[] = [];
  let workerEnv: MessagingDoEnv & { MESSAGING_DO: DurableObjectNamespace<MessagingDO> };

  beforeAll(() => {
    const handle = createDb(NEON_DATABASE_URL);
    db = handle.db;
    handle.pool.on("error", () => {});
  });

  beforeEach(async () => {
    collected = [];
    kvStore = new MemoryKvStore();
    await resetWorkspaceData(db, WORKSPACE_ID);
    await seedWorkspace(db, WORKSPACE_ID);
    await seedAdminMember(db);

    apiContext = makeTestContext(db, kvStore, ADMIN_ID);

    widgetApp = new Hono();
    widgetApp.use("*", async (c, next) => {
      c.set("db", db as never);
      await next();
    });
    widgetApp.route("/widget", createWidgetIngressApp({ kvStore }));

    workerEnv = env as unknown as MessagingDoEnv & {
      MESSAGING_DO: DurableObjectNamespace<MessagingDO>;
    };
    workerEnv.DATABASE_URL = NEON_DATABASE_URL;
    delete workerEnv.__messagingDODeps;
    workerEnv.__messagingDoDepsOverrides = {
      resolveModel: createPongTestModel(),
      emitEvents: async (_conversationId, events) => {
        collected.push(...events);
      },
      createWhatsAppSender: async () => null,
    };
  });

  async function setupBoundWidget(): Promise<{
    embedKey: string;
    endpointId: string;
    agentId: string;
  }> {
    const { embedKey, endpointId } = await callProcedure<{
      embedKey: string;
      endpointId: string;
    }>(appRouter.widget.enable, { workspaceId: WORKSPACE_ID }, apiContext);

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
        ir: PUBLISH_IR,
      },
      apiContext,
    );

    await callProcedure(
      appRouter.channels.bindAgent,
      {
        workspaceId: WORKSPACE_ID,
        endpointId,
        agentId,
      },
      apiContext,
    );

    return { embedKey, endpointId, agentId };
  }

  it("returns 404 for unknown embed key on config and chat", async () => {
    const config = await widgetApp.request(
      "http://localhost/widget/wk_unknownunknownunknown/config",
    );
    expect(config.status).toBe(404);

    const chat = await widgetApp.request(
      `http://localhost/widget/wk_unknownunknownunknown/chat?visitorId=${VISITOR_ID}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ping", sessionId: VISITOR_ID }),
      },
      { MESSAGING_DO: workerEnv.MESSAGING_DO },
    );
    expect(chat.status).toBe(404);
  });

  it("returns agent-not-bound when widget endpoint has no agent", async () => {
    const { embedKey } = await callProcedure<{ embedKey: string }>(
      appRouter.widget.enable,
      { workspaceId: WORKSPACE_ID },
      apiContext,
    );

    const chat = await widgetApp.request(
      `http://localhost/widget/${embedKey}/chat?visitorId=${VISITOR_ID}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "ping", sessionId: VISITOR_ID }),
      },
      { MESSAGING_DO: workerEnv.MESSAGING_DO },
    );
    expect(chat.status).toBe(400);
    expect(await chat.json()).toEqual({ error: "agent-not-bound" });
  });

  it(
    "streams assistant parts and persists turns; same visitor reuses conversation",
    async () => {
    const { embedKey } = await setupBoundWidget();

    const configRes = await widgetApp.request(
      `http://localhost/widget/${embedKey}/config`,
    );
    expect(configRes.status).toBe(200);
    const config = (await configRes.json()) as { agentName: string };
    expect(config.agentName).toBe("Widget Pong Agent");

    const firstTurn = await chatViaPost(
      widgetApp,
      workerEnv,
      embedKey,
      VISITOR_ID,
      "ping",
    );
    expect(firstTurn.fullText).toBe("PONG");
    expect(
      firstTurn.streamParts.some((part) => part.type === "text-delta"),
    ).toBe(true);

    const threadKey = `widget:${embedKey}:${VISITOR_ID}`;
    const threadRows = await db
      .select()
      .from(messagingThreads)
      .where(
        and(
          eq(messagingThreads.workspaceId, WORKSPACE_ID),
          eq(messagingThreads.threadKey, threadKey),
        ),
      );
    expect(threadRows).toHaveLength(1);
    const conversationId = threadRows[0]!.lastConversationId!;

    await projectCollectedEvents(db, collected, conversationId);

    const turns = await db
      .select()
      .from(conversationTurns)
      .where(eq(conversationTurns.conversationId, conversationId));
    const assistantTurn = turns.find((turn) => turn.speaker === "agent");
    expect(assistantTurn?.text).toBe("PONG");

    collected.length = 0;
    await chatViaPost(widgetApp, workerEnv, embedKey, VISITOR_ID, "ping again");

    const conversationRows = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, WORKSPACE_ID),
          eq(conversations.threadKey, threadKey),
        ),
      );
    expect(conversationRows).toHaveLength(1);
    expect(conversationRows[0]!.id).toBe(conversationId);
    },
    120_000,
  );
});
