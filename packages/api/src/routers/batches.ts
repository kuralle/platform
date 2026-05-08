import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { withWorkspace } from "@kuralle/core";
import { batchSchema } from "./batches.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const cursorInput = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
});

const listInput = workspaceIdInput.merge(cursorInput);

const listOutput = z
  .object({
    items: z.array(batchSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const recipientsSummarySchema = z
  .object({
    total: z.number().int(),
    byStatus: z.record(z.string(), z.number().int()),
  })
  .strict();

const getOutput = z
  .object({
    batch: batchSchema,
    recipientsSummary: recipientsSummarySchema,
  })
  .strict();

const createInput = workspaceIdInput.extend({
  name: z.string().min(1),
  agentId: z.string().nullable().optional(),
  channelKind: z.enum(["voice", "whatsapp", "messenger", "instagram", "web_chat", "sms"]),
  channelEndpointId: z.string().nullable().optional(),
  vertical: z.enum(["home-services", "appointment-services", "education"]),
  scheduledFor: z.date().nullable().optional(),
  totalRecipients: z.number().int().nonnegative(),
  concurrency: z.number().int().positive().optional(),
});

const createOutput = z.object({ batchId: z.string() }).strict();

function newBatchId(): string {
  return `bat_${crypto.randomUUID().slice(0, 12)}`;
}

export const batchesRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      return await repos.batches.findByWorkspace({
        cursor: input.cursor ?? null,
        limit: input.limit,
        status: input.status,
      });
    }),

  get: protectedProcedure
    .input(workspaceIdInput.extend({ batchId: z.string() }))
    .output(getOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const batch = await repos.batches.findById(input.batchId);
      if (!batch) {
        throw new ORPCError("NOT_FOUND", { message: "Batch not found" });
      }
      const recipientsSummary = await repos.batches.getStatus(input.batchId);
      if (!recipientsSummary) {
        throw new ORPCError("NOT_FOUND", { message: "Batch not found" });
      }
      return { batch, recipientsSummary };
    }),

  create: protectedProcedure
    .input(createInput)
    .output(createOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const batchId = newBatchId();
      await repos.batches.create({
        id: batchId,
        name: input.name,
        agentId: input.agentId ?? null,
        channelKind: input.channelKind,
        channelEndpointId: input.channelEndpointId ?? null,
        vertical: input.vertical,
        scheduledFor: input.scheduledFor ?? null,
        totalRecipients: input.totalRecipients,
        concurrency: input.concurrency ?? undefined,
        createdByUserId: context.session?.user?.id ?? undefined,
      });
      return { batchId };
    }),
};
