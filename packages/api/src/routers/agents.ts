import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { withWorkspace, agentIRSchema } from "@kuralle/core";
import {
  projectAgent,
  recordSloViolation,
  SLO_PUBLISH_THRESHOLD_MS,
} from "@kuralle/runtime";
import { protectedProcedure } from "../index";
import {
  agentSchema,
  agentVersionSchema,
  agentWithVersionSchema,
} from "./agents.schemas";
import { assertWorkspaceMember } from "../workspace-access";

// ── shared inputs ──────────────────────────────────────────────────

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const agentIdInput = workspaceIdInput.extend({
  agentId: z.string(),
});

const cursorInput = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// ── output schemas ─────────────────────────────────────────────────

const listOutput = z
  .object({
    items: z.array(agentSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const getOutput = agentWithVersionSchema;

const historyOutput = z
  .object({
    items: z.array(agentVersionSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const createOutput = z
  .object({
    agentId: z.string(),
  })
  .strict();

const publishOutput = z
  .object({
    versionId: z.string(),
    versionNumber: z.number().int(),
    activeVersionId: z.string(),
  })
  .strict();

const autoSaveOutput = z
  .object({
    versionId: z.string(),
    versionNumber: z.number().int(),
  })
  .strict();

// ── helpers ────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

// ── router ─────────────────────────────────────────────────────────

export const agentsRouter = {
  create: protectedProcedure
    .input(
      workspaceIdInput.extend({
        snapshot: agentIRSchema.optional(),
      }),
    )
    .output(createOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      const agentId = newId("ag");
      const versionId = newId("av");

      const snapshot = input.snapshot ?? {
        name: "Untitled agent",
        description: "",
        instructions: "",
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

      await repos.agents.create({
        agentId,
        versionId,
        authorUserId: context.session?.user?.id ?? null,
        snapshot,
      });

      return { agentId };
    }),

  list: protectedProcedure
    .input(workspaceIdInput.merge(cursorInput))
    .output(listOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      // R2-4: cursor is now load-bearing.
      return await repos.agents.findManyByWorkspace({
        limit: input.limit,
        cursor: input.cursor ?? null,
      });
    }),

  get: protectedProcedure
    .input(agentIdInput)
    .output(getOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      let activeVersion = null;
      if (agent.activeVersionId) {
        activeVersion = await repos.agentVersions.findById(
          agent.activeVersionId,
        );
      }

      return { agent, activeVersion };
    }),

  publish: protectedProcedure
    .input(
      agentIdInput.extend({
        ir: agentIRSchema,
      }),
    )
    .output(publishOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // F09: agentIRSchema is already in the input contract — oRPC validates.
      const ir = input.ir;
      const versionId = newId("av");

      const t0 = performance.now();

      // F01 + R2-3: wrap the transactional publish so DB-level failures
      // surface as ORPCError('CONFLICT') instead of a raw 500. NOT_FOUND is
      // preserved for the agent existence check above. SQLSTATE coverage:
      //   23505 unique_violation
      //   23503 fk_violation
      //   0A000 feature_not_supported (append-only trigger)
      //   40001 serialization_failure   (R2-3 added)
      //   40P01 deadlock_detected       (R2-3 added)
      let result: {
        versionId: string;
        activeVersionId: string;
        versionNumber: number;
      };
      try {
        result = await repos.agents.publishVersion({
          versionId,
          agentId: input.agentId,
          publishedByUserId: context.session?.user?.id ?? null,
          snapshot: ir,
          project: (tx, vid) => projectAgent(tx, vid, ir),
        });
      } catch (e: unknown) {
        const cause = (e as Error & { cause?: { code?: string } }).cause;
        const message = e instanceof Error ? e.message : "publish failed";
        const code = cause?.code;
        if (
          code === "23505" ||
          code === "23503" ||
          code === "0A000" ||
          code === "40001" ||
          code === "40P01"
        ) {
          throw new ORPCError("CONFLICT", { message });
        }
        throw e;
      }

      // SLO instrumentation: wall-clock publish latency vs. 1 s threshold.
      // Fire-and-forget — a failed slo_violation insert does not roll back
      // the successful publish (TTL would age an uncached entry within 60 s).
      const latencyMs = performance.now() - t0;
      if (latencyMs > SLO_PUBLISH_THRESHOLD_MS) {
        recordSloViolation(context.db, {
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          agentVersionId: result.versionId,
          observedMs: latencyMs,
        }).catch(() => {
          // Best-effort; publish already succeeded.
        });
      }

      return {
        versionId: result.versionId,
        versionNumber: result.versionNumber,
        activeVersionId: result.activeVersionId,
      };
    }),

  autoSave: protectedProcedure
    .input(
      agentIdInput.extend({
        ir: agentIRSchema,
      }),
    )
    .output(autoSaveOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // F09: agentIRSchema already in the input contract — oRPC validates.
      const ir = input.ir;
      const versionNumber = await repos.agents.nextVersionNumber(
        input.agentId,
      );
      const versionId = newId("av");

      await repos.agentVersions.insert({
        id: versionId,
        agentId: input.agentId,
        versionNumber,
        versionKind: "auto_save",
        parentVersionId: agent.activeVersionId ?? undefined,
        publishedByUserId: context.session?.user?.id ?? undefined,
        publishedAt: undefined,
        snapshot: ir,
      });

      return { versionId, versionNumber };
    }),

  history: protectedProcedure
    .input(agentIdInput.merge(cursorInput))
    .output(historyOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      // R2-4: cursor is now load-bearing.
      return await repos.agentVersions.findByAgentId(input.agentId, {
        limit: input.limit,
        cursor: input.cursor ?? null,
      });
    }),
};
