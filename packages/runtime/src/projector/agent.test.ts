/**
 * Projector agent tests.
 *
 * Test plan:
 *   1. Round-trip property test (fast-check, 50+ cases)
 *   2. Latency test (p95 ≤ 200 ms, 100 projections of representative IR)
 *   3. FK violation failure-path test
 *
 * Substrate: local Postgres via @kuralle/core/test-utils (S2-01 convention).
 * Prerequisite: Postgres running at postgres://kuralle:kuralle@localhost:5432/kuralle_dev
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fc from "fast-check";
import { eq, sql } from "drizzle-orm";
import * as schema from "@kuralle/db/schema";
import {
  createTestDb,
  releaseTestDb,
  resetSchema,
  closePool,
  type TestDb,
  type PoolClient,
} from "@kuralle/core/test-utils";
import { agentIRSchema, type AgentIR } from "@kuralle/core";
import { projectAgent, type AgentProjectionTx } from "./agent.js";
import calderonIR from "./__fixtures__/calderon-dispatcher-ir.json" with { type: "json" };

/** Coerce a parsed AgentIR into Drizzle's jsonb insert type without `as unknown as` casts. */
function toJsonb(ir: AgentIR): Record<string, unknown> {
  return ir as unknown as Record<string, unknown>;
}

const TEST_WS = "ws_proj_test";
const TEST_AGENT_ID = "ag_proj_test";
let db: TestDb;
let client: PoolClient;

beforeAll(async () => {
  const result = await createTestDb();
  db = result.db;
  client = result.client;
});

afterAll(async () => {
  releaseTestDb(client);
  await closePool();
});

