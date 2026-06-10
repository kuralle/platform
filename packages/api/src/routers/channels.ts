import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { withWorkspace } from "@kuralle/core";
import {
  createMetaWhatsAppClient,
  listPhoneNumbers,
  subscribeApp,
  unsubscribeApp,
} from "@kuralle/runtime";
import { protectedProcedure } from "../index";
import { assertWorkspaceMember, assertWorkspaceRole } from "../workspace-access";
import { cursorInputFields, cursorListOutput } from "../list-pagination";
import {
  channelConnectionSchema,
  channelEndpointSchema,
  availablePhoneNumberSchema,
} from "./channels.schemas";

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

const workspaceIdInput = z.object({ workspaceId: z.string() }).strict();

const listInput = workspaceIdInput.extend({
  kind: z.string().optional(),
  ...cursorInputFields,
}).strict();

const listOutput = cursorListOutput(channelConnectionSchema);

const connectInput = workspaceIdInput.extend({
  provider: z.literal("meta-whatsapp-cloud"),
  displayName: z.string(),
  accessToken: z.string().min(1).optional(),
  appSecret: z.string().min(1).optional(),
}).strict();

const connectOutput = z.object({
  connectionId: z.string(),
  availablePhoneNumbers: z.array(availablePhoneNumberSchema),
}).strict();

const endpointsListInput = workspaceIdInput.extend({
  connectionId: z.string(),
}).strict();

const endpointsListOutput = z.object({
  items: z.array(channelEndpointSchema),
}).strict();

const endpointsListByKindInput = workspaceIdInput.extend({
  kind: z.string(),
}).strict();

const endpointsListByKindOutput = z.object({
  items: z.array(channelEndpointSchema),
}).strict();

const endpointsAttachInput = workspaceIdInput.extend({
  connectionId: z.string(),
  phoneNumberId: z.string(),
  // §8:626 — endpoints must be routed; agentId is required at attach time.
  // The wizard's UI step that picks the agent is upstream of this call.
  agentId: z.string(),
}).strict();

const endpointsAttachOutput = z.object({
  endpointId: z.string(),
}).strict();

const endpointsDetachInput = workspaceIdInput.extend({
  endpointId: z.string(),
}).strict();

const endpointsDetachOutput = z.object({
  released: z.boolean(),
  alreadyReleased: z.boolean().optional(),
  // Returned so client-side hooks can invalidate the connection-scoped
  // endpoint list without storing it locally — fix-pass for kimi gate
  // R2-1 (`useDetachEndpoint` was invalidating `connectionId: ""`).
  connectionId: z.string().nullable(),
}).strict();

const bindAgentInput = workspaceIdInput.extend({
  endpointId: z.string(),
  agentId: z.string(),
}).strict();

const bindAgentOutput = z.object({
  endpointId: z.string(),
  agentId: z.string(),
  agentVersionId: z.string(),
}).strict();

const statusInput = workspaceIdInput.extend({
  endpointId: z.string(),
}).strict();

const boundAgentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    activeVersionNumber: z.number().int(),
  })
  .strict();

const statusOutput = z
  .object({
    receivingTraffic: z.boolean(),
    lastInboundAt: z.date().nullable(),
    boundAgent: boundAgentSchema.nullable(),
  })
  .strict();

const webhookInfoOutput = z
  .object({
    url: z.string(),
    verifyTokenHint: z.string(),
    instructions: z.string(),
  })
  .strict();

function agentNameFromSnapshot(snapshot: unknown): string {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    "name" in snapshot &&
    typeof (snapshot as { name: unknown }).name === "string"
  ) {
    return (snapshot as { name: string }).name;
  }
  return "Untitled agent";
}

function maskVerifyToken(token: string): string {
  if (!token) return "(not configured)";
  if (token.length <= 4) return "••••";
  return `${token.slice(0, 2)}••••${token.slice(-2)}`;
}

