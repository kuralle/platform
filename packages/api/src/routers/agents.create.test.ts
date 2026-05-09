import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  seedWorkspaceMember,
  closePool,
} from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import { agents, agentVersions } from "@kuralle/db/schema";
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_ag_create";
const USER_ID = "user_ag_create";

const VALID_SNAPSHOT = {
  name: "Test Agent",
  description: "A test agent for schema validation",
  instructions: "Be helpful.",
  model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
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
    disclosureScript: "",
  },
  requestContextSchema: {},
};

describe("agents.create", () => {
  let db: TestDb;
  let client: PoolClient;
  let kvStore: MemoryKvStore;

  beforeAll(async () => {
    const t = await createTestDb();
    db = t.db;
    client = t.client;
  });

  afterAll(async () => {
    await releaseTestDb(client);
    await closePool();
  });

  beforeEach(async () => {
    kvStore = new MemoryKvStore();
    await resetSchema(client, WORKSPACE_ID);
    await seedWorkspaceMember(db, {
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      email: `${USER_ID}@test.local`,
    });
  });

  function ctx(): Context {
    return {
      auth: null,
      session: {
        user: {
          id: USER_ID,
          name: "T",
          email: "t@t",
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          image: null,
          systemRole: "user",
        },
        session: {
          id: "s1",
          token: "tok",
          userId: USER_ID,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      db,
      kvStore,
      env: {
        META_APP_ID: "",
        META_APP_SECRET: "",
        META_SYSTEM_USER_TOKEN: "",
        META_VERIFY_TOKEN: "",
        META_PHONE_NUMBER_ID: "",
        PUBLIC_BASE_URL: "http://localhost:3000",
      },
      requestHeaders: new Headers(),
    };
  }

  it("creates an agent with default snapshot when none provided", async () => {
    const result = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    expect(result.agentId).toMatch(/^ag_/);

    const [agentRow] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, result.agentId))
      .limit(1);

    expect(agentRow).toBeDefined();
    expect(agentRow!.workspaceId).toBe(WORKSPACE_ID);
    expect(agentRow!.status).toBe("draft");
    expect(agentRow!.activeVersionId).not.toBeNull();

    const [versionRow] = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, result.agentId))
      .limit(1);

    expect(versionRow).toBeDefined();
    expect(versionRow!.versionNumber).toBe(1);
    expect(versionRow!.versionKind).toBe("manual_save");
    expect(versionRow!.parentVersionId).toBeNull();
    expect(versionRow!.id).toBe(agentRow!.activeVersionId);
  });

  it("creates an agent with a provided snapshot", async () => {
    const result = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID, snapshot: VALID_SNAPSHOT },
      ctx(),
    );

    expect(result.agentId).toMatch(/^ag_/);

    const [versionRow] = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, result.agentId))
      .limit(1);

    const snapshot = versionRow!.snapshot as Record<string, unknown>;
    expect(snapshot.name).toBe("Test Agent");
  });

  it("sets the agent activeVersionId atomically", async () => {
    const result = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID },
      ctx(),
    );

    const [agentRow] = await db
      .select({ activeVersionId: agents.activeVersionId })
      .from(agents)
      .where(eq(agents.id, result.agentId))
      .limit(1);

    expect(agentRow!.activeVersionId).not.toBeNull();

    const versionCount = await db
      .select()
      .from(agentVersions)
      .where(eq(agentVersions.agentId, result.agentId));

    expect(versionCount).toHaveLength(1);
    expect(versionCount[0]!.id).toBe(agentRow!.activeVersionId);
  });
});
