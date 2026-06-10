import type { AgentIR } from "@kuralle/core";
import { agentIRSchema } from "@kuralle/core";
import { createDb, createHyperdriveDb, type Db, type HyperdriveBinding } from "@kuralle/db";
import {
  agentVersions,
  agents,
  channelConnections,
  channelEndpoints,
  conversations,
  messagingThreads,
  runtimeSessions,
  secrets,
} from "@kuralle/db/schema";
import type { PlatformClient } from "@kuralle-agents/messaging";
import { createWhatsAppClient } from "@kuralle-agents/messaging-meta/whatsapp";
import { MemoryKvStore } from "@kuralle/platform/memory";
import type { AgentConfigOpts } from "@kuralle/runtime";
import { createDbToolResolver, createLazyWorkspaceModelResolver } from "@kuralle/runtime";
import { and, eq, isNull } from "drizzle-orm";
import type { ConversationPlatformEvent } from "./delivery-events.js";

const MAX_GRAPH_DEPTH = 5;

export interface AgentGraphEntry {
  agentId: string;
  ir: AgentIR;
}

export interface AgentGraphResult {
  workspaceId: string;
  defaultAgentId: string;
  agents: AgentGraphEntry[];
}

export interface WhatsAppSender {
  client: PlatformClient;
  phoneNumberId: string;
}

export interface MessagingDoDeps {
  loadAgentIr?: (conversationId: string) => Promise<{ agentId: string; ir: AgentIR } | null>;
  loadAgentGraph?: (conversationId: string) => Promise<AgentGraphResult | null>;
  resolveModel?: AgentConfigOpts["resolveModel"];
  resolveTool?: AgentConfigOpts["resolveTool"];
  resolveIntegrationTools?: AgentConfigOpts["resolveIntegrationTools"];
  resolveMcpTools?: AgentConfigOpts["resolveMcpTools"];
  runtimeDefaults?: Pick<AgentConfigOpts, "maxSteps" | "maxTurns" | "toolMaxSteps">;
  loadWorkingMemory: (conversationId: string) => Promise<Record<string, unknown> | null>;
  persistWorkingMemory: (
    conversationId: string,
    workingMemory: Record<string, unknown>,
  ) => Promise<void>;
  emitEvents: (conversationId: string, events: ConversationPlatformEvent[]) => Promise<void>;
  createWhatsAppSender?: (conversationId: string) => Promise<WhatsAppSender | null>;
  bindConversation?: (conversationId: string, workspaceId: string) => void;
}

export interface MessagingDoEnv {
  __messagingDODeps?: MessagingDoDeps;
  __messagingDoDepsOverrides?: Partial<
    Pick<
      MessagingDoDeps,
      | "loadAgentIr"
      | "loadAgentGraph"
      | "resolveModel"
      | "resolveTool"
      | "resolveIntegrationTools"
      | "resolveMcpTools"
      | "runtimeDefaults"
      | "loadWorkingMemory"
      | "persistWorkingMemory"
      | "emitEvents"
      | "createWhatsAppSender"
    >
  >;
  DATABASE_URL?: string;
  META_APP_SECRET?: string;
  META_SYSTEM_USER_TOKEN?: string;
  META_VERIFY_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  [key: string]: unknown;
}

export type MessagingDoDepsOverrides = NonNullable<
  MessagingDoEnv["__messagingDoDepsOverrides"]
>;

