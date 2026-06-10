import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
  seedWorkspace,
} from "@kuralle/core/test-utils";
import type { PoolClient, TestDb } from "@kuralle/core/test-utils";
import { ToolRepository } from "@kuralle/core";
import * as schema from "@kuralle/db/schema";
import {
  createDbToolResolver,
  catalogToolToDefineTool,
  ToolExecutionConfigError,
} from "./tool-resolver.js";
import { noopAdapterLogger } from "./logger.js";

const workspaceId = "ws_tool_resolver";
const kv = new MemoryKvStore();

let client: PoolClient;
let db: TestDb;

beforeAll(async () => {
  const setup = await createTestDb();
  client = setup.client;
  db = setup.db;
});

beforeEach(async () => {
  await resetSchema(client, workspaceId);
  await seedWorkspace(db, { id: workspaceId });
});

afterAll(async () => {
  await releaseTestDb(client);
  await closePool();
});

describe("createDbToolResolver", () => {
  it("resolves a native webhook tool by id", async () => {
    const repo = new ToolRepository(db, workspaceId, kv);
    await repo.insert({
      id: "tool_weather",
      name: "get_weather",
      description: "Fetch weather",
      kind: "webhook",
      config: {
        url: "https://example.com/weather",
        method: "POST",
      },
    });

    const { resolveTool } = createDbToolResolver({
      db,
      workspaceId,
      kv,
      logger: noopAdapterLogger(),
    });

    const resolved = await resolveTool("tool_weather");
    expect(Object.keys(resolved)).toEqual(["tool_weather"]);
    expect(resolved.tool_weather?.description).toBe("Fetch weather");
    expect(resolved.tool_weather?.execute).toBeTypeOf("function");
  });

  it("resolves integration catalog tools by provider + external key", async () => {
    await db.insert(schema.toolCatalogProviders).values({
      id: "tcp_service_titan",
      workspaceId,
      kind: "composio",
      displayName: "Service Titan",
      mcpServerUrl: "https://example.com/mcp",
    });

    const repo = new ToolRepository(db, workspaceId, kv);
    await repo.insert({
      id: "tool_st_search",
      name: "service_titan.search_techs",
      kind: "webhook",
      catalogProviderId: "tcp_service_titan",
      externalToolKey: "search_techs",
      config: { url: "https://example.com/search" },
    });

    const { resolveIntegrationTools } = createDbToolResolver({
      db,
      workspaceId,
      kv,
      logger: noopAdapterLogger(),
    });

    const resolved = await resolveIntegrationTools("tcp_service_titan", [
      "search_techs",
      "missing_tool",
    ]);
    expect(Object.keys(resolved)).toEqual(["search_techs"]);
  });

  it("returns MCP tools that throw a clear error on execute", async () => {
    await db.insert(schema.toolCatalogProviders).values({
      id: "mcp_calderon_crm",
      workspaceId,
      kind: "mcp-custom",
      displayName: "Calderon CRM",
      mcpServerUrl: "https://example.com/mcp",
    });

    const repo = new ToolRepository(db, workspaceId, kv);
    await repo.insert({
      id: "tool_mcp_get",
      name: "crm.get_customer",
      kind: "mcp",
      catalogProviderId: "mcp_calderon_crm",
      externalToolKey: "get_customer",
      config: {},
    });

    const { resolveMcpTools } = createDbToolResolver({
      db,
      workspaceId,
      kv,
      logger: noopAdapterLogger(),
    });

    const resolved = await resolveMcpTools("mcp_calderon_crm", ["get_customer"]);
    await expect(resolved.get_customer!.execute({})).rejects.toBeInstanceOf(
      ToolExecutionConfigError,
    );
  });

  it("skips unknown tool ids without throwing", async () => {
    const warnings: string[] = [];
    const { resolveTool } = createDbToolResolver({
      db,
      workspaceId,
      kv,
      logger: { warn: (msg) => warnings.push(msg) },
    });

    const resolved = await resolveTool("tool_missing");
    expect(resolved).toEqual({});
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("catalogToolToDefineTool", () => {
  it("throws ToolExecutionConfigError when webhook url is missing", async () => {
    const tool = catalogToolToDefineTool({
      id: "t1",
      workspaceId: workspaceId,
      name: "broken_webhook",
      displayName: null,
      description: null,
      kind: "webhook",
      catalogProviderId: null,
      externalToolKey: null,
      inputSchema: null,
      outputSchema: null,
      config: {},
      status: "active",
      lastValidatedAt: null,
      createdAt: new Date(),
      updatedAt: null,
      deletedAt: null,
    });

    await expect(tool.execute({})).rejects.toThrow(/tool execution config missing/);
  });
});
