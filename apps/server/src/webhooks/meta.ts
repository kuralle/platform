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

interface NormalizedInboundMessage {
  id: string;
  from: string;
  phoneNumberId: string;
  text: { body: string } | null;
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
    const normalizedMessages = events.messages.length
      ? events.messages
      : extractInboundMessages(parsed);

    for (const message of normalizedMessages) {
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

function extractInboundMessages(payload: unknown): NormalizedInboundMessage[] {
  if (typeof payload !== "object" || payload === null) return [];
  const entry = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entry)) return [];
  const normalized: NormalizedInboundMessage[] = [];
  for (const item of entry) {
    const changes = (item as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> }).value;
      if (!value) continue;
      const phoneNumberId =
        typeof value.metadata === "object" &&
        value.metadata !== null &&
        "phone_number_id" in value.metadata &&
        typeof value.metadata.phone_number_id === "string"
          ? value.metadata.phone_number_id
          : "";
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const message of messages) {
        const text =
          typeof message === "object" &&
          message !== null &&
          "text" in message &&
          typeof message.text === "object" &&
          message.text !== null &&
          "body" in message.text &&
          typeof message.text.body === "string"
            ? { body: message.text.body }
            : null;
        if (
          typeof message === "object" &&
          message !== null &&
          typeof message.id === "string" &&
          typeof message.from === "string"
        ) {
          normalized.push({
            id: message.id,
            from: message.from,
            phoneNumberId,
            text,
          });
        }
      }
    }
  }
  return normalized;
}

