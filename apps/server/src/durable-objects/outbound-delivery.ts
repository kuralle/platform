import type { HarnessStreamPart } from "@kuralle-agents/core";
import {
  OutboundPipeline,
  StreamMapper,
  windowGuard,
  type OutboundRequest,
  type OutboundSink,
  type PlatformClient,
  type SendOutcome,
  type WindowStore,
} from "@kuralle-agents/messaging";
import { classifyMetaError } from "@kuralle-agents/messaging-meta";
import { MessagingError } from "@kuralle-agents/messaging";
import type { DeliveryEvent } from "./delivery-events.js";

export type TemplateStrategy = "none";

export interface DeliverAssistantTurnOptions {
  conversationId: string;
  waId: string;
  threadKey: string;
  streamParts: HarnessStreamPart[];
  sessionId: string;
  platform: PlatformClient;
  windowStore: WindowStore;
  templateStrategy?: TemplateStrategy;
  allocateSequence: () => number;
  emitDelivery: (event: DeliveryEvent) => Promise<void>;
}

function hasOutboundContent(parts: HarnessStreamPart[]): boolean {
  const text = parts
    .filter((part): part is Extract<HarnessStreamPart, { type: "text-delta" }> => part.type === "text-delta")
    .map((part) => part.delta)
    .join("")
    .trim();
  if (text.length > 0) return true;
  return parts.some((part) => part.type === "interactive");
}

async function* partsToStream(parts: HarnessStreamPart[]): AsyncIterable<HarnessStreamPart> {
  for (const part of parts) {
    yield part;
  }
}

function classifySendError(error: unknown): { message: string; code?: number } {
  if (error instanceof MessagingError) {
    return { message: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function createObservedPipeline(
  sink: OutboundSink,
  onOutcome: (outcome: SendOutcome, req: OutboundRequest) => void,
): OutboundPipeline {
  const pipeline = new OutboundPipeline([windowGuard], sink);
  return {
    send: async (req) => {
      const outcome = await pipeline.send(req);
      onOutcome(outcome, req);
      return outcome;
    },
  } as OutboundPipeline;
}

export async function deliverAssistantTurn(
  options: DeliverAssistantTurnOptions,
): Promise<void> {
  const {
    conversationId,
    waId,
    threadKey,
    streamParts,
    sessionId,
    platform,
    windowStore,
    templateStrategy = "none",
    allocateSequence,
    emitDelivery,
  } = options;

  if (!hasOutboundContent(streamParts)) {
    return;
  }

  const window = await windowStore.get(threadKey);
  if (!window.open) {
    if (templateStrategy !== "none") {
      // Template recovery seam — strategy wiring is follow-up work.
    }
    console.log(
      JSON.stringify({
        level: "info",
        at: "messaging-do-outbound",
        operation: "delivery-deferred",
        conversationId,
        threadKey,
        reason: "window-closed",
        ts: new Date().toISOString(),
      }),
    );
    await emitDelivery({
      kind: "delivery.deferred",
      conversationId,
      sequenceNumber: allocateSequence(),
      occurredAt: new Date(),
      payload: {
        channel: "whatsapp",
        reason: "window-closed",
      },
    });
    return;
  }

  const emitSent = async (
    outcome: SendOutcome,
    req: OutboundRequest,
  ): Promise<void> => {
    if (outcome.kind === "deferred") {
      console.log(
        JSON.stringify({
          level: "info",
          at: "messaging-do-outbound",
          operation: "delivery-deferred",
          conversationId,
          threadKey,
          reason: outcome.reason,
          ts: new Date().toISOString(),
        }),
      );
      await emitDelivery({
        kind: "delivery.deferred",
        conversationId,
        sequenceNumber: allocateSequence(),
        occurredAt: new Date(),
        payload: {
          channel: "whatsapp",
          reason: outcome.reason,
          payloadKind:
            req.payload.kind === "interactive"
              ? "interactive"
              : req.payload.kind === "text"
                ? "text"
                : undefined,
        },
      });
      return;
    }
    if (outcome.kind === "suppressed") {
      return;
    }
    if (outcome.kind === "sent" || outcome.kind === "converted") {
      await emitDelivery({
        kind: "delivery.sent",
        conversationId,
        sequenceNumber: allocateSequence(),
        occurredAt: new Date(),
        payload: {
          channel: "whatsapp",
          outboundMessageId: outcome.result.messageId,
          payloadKind:
            req.payload.kind === "interactive"
              ? "interactive"
              : req.payload.kind === "text"
                ? "text"
                : undefined,
        },
      });
    }
  };

  const sink: OutboundSink = {
    sendText: (to, text) => platform.sendText(to, text),
    sendInteractive: (to, msg) => platform.sendInteractive(to, msg),
    sendMedia: (to, media) => platform.sendMedia(to, media),
    ...(typeof platform.sendTemplate === "function"
      ? { sendTemplate: (to, template) => platform.sendTemplate!(to, template) }
      : {}),
    ...(typeof platform.sendTextWithTag === "function"
      ? {
          sendTextWithTag: (to, text, tag) =>
            platform.sendTextWithTag!(to, text, tag),
        }
      : {}),
  };

  const pipeline = createObservedPipeline(sink, (outcome, req) => {
    void emitSent(outcome, req);
  });
  const mapper = new StreamMapper();

  try {
    await mapper.mapStream(partsToStream(streamParts), platform, waId, {
      pipeline,
      windowStore,
      sessionId,
    });
  } catch (error: unknown) {
    const classified =
      error instanceof MessagingError
        ? error
        : classifyMetaError(500, { error: { message: classifySendError(error).message } }, "whatsapp");
    console.error(
      JSON.stringify({
        level: "error",
        at: "messaging-do-outbound",
        operation: "delivery-failed",
        conversationId,
        threadKey,
        error: classified.message,
        code: classified.code,
        ts: new Date().toISOString(),
      }),
    );
    await emitDelivery({
      kind: "delivery.failed",
      conversationId,
      sequenceNumber: allocateSequence(),
      occurredAt: new Date(),
      payload: {
        channel: "whatsapp",
        error: classified.message,
      },
    });
  }
}
