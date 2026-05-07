/**
 * Integration test: agents.publish → list → get → history round-trip.
 *
 * Wires local Postgres + memory KvStore via the core test-utils pattern.
 * Calls oRPC procedure handlers via the internal `'~orpc'` def for direct invocation
 * (bypasses the auth middleware so tests don't need a real better-auth session).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "@kuralle/api/routers/index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import { createTestDb, releaseTestDb, resetSchema } from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import type { Context } from "@kuralle/api/context";
import type { AgentIR } from "@kuralle/core";
import { agents } from "@kuralle/db/schema/agents";
import {
  agentToolAttachments,
  agentKbAttachments,
  agentGuardrails,
  agentEvalCriteria,
  workflowNodesProjection,
  workflowEdgesProjection,
} from "@kuralle/db/schema/agents";

const MINIMAL_IR: AgentIR = {
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

/**
 * F04: AMENDMENT-003 + AMENDMENT-004 fixture. scorerAttachments carries
 * per-criterion fields (name/description/kind/rubric); workflow has 2 nodes + 1 edge.
 */
const AMENDED_IR: AgentIR = {
  ...MINIMAL_IR,
  scorerAttachments: {
    pii_redaction: {
      weight: 0.8,
      samplingRate: 0.5,
      name: "PII Redaction Adherence",
      description: "Did the agent redact PII per the disclosure script?",
      kind: "safety",
      rubric: "Score 1.0 if no PII leaked; 0.0 if any leaked.",
    },
  },
  workflow: {
    nodes: [
      { nodeId: "wf_start", kind: "extraction", title: "Start" },
      { nodeId: "wf_end", kind: "end", title: "End" },
    ],
    edges: [
      { sourceNodeId: "wf_start", targetNodeId: "wf_end" },
    ],
  },
};

const WORKSPACE_ID = "org_test_s2_03";

type ProcedureLike = {
  "~orpc": {
    handler: (opts: { input: unknown; context: Context }) => Promise<unknown>;
  };
};

async function call<T>(
  procedure: unknown,
  input: unknown,
  context: Context,
): Promise<T> {
  const def = (procedure as ProcedureLike)["~orpc"];
  return def.handler({ input, context }) as Promise<T>;
}

interface PublishResult {
  versionId: string;
  versionNumber: number;
  activeVersionId: string;
}

interface AgentRow {
  id: string;
  activeVersionId: string | null;
  status: string;
}

interface ListResult {
  items: AgentRow[];
  cursor: string | null;
}

interface VersionRow {
  id: string;
  agentId: string;
  versionKind: string;
}

interface HistoryResult {
  items: VersionRow[];
  cursor: string | null;
}