export const channelsRouter = {
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
      return await repos.channels.findManyByWorkspaceFiltered({
        kind: input.kind,
        cursor: input.cursor ?? null,
        limit: input.limit,
      });
    }),

  connect: protectedProcedure
    .input(connectInput)
    .output(connectOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceRole(context, input.workspaceId, "admin");
      const appSecret = input.appSecret ?? context.env.META_APP_SECRET;
      const systemUserToken =
        input.accessToken ?? context.env.META_SYSTEM_USER_TOKEN;
      const appId = context.env.META_APP_ID;

      if (!appSecret || !systemUserToken || !appId) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Meta credentials not configured",
        });
      }

      const metaClient = createMetaWhatsAppClient({
        accessToken: systemUserToken,
        appSecret,
      });

      // Note: this connector flow stores raw provider credentials handed to
      // us by the operator (not a Meta Embedded-Signup callback). Meta-side
      // signed-request validation belongs in the inbound webhook handler
      // (S3-03) where `verifyHmac` runs against `X-Hub-Signature-256`.

      let availablePhoneNumbers: Awaited<ReturnType<typeof listPhoneNumbers>>;
      try {
        availablePhoneNumbers = await listPhoneNumbers(metaClient, { appId });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Meta API error";
        throw new ORPCError("INTERNAL_SERVER_ERROR", { message });
      }

      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const connectionId = newId("chc");
      const secretId = newId("sec");

      await repos.channels.connectWithCredentials({
        connectionId,
        displayName: input.displayName,
        provider: input.provider,
        channelKind: "whatsapp",
        capabilities: ["messaging"],
        credentials: {
          secretId,
          name: "meta_credentials",
          ciphertext: Buffer.from(
            JSON.stringify({ appSecret, systemUserToken }),
          ),
          kmsKeyId: "none",
          scope: "workspace",
        },
      });

      return {
        connectionId,
        availablePhoneNumbers: availablePhoneNumbers.map((p) => ({
          phoneNumberId: p.id,
          displayPhoneNumber: p.displayPhoneNumber,
          qualityRating: p.qualityRating,
        })),
      };
    }),

  endpoints: {
    list: protectedProcedure
      .input(endpointsListInput)
      .output(endpointsListOutput)
      .handler(async ({ input, context }) => {
        await assertWorkspaceMember(context, input.workspaceId);
        const repos = withWorkspace(
          context.db,
          input.workspaceId,
          context.kvStore,
        );
        const items = await repos.channels.findEndpointsByConnection(
          input.connectionId,
        );
        return { items };
      }),

    listByKind: protectedProcedure
      .input(endpointsListByKindInput)
      .output(endpointsListByKindOutput)
      .handler(async ({ input, context }) => {
        await assertWorkspaceMember(context, input.workspaceId);
        const repos = withWorkspace(
          context.db,
          input.workspaceId,
          context.kvStore,
        );
        const items = await repos.channels.findEndpointsByKind(input.kind);
        return { items };
      }),

    attach: protectedProcedure
      .input(endpointsAttachInput)
      .output(endpointsAttachOutput)
      .handler(async ({ input, context }) => {
        await assertWorkspaceRole(context, input.workspaceId, "admin");
        const repos = withWorkspace(
          context.db,
          input.workspaceId,
          context.kvStore,
        );

        const connection = await repos.channels.findById(input.connectionId);
        if (!connection) {
          throw new ORPCError("NOT_FOUND", {
            message: "Channel connection not found",
          });
        }

        const agent = await repos.agents.findById(input.agentId);
        if (!agent) {
          throw new ORPCError("NOT_FOUND", {
            message: "Agent not found",
          });
        }
        if (!agent.activeVersionId) {
          throw new ORPCError("BAD_REQUEST", {
            message: "agent-not-published",
          });
        }
        const activeVersion = await repos.agentVersions.findById(
          agent.activeVersionId,
        );
        if (!activeVersion?.publishedAt) {
          throw new ORPCError("BAD_REQUEST", {
            message: "agent-not-published",
          });
        }

        const appSecret = context.env.META_APP_SECRET;
        const systemUserToken = context.env.META_SYSTEM_USER_TOKEN;
        const publicBaseUrl = context.env.PUBLIC_BASE_URL;

        if (!appSecret || !systemUserToken) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Meta credentials not configured",
          });
        }

        const metaClient = createMetaWhatsAppClient({
          accessToken: systemUserToken,
          appSecret,
        });

        const endpointId = newId("che");
        const webhookUrl = `${publicBaseUrl}/webhooks/meta`;

        await repos.channels.attachEndpoint({
          endpoint: {
            id: endpointId,
            connectionId: input.connectionId,
            channelKind: connection.channelKind,
            identifier: input.phoneNumberId,
            displayName: input.phoneNumberId,
            attachedAgentId: input.agentId,
            attachedAgentVersionId: agent.activeVersionId,
            publicWebhookUrl: webhookUrl,
          },
          onAttached: async () => {
            await subscribeApp(metaClient, {
              phoneNumberId: input.phoneNumberId,
            });
          },
        });

        return { endpointId };
      }),

    detach: protectedProcedure
      .input(endpointsDetachInput)
      .output(endpointsDetachOutput)
      .handler(async ({ input, context }) => {
        await assertWorkspaceRole(context, input.workspaceId, "admin");
        const repos = withWorkspace(
          context.db,
          input.workspaceId,
          context.kvStore,
        );

        const appSecret = context.env.META_APP_SECRET;
        const systemUserToken = context.env.META_SYSTEM_USER_TOKEN;
        if (!appSecret || !systemUserToken) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Meta credentials not configured",
          });
        }

        const metaClient = createMetaWhatsAppClient({
          accessToken: systemUserToken,
          appSecret,
        });

        const result = await repos.channels.detachEndpoint({
          endpointId: input.endpointId,
          onDetached: async (_tx, endpoint) => {
            await unsubscribeApp(metaClient, {
              phoneNumberId: endpoint.identifier,
            });
          },
        });

        if (result.status === "not_found") {
          throw new ORPCError("NOT_FOUND", {
            message: "Channel endpoint not found",
          });
        }

        return {
          released: true,
          alreadyReleased:
            result.status === "already_released" ? true : undefined,
          connectionId: result.endpoint.connectionId,
        };
      }),
  },

  bindAgent: protectedProcedure
    .input(bindAgentInput)
    .output(bindAgentOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceRole(context, input.workspaceId, "admin");
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      const endpoint = await repos.channels.findEndpointById(input.endpointId);
      if (!endpoint) {
        throw new ORPCError("NOT_FOUND", {
          message: "Channel endpoint not found",
        });
      }

      const agent = await repos.agents.findById(input.agentId);
      if (!agent) {
        throw new ORPCError("NOT_FOUND", {
          message: "Agent not found",
        });
      }

      if (!agent.activeVersionId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "agent-not-published",
        });
      }

      const activeVersion = await repos.agentVersions.findById(
        agent.activeVersionId,
      );
      if (!activeVersion?.publishedAt) {
        throw new ORPCError("BAD_REQUEST", {
          message: "agent-not-published",
        });
      }

      const updated = await repos.channels.updateEndpointBinding({
        endpointId: input.endpointId,
        attachedAgentId: input.agentId,
        attachedAgentVersionId: agent.activeVersionId,
      });

      return {
        endpointId: updated.id,
        agentId: updated.attachedAgentId!,
        agentVersionId: updated.attachedAgentVersionId!,
      };
    }),

  status: protectedProcedure
    .input(statusInput)
    .output(statusOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );

      const endpoint = await repos.channels.findEndpointById(input.endpointId);
      if (!endpoint) {
        throw new ORPCError("NOT_FOUND", {
          message: "Channel endpoint not found",
        });
      }

      const lastInboundAt = await repos.channels.findLastInboundAtForEndpoint(
        input.endpointId,
      );

      let boundAgent: z.infer<typeof boundAgentSchema> | null = null;
      if (endpoint.attachedAgentId && endpoint.attachedAgentVersionId) {
        const agent = await repos.agents.findById(endpoint.attachedAgentId);
        const version = await repos.agentVersions.findById(
          endpoint.attachedAgentVersionId,
        );
        if (agent && version) {
          boundAgent = {
            id: agent.id,
            name: agentNameFromSnapshot(version.snapshot),
            activeVersionNumber: version.versionNumber,
          };
        }
      }

      return {
        receivingTraffic: lastInboundAt !== null,
        lastInboundAt,
        boundAgent,
      };
    }),

  webhookInfo: protectedProcedure
    .input(workspaceIdInput)
    .output(webhookInfoOutput)
    .handler(async ({ input, context }) => {
      await assertWorkspaceMember(context, input.workspaceId);
      const publicBaseUrl = context.env.PUBLIC_BASE_URL;
      const verifyToken = context.env.META_VERIFY_TOKEN ?? "";

      if (!publicBaseUrl) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "PUBLIC_BASE_URL not configured",
        });
      }

      return {
        url: `${publicBaseUrl}/webhooks/meta`,
        verifyTokenHint: maskVerifyToken(verifyToken),
        instructions:
          "In Meta App Dashboard → WhatsApp → Configuration, set Callback URL to the webhook URL and Verify Token to your META_VERIFY_TOKEN. Subscribe to messages. Replies outside the 24-hour customer care window are deferred until the customer messages again.",
      };
    }),
};
