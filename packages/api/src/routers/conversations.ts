import { ORPCError } from "@orpc/server";
import { withWorkspace } from "@kuralle/core";
import { z } from "zod";
import {
  conversationSchema,
  conversationDetailSchema,
  conversationLivePollingSchema,
} from "./conversations.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember } from "../workspace-access";
import { cursorInputFields, cursorListOutput } from "../list-pagination";

const listInput = z
  .object({
    workspaceId: z.string(),
    ...cursorInputFields,
  })
  .strict();

const getInput = z
  .object({
    workspaceId: z.string(),
    conversationId: z.string(),
  })
  .strict();

const liveInput = z
  .object({
    workspaceId: z.string(),
    conversationId: z.string(),
    sinceSequence: z.number().int().default(0),
  })
  .strict();

const listOutput = cursorListOutput(conversationSchema);

export const conversationsRouter = {
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

      return repos.conversations.findManyByWorkspaceCursor({
        cursor: input.cursor ?? null,
        limit: input.limit,
      });
    }),
  get: protectedProcedure
    .input(getInput)
    .output(conversationDetailSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const detail = await repos.conversations.getDetail(input.conversationId);
      if (!detail) {
        throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
      }
      return detail;
    }),
  live: protectedProcedure
    .input(liveInput)
    .output(conversationLivePollingSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const detail = await repos.conversations.getDetail(input.conversationId);
      if (!detail) {
        throw new ORPCError("NOT_FOUND", { message: "Conversation not found" });
      }

      const items = await repos.conversations.getTurnsAfterSequence(
        input.conversationId,
        input.sinceSequence,
      );
      const nextSequence =
        items.length > 0
          ? items[items.length - 1]!.ordinal
          : input.sinceSequence;

      return {
        kind: "polling",
        sinceSequence: input.sinceSequence,
        nextSequence,
        items,
      };
    }),
};