interface GetResult {
  agent: AgentRow;
  activeVersion: VersionRow | null;
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
    // F08: build a minimal but typed session for protectedProcedure context.
    // The `call` helper bypasses middleware; the handler reads
    // `context.session?.user?.id ?? null`, so a null session is sufficient.
    ctx = {
      auth: null,
      session: null,
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

    const publishResult = await call<PublishResult>(
      appRouter.agents.publish,
      { workspaceId: WORKSPACE_ID, agentId, ir: MINIMAL_IR },
      ctx,
    );

    expect(publishResult.versionId).toMatch(/^av_/);
    expect(publishResult.versionNumber).toBe(1);
    expect(publishResult.activeVersionId).toBe(publishResult.versionId);

    const listResult = await call<ListResult>(
      appRouter.agents.list,
      { workspaceId: WORKSPACE_ID, limit: 20 },
      ctx,
    );

    expect(listResult.items.length).toBeGreaterThanOrEqual(1);
    const agent = listResult.items.find((a) => a.id === agentId);
    expect(agent).toBeDefined();
    expect(agent!.activeVersionId).toBe(publishResult.versionId);
    expect(agent!.status).toBe("published");

    const getResult = await call<GetResult>(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );

    expect(getResult.agent.id).toBe(agentId);
    expect(getResult.activeVersion).toBeDefined();
    expect(getResult.activeVersion!.id).toBe(publishResult.versionId);
    expect(getResult.activeVersion!.versionKind).toBe("publish");

    const historyResult = await call<HistoryResult>(
      appRouter.agents.history,
      { workspaceId: WORKSPACE_ID, agentId, limit: 20 },
      ctx,
    );

    expect(historyResult.items.length).toBeGreaterThanOrEqual(1);
    const version = historyResult.items.find(
      (v) => v.id === publishResult.versionId,
    );
    expect(version).toBeDefined();
    expect(version!.versionKind).toBe("publish");
    expect(version!.agentId).toBe(agentId);

    // F03: projection row count assertions for the MINIMAL_IR (all empty).
    const counts = await projectionCounts(publishResult.versionId);
    expect(counts.tools).toBe(0);
    expect(counts.kb).toBe(0);
    expect(counts.guardrails).toBe(0);
    expect(counts.evalCriteria).toBe(0);
    expect(counts.workflowNodes).toBe(0);
    expect(counts.workflowEdges).toBe(0);
  });

  it("autoSave inserts version without projection or pointer swap", async () => {
    const agentId = "ag_test_autosave";
    await insertAgent(agentId);

    const result = await call<{ versionId: string; versionNumber: number }>(
      appRouter.agents.autoSave,
      { workspaceId: WORKSPACE_ID, agentId, ir: MINIMAL_IR },
      ctx,
    );

    expect(result.versionId).toMatch(/^av_/);
    expect(result.versionNumber).toBe(1);

    const agent = await call<GetResult>(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );

    expect(agent.agent.status).toBe("draft");
    expect(agent.agent.activeVersionId).toBeNull();

    // F03: projection rows must be ZERO after auto-save (no projector run).
    const counts = await projectionCounts(result.versionId);
    expect(counts.tools).toBe(0);
    expect(counts.kb).toBe(0);
    expect(counts.guardrails).toBe(0);
    expect(counts.evalCriteria).toBe(0);
    expect(counts.workflowNodes).toBe(0);
    expect(counts.workflowEdges).toBe(0);
  });

  it("get throws NOT_FOUND for non-existent agent", async () => {
    await expect(
      call(
        appRouter.agents.get,
        { workspaceId: WORKSPACE_ID, agentId: "ag_nonexistent" },
        ctx,
      ),
    ).rejects.toThrow(/not found|NOT_FOUND/i);
  });

  // F02: explicit publish-side NOT_FOUND test.
  it("publish throws NOT_FOUND for non-existent agent", async () => {
    await expect(
      call(
        appRouter.agents.publish,
        {
          workspaceId: WORKSPACE_ID,
          agentId: "ag_nonexistent",
          ir: MINIMAL_IR,
        },
        ctx,
      ),
    ).rejects.toThrow(/not found|NOT_FOUND/i);
  });

  it("cache invalidation after publish", async () => {
    const agentId = "ag_test_cache";
    await insertAgent(agentId);

    const first = await call<GetResult>(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );
    expect(first.agent.activeVersionId).toBeNull();

    const pub = await call<PublishResult>(
      appRouter.agents.publish,
      { workspaceId: WORKSPACE_ID, agentId, ir: MINIMAL_IR },
      ctx,
    );

    const second = await call<GetResult>(
      appRouter.agents.get,
      { workspaceId: WORKSPACE_ID, agentId },
      ctx,
    );
    expect(second.agent.activeVersionId).toBe(pub.versionId);
  });

  // F04: AMENDMENT-003 + AMENDMENT-004 round-trip exercises the per-criterion
  // scorer fields and the inline workflow nodes/edges.
  it("publish with AMENDMENT-003 scorer + AMENDMENT-004 workflow lands projection rows", async () => {
    const agentId = "ag_test_amended";
    await insertAgent(agentId);

    const pub = await call<PublishResult>(
      appRouter.agents.publish,
      { workspaceId: WORKSPACE_ID, agentId, ir: AMENDED_IR },
      ctx,
    );

    // AMENDMENT-003: the eval row carries the IR's per-criterion fields, not defaults.
    const evalRows = await db
      .select()
      .from(agentEvalCriteria)
      .where(eq(agentEvalCriteria.agentVersionId, pub.versionId));
    expect(evalRows).toHaveLength(1);
    expect(evalRows[0]!.id).toBe("pii_redaction");
    expect(evalRows[0]!.name).toBe("PII Redaction Adherence");
    expect(evalRows[0]!.kind).toBe("safety");
    expect(evalRows[0]!.description).toBe(
      "Did the agent redact PII per the disclosure script?",
    );
    expect(evalRows[0]!.rubric).toBe(
      "Score 1.0 if no PII leaked; 0.0 if any leaked.",
    );

    // AMENDMENT-004: workflow projection rows landed.
    const counts = await projectionCounts(pub.versionId);
    expect(counts.workflowNodes).toBe(2);
    expect(counts.workflowEdges).toBe(1);
    expect(counts.evalCriteria).toBe(1);
  });

  // ── helpers ────────────────────────────────────────────────────

  async function projectionCounts(versionId: string): Promise<{
    tools: number;
    kb: number;
    guardrails: number;
    evalCriteria: number;
    workflowNodes: number;
    workflowEdges: number;
  }> {
    const [tools, kb, guards, evals, wfNodes, wfEdges] = await Promise.all([
      db
        .select()
        .from(agentToolAttachments)
        .where(eq(agentToolAttachments.agentVersionId, versionId)),
      db
        .select()
        .from(agentKbAttachments)
        .where(eq(agentKbAttachments.agentVersionId, versionId)),
      db
        .select()
        .from(agentGuardrails)
        .where(eq(agentGuardrails.agentVersionId, versionId)),
      db
        .select()
        .from(agentEvalCriteria)
        .where(eq(agentEvalCriteria.agentVersionId, versionId)),
      db
        .select()
        .from(workflowNodesProjection)
        .where(eq(workflowNodesProjection.agentVersionId, versionId)),
      db
        .select()
        .from(workflowEdgesProjection)
        .where(eq(workflowEdgesProjection.agentVersionId, versionId)),
    ]);
    return {
      tools: tools.length,
      kb: kb.length,
      guardrails: guards.length,
      evalCriteria: evals.length,
      workflowNodes: wfNodes.length,
      workflowEdges: wfEdges.length,
    };
  }
});
