import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { withWorkspace, agentIRSchema } from "@kuralle/core";
import { projectAgent } from "@kuralle/runtime";
import { protectedProcedure } from "../index";
import {
  agentSchema,
  agentVersionSchema,
  agentWithVersionSchema,
} from "./agents.schemas";

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
  list: protectedProcedure
    .input(workspaceIdInput.merge(cursorInput))
    .output(listOutput)
    .handler(async ({ input, context }) => {
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const items = await repos.agents.findManyByWorkspace({
        limit: input.limit,
      });
      return { items, cursor: null };
    }),

  get: protectedProcedure
    .input(agentIdInput)
    .output(getOutput)
    .handler(async ({ input, context }) => {
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

      const ir = agentIRSchema.parse(input.ir);
      const versionNumber = await repos.agents.nextVersionNumber(
        input.agentId,
      );
      const versionId = newId("av");

      const result = await repos.agents.publishVersion({
        versionId,
        agentId: input.agentId,
        versionNumber,
        publishedByUserId: context.session?.user?.id ?? null,
        snapshot: ir,
        project: (tx, vid) => projectAgent(tx, vid, ir),
      });

      return {
        versionId: result.versionId,
        versionNumber,
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

      const ir = agentIRSchema.parse(input.ir);
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

      const items = await repos.agentVersions.findByAgentId(input.agentId, {
        limit: input.limit,
      });

      return { items, cursor: null };
    }),
};