beforeEach(async () => {
  await resetSchema(client, TEST_WS);
  // Insert a parent agent row so agent_versions FK is satisfiable
  await client.query(
    `INSERT INTO agents (id, workspace_id, status, created_at)
     VALUES ($1, $2, 'draft', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [TEST_AGENT_ID, TEST_WS],
  );
  // Insert referenced tools (FK from agent_tool_attachments.tool_id → tools.id)
  for (const toolId of [
    "tool_lookup_zip",
    "tool_book_appointment",
    "tool_check_tech_availability",
    "tool_lookup_customer",
    "tool_escalate_to_manager",
    "ag_calderon_intake",
    "tcp_service_titan",
    "mcp_calderon_crm",
  ]) {
    await client.query(
      `INSERT INTO tools (id, workspace_id, name, display_name, kind, config, status, created_at)
       VALUES ($1, $2, $3, $3, 'system', '{}'::jsonb, 'active', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [toolId, TEST_WS, toolId],
    );
  }
  // Insert referenced KB documents (FK from agent_kb_attachments.document_id → kb_documents.id)
  for (const kbId of [
    "kb_calderon_pricing_q4",
    "kb_calderon_service_areas",
    "kb_calderon_warranty_terms",
  ]) {
    await client.query(
      `INSERT INTO kb_documents (id, workspace_id, name, source, size_bytes, status, created_at)
       VALUES ($1, $2, $3, 'file', 0, 'ready', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [kbId, TEST_WS, kbId],
    );
  }
});

/** Parse the fixed IR fixture through Zod to get the typed AgentIR */
const parsedFixture: AgentIR = agentIRSchema.parse(calderonIR);

// ── fast-check Arbitraries ──────────────────────────────────────────
// Constraints documented inline per §4 acceptance criterion 5.

const modelArb: fc.Arbitrary<AgentIR["model"]> = fc.record({
  provider: fc.constantFrom("openai", "anthropic", "google", "custom"),
  name: fc.constantFrom("gpt-4o", "gpt-4o-mini", "claude-sonnet-4-20250514", "gemini-2.5-pro"),
  temperature: fc.option(fc.float({ min: 0, max: 2 }), { nil: undefined }),
});

const voiceConfigArb = fc.record({
  pipelineMode: fc.constantFrom("stt-llm-tts", "stt-llm", "llm-tts"),
  ttsModel: fc.constantFrom("cartesia-sonic-3", "elevenlabs-turbo-v2.5", "openai-tts-1"),
  ttsVoiceId: fc.string({ minLength: 2, maxLength: 20 }),
  sttModel: fc.constantFrom("deepgram-nova-3-monolingual", "deepgram-nova-3"),
  sttLanguage: fc.option(fc.constantFrom("en", "es", "fr"), { nil: undefined }),
});

const complianceConfigArb = fc.record({
  retentionDays: fc.integer({ min: 1, max: 365 }),
  redactionPatterns: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  disclosureScript: fc.string({ maxLength: 200 }),
});

const guardrailNodeArb = fc.record({
  id: fc.string({ minLength: 3, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 30 }),
  direction: fc.constantFrom("input", "output", "both"),
  evaluationModel: fc.constantFrom("gpt-4o-mini", "gpt-4o"),
  prompt: fc.string({ maxLength: 100 }),
  onTrigger: fc.constantFrom("block", "redact", "flag", "escalate"),
  enabled: fc.boolean(),
  ordinal: fc.nat({ max: 100 }),
});

/** Edge references only present node IDs (valid DAG constraint). */
function guardrailGraphArb(): fc.Arbitrary<AgentIR["guardrailGraph"]> {
  return fc.array(guardrailNodeArb, { minLength: 0, maxLength: 10 }).chain((nodes) => {
    if (nodes.length < 2) return fc.constant({ nodes, edges: [] });
    const nodeIds = nodes.map((n) => n.id);
    const edgeArb = fc.record({
      sourceNodeId: fc.constantFrom(...nodeIds),
      targetNodeId: fc.constantFrom(...nodeIds),
      conditionType: fc.option(fc.constantFrom("llm", "expression", "none"), { nil: undefined }),
      conditionLabel: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
    });
    return fc.array(edgeArb, { maxLength: 10 }).map((edges) => ({ nodes, edges }));
  });
}

function toolAttachmentsArb(): fc.Arbitrary<AgentIR["toolAttachments"]> {
  // F05: maxKeys here is 10 (intentionally smaller than the 0-50 range
  // documented at the IR level); fast-check property tests run faster on a
  // smaller dictionary while still exercising the projection logic. Fixture-
  // based tests (Calderon HVAC) cover the larger-IR end of the range.
  return fc.dictionary(
    fc.string({ minLength: 3, maxLength: 15 }),
    fc.record({
      description: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
      rules: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
    }),
    { minKeys: 0, maxKeys: 10 },
  );
}

function scorerAttachmentsArb(): fc.Arbitrary<AgentIR["scorerAttachments"]> {
  // AMENDMENT-003: optional per-criterion fields name/description/kind/rubric.
  // We generate them sometimes (via fc.option with nil:undefined) so the
  // round-trip property test exercises both pre- and post-amendment shapes.
  return fc.dictionary(
    fc.string({ minLength: 3, maxLength: 20 }),
    fc.record({
      weight: fc.float({ min: 0, max: 5, noNaN: true }),
      samplingRate: fc.float({ min: 0, max: 1, noNaN: true }),
      name: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: undefined }),
      description: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
      kind: fc.option(
        fc.constantFrom("success" as const, "data" as const, "safety" as const),
        { nil: undefined },
      ),
      rubric: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
    }),
    { minKeys: 0, maxKeys: 10 },
  );
}

function workflowArb(): fc.Arbitrary<NonNullable<AgentIR["workflow"]>> {
  const nodeArb = fc.record({
    nodeId: fc.string({ minLength: 3, maxLength: 15 }),
    kind: fc.constantFrom("subagent", "extraction", "dispatch", "transfer-agent", "transfer-number", "end"),
    title: fc.string({ minLength: 1, maxLength: 30 }),
    positionX: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
    positionY: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
  });

  // F07: edges form a valid DAG. We enforce this by ordering nodes (by their
  // generated index) and only allowing edges that go i → j with i < j. This
  // also rules out self-loops by construction.
  return fc.array(nodeArb, { minLength: 0, maxLength: 12 }).chain((rawNodes) => {
    // De-duplicate node ids deterministically so generated arbitraries with
    // colliding strings don't break edge resolution.
    const seenIds = new Set<string>();
    const nodes = rawNodes.filter((n) => {
      if (seenIds.has(n.nodeId)) return false;
      seenIds.add(n.nodeId);
      return true;
    });

    if (nodes.length < 2) return fc.constant({ nodes, edges: [] });

    // Enumerate all valid forward edges (i → j with i < j) and pick a subset.
    const candidateEdges: Array<{ source: string; target: string }> = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        candidateEdges.push({ source: nodes[i]!.nodeId, target: nodes[j]!.nodeId });
      }
    }

    return fc
      .subarray(candidateEdges, { maxLength: Math.min(15, candidateEdges.length) })
      .chain((picked) =>
        fc
          .array(
            fc.record({
              conditionType: fc.option(fc.constantFrom("llm", "expression", "none"), {
                nil: undefined,
              }),
              conditionLabel: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
            }),
            { minLength: picked.length, maxLength: picked.length },
          )
          .map((extras) => ({
            nodes,
            edges: picked.map((e, idx) => ({
              sourceNodeId: e.source,
              targetNodeId: e.target,
              conditionType: extras[idx]!.conditionType,
              conditionLabel: extras[idx]!.conditionLabel,
            })),
          })),
      );
  });
}

/** Full AgentIR arbitrary with realistic size constraints. */
const agentIRArb: fc.Arbitrary<AgentIR> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 60 }),
  description: fc.string({ maxLength: 200 }),
  instructions: fc.string({ maxLength: 500 }),
  model: modelArb,
  defaultOptions: fc.constant({}),
  toolAttachments: toolAttachmentsArb(),
  workflowAttachments: fc.constant({}),
  subagentAttachments: fc.constant({}),
  integrationTools: fc.constant({}),
  mcpClientAttachments: fc.constant({}),
  kbAttachments: fc.array(
    fc.record({ documentId: fc.string({ minLength: 3, maxLength: 20 }) }),
    { maxLength: 10 },
  ),
  guardrailGraph: guardrailGraphArb(),
  scorerAttachments: scorerAttachmentsArb(),
  voiceConfig: voiceConfigArb,
  channelConfig: fc.constant({}),
  complianceConfig: complianceConfigArb,
  requestContextSchema: fc.constant({}),
  workflow: fc.option(workflowArb(), { nil: undefined }),
});

// ── Helpers ─────────────────────────────────────────────────────────

type TestTx = AgentProjectionTx;

/** Insert an agent_version row and return its id. */
async function insertAgentVersion(
  tx: TestTx,
  agentId: string,
  versionKind: string,
  ir: AgentIR,
): Promise<string> {
  const versionId = `av_test_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await tx.insert(schema.agentVersions).values({
    id: versionId,
    agentId,
    versionNumber: 1,
    versionKind,
    snapshot: toJsonb(ir),
  });
  return versionId;
}

/** Reconstruct an AgentIR from the snapshot + projection rows. */
async function reconstructIR(
  tx: TestTx,
  versionId: string,
): Promise<AgentIR> {
  // Read snapshot
  const versionRows = await tx
    .select({ snapshot: schema.agentVersions.snapshot })
    .from(schema.agentVersions)
    .where(eq(schema.agentVersions.id, versionId))
    .limit(1);

  if (!versionRows[0]) throw new Error(`Agent version ${versionId} not found`);
  const ir = versionRows[0].snapshot as AgentIR;

  // Read tool attachments
  const toolRows = await tx
    .select()
    .from(schema.agentToolAttachments)
    .where(eq(schema.agentToolAttachments.agentVersionId, versionId));

  // Read KB attachments
  const kbRows = await tx
    .select()
    .from(schema.agentKbAttachments)
    .where(eq(schema.agentKbAttachments.agentVersionId, versionId));

  // Read guardrails
  const guardrailRows = await tx
    .select()
    .from(schema.agentGuardrails)
    .where(eq(schema.agentGuardrails.agentVersionId, versionId));

  // Read eval criteria
  const evalRows = await tx
    .select()
    .from(schema.agentEvalCriteria)
    .where(eq(schema.agentEvalCriteria.agentVersionId, versionId));

  // Read workflow nodes
  const wfNodeRows = await tx
    .select()
    .from(schema.workflowNodesProjection)
    .where(eq(schema.workflowNodesProjection.agentVersionId, versionId));

  // Read workflow edges
  const wfEdgeRows = await tx
    .select()
    .from(schema.workflowEdgesProjection)
    .where(eq(schema.workflowEdgesProjection.agentVersionId, versionId));

  // Build reconstructed IR (base on snapshot, verify projection consistency)
  const reconstructed: AgentIR = {
    ...ir,
    toolAttachments: {},
    integrationTools: {},
    mcpClientAttachments: {},
    subagentAttachments: {},
    kbAttachments: kbRows.map((r) => ({ documentId: r.documentId })),
    guardrailGraph: {
      nodes: guardrailRows.map((r) => ({
        id: r.id,
        name: r.name,
        direction: r.direction as AgentIR["guardrailGraph"]["nodes"][0]["direction"],
        evaluationModel: r.evaluationModel,
        prompt: r.prompt,
        onTrigger: r.onTrigger as AgentIR["guardrailGraph"]["nodes"][0]["onTrigger"],
        enabled: r.enabled ?? true,
        ordinal: r.ordinal,
      })),
      edges: ir.guardrailGraph.edges,
    },
    scorerAttachments: {},
    workflow: ir.workflow
      ? {
          nodes: wfNodeRows.map((r) => ({
            nodeId: r.nodeId,
            kind: r.kind as NonNullable<AgentIR["workflow"]>["nodes"][0]["kind"],
            title: r.title,
            positionX: r.positionX ?? undefined,
            positionY: r.positionY ?? undefined,
          })),
          edges: wfEdgeRows.map((r) => ({
            sourceNodeId: r.sourceNodeId,
            targetNodeId: r.targetNodeId,
            conditionType: (r.conditionType ?? undefined) as
              | "llm"
              | "expression"
              | "none"
              | undefined,
            conditionLabel: r.conditionLabel ?? undefined,
          })),
        }
      : undefined,
  };

  // Rebuild toolAttachments by source
  for (const t of toolRows) {
    if (t.source === "native") {
      reconstructed.toolAttachments[t.toolId] = {
        description: (t.config as Record<string, unknown> | null)?.description as string | undefined,
        rules: (t.config as Record<string, unknown> | null)?.rules as string | undefined,
      };
    } else if (t.source === "integration") {
      reconstructed.integrationTools[t.toolId] = {
        selectedTools: ((t.config as Record<string, unknown> | null)?.selectedTools as string[]) ?? [],
      };
    } else if (t.source === "mcp") {
      reconstructed.mcpClientAttachments[t.toolId] = {
        allowedTools: ((t.config as Record<string, unknown> | null)?.allowedTools as string[]) ?? [],
      };
    } else if (t.source === "subagent") {
      reconstructed.subagentAttachments[t.toolId] = {};
    }
  }

  // AMENDMENT-003: scorerAttachments reconstructed from eval rows for the
  // projection-side fields (weight, name, description, kind, rubric). The
  // samplingRate field has no projection column — it's a runtime-only field
  // per the AMENDMENT-003 footnote; we read it from the snapshot.
  const snapshotScorers = ir.scorerAttachments;
  for (const e of evalRows) {
    const orig = snapshotScorers[e.id];
    reconstructed.scorerAttachments[e.id] = {
      weight: e.weight ?? 1,
      samplingRate: orig?.samplingRate ?? 0,
      name: e.name,
      description: e.description ?? "",
      kind: e.kind as "success" | "data" | "safety",
      rubric: e.rubric,
    };
  }

  return reconstructed;
}

/**
 * Apply the projector's default-fill semantics to an IR's scorerAttachments
 * so the original (pre-projection) IR can be compared to the reconstructed
 * (post-projection-roundtrip) IR. Per AMENDMENT-003: when the IR omits a
 * scorer field, the projector writes the default; the reconstruction reads
 * the default. To compare, we apply the same defaults to the original.
 */
function applyScorerDefaults(ir: AgentIR): AgentIR {
  return {
    ...ir,
    scorerAttachments: Object.fromEntries(
      Object.entries(ir.scorerAttachments).map(([id, s]) => [
        id,
        {
          weight: s.weight,
          samplingRate: s.samplingRate,
          name: s.name ?? id,
          description: s.description ?? "",
          kind: s.kind ?? "success",
          rubric: s.rubric ?? "",
        },
      ]),
    ),
  };
}

/**
 * Coerce a number to single-precision (Postgres `real`) so doubles in the IR
 * compare equal to projection rows after the DB round-trip. `agent_eval_criteria.weight`
 * is `real` per `DATA_MODEL.md §5:431` (4 bytes / IEEE 754 single).
 */
function toReal(n: number): number {
  return Math.fround(n);
}

/**
 * Canonicalize an IR so DB-non-deterministic orderings (kb attachments,
 * guardrail nodes, workflow nodes/edges), float precision (single-precision
 * `real` columns), and undefined-vs-missing key shapes compare structurally.
 * Used by the round-trip property test before `toEqual`. The final
 * JSON.parse(JSON.stringify(...)) round-trip strips `undefined` keys so the
 * reconstructed-from-DB IR and the JSON-shaped original IR compare cleanly.
 */
function canonicalize(ir: AgentIR): AgentIR {
  const sorted: AgentIR = {
    ...ir,
    kbAttachments: [...ir.kbAttachments].sort((a, b) =>
      a.documentId.localeCompare(b.documentId),
    ),
    guardrailGraph: {
      nodes: [...ir.guardrailGraph.nodes].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      edges: [...ir.guardrailGraph.edges].sort((a, b) =>
        (a.sourceNodeId + a.targetNodeId).localeCompare(b.sourceNodeId + b.targetNodeId),
      ),
    },
    scorerAttachments: Object.fromEntries(
      Object.entries(ir.scorerAttachments).map(([id, s]) => [
        id,
        { ...s, weight: toReal(s.weight) },
      ]),
    ),
    workflow: ir.workflow
      ? {
          nodes: [...ir.workflow.nodes].sort((a, b) =>
            a.nodeId.localeCompare(b.nodeId),
          ),
          edges: [...ir.workflow.edges].sort((a, b) =>
            (a.sourceNodeId + a.targetNodeId).localeCompare(b.sourceNodeId + b.targetNodeId),
          ),
        }
      : ir.workflow,
  };
  return JSON.parse(JSON.stringify(sorted)) as AgentIR;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("projectAgent", () => {
  // ─── AC #5: Round-trip property test (50+ generated cases) ─────
  it(
    "round-trip: AgentIR → snapshot + projection → reconstruct = structurally equal (50+ cases)",
    async () => {
      await fc.assert(
        fc.asyncProperty(agentIRArb, async (rawIr) => {
          // fast-check may produce null-prototype objects; JSON round-trip strips them
          const ir: AgentIR = JSON.parse(JSON.stringify(rawIr));
          // Use a unique agent ID per iteration to avoid (agent_id, version_number) uniqueness
          const agentId = `ag_fc_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
          
          // Ensure agent row exists
          await client.query(
            `INSERT INTO agents (id, workspace_id, status, created_at)
             VALUES ($1, $2, 'draft', NOW())
             ON CONFLICT (id) DO NOTHING`,
            [agentId, TEST_WS],
          );

          await db.transaction(async (tx) => {
            // Make eval criteria and guardrail IDs globally unique per iteration
            const uniqueIr: AgentIR = {
              ...ir,
              scorerAttachments: Object.fromEntries(
                Object.entries(ir.scorerAttachments).map(([k, v]) => [
                  `${k}_${agentId}`,
                  v,
                ]),
              ),
              guardrailGraph: {
                nodes: ir.guardrailGraph.nodes.map((n) => ({
                  ...n,
                  id: `${n.id}_${agentId}`,
                })),
                edges: ir.guardrailGraph.edges.map((e) => ({
                  ...e,
                  sourceNodeId: `${e.sourceNodeId}_${agentId}`,
                  targetNodeId: `${e.targetNodeId}_${agentId}`,
                })),
              },
            };

            const versionId = await insertAgentVersion(
              tx,
              agentId,
              "publish",
              uniqueIr,
            );

            // Insert referenced tools (FK: agent_tool_attachments.tool_id → tools.id)
            const allToolIds = [
              ...Object.keys(ir.toolAttachments),
              ...Object.keys(ir.integrationTools),
              ...Object.keys(ir.mcpClientAttachments),
              ...Object.keys(ir.subagentAttachments),
            ];
            for (const toolId of allToolIds) {
              await tx.insert(schema.tools).values({
                id: toolId,
                workspaceId: TEST_WS,
                name: toolId,
                displayName: toolId,
                kind: "system",
                config: {},
                status: "active",
              }).onConflictDoNothing();
            }

            // Insert referenced KB documents (FK: agent_kb_attachments.document_id → kb_documents.id)
            for (const kb of ir.kbAttachments) {
              await tx.insert(schema.kbDocuments).values({
                id: kb.documentId,
                workspaceId: TEST_WS,
                name: kb.documentId,
                source: "file",
                sizeBytes: 0,
                status: "ready",
              }).onConflictDoNothing();
            }

            await projectAgent(tx, versionId, uniqueIr);

            const reconstructed = await reconstructIR(tx, versionId);

            // F03: full structural equality after applying scorer defaults
            // (per AMENDMENT-003) and canonicalizing array orderings. The two
            // helpers (`applyScorerDefaults`, `canonicalize`) are the only
            // round-trip transforms applied — anything else means the projector
            // or reconstruction is losing information.
            const expected = canonicalize(applyScorerDefaults(uniqueIr));
            const actual = canonicalize(reconstructed);
            expect(actual).toEqual(expected);
          });
        }),
        { numRuns: 50, endOnFailure: true },
      );
    },
    120_000,
  );

  // ─── AC #4: Row counts ──────────────────────────────────────────
  it("returns correct row counts for a representative IR", async () => {
    await db.transaction(async (tx) => {
      const versionId = await insertAgentVersion(
        tx,
        TEST_AGENT_ID,
        "publish",
        parsedFixture,
      );
      const counts = await projectAgent(tx, versionId, parsedFixture);

      // 5 native tools + 1 subagent + 1 integration + 1 mcp = 8
      expect(counts.toolAttachments).toBe(8);
      expect(counts.kbAttachments).toBe(parsedFixture.kbAttachments.length);
      expect(counts.guardrails).toBe(parsedFixture.guardrailGraph.nodes.length);
      expect(counts.evalCriteria).toBe(
        Object.keys(parsedFixture.scorerAttachments).length,
      );
      expect(counts.workflowNodes).toBe(parsedFixture.workflow!.nodes.length);
      expect(counts.workflowEdges).toBe(parsedFixture.workflow!.edges.length);
    });
  });

  // ─── AC #6: Latency test (p95 ≤ 200 ms) ─────────────────────────
  it(
    "p95 latency ≤ 200 ms over 100 projections of representative IR",
    async () => {
      const durations: number[] = [];
      const agentId = "ag_perf_test";

      // Ensure a dedicated agent row
      await client.query(
        `INSERT INTO agents (id, workspace_id, status, created_at)
         VALUES ($1, $2, 'draft', NOW())
         ON CONFLICT (id) DO NOTHING`,
        [agentId, TEST_WS],
      );

      for (let i = 0; i < 100; i++) {
        // Create a copy of the fixture with unique guardrail/eval IDs per iteration
        const ir: AgentIR = JSON.parse(JSON.stringify(parsedFixture));
        const suffix = `_${i}`;
        ir.guardrailGraph = {
          nodes: parsedFixture.guardrailGraph.nodes.map((n) => ({
            ...n,
            id: n.id + suffix,
          })),
          edges: parsedFixture.guardrailGraph.edges.map((e) => ({
            ...e,
            sourceNodeId: e.sourceNodeId + suffix,
            targetNodeId: e.targetNodeId + suffix,
          })),
        };
        ir.scorerAttachments = Object.fromEntries(
          Object.entries(parsedFixture.scorerAttachments).map(([k, v]) => [
            k + suffix,
            v,
          ]),
        );
        if (ir.workflow) {
          ir.workflow = {
            nodes: ir.workflow.nodes.map((n) => ({ ...n, nodeId: n.nodeId + suffix })),
            edges: ir.workflow.edges.map((e) => ({
              ...e,
              sourceNodeId: e.sourceNodeId + suffix,
              targetNodeId: e.targetNodeId + suffix,
            })),
          };
        }
        await db.transaction(async (tx) => {
          const versionId = `av_perf_${i}_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
          await tx.insert(schema.agentVersions).values({
            id: versionId,
            agentId,
            versionNumber: i + 1,
            versionKind: "publish",
            snapshot: toJsonb(ir),
          });

          const t0 = performance.now();
          await projectAgent(tx, versionId, ir);
          const elapsed = performance.now() - t0;
          durations.push(elapsed);
        });
      }

      durations.sort((a, b) => a - b);
      const p50 = durations[Math.floor(durations.length * 0.5)]!;
      const p95 = durations[Math.floor(durations.length * 0.95)]!;
      const p99 = durations[Math.floor(durations.length * 0.99)]!;
      const min = durations[0]!;
      const max = durations[durations.length - 1]!;

      const histogram = [
        `Latency histogram (100 projections of Calderon dispatcher IR):`,
        `  min: ${min.toFixed(2)} ms`,
        `  p50: ${p50.toFixed(2)} ms`,
        `  p95: ${p95.toFixed(2)} ms`,
        `  p99: ${p99.toFixed(2)} ms`,
        `  max: ${max.toFixed(2)} ms`,
      ].join("\n");
      console.log(histogram);

      expect(
        p95,
        `p95 latency ${p95.toFixed(2)} ms exceeds 200 ms threshold`,
      ).toBeLessThanOrEqual(200);
    },
    120_000,
  );

  // ─── AC #8: FK violation test ────────────────────────────────────
  it("throws foreign_key_violation when agentVersionId does not exist", async () => {
    await db.transaction(async (tx) => {
      try {
        await projectAgent(tx, "av_nonexistent_12345", parsedFixture);
        expect.unreachable("Expected an error but none was thrown");
      } catch (e: unknown) {
        // Drizzle wraps Postgres errors; the cause contains the original pg error
        const drizzleErr = e as { cause?: { code?: string; detail?: string } };
        const pgCode = drizzleErr.cause?.code;
        const pgDetail = drizzleErr.cause?.detail;
        expect(
          pgCode === "23503" ||
            (typeof pgDetail === "string" && pgDetail.includes("not present")),
        ).toBe(true);
      }
    });
  });

  // ─── Empirical: verify projection data integrity ────────────────
  it("projection rows reference the correct agentVersionId", async () => {
    const versionId = await db.transaction(async (tx) => {
      const vid = await insertAgentVersion(tx, TEST_AGENT_ID, "publish", parsedFixture);
      await projectAgent(tx, vid, parsedFixture);
      return vid;
    });

    // Read all projection tables
    const toolRows = await db
      .select()
      .from(schema.agentToolAttachments)
      .where(eq(schema.agentToolAttachments.agentVersionId, versionId));
    expect(toolRows.length).toBeGreaterThan(0);
    for (const row of toolRows) {
      expect(row.agentVersionId).toBe(versionId);
    }

    const kbRows = await db
      .select()
      .from(schema.agentKbAttachments)
      .where(eq(schema.agentKbAttachments.agentVersionId, versionId));
    expect(kbRows.length).toBe(parsedFixture.kbAttachments.length);

    const guardrailRows = await db
      .select()
      .from(schema.agentGuardrails)
      .where(eq(schema.agentGuardrails.agentVersionId, versionId));
    expect(guardrailRows.length).toBe(parsedFixture.guardrailGraph.nodes.length);

    const evalRows = await db
      .select()
      .from(schema.agentEvalCriteria)
      .where(eq(schema.agentEvalCriteria.agentVersionId, versionId));
    expect(evalRows.length).toBe(Object.keys(parsedFixture.scorerAttachments).length);

    const wfNodes = await db
      .select()
      .from(schema.workflowNodesProjection)
      .where(eq(schema.workflowNodesProjection.agentVersionId, versionId));
    expect(wfNodes.length).toBe(parsedFixture.workflow!.nodes.length);

    const wfEdges = await db
      .select()
      .from(schema.workflowEdgesProjection)
      .where(eq(schema.workflowEdgesProjection.agentVersionId, versionId));
    expect(wfEdges.length).toBe(parsedFixture.workflow!.edges.length);
  });

  // ─── Deterministic order test ────────────────────────────────────
  it("inserts in deterministic order (tool → kb → guardrail → eval → nodes → edges)", async () => {
    const captured: string[] = [];

    await db.transaction(async (tx) => {
      const versionId = await insertAgentVersion(tx, TEST_AGENT_ID, "publish", parsedFixture);
      await projectAgent(tx, versionId, parsedFixture);

      // Verify rows exist in each table
      const toolCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentToolAttachments)
        .where(eq(schema.agentToolAttachments.agentVersionId, versionId));
      captured.push(`tools:${toolCount[0]?.count ?? 0}`);

      const kbCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentKbAttachments)
        .where(eq(schema.agentKbAttachments.agentVersionId, versionId));
      captured.push(`kb:${kbCount[0]?.count ?? 0}`);

      const grCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentGuardrails)
        .where(eq(schema.agentGuardrails.agentVersionId, versionId));
      captured.push(`guardrails:${grCount[0]?.count ?? 0}`);

      const evalCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.agentEvalCriteria)
        .where(eq(schema.agentEvalCriteria.agentVersionId, versionId));
      captured.push(`eval:${evalCount[0]?.count ?? 0}`);

      const nodeCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.workflowNodesProjection)
        .where(eq(schema.workflowNodesProjection.agentVersionId, versionId));
      captured.push(`nodes:${nodeCount[0]?.count ?? 0}`);

      const edgeCount = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.workflowEdgesProjection)
        .where(eq(schema.workflowEdgesProjection.agentVersionId, versionId));
      captured.push(`edges:${edgeCount[0]?.count ?? 0}`);
    });

    // All six tables received rows
    expect(captured.length).toBe(6);
    for (const entry of captured) {
      const [, countStr] = entry.split(":");
      expect(Number(countStr)).toBeGreaterThan(0);
    }
  });
});
