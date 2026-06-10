import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { AgentIR } from "@kuralle/core";
import { agentIRSchema } from "@kuralle/core";
import { createDb, type Db } from "@kuralle/db";
import {
  agentVersions,
  agents,
  channelEndpoints,
  conversations,
  messagingThreads,
  runtimeSessions,
  secrets,
} from "@kuralle/db/schema";
import { MemoryKvStore } from "@kuralle/platform/memory";
import type { AgentConfigOpts, MessagingEvent } from "@kuralle/runtime";
import { createDbToolResolver } from "@kuralle/runtime";
import { and, eq, isNull } from "drizzle-orm";

type LanguageModel = ReturnType<AgentConfigOpts["resolveModel"]>;

const MAX_GRAPH_DEPTH = 5;

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  openai: ["OPENAI_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEY"],
  google: ["GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
};

export interface AgentGraphEntry {
  agentId: string;
  ir: AgentIR;
}

export interface AgentGraphResult {
  workspaceId: string;
  defaultAgentId: string;
  agents: AgentGraphEntry[];
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
  emitEvents: (conversationId: string, events: MessagingEvent[]) => Promise<void>;
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
    >
  >;
  DATABASE_URL?: string;
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

async function withDb<T>(
  env: MessagingDoEnv,
  fn: (db: Db) => Promise<T>,
): Promise<T> {
  const connectionString = getDatabaseUrl(env);
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for MessagingDO database access");
  }
  const { db, pool } = createDb(connectionString);
  pool.on("error", () => {});
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

function decodeSecretPlaintext(row: typeof secrets.$inferSelect): string | null {
  if (row.kmsKeyId !== "none") {
    return null;
  }
  const raw = row.ciphertext.toString("utf8");
  try {
    const parsed = JSON.parse(raw) as { apiKey?: string; key?: string; token?: string };
    return parsed.apiKey ?? parsed.key ?? parsed.token ?? raw;
  } catch {
    return raw;
  }
}

async function resolveProviderApiKey(
  env: MessagingDoEnv,
  db: Db,
  workspaceId: string,
  provider: string,
): Promise<string> {
  const normalized = provider.toLowerCase();
  const candidateNames = PROVIDER_ENV_KEYS[normalized] ?? [
    `${normalized.toUpperCase()}_API_KEY`,
  ];

  for (const name of candidateNames) {
    const rows = await db
      .select()
      .from(secrets)
      .where(
        and(
          eq(secrets.workspaceId, workspaceId),
          eq(secrets.name, name),
          isNull(secrets.agentId),
        ),
      )
      .limit(1);
    const decoded = rows[0] ? decodeSecretPlaintext(rows[0]) : null;
    if (decoded) return decoded;
  }

  for (const name of candidateNames) {
    const fromEnv = env[name];
    if (typeof fromEnv === "string" && fromEnv.length > 0) {
      return fromEnv;
    }
  }

  throw new Error(
    `No API key found for provider "${provider}" in workspace "${workspaceId}"`,
  );
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

function instantiateProviderModel(
  provider: string,
  modelName: string,
  apiKey: string,
): LanguageModel {
  switch (provider.toLowerCase()) {
    case "openai":
      return createOpenAI({ apiKey })(modelName);
    case "anthropic":
      return createAnthropic({ apiKey })(modelName);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelName);
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
}

function createLazyProviderModel(
  env: MessagingDoEnv,
  getContext: () => { conversationId: string; workspaceId: string } | null,
  provider: string,
  modelName: string,
): LanguageModel {
  let resolved: LanguageModel | null = null;

  async function getModel(): Promise<LanguageModel> {
    if (resolved) return resolved;
    const context = getContext();
    if (!context) {
      throw new Error(
        `resolveModel called before conversation context was bound (provider=${provider})`,
      );
    }
    const apiKey = await withDb(env, (db) =>
      resolveProviderApiKey(env, db, context.workspaceId, provider),
    );
    resolved = instantiateProviderModel(provider, modelName, apiKey);
    return resolved;
  }

  return {
    specificationVersion: "v2",
    provider,
    modelId: modelName,
    supportedUrls: {},
    doGenerate: async (options) => (await getModel()).doGenerate(options),
    doStream: async (options) => (await getModel()).doStream(options),
  } as LanguageModel;
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

function createResolveModel(
  env: MessagingDoEnv,
  getContext: () => { conversationId: string; workspaceId: string } | null,
): AgentConfigOpts["resolveModel"] {
  return (provider: string, modelName: string) =>
    createLazyProviderModel(env, getContext, provider, modelName);
}

export function createMessagingDoDeps(
  env: MessagingDoEnv,
  overrides?: MessagingDoDepsOverrides,
): MessagingDoDeps {
  let conversationContext: { conversationId: string; workspaceId: string } | null =
    null;

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
    resolveModel: createResolveModel(env, () => conversationContext),
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
  };

  if (!overrides) {
    return base;
  }

  return {
    ...base,
    ...overrides,
    bindConversation: base.bindConversation,
  };
}
