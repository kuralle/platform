import { describe, expect, it, vi } from "vitest";
import type { DurableObjectState } from "@cloudflare/workers-types";

vi.mock("@ariaflowagents/cf-agent", () => {
  class AriaFlowAgent {
    messages: unknown[] = [];
    constructor() {}
    async saveMessages(messages: unknown[]) {
      this.messages = messages;
    }
    async onRequest() {
      return new Response("OK");
    }
  }
  return { AriaFlowAgent };
});

class InMemoryStorage {
  private readonly map = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }
}

class FakeDurableObjectState {
  readonly storage = new InMemoryStorage();
  readonly id = { toString: () => "do-id-1" };
  async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

function createDo(
  MessagingDOClass: typeof import("./MessagingDO.js").MessagingDO,
  deps?: Partial<{
    loadWorkingMemory: (conversationId: string) => Promise<Record<string, unknown> | null>;
  }>,
) {
  const state = new FakeDurableObjectState() as unknown as DurableObjectState;
  return new MessagingDOClass(state, {
    __messagingDODeps: {
      loadWorkingMemory: deps?.loadWorkingMemory ?? (async () => null),
      persistWorkingMemory: async () => {},
      emitEvents: async () => {},
    },
  });
}

describe("MessagingDO", () => {
  it("restores working memory on cold start", async () => {
    const { MessagingDO } = await import("./MessagingDO.js");
    const first = createDo(MessagingDO);
    await first.onRequest(
      new Request("https://example.com/internal/inbound", {
        method: "POST",
        body: JSON.stringify({
          waId: "94770000000",
          threadKey: "whatsapp:94770000000",
          conversationId: "cv_1",
          workspaceId: "ws_1",
          channelEndpointId: "ce_1",
          text: "hello",
          messageId: "wamid.1",
        }),
      }),
    );

    const second = createDo(MessagingDO, {
      loadWorkingMemory: async () => ({ remembered: "from-turn-1" }),
    });
    await second.onRequest(
      new Request("https://example.com/internal/inbound", {
        method: "POST",
        body: JSON.stringify({
          waId: "94770000000",
          threadKey: "whatsapp:94770000000",
          conversationId: "cv_1",
          workspaceId: "ws_1",
          channelEndpointId: "ce_1",
          text: "second",
          messageId: "wamid.2",
        }),
      }),
    );

    const restored = await (
      second as unknown as { stateRef: FakeDurableObjectState }
    ).stateRef.storage.get<{ workingMemory: Record<string, unknown> }>(
      "runtime-session",
    );
    expect(restored?.workingMemory.remembered).toBe("from-turn-1");
  });

  it("maps same wa_id to same thread key", async () => {
    const { MessagingDO } = await import("./MessagingDO.js");
    expect(MessagingDO.threadKeyForWaId("94770000000")).toBe(
      MessagingDO.threadKeyForWaId("94770000000"),
    );
  });
});

