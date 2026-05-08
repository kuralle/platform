/**
 * SLO test: agents.publish sub-second latency.
 *
 * Asserts the USER_JOURNEYS.md §2 SLO #2 — 100 sequential publishes of a
 * representative AgentIR against local Postgres complete with p95 ≤ 1 s
 * wall-clock from oRPC request submission to agents.activeVersionId swap
 * visible.
 *
 * Second test exercises the failure-mode instrumentation: when a publish
 * exceeds 1 s (forced via vi.spyOn wrapping `projectAgent` to inject a
 * controlled delay — kimi-gate F3 fix replacing the prior module-level
 * `__injectedDelayMs` seam), a usage_events row with kind='slo_violation'
 * is written with the full payload per AC#2.
 *
 * Reuses the in-process oRPC server setup from agents.publish.test.ts (S2-03).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { eq, and } from "drizzle-orm";
import { appRouter } from "@kuralle/api/routers/index";
import { MemoryKvStore } from "@kuralle/platform/memory";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
} from "@kuralle/core/test-utils";
import type { PoolClient } from "@kuralle/core/test-utils";
import type { TestDb } from "@kuralle/core/test-utils";
import type { Context } from "@kuralle/api/context";
import type { AgentIR } from "@kuralle/core";
import { agents } from "@kuralle/db/schema/agents";
import { usageEvents } from "@kuralle/db/schema/billing";
import * as runtime from "@kuralle/runtime";
import {
  SLO_PUBLISH_NAME,
  SLO_PUBLISH_THRESHOLD_MS,
} from "@kuralle/runtime";

// ── fixture IR (representative: 5 tools / 2 guardrail nodes / 2 wf nodes / 1 wf edge) ──

const REPRESENTATIVE_IR: AgentIR = {
  name: "Calderon HVAC Dispatcher",
  description:
    "Inbound dispatcher for HVAC operators. Triages emergency / routine / quote / info calls.",
  instructions: "You are a calm, professional dispatcher.",
  model: { provider: "openai", name: "gpt-4o", temperature: 0.4 },
  defaultOptions: {},
  toolAttachments: {},
  workflowAttachments: {},
  subagentAttachments: {},
  integrationTools: {},
  mcpClientAttachments: {},
  kbAttachments: [],
  guardrailGraph: {
    nodes: [
      {
        id: "gr_pii_input",
        name: "PII Detection (Input)",
        direction: "input",
        evaluationModel: "gpt-4o-mini",
        prompt: "Check for PII.",
        onTrigger: "block",
        enabled: true,
        ordinal: 1,
      },
      {
        id: "gr_pricing_output",
        name: "Pricing Leak Prevention (Output)",
        direction: "output",
        evaluationModel: "gpt-4o-mini",
        prompt: "Check for pricing.",
        onTrigger: "redact",
        enabled: true,
        ordinal: 2,
      },
    ],
    edges: [],
  },
  scorerAttachments: {
    sc_call_resolution: { weight: 1.0, samplingRate: 1.0 },
  },
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
    disclosureScript: "This call is being recorded.",
  },
  requestContextSchema: {},
  workflow: {
    nodes: [
      { nodeId: "wf_start", kind: "dispatch" as const, title: "Start" },
      { nodeId: "wf_end", kind: "end" as const, title: "End" },
    ],
    edges: [{ sourceNodeId: "wf_start", targetNodeId: "wf_end" }],
  },
};

// ── helpers ────────────────────────────────────────────────────────

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

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function histogram(latencies: number[]): string {
  const s = [...latencies].sort((a, b) => a - b);
  const min = s[0]!;
  const p50 = percentile(s, 0.5);
  const p95 = percentile(s, 0.95);
  const p99 = percentile(s, 0.99);
  const max = s[s.length - 1]!;
  return [
    `n=${s.length}`,
    `min=${min.toFixed(1)}ms`,
    `p50=${p50.toFixed(1)}ms`,
    `p95=${p95.toFixed(1)}ms`,
    `p99=${p99.toFixed(1)}ms`,
    `max=${max.toFixed(1)}ms`,
  ].join("  ");
}

// ── test harness ───────────────────────────────────────────────────

const WORKSPACE_ID = "org_test_s2_05_slo";

interface PublishResult {
  versionId: string;
  versionNumber: number;
  activeVersionId: string;
}

describe("agents.publish SLO", () => {
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
    // AMENDMENT-005 migration (0012) extends usage_events.kind CHECK with
    // 'slo_violation', so no schema mutation is needed here. Older S2-05
    // versions of this test dropped/re-added the constraint per beforeEach;
    // that hack is gone.
    ctx = {
      auth: null,
      session: null,
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
    vi.restoreAllMocks();
  });

  async function insertAgent(agentId: string): Promise<void> {
    await db.insert(agents).values({
      id: agentId,
      workspaceId: WORKSPACE_ID,
      status: "draft",
    });
  }

  // ── Test 1: p95 ≤ 1 s over 100 sequential publishes ──────────────

  it("agents.publish meets p95 ≤ 1s SLO over 100 sequential publishes", async () => {
    const agentId = "ag_slo_p95";
    await insertAgent(agentId);

    const latencies: number[] = [];

    for (let i = 0; i < 100; i++) {
      const suffix = `_${i}`;
      const ir: AgentIR = {
        ...REPRESENTATIVE_IR,
        guardrailGraph: {
          nodes: REPRESENTATIVE_IR.guardrailGraph.nodes.map((n) => ({
            ...n,
            id: `${n.id}${suffix}`,
          })),
          edges: REPRESENTATIVE_IR.guardrailGraph.edges.map((e) => ({
            ...e,
            sourceNodeId: `${e.sourceNodeId}${suffix}`,
            targetNodeId: `${e.targetNodeId}${suffix}`,
          })),
        },
        scorerAttachments: Object.fromEntries(
          Object.entries(REPRESENTATIVE_IR.scorerAttachments).map(
            ([key, val]) => [`${key}${suffix}`, val],
          ),
        ),
      };

      const t0 = performance.now();
      const result = await call<PublishResult>(
        appRouter.agents.publish,
        { workspaceId: WORKSPACE_ID, agentId, ir },
        ctx,
      );
      const t1 = performance.now();

      expect(result.versionId).toMatch(/^av_/);
      expect(result.activeVersionId).toBe(result.versionId);

      latencies.push(t1 - t0);
    }

    const s = [...latencies].sort((a, b) => a - b);
    const p95 = percentile(s, 0.95);
    const p99 = percentile(s, 0.99);

    console.log(
      `\n[SLO] agents.publish — 100 sequential publishes: ${histogram(latencies)}`,
    );

    expect(p95).toBeLessThanOrEqual(SLO_PUBLISH_THRESHOLD_MS);
    expect(p99).toBeLessThanOrEqual(5000);
  }, 60_000);

  // ── Test 2: failure-mode instrumentation ─────────────────────────

  it(
    "projector slow-path writes usage_events with kind=slo_violation + payload",
    async () => {
      // F3 fix: replace the prior module-level __setProjectorDelay seam with
      // a vi.spyOn wrapper that injects a controlled delay only for this
      // test. Production code path is untouched; the projector signature did
      // not change.
      const realProject = runtime.projectAgent;
      vi.spyOn(runtime, "projectAgent").mockImplementation(
        async (...args) => {
          await new Promise((r) =>
            setTimeout(r, SLO_PUBLISH_THRESHOLD_MS + 100),
          );
          return realProject(...args);
        },
      );

      const agentId = "ag_slo_fail";
      await insertAgent(agentId);

      const result = await call<PublishResult>(
        appRouter.agents.publish,
        { workspaceId: WORKSPACE_ID, agentId, ir: REPRESENTATIVE_IR },
        ctx,
      );

      expect(result.versionId).toMatch(/^av_/);

      // Fire-and-forget slo_violation insert should land within 3 s.
      await vi.waitFor(
        async () => {
          const rows = await db
            .select()
            .from(usageEvents)
            .where(
              and(
                eq(usageEvents.kind, "slo_violation"),
                eq(usageEvents.agentVersionId, result.versionId),
              ),
            );
          expect(rows.length).toBe(1);
          // F2 fix (post-AMENDMENT-005): assert the full payload contract
          // from AC#2 — { slo, observedMs, thresholdMs }.
          expect(rows[0]!.quantity!).toBeGreaterThanOrEqual(
            SLO_PUBLISH_THRESHOLD_MS,
          );
          const payload = rows[0]!.payload as {
            slo: string;
            observedMs: number;
            thresholdMs: number;
          };
          expect(payload).toMatchObject({
            slo: SLO_PUBLISH_NAME,
            thresholdMs: SLO_PUBLISH_THRESHOLD_MS,
          });
          expect(payload.observedMs).toBeGreaterThanOrEqual(
            SLO_PUBLISH_THRESHOLD_MS,
          );
        },
        { timeout: 3000, interval: 100 },
      );
    },
    15_000,
  );
});
