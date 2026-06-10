import type { HarnessStreamPart } from "@kuralle-agents/core";
import type { InteractiveMessage, PlatformClient, SendResult } from "@kuralle-agents/messaging";
import type { WindowStore } from "@kuralle-agents/messaging";
import { WhatsAppFormatConverter } from "@kuralle-agents/messaging-meta/whatsapp";
import { describe, expect, it } from "vitest";
import type { DeliveryEvent } from "./delivery-events.js";
import { deliverAssistantTurn } from "./outbound-delivery.js";

function createCapturingClient(captured: Array<{ kind: string; payload: unknown }>): PlatformClient {
  const formatConverter = new WhatsAppFormatConverter();
  return {
    platform: "whatsapp",
    formatConverter,
    sendText: async (to: string, text: string): Promise<SendResult> => {
      captured.push({ kind: "text", payload: { to, text } });
      return { messageId: "wamid.unit-text", threadId: to, timestamp: new Date() };
    },
    sendInteractive: async (
      to: string,
      interactive: InteractiveMessage,
    ): Promise<SendResult> => {
      captured.push({ kind: "interactive", payload: { to, interactive } });
      return {
        messageId: "wamid.unit-interactive",
        threadId: to,
        timestamp: new Date(),
      };
    },
    sendMedia: async (to: string): Promise<SendResult> => ({
      messageId: "wamid.unit-media",
      threadId: to,
      timestamp: new Date(),
    }),
    sendTypingIndicator: async () => {},
    onMessage: () => {},
    onStatus: () => {},
    onReaction: () => {},
    handleWebhook: async () => new Response("OK"),
  };
}

describe("deliverAssistantTurn", () => {
  it("renders trailing interactive stream parts as WhatsApp buttons", async () => {
    const captured: Array<{ kind: string; payload: unknown }> = [];
    const events: DeliveryEvent[] = [];
    const windowStore: WindowStore = {
      async get() {
        return { open: true, expiresAt: new Date(Date.now() + 3_600_000) };
      },
      async recordInbound() {},
      async recordExpiry() {},
    };

    const parts: HarnessStreamPart[] = [
      {
        type: "interactive",
        nodeId: "choice-node",
        prompt: "Pick one:",
        options: [
          { id: "a", label: "Option A" },
          { id: "b", label: "Option B" },
        ],
      },
    ];

    await deliverAssistantTurn({
      conversationId: "cv_unit",
      waId: "94770000001",
      threadKey: "whatsapp:94770000001",
      streamParts: parts,
      sessionId: "do-unit",
      platform: createCapturingClient(captured),
      windowStore,
      allocateSequence: () => 1,
      emitDelivery: async (event) => {
        events.push(event);
      },
    });

    const interactive = captured.find((item) => item.kind === "interactive");
    expect(interactive).toBeDefined();
    const payload = interactive?.payload as {
      interactive: InteractiveMessage;
    };
    expect(payload.interactive.type).toBe("buttons");
    expect(payload.interactive.action?.buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Option A" }),
        expect.objectContaining({ title: "Option B" }),
      ]),
    );
    expect(events.some((event) => event.kind === "delivery.sent")).toBe(true);
  });
});
