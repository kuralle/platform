import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { withWorkspace } from "@kuralle/core";
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
};
