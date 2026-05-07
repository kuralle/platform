/**
 * Integration test: agents.publish → list → get → history round-trip.
 *
 * Wires local Postgres + memory KvStore via the core test-utils pattern.
 * Calls oRPC procedure handlers via the internal `'~orpc'` def for direct invocation.
 *
 * eslint-disable is used for `any` casts on oRPC procedure results since the
 * `call` helper cannot preserve generic procedure types.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { appRouter } from "@kuralle/api/routers/index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import { createTestDb, releaseTestDb, resetSchema } from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import type { Context } from "@kuralle/api/context";
import { agents } from "@kuralle/db/schema/agents";

const MINIMAL_IR = {
  name: "Test Agent",
  description: "Test agent for integration tests",
  instructions: "You are a test agent.",
  model: { provider: "openai", name: "gpt-4o", temperature: 0.5 },
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
    ttsVoiceId: "v_aurora",
    sttModel: "deepgram-nova-3-monolingual",
    sttLanguage: "en",
  },
  channelConfig: {},
  complianceConfig: {
    retentionDays: 90,
    redactionPatterns: [],
    disclosureScript: "Test disclosure",
  },
  requestContextSchema: {},
};

const WORKSPACE_ID = "org_test_s2_03";

async function call(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<any> {
  const def = (procedure as Record<string, unknown>)["~orpc"] as {
    handler: (opts: { input: unknown; context: Context }) => Promise<any>;
  };
  return def.handler({ input, context });
}

describe("agents router round-trip", () => {
  let db: TestDb;
  let client: PoolClient;
  let kvStore: MemoryKvStore;
  let ctx: Context;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db;
    client = result.client;
  });

  afterAll(async () => {
    await releaseTestDb(client);
  });

  beforeEach(async () => {
    kvStore = new MemoryKvStore();
    await resetSchema(client, WORKSPACE_ID);
    ctx = {
      auth: null,
      session: { user: { id: null } } as unknown as Context["session"],
      db,
      kvStore,
    };
  });

  async function insertAgent(agentId: string): Promise<void> {
    await db.insert(agents).values({
      id: agentId,
      workspaceId: WORKSPACE_ID,
      status: "draft",
    });
  }

  it("publish → list → get → history round-trip", async () => {
    const agentId = "ag_test_roundtrip";
    await insertAgent(agentId);

    const publishResult: any = await call(
      appRouter.agents.publish,
      { workspaceId: WORKSPACE_ID, agentId, ir: MINIMAL_IR },
      ctx,
    );

    expect(publishResult.versionId).toMatch(/^av_/);
    expect(publishResult.versionNumber).toBe(1);
    expect(publishResult.activeVersionId).toBe(publishResult.versionId);

    const listResult: any = await call(
      appRouter.agents.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      ctx,
    );

    expect(listResult.items.length).toBeGreaterThanOrEqual(1);
    const agent = listResult.items.find(
      (a: { id: string }) => a.id === agentId,
    );
    expect(agent).toBeDefined();
    expect(agent.activeVersionId).toBe(publishResult.versionId);
    expect(agent.status).toBe("published");

    const getResult: any = await call(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );

    expect(getResult.agent.id).toBe(agentId);
    expect(getResult.activeVersion).toBeDefined();
    expect(getResult.activeVersion.id).toBe(publishResult.versionId);
    expect(getResult.activeVersion.versionKind).toBe("publish");

    const historyResult: any = await call(
      appRouter.agents.history,
      { workspaceId: WORKSPACE_ID, agentId, limit: 20 },
      ctx,
    );

    expect(historyResult.items.length).toBeGreaterThanOrEqual(1);
    const version = historyResult.items.find(
      (v: { id: string }) => v.id === publishResult.versionId,
    );
    expect(version).toBeDefined();
    expect(version.versionKind).toBe("publish");
    expect(version.agentId).toBe(agentId);
  });

  it("autoSave inserts version without projection or pointer swap", async () => {
    const agentId = "ag_test_autosave";
    await insertAgent(agentId);

    const result: any = await call(
      appRouter.agents.autoSave,
      { workspaceId: WORKSPACE_ID, agentId, ir: MINIMAL_IR },
      ctx,
    );

    expect(result.versionId).toMatch(/^av_/);
    expect(result.versionNumber).toBe(1);

    const agent: any = await call(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );

    expect(agent.agent.status).toBe("draft");
    expect(agent.agent.activeVersionId).toBeNull();
  });

  it("get throws for non-existent agent", async () => {
    await expect(
      call(
        appRouter.agents.get,
        { workspaceId: WORKSPACE_ID, agentId: "ag_nonexistent" },
        ctx,
      ),
    ).rejects.toThrow();
  });

  it("cache invalidation after publish", async () => {
    const agentId = "ag_test_cache";
    await insertAgent(agentId);

    const first: any = await call(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );
    expect(first.agent.activeVersionId).toBeNull();

    const pub: any = await call(
      appRouter.agents.publish,
      { workspaceId: WORKSPACE_ID, agentId, ir: MINIMAL_IR },
      ctx,
    );

    const second: any = await call(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );
    expect(second.agent.activeVersionId).toBe(pub.versionId);
  });
});
