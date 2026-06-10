import type { MessagingEvent } from "@kuralle/runtime";

export type DeliveryEventKind = "delivery.sent" | "delivery.deferred" | "delivery.failed";

export interface DeliveryEvent {
  kind: DeliveryEventKind;
  conversationId: string;
  sequenceNumber: number;
  occurredAt: Date;
  payload: {
    turnId?: string;
    outboundMessageId?: string;
    channel: "whatsapp";
    reason?: string;
    error?: string;
    payloadKind?: "text" | "interactive";
  };
}

export type ConversationPlatformEvent = MessagingEvent | DeliveryEvent;

export function isDeliveryEvent(
  event: ConversationPlatformEvent,
): event is DeliveryEvent {
  return (
    event.kind === "delivery.sent" ||
    event.kind === "delivery.deferred" ||
    event.kind === "delivery.failed"
  );
}