function getDatabaseUrl(env: MessagingDoEnv): string | undefined {
  const url = env.DATABASE_URL;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

interface MetaChannelCredentials {
  appSecret: string;
  accessToken: string;
}

function decodeMetaChannelCredentials(
  row: typeof secrets.$inferSelect,
): MetaChannelCredentials | null {
  if (row.kmsKeyId !== "none") {
    return null;
  }
  const raw = row.ciphertext.toString("utf8");
  try {
    const parsed = JSON.parse(raw) as {
      appSecret?: string;
      systemUserToken?: string;
      accessToken?: string;
      token?: string;
    };
    const appSecret = parsed.appSecret;
    const accessToken =
      parsed.systemUserToken ?? parsed.accessToken ?? parsed.token;
    if (!appSecret || !accessToken) {
      return null;
    }
    return { appSecret, accessToken };
  } catch {
    return null;
  }
}

async function resolveWhatsAppChannelContext(
  db: Db,
  conversationId: string,
): Promise<{
  workspaceId: string;
  phoneNumberId: string;
  credentialsSecretId: string | null;
} | null> {
  const conversationRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conversation = conversationRows[0];
  if (!conversation) {
    return null;
  }

  const threadRows = await db
    .select({ channelEndpointId: messagingThreads.channelEndpointId })
    .from(messagingThreads)
    .where(
      and(
        eq(messagingThreads.workspaceId, conversation.workspaceId),
        eq(messagingThreads.lastConversationId, conversationId),
      ),
    )
    .limit(1);

  const endpointId =
    threadRows[0]?.channelEndpointId ?? conversation.channelEndpointId;
  if (!endpointId) {
    return null;
  }

  const endpointRows = await db
    .select({
      identifier: channelEndpoints.identifier,
      connectionId: channelEndpoints.connectionId,
    })
    .from(channelEndpoints)
    .where(
      and(
        eq(channelEndpoints.id, endpointId),
        eq(channelEndpoints.workspaceId, conversation.workspaceId),
      ),
    )
    .limit(1);
  const endpoint = endpointRows[0];
  if (!endpoint?.connectionId) {
    return null;
  }

  const connectionRows = await db
    .select({ credentialsSecretId: channelConnections.credentialsSecretId })
    .from(channelConnections)
    .where(eq(channelConnections.id, endpoint.connectionId))
    .limit(1);

  return {
    workspaceId: conversation.workspaceId,
    phoneNumberId: endpoint.identifier,
    credentialsSecretId: connectionRows[0]?.credentialsSecretId ?? null,
  };
}

async function resolveMetaCredentials(
  env: MessagingDoEnv,
  db: Db,
  credentialsSecretId: string | null,
): Promise<MetaChannelCredentials | null> {
  if (credentialsSecretId) {
    const rows = await db
      .select()
      .from(secrets)
      .where(eq(secrets.id, credentialsSecretId))
      .limit(1);
    const decoded = rows[0] ? decodeMetaChannelCredentials(rows[0]) : null;
    if (decoded) {
      return decoded;
    }
  }

  const appSecret = env.META_APP_SECRET;
  const accessToken = env.META_SYSTEM_USER_TOKEN;
  if (
    typeof appSecret === "string" &&
    appSecret.length > 0 &&
    typeof accessToken === "string" &&
    accessToken.length > 0
  ) {
    return { appSecret, accessToken };
  }

  return null;
}

async function withDb<T>(
  env: MessagingDoEnv,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const hyperdrive = (env as { HYPERDRIVE?: HyperdriveBinding }).HYPERDRIVE;
  let handle;
  if (hyperdrive?.connectionString) {
    handle = createHyperdriveDb(hyperdrive);
  } else {
    const connectionString = getDatabaseUrl(env);
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured for MessagingDO database access");
    }
    handle = createDb(connectionString);
  }
  const { db, pool } = handle;
  (pool as { on?: (e: string, f: () => void) => void }).on?.("error", () => {});
  try {
    return await fn(db);
  } finally {
    try {
      await pool.end();
    } catch {
      // Neon websocket teardown can race inside workerd; ignore close errors.
    }
  }
}

async function loadAgentSnapshot(
  db: Db,
  workspaceId: string,
  agentId: string,
): Promise<AgentGraphEntry | null> {
  const agentRows = await db
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.workspaceId, workspaceId),
        isNull(agents.deletedAt),
      ),
    )
    .limit(1);
  const agentRow = agentRows[0];
  if (!agentRow?.activeVersionId) {
    return null;
  }

  const versionRows = await db
    .select({ snapshot: agentVersions.snapshot })
    .from(agentVersions)
    .where(eq(agentVersions.id, agentRow.activeVersionId))
    .limit(1);
  const versionRow = versionRows[0];
  if (!versionRow) {
    return null;
  }

  const parsed = agentIRSchema.safeParse(versionRow.snapshot);
  if (!parsed.success) {
    console.warn(
      JSON.stringify({
        level: "warn",
        at: "messaging-do-deps",
        operation: "loadAgentSnapshot",
        agentId,
        workspaceId,
        error: "invalid AgentIR snapshot",
      }),
    );
    return null;
  }

  return { agentId, ir: parsed.data };
}

