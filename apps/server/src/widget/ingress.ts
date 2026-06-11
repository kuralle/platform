import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { withWorkspace } from "@kuralle/core";
import type { RepoDb } from "@kuralle/core";
import * as schema from "@kuralle/db/schema";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { WIDGET_VISITOR_ID_PATTERN } from "./embed-key.js";

export const KURALLE_CONVERSATION_HEADER = "x-kuralle-conversation";
export const KURALLE_WORKSPACE_HEADER = "x-kuralle-workspace-id";
export const KURALLE_CHANNEL_ENDPOINT_HEADER = "x-kuralle-channel-endpoint-id";
export const KURALLE_THREAD_KEY_HEADER = "x-kuralle-thread-key";

interface WidgetIngressBindings {
  MESSAGING_DO: DurableObjectNamespace;
}

interface WidgetIngressVariables {
  db: RepoDb;
}

interface WidgetIngressDeps {
  kvStore: Parameters<typeof withWorkspace>[2];
}

type WidgetEndpointRow = typeof schema.channelEndpoints.$inferSelect;

interface ResolvedWidgetChat {
  threadKey: string;
  headers: Headers;
  stub: ReturnType<DurableObjectNamespace["get"]>;
}

async function findWidgetEndpoint(
  db: RepoDb,
  embedKey: string,
): Promise<WidgetEndpointRow | null> {
  const rows = await db
    .select()
    .from(schema.channelEndpoints)
    .where(
      and(
        eq(schema.channelEndpoints.channelKind, "widget"),
        eq(schema.channelEndpoints.identifier, embedKey),
        isNull(schema.channelEndpoints.releasedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function validateWidgetAgentBinding(
  db: RepoDb,
  endpoint: WidgetEndpointRow,
): Promise<"agent-not-bound" | "agent-not-published" | null> {
  if (!endpoint.attachedAgentId || !endpoint.attachedAgentVersionId) {
    return "agent-not-bound";
  }

  const agentRows = await db
    .select({ activeVersionId: schema.agents.activeVersionId })
    .from(schema.agents)
    .where(eq(schema.agents.id, endpoint.attachedAgentId))
    .limit(1);
  const agent = agentRows[0];
  if (!agent?.activeVersionId) {
    return "agent-not-published";
  }

  const versionRows = await db
    .select({ publishedAt: schema.agentVersions.publishedAt })
    .from(schema.agentVersions)
    .where(eq(schema.agentVersions.id, endpoint.attachedAgentVersionId))
    .limit(1);
  if (!versionRows[0]?.publishedAt) {
    return "agent-not-published";
  }

  return null;
}

async function loadAgentDisplayName(
  db: RepoDb,
  endpoint: WidgetEndpointRow,
): Promise<string> {
  if (!endpoint.attachedAgentVersionId) {
    return "Assistant";
  }
  const rows = await db
    .select({ snapshot: schema.agentVersions.snapshot })
    .from(schema.agentVersions)
    .where(eq(schema.agentVersions.id, endpoint.attachedAgentVersionId))
    .limit(1);
  const snapshot = rows[0]?.snapshot;
  if (
    snapshot &&
    typeof snapshot === "object" &&
    "name" in snapshot &&
    typeof snapshot.name === "string" &&
    snapshot.name.length > 0
  ) {
    return snapshot.name;
  }
  return "Assistant";
}

function chatSuffixPath(requestUrl: string, embedKey: string): string {
  const url = new URL(requestUrl);
  const prefix = `/widget/${embedKey}/chat`;
  if (!url.pathname.startsWith(prefix)) {
    return "";
  }
  return url.pathname.slice(prefix.length);
}

async function resolveWidgetChat(
  c: {
    req: {
      param: (name: string) => string;
      query: (name: string) => string | undefined;
    };
    var: WidgetIngressVariables;
    env: WidgetIngressBindings;
  },
  deps: WidgetIngressDeps,
): Promise<Response | ResolvedWidgetChat> {
  const embedKey = c.req.param("embedKey");
  const visitorId = c.req.query("visitorId");
  if (!visitorId || !WIDGET_VISITOR_ID_PATTERN.test(visitorId)) {
    return Response.json({ error: "invalid-visitor-id" }, { status: 400 });
  }

  const endpoint = await findWidgetEndpoint(c.var.db, embedKey);
  if (!endpoint) {
    return new Response(null, { status: 404 });
  }

  const bindingError = await validateWidgetAgentBinding(c.var.db, endpoint);
  if (bindingError) {
    return Response.json({ error: bindingError }, { status: 400 });
  }

  const threadKey = `widget:${embedKey}:${visitorId}`;
  const repos = withWorkspace(
    c.var.db as never,
    endpoint.workspaceId,
    deps.kvStore,
  );
  const { conversationId } = await repos.conversations.findOrCreateMessagingThread({
    workspaceId: endpoint.workspaceId,
    channelEndpointId: endpoint.id,
    threadKey,
    channelKind: "widget",
    participantId: visitorId,
  });

  const headers = new Headers();
  headers.set(KURALLE_CONVERSATION_HEADER, conversationId);
  headers.set(KURALLE_WORKSPACE_HEADER, endpoint.workspaceId);
  headers.set(KURALLE_CHANNEL_ENDPOINT_HEADER, endpoint.id);
  headers.set(KURALLE_THREAD_KEY_HEADER, threadKey);

  const doId = c.env.MESSAGING_DO.idFromName(threadKey);
  const stub = c.env.MESSAGING_DO.get(doId);
  return { threadKey, headers, stub };
}

export function createWidgetIngressApp(deps: WidgetIngressDeps) {
  const app = new Hono<{
    Bindings: WidgetIngressBindings;
    Variables: WidgetIngressVariables;
  }>();

  app.get("/:embedKey/config", async (c) => {
    const embedKey = c.req.param("embedKey");
    const endpoint = await findWidgetEndpoint(c.var.db, embedKey);
    if (!endpoint) {
      return c.body(null, 404);
    }

    const configRows = await c.var.db
      .select()
      .from(schema.widgetConfigs)
      .where(eq(schema.widgetConfigs.workspaceId, endpoint.workspaceId))
      .limit(1);
    const config = configRows[0];
    const agentName = await loadAgentDisplayName(c.var.db, endpoint);

    return c.json({
      agentName,
      modality: config?.modality ?? "both",
      theme: config?.theme ?? null,
      strings: config?.strings ?? null,
      feedbackEnabled: config?.feedbackEnabled ?? false,
      termsUrl: config?.termsUrl ?? null,
    });
  });

  app.post("/:embedKey/chat", async (c) => {
    const resolved = await resolveWidgetChat(c, deps);
    if (resolved instanceof Response) {
      return resolved;
    }

    const payload = (await c.req.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    if (!payload || typeof payload.message !== "string" || !payload.message.trim()) {
      return c.json({ error: "message-required" }, { status: 400 });
    }

    return resolved.stub.fetch(
      new Request("https://messaging-do/internal/widget-turn", {
        method: "POST",
        headers: resolved.headers,
        body: JSON.stringify({
          text: payload.message,
          messageId: crypto.randomUUID(),
        }),
      }),
    );
  });

  const forwardChat = async (c: {
    req: {
      param: (name: string) => string;
      query: (name: string) => string | undefined;
      url: string;
      method: string;
      raw: Request;
    };
    var: WidgetIngressVariables;
    env: WidgetIngressBindings;
  }) => {
    const resolved = await resolveWidgetChat(c, deps);
    if (resolved instanceof Response) {
      return resolved;
    }

    const embedKey = c.req.param("embedKey");
    const url = new URL(c.req.url);
    url.pathname = `/agents/chat${chatSuffixPath(c.req.url, embedKey)}`;

    const headers = new Headers(c.req.raw.headers);
    for (const [key, value] of resolved.headers.entries()) {
      headers.set(key, value);
    }

    return resolved.stub.fetch(
      new Request(url.toString(), {
        method: c.req.method,
        headers,
        body: c.req.raw.body,
      }),
    );
  };

  app.all("/:embedKey/chat", (c) => forwardChat(c));
  app.all("/:embedKey/chat/*", (c) => forwardChat(c));

  return app;
}
