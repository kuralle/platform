import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { withWorkspace, type KbDocumentUpdate } from "@kuralle/core";
import { kbDocumentSchema } from "./kb.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const cursorInput = z.object({
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

const listInput = workspaceIdInput.merge(cursorInput);

const listOutput = z
  .object({
    items: z.array(kbDocumentSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const getInput = workspaceIdInput.extend({
  docId: z.string(),
});

const createInput = workspaceIdInput.extend({
  name: z.string().min(1),
  sourceType: z.string().min(1),
  sourceUrl: z.string().optional(),
  folder: z.string().optional(),
  storageKey: z.string().optional(),
  contentText: z.string().optional(),
  sizeBytes: z.number().int().nonnegative(),
});

const createOutput = z.object({ docId: z.string() }).strict();

const deleteInput = workspaceIdInput.extend({
  docId: z.string(),
});

const deleteOutput = z.object({ ok: z.literal(true) }).strict();

const updateInput = getInput.extend({
  name: z.string().min(1).optional(),
  folder: z.string().nullable().optional(),
  contentText: z.string().nullable().optional(),
  autoSync: z.boolean().optional(),
});

const listAttachedInput = workspaceIdInput.extend({
  agentId: z.string(),
});

const listAttachedOutput = z
  .object({
    items: z.array(kbDocumentSchema),
  })
  .strict();

const attachToAgentInput = workspaceIdInput.extend({
  agentId: z.string(),
  docId: z.string(),
});

const detachFromAgentInput = workspaceIdInput.extend({
  agentId: z.string(),
  docId: z.string(),
});

const attachDetachOutput = z.object({ ok: z.literal(true) }).strict();

function newDocId(): string {
  return `kb_${crypto.randomUUID().slice(0, 12)}`;
}

export const kbRouter = {
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
      return await repos.kbDocuments.findByWorkspace({
        workspaceId: input.workspaceId,
        cursor: input.cursor ?? null,
        limit: input.limit,
      });
    }),

  get: protectedProcedure
    .input(getInput)
    .output(kbDocumentSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const doc = await repos.kbDocuments.findById(input.docId);
      if (!doc) {
        throw new ORPCError("NOT_FOUND", { message: "Document not found" });
      }
      return doc;
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
      const docId = newDocId();
      await repos.kbDocuments.create({
        id: docId,
        name: input.name,
        source: input.sourceType,
        sourceUrl: input.sourceUrl,
        folder: input.folder,
        storageKey: input.storageKey,
        contentText: input.contentText,
        sizeBytes: input.sizeBytes,
        createdByUserId: context.session?.user?.id ?? undefined,
      });
      return { docId };
    }),

  delete: protectedProcedure
    .input(deleteInput)
    .output(deleteOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const doc = await repos.kbDocuments.findById(input.docId);
      if (!doc) {
        throw new ORPCError("NOT_FOUND", { message: "Document not found" });
      }
      await repos.kbDocuments.delete(input.docId);
      return { ok: true as const };
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(kbDocumentSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const existing = await repos.kbDocuments.findById(input.docId);
      if (!existing) {
        throw new ORPCError("NOT_FOUND", { message: "Document not found" });
      }
      const patch: KbDocumentUpdate = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.folder !== undefined) patch.folder = input.folder;
      if (input.contentText !== undefined) patch.contentText = input.contentText;
      if (input.autoSync !== undefined) patch.autoSync = input.autoSync;
      return await repos.kbDocuments.update(input.docId, patch);
    }),

  listAttached: protectedProcedure
    .input(listAttachedInput)
    .output(listAttachedOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
      }
      if (!agent.activeVersionId) {
        return { items: [] };
      }
      const items = await repos.kbDocuments.findAttachedForAgentVersion(
        agent.activeVersionId,
      );
      return { items };
    }),

  attach: protectedProcedure
    .input(attachToAgentInput)
    .output(attachDetachOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
      }
      if (!agent.activeVersionId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Agent has no published version to attach knowledge to",
        });
      }
      const doc = await repos.kbDocuments.findById(input.docId);
      if (!doc) {
        throw new ORPCError("NOT_FOUND", { message: "Document not found" });
      }
      await repos.kbDocuments.attachToAgentVersion(
        agent.activeVersionId,
        input.docId,
      );
      return { ok: true as const };
    }),

  detach: protectedProcedure
    .input(detachFromAgentInput)
    .output(attachDetachOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
      }
      if (!agent.activeVersionId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Agent has no published version",
        });
      }
      const doc = await repos.kbDocuments.findById(input.docId);
      if (!doc) {
        throw new ORPCError("NOT_FOUND", { message: "Document not found" });
      }
      await repos.kbDocuments.detachFromAgentVersion(
        agent.activeVersionId,
        input.docId,
      );
      return { ok: true as const };
    }),
};