async function resolveEndpointAgentId(
  db: Db,
  conversationId: string,
): Promise<{ workspaceId: string; rootAgentId: string } | null> {
  const conversationRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  const conversation = conversationRows[0];
  if (!conversation) {
    return null;
  }

  const threadRows = await db
    .select({ channelEndpointId: messagingThreads.channelEndpointId })
    .from(messagingThreads)
    .where(
      and(
        eq(messagingThreads.workspaceId, conversation.workspaceId),
        eq(messagingThreads.lastConversationId, conversationId),
      ),
    )
    .limit(1);

  const endpointId =
    threadRows[0]?.channelEndpointId ?? conversation.channelEndpointId;
  if (!endpointId) {
    return null;
  }

  const endpointRows = await db
    .select({ attachedAgentId: channelEndpoints.attachedAgentId })
    .from(channelEndpoints)
    .where(
      and(
        eq(channelEndpoints.id, endpointId),
        eq(channelEndpoints.workspaceId, conversation.workspaceId),
      ),
    )
    .limit(1);

  const rootAgentId = endpointRows[0]?.attachedAgentId;
  if (!rootAgentId) {
    return null;
  }

  return { workspaceId: conversation.workspaceId, rootAgentId };
}

export async function loadAgentGraphFromDb(
  db: Db,
  conversationId: string,
): Promise<AgentGraphResult | null> {
  const root = await resolveEndpointAgentId(db, conversationId);
  if (!root) {
    return null;
  }

  const loaded = new Map<string, AgentGraphEntry>();
  const visited = new Set<string>();

  async function walk(agentId: string, depth: number): Promise<void> {
    if (visited.has(agentId) || depth > MAX_GRAPH_DEPTH) {
      if (depth > MAX_GRAPH_DEPTH) {
        console.warn(
          JSON.stringify({
            level: "warn",
            at: "messaging-do-deps",
            operation: "loadAgentGraph",
            conversationId,
            agentId,
            error: "graph depth cap reached",
          }),
        );
      }
      return;
    }
    visited.add(agentId);

    const snapshot = await loadAgentSnapshot(db, root.workspaceId, agentId);
    if (!snapshot) {
      console.warn(
        JSON.stringify({
          level: "warn",
          at: "messaging-do-deps",
          operation: "loadAgentGraph",
          conversationId,
          agentId,
          error: "missing or unpublished agent snapshot",
        }),
      );
      return;
    }

    loaded.set(agentId, snapshot);

    for (const subagentId of Object.keys(snapshot.ir.subagentAttachments)) {
      if (subagentId === agentId) continue;
      await walk(subagentId, depth + 1);
    }
  }

  await walk(root.rootAgentId, 0);

  const rootEntry = loaded.get(root.rootAgentId);
  if (!rootEntry) {
    return null;
  }

  return {
    workspaceId: root.workspaceId,
    defaultAgentId: root.rootAgentId,
    agents: [...loaded.values()],
  };
}

export async function loadAgentIrFromDb(
  db: Db,
  conversationId: string,
): Promise<{ agentId: string; ir: AgentIR } | null> {
  const graph = await loadAgentGraphFromDb(db, conversationId);
  if (!graph) return null;
  const root = graph.agents.find((entry) => entry.agentId === graph.defaultAgentId);
  return root ?? null;
}

