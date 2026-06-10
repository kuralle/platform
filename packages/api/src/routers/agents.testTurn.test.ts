import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { ORPCError } from "@orpc/server";
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
import {
  __setTestTurnResolveModelOverride,
  createStubLanguageModel,
} from "@kuralle/runtime";
import type { Context } from "../context";
import { callProcedure } from "./test-call";

const WORKSPACE_ID = "org_ag_test_turn";
const USER_ID = "user_ag_test_turn";

const DRAFT_IR = {
  name: "Test Drawer Agent",
  description: "Runs in the test drawer",
  instructions: "Reply briefly.",
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

describe("agents.testTurn", () => {
  let db: TestDb;
  let client: PoolClient;
  let kvStore: MemoryKvStore;
  let agentId: string;

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

    const created = await callProcedure<{ agentId: string }>(
      appRouter.agents.create,
      { workspaceId: WORKSPACE_ID, snapshot: DRAFT_IR },
      ctx(),
    );
    agentId = created.agentId;
  });

  afterEach(() => {
    __setTestTurnResolveModelOverride(undefined);
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

  it("returns a deterministic model reply for a draft IR with stub model", async () => {
    __setTestTurnResolveModelOverride(() => createStubLanguageModel("Hello from the test agent."));

    const result = await callProcedure<{
      reply: string;
      sessionId: string;
      toolCalls: Array<{ name: string; ok: boolean }>;
    }>(
      appRouter.agents.testTurn,
      {
        workspaceId: WORKSPACE_ID,
        agentId,
        ir: DRAFT_IR,
        input: "Hi there",
      },
      ctx(),
    );

    expect(result.reply).toBe("Hello from the test agent.");
    expect(result.sessionId).toMatch(/^test_/);
    expect(result.toolCalls).toEqual([]);
  });

  it("returns a typed error when no provider key is configured", async () => {
    await expect(
      callProcedure(
        appRouter.agents.testTurn,
        {
          workspaceId: WORKSPACE_ID,
          agentId,
          ir: DRAFT_IR,
          input: "Hi there",
        },
        ctx(),
      ),
    ).rejects.toMatchObject({
      code: "FAILED_PRECONDITION",
      message: "No OpenAI key configured for this workspace",
    } satisfies Partial<ORPCError<"FAILED_PRECONDITION", unknown>>);
  });
});
