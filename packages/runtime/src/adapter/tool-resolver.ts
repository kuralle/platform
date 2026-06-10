import { defineTool } from "@kuralle-agents/core";
import type { AnyTool } from "@kuralle-agents/core";
import { ToolRepository, type Tool } from "@kuralle/core";
import type { RepoDb } from "@kuralle/core";
import type { KvStore } from "@kuralle/platform/interface";
import { z } from "zod";
import type { AgentConfigOpts } from "./agent-config.js";
import type { AdapterLogger } from "./logger.js";
import { consoleAdapterLogger } from "./logger.js";

/** Stored JSON Schema is validated minimally at runtime — no JSON-Schema→zod converter. */
const passthroughToolInput = z.object({}).passthrough();

interface WebhookToolConfig {
  url?: string;
  method?: string;
  auth?: { type?: string; token?: string; header?: string };
  headers?: Record<string, string>;
}

export class ToolExecutionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionConfigError";
  }
}

function buildWebhookExecutor(config: unknown) {
  const cfg = config as WebhookToolConfig;
  if (!cfg?.url) {
    return async () => {
      throw new ToolExecutionConfigError(
        "tool execution config missing: webhook url is required",
      );
    };
  }

  return async (input: Record<string, unknown>) => {
    const method = (cfg.method ?? "POST").toUpperCase();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...cfg.headers,
    };
    if (cfg.auth?.type === "bearer" && cfg.auth.token) {
      headers.Authorization = `Bearer ${cfg.auth.token}`;
    } else if (cfg.auth?.type === "api-key" && cfg.auth.token) {
      const header = cfg.auth.header ?? "X-API-Key";
      headers[header] = cfg.auth.token;
    }

    const response = await fetch(cfg.url!, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(input),
    });

    if (!response.ok) {
      throw new ToolExecutionConfigError(
        `webhook tool failed: HTTP ${response.status}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return { body: await response.text() };
  };
}

export function catalogToolToDefineTool(tool: Tool): AnyTool {
  const description = tool.description ?? tool.displayName ?? tool.name;

  switch (tool.kind) {
    case "webhook":
      return defineTool({
        name: tool.name,
        description,
        input: passthroughToolInput,
        execute: buildWebhookExecutor(tool.config),
      });
    case "mcp":
      return defineTool({
        name: tool.name,
        description,
        input: passthroughToolInput,
        execute: async () => {
          throw new ToolExecutionConfigError(
            "MCP tool execution is not available: MCP client infrastructure is not wired in this runtime",
          );
        },
      });
    case "client":
    case "system":
      return defineTool({
        name: tool.name,
        description,
        input: passthroughToolInput,
        execute: async () => {
          throw new ToolExecutionConfigError(
            `tool execution config missing: runtime resolver does not implement kind '${tool.kind}'`,
          );
        },
      });
    default:
      return defineTool({
        name: tool.name,
        description,
        input: passthroughToolInput,
        execute: async () => {
          throw new ToolExecutionConfigError(
            `tool execution config missing: unknown tool kind '${tool.kind}'`,
          );
        },
      });
  }
}

export interface DbToolResolverOpts {
  db: RepoDb;
  workspaceId: string;
  kv: KvStore;
  logger?: AdapterLogger;
}

export interface DbToolResolvers {
  resolveTool: NonNullable<AgentConfigOpts["resolveTool"]>;
  resolveIntegrationTools: NonNullable<AgentConfigOpts["resolveIntegrationTools"]>;
  resolveMcpTools: NonNullable<AgentConfigOpts["resolveMcpTools"]>;
}

export function createDbToolResolver(opts: DbToolResolverOpts): DbToolResolvers {
  const logger = opts.logger ?? consoleAdapterLogger;
  const toolRepo = new ToolRepository(opts.db, opts.workspaceId, opts.kv);

  const resolveCatalogEntry = async (
    lookup: () => Promise<Tool | null>,
    context: Record<string, unknown>,
    toolKey: string,
  ): Promise<Record<string, AnyTool>> => {
    try {
      const tool = await lookup();
      if (!tool) {
        logger.warn("adapter: tool resolver lookup missed", { ...context, toolKey });
        return {};
      }
      const built = catalogToolToDefineTool(tool);
      return { [toolKey]: built };
    } catch (error) {
      logger.warn("adapter: tool resolver lookup failed", {
        ...context,
        toolKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  };

  return {
    resolveTool: async (toolId) =>
      resolveCatalogEntry(() => toolRepo.findById(toolId), { source: "native" }, toolId),

    resolveIntegrationTools: async (tcpId, selectedTools) => {
      const result: Record<string, AnyTool> = {};
      for (const toolKey of selectedTools) {
        const resolved = await resolveCatalogEntry(
          () => toolRepo.findByCatalogProviderAndExternalKey(tcpId, toolKey),
          { source: "integration", catalogProviderId: tcpId },
          toolKey,
        );
        Object.assign(result, resolved);
      }
      return result;
    },

    resolveMcpTools: async (clientId, allowedTools) => {
      const result: Record<string, AnyTool> = {};
      for (const toolKey of allowedTools) {
        const resolved = await resolveCatalogEntry(
          () => toolRepo.findByCatalogProviderAndExternalKey(clientId, toolKey),
          { source: "mcp", catalogProviderId: clientId },
          toolKey,
        );
        Object.assign(result, resolved);
      }
      return result;
    },
  };
}