export function createMessagingDoDeps(
  env: MessagingDoEnv,
  overrides?: MessagingDoDepsOverrides,
): MessagingDoDeps {
  let conversationContext: { conversationId: string; workspaceId: string } | null =
    null;
  const whatsAppSenderCache = new Map<string, WhatsAppSender>();

  const toolKv = new MemoryKvStore();

  const loadAgentGraphImpl = async (
    conversationId: string,
  ): Promise<AgentGraphResult | null> =>
    withDb(env, (db) => loadAgentGraphFromDb(db, conversationId));

  const loadAgentIrImpl = async (
    conversationId: string,
  ): Promise<{ agentId: string; ir: AgentIR } | null> =>
    withDb(env, (db) => loadAgentIrFromDb(db, conversationId));

  const base: MessagingDoDeps = {
    bindConversation(conversationId: string, workspaceId: string) {
      conversationContext = { conversationId, workspaceId };
    },
    loadAgentGraph: loadAgentGraphImpl,
    loadAgentIr: loadAgentIrImpl,
    resolveModel: createLazyWorkspaceModelResolver({
      env,
      getWorkspaceId: () => conversationContext?.workspaceId ?? null,
      withDb: (fn) => withDb(env, fn),
    }),
    resolveTool: async (toolId) => {
      const ctx = conversationContext;
      if (!ctx) return {};
      return withDb(env, (db) => {
        const { resolveTool } = createDbToolResolver({ db, workspaceId: ctx.workspaceId, kv: toolKv });
        return resolveTool(toolId);
      });
    },
    resolveIntegrationTools: async (tcpId, selectedTools) => {
      const ctx = conversationContext;
      if (!ctx) return {};
      return withDb(env, (db) => {
        const { resolveIntegrationTools } = createDbToolResolver({ db, workspaceId: ctx.workspaceId, kv: toolKv });
        return resolveIntegrationTools(tcpId, selectedTools);
      });
    },
    resolveMcpTools: async (clientId, allowedTools) => {
      const ctx = conversationContext;
      if (!ctx) return {};
      return withDb(env, (db) => {
        const { resolveMcpTools } = createDbToolResolver({ db, workspaceId: ctx.workspaceId, kv: toolKv });
        return resolveMcpTools(clientId, allowedTools);
      });
    },
    loadWorkingMemory: async (conversationId) =>
      withDb(env, async (db) => {
        const rows = await db
          .select({ workingMemory: runtimeSessions.workingMemory })
          .from(runtimeSessions)
          .where(eq(runtimeSessions.conversationId, conversationId))
          .limit(1);
        const snapshot = rows[0]?.workingMemory;
        return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
          ? (snapshot as Record<string, unknown>)
          : null;
      }),
    persistWorkingMemory: async (conversationId, workingMemory) =>
      withDb(env, async (db) => {
        const sessionId = `rs_${conversationId}`;
        await db
          .insert(runtimeSessions)
          .values({
            id: sessionId,
            conversationId,
            workingMemory,
          })
          .onConflictDoUpdate({
            target: runtimeSessions.conversationId,
            set: { workingMemory },
          });
      }),
    emitEvents: async () => {},
    createWhatsAppSender: async (conversationId) => {
      const cached = whatsAppSenderCache.get(conversationId);
      if (cached) {
        return cached;
      }
      const sender = await withDb(env, async (db) => {
        const channel = await resolveWhatsAppChannelContext(db, conversationId);
        if (!channel) {
          return null;
        }
        const creds = await resolveMetaCredentials(
          env,
          db,
          channel.credentialsSecretId,
        );
        if (!creds) {
          throw new Error(
            `No WhatsApp credentials for conversation "${conversationId}"`,
          );
        }
        const verifyToken =
          typeof env.META_VERIFY_TOKEN === "string" && env.META_VERIFY_TOKEN.length > 0
            ? env.META_VERIFY_TOKEN
            : "kuralle-sandbox";
        const client = createWhatsAppClient({
          accessToken: creds.accessToken,
          appSecret: creds.appSecret,
          phoneNumberId: channel.phoneNumberId,
          verifyToken,
        });
        return { client, phoneNumberId: channel.phoneNumberId };
      });
      if (sender) {
        whatsAppSenderCache.set(conversationId, sender);
      }
      return sender;
    },
  };

  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    bindConversation: base.bindConversation,
    createWhatsAppSender:
      overrides.createWhatsAppSender ?? base.createWhatsAppSender,
  };
}
