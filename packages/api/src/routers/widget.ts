import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { withWorkspace } from "@kuralle/core";
import { widgetConfigSchema, widgetEnableOutputSchema } from "./widget.schemas";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember, assertWorkspaceRole } from "../workspace-access";

const workspaceIdInput = z.object({
  workspaceId: z.string(),
});

const updateInput = workspaceIdInput.extend({
  modality: z.enum(["voice", "chat", "both"]).optional(),
  theme: z.unknown().optional(),
  strings: z.unknown().optional(),
  vars: z.unknown().optional(),
  feedbackEnabled: z.boolean().optional(),
  termsUrl: z.string().nullable().optional(),
});

const enableInput = workspaceIdInput.extend({
  attachedAgentId: z.string().optional(),
});

const EMBED_KEY_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateWidgetEmbedKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let suffix = "";
  for (let i = 0; i < 24; i++) {
    suffix += EMBED_KEY_ALPHABET[bytes[i]! % EMBED_KEY_ALPHABET.length]!;
  }
  return `wk_${suffix}`;
}

async function resolveWidgetGetPayload(
  workspaceId: string,
  context: {
    db: Parameters<typeof withWorkspace>[0];
    kvStore: Parameters<typeof withWorkspace>[2];
    env: { PUBLIC_BASE_URL: string };
  },
) {
  const repos = withWorkspace(context.db, workspaceId, context.kvStore);
  const config = await repos.widget.getByWorkspace();
  const endpoints = await repos.channels.findEndpointsByKind("widget");
  const embedKey = endpoints[0]?.identifier ?? null;
  const serverUrl = context.env.PUBLIC_BASE_URL;

  if (!config) {
    const now = new Date();
    return {
      workspaceId,
      modality: "both",
      theme: null,
      strings: null,
      vars: null,
      feedbackEnabled: false,
      termsUrl: null,
      createdAt: now,
      updatedAt: null,
      embedKey,
      serverUrl,
    };
  }

  return {
    ...config,
    embedKey,
    serverUrl,
  };
}

export const widgetRouter = {
  get: protectedProcedure
    .input(workspaceIdInput)
    .output(widgetConfigSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      return resolveWidgetGetPayload(input.workspaceId, context);
    }),

  enable: protectedProcedure
    .input(enableInput)
    .output(widgetEnableOutputSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceRole(context, input.workspaceId, "admin");
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      let endpoint = (await repos.channels.findEndpointsByKind("widget"))[0];
      if (!endpoint) {
        endpoint = await repos.channels.insertEndpoint({
          id: `ce_widget_${crypto.randomUUID().slice(0, 12)}`,
          channelKind: "widget",
          identifier: generateWidgetEmbedKey(),
        });
      }

      if (input.attachedAgentId) {
        const agent = await repos.agents.findById(input.attachedAgentId);
        if (!agent) {
          throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
        }
        if (!agent.activeVersionId) {
          throw new ORPCError("BAD_REQUEST", { message: "agent-not-published" });
        }
        const activeVersion = await repos.agentVersions.findById(
          agent.activeVersionId,
        );
        if (!activeVersion?.publishedAt) {
          throw new ORPCError("BAD_REQUEST", { message: "agent-not-published" });
        }
        endpoint = await repos.channels.updateEndpointBinding({
          endpointId: endpoint.id,
          attachedAgentId: input.attachedAgentId,
          attachedAgentVersionId: agent.activeVersionId,
        });
      }

      return {
        embedKey: endpoint.identifier,
        endpointId: endpoint.id,
      };
    }),

  update: protectedProcedure
    .input(updateInput)
    .output(widgetConfigSchema)
    .handler(async ({ input, context }) => {
      await assertWorkspaceRole(context, input.workspaceId, "admin");
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const updated = await repos.widget.upsertConfig({
        modality: input.modality,
        theme: input.theme,
        strings: input.strings,
        vars: input.vars,
        feedbackEnabled: input.feedbackEnabled,
        termsUrl: input.termsUrl,
      });
      const endpoints = await repos.channels.findEndpointsByKind("widget");
      return {
        ...updated,
        embedKey: endpoints[0]?.identifier ?? null,
        serverUrl: context.env.PUBLIC_BASE_URL,
      };
    }),
};
