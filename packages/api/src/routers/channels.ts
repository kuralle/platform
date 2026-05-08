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
  cursor: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(20),
}).strict();

const listOutput = z.object({
  items: z.array(channelConnectionSchema),
  cursor: z.string().nullable(),
}).strict();

const connectInput = workspaceIdInput.extend({
  provider: z.literal("meta-whatsapp-cloud"),
  displayName: z.string(),
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
  connectionId: z.string(),
}).strict();

export const channelsRouter = {
  list: protectedProcedure
    .input(listInput)
    .output(listOutput)
    .handler(async ({ input, context }) => {
      const repos = withWorkspace(
        context.db,
        input.workspaceId,
        context.kvStore,
      );
      const items = await repos.channels.findManyByWorkspaceFiltered({
        kind: input.kind,
        limit: input.limit,
      });
      return { items, cursor: null };
    }),

  connect: protectedProcedure
    .input(connectInput)
    .output(connectOutput)
    .handler(async ({ input, context }) => {
      const appSecret = context.env.META_APP_SECRET;
      const systemUserToken = context.env.META_SYSTEM_USER_TOKEN;
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
};
