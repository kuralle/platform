import { createRuntime, MemoryStore } from "@kuralle-agents/core";
import type { AgentConfig } from "@kuralle-agents/core";
import type { AgentIR } from "@kuralle/core";
import { agentIRSchema } from "@kuralle/core";
import type { Db } from "@kuralle/db";
import { agents, agentVersions } from "@kuralle/db/schema";
import type { KvStore } from "@kuralle/platform/interface";
import { and, eq, isNull } from "drizzle-orm";
import { irToAgentConfig } from "./adapter/agent-config.js";
import type { AgentConfigOpts } from "./adapter/agent-config.js";
import { createDbToolResolver } from "./adapter/tool-resolver.js";
import {
  createWorkspaceModelResolver,
  ModelResolutionError,
  type ModelResolverEnv,
} from "./adapter/resolve-model.js";

const MAX_GRAPH_DEPTH = 5;
const SESSION_TTL_MS = 30 * 60 * 1000;

interface SessionEntry {
  store: MemoryStore;
  expiresAt: number;
}

const sessionStores = new Map<string, SessionEntry>();

let testResolveModelOverride: AgentConfigOpts["resolveModel"] | undefined;

export function __setTestTurnResolveModelOverride(
  override: AgentConfigOpts["resolveModel"] | undefined,
): void {
  testResolveModelOverride = override;
}

export interface AgentGraphEntry {
  agentId: string;
  ir: AgentIR;
}

export interface AgentTestTurnResult {
  reply: string;
  sessionId: string;
  toolCalls: Array<{ name: string; ok: boolean }>;
}

export interface RunAgentTestTurnOpts {
  db: Db;
  kv: KvStore;
  env?: ModelResolverEnv;
  workspaceId: string;
  agentId: string;
  ir?: AgentIR;
  input: string;
  sessionId?: string;
}

function pruneExpiredSessions(now: number): void {
  for (const [id, entry] of sessionStores) {
    if (entry.expiresAt <= now) {
      sessionStores.delete(id);
    }
  }
}

function getOrCreateSessionStore(sessionId: string): MemoryStore {
  const now = Date.now();
  pruneExpiredSessions(now);
  const existing = sessionStores.get(sessionId);
  if (existing) {
    existing.expiresAt = now + SESSION_TTL_MS;
    return existing.store;
  }
  const store = new MemoryStore();
  sessionStores.set(sessionId, { store, expiresAt: now + SESSION_TTL_MS });
  return store;
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
    return null;
  }

  return { agentId, ir: parsed.data };
}

async function loadAgentGraph(
  db: Db,
  workspaceId: string,
  rootAgentId: string,
  rootIr: AgentIR,
): Promise<{ defaultAgentId: string; agents: AgentGraphEntry[] }> {
  const loaded = new Map<string, AgentGraphEntry>();
  const visited = new Set<string>();

  async function walk(agentId: string, ir: AgentIR, depth: number): Promise<void> {
    if (visited.has(agentId) || depth > MAX_GRAPH_DEPTH) {
      return;
    }
    visited.add(agentId);
    loaded.set(agentId, { agentId, ir });

    for (const subagentId of Object.keys(ir.subagentAttachments)) {
      if (subagentId === agentId) continue;
      const snapshot = await loadAgentSnapshot(db, workspaceId, subagentId);
      if (!snapshot) continue;
      await walk(subagentId, snapshot.ir, depth + 1);
    }
  }

  await walk(rootAgentId, rootIr, 0);

  return {
    defaultAgentId: rootAgentId,
    agents: [...loaded.values()],
  };
}

function toolCallOk(result: unknown): boolean {
  if (result instanceof Error) return false;
  if (result && typeof result === "object" && "error" in result) {
    return false;
  }
  return true;
}

export async function runAgentTestTurn(
  opts: RunAgentTestTurnOpts,
): Promise<AgentTestTurnResult> {
  const rootIr =
    opts.ir ??
    (await loadAgentSnapshot(opts.db, opts.workspaceId, opts.agentId))?.ir;
  if (!rootIr) {
    throw new Error("Agent not found or has no active version snapshot");
  }

  const graph = await loadAgentGraph(
    opts.db,
    opts.workspaceId,
    opts.agentId,
    rootIr,
  );

  const resolveModel = createWorkspaceModelResolver({
    db: opts.db,
    env: opts.env ?? {},
    workspaceId: opts.workspaceId,
    override: testResolveModelOverride,
  });
  const { resolveTool, resolveIntegrationTools, resolveMcpTools } =
    createDbToolResolver({
      db: opts.db,
      workspaceId: opts.workspaceId,
      kv: opts.kv,
    });

  const configs: AgentConfig[] = [];
  for (const entry of graph.agents) {
    configs.push(
      await irToAgentConfig(entry.ir, {
        agentId: entry.agentId,
        resolveModel,
        resolveTool,
        resolveIntegrationTools,
        resolveMcpTools,
      }),
    );
  }

  const sessionId = opts.sessionId ?? `test_${crypto.randomUUID()}`;
  const runtime = createRuntime({
    agents: configs,
    defaultAgentId: graph.defaultAgentId,
    sessionStore: getOrCreateSessionStore(sessionId),
  });

  const turn = runtime.run({
    sessionId,
    agentId: graph.defaultAgentId,
    input: opts.input,
  });
  const result = await turn;

  return {
    reply: result.text,
    sessionId,
    toolCalls: result.toolResults.map((toolResult) => ({
      name: toolResult.name,
      ok: toolCallOk(toolResult.result),
    })),
  };
}

export { ModelResolutionError };
