import type { MessagingEvent } from "@kuralle/runtime";

export type DeliveryEventKind = "delivery.sent" | "delivery.deferred" | "delivery.failed";

/** Delivery events are part of the runtime MessagingEvent union (projected to
 * conversation_turns.delivery_status); this narrows for DO-local call sites. */
export type DeliveryEvent = Extract<MessagingEvent, { kind: DeliveryEventKind }>;

export type ConversationPlatformEvent = MessagingEvent;

export function isDeliveryEvent(
  event: ConversationPlatformEvent,
): event is DeliveryEvent {
  return (
    event.kind === "delivery.sent" ||
    event.kind === "delivery.deferred" ||
    event.kind === "delivery.failed"
  );
}
