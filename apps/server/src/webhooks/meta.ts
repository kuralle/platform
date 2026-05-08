import { Hono } from "hono";
import { and, eq, isNull } from "drizzle-orm";
import { withWorkspace } from "@kuralle/core";
import type { createDb } from "@kuralle/db";
import * as schema from "@kuralle/db/schema";
import { normalizeWebhook, verifySignature } from "@ariaflowagents/messaging-meta/server";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";

interface MetaWebhookBindings {
  META_APP_SECRET: string;
  META_VERIFY_TOKEN: string;
  MESSAGING_DO: DurableObjectNamespace;
}

interface MetaWebhookDeps {
  db: ReturnType<typeof createDb>;
  kvStore: Parameters<typeof withWorkspace>[2];
}

function internalRequestForInboundMessage(body: Record<string, unknown>): Request {
  return new Request("https://messaging-do/internal/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createMetaWebhookApp(deps: MetaWebhookDeps) {
  const app = new Hono<{ Bindings: MetaWebhookBindings }>();

  app.get("/", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    if (mode === "subscribe" && token === c.env.META_VERIFY_TOKEN && challenge) {
      return c.text(challenge, 200);
    }
    return c.text("Forbidden", 403);
  });

  app.post("/", async (c) => {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header("X-Hub-Signature-256") ?? "";
    if (!signatureHeader) {
      return c.text("Unauthorized", 401);
    }

    const valid = verifySignature({
      appSecret: c.env.META_APP_SECRET,
      rawBody,
      signatureHeader,
    });
    if (!valid) {
      return c.text("Unauthorized", 401);
    }

    const parsed = JSON.parse(rawBody) as unknown;
    const events = normalizeWebhook(parsed);

    for (const message of events.messages) {
      const waId = message.from;
      const threadKey = `whatsapp:${waId}`;

      const endpointRows = await deps.db
        .select()
        .from(schema.channelEndpoints)
        .where(
          and(
            eq(schema.channelEndpoints.channelKind, "whatsapp"),
            eq(schema.channelEndpoints.identifier, message.phoneNumberId),
            isNull(schema.channelEndpoints.releasedAt),
          ),
        )
        .limit(1);
      const endpoint = endpointRows[0];
      if (!endpoint) continue;

      const repos = withWorkspace(deps.db as never, endpoint.workspaceId, deps.kvStore);
      const { conversationId } = await repos.conversations.findOrCreateMessagingThread({
        workspaceId: endpoint.workspaceId,
        channelEndpointId: endpoint.id,
        threadKey,
        channelKind: "whatsapp",
        participantId: waId,
      });

      const id = c.env.MESSAGING_DO.idFromName(threadKey);
      const stub = c.env.MESSAGING_DO.get(id);
      await stub.fetch(
        internalRequestForInboundMessage({
          waId,
          threadKey,
          conversationId,
          workspaceId: endpoint.workspaceId,
          channelEndpointId: endpoint.id,
          text: message.text?.body ?? "",
          messageId: message.id,
          phoneNumberId: message.phoneNumberId,
        }),
      );
    }

    return c.text("OK", 200);
  });

  return app;
}

