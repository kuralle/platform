import { describe, it, expect } from "vitest";
import { createMemoryBindings } from "./index.js";

const b = createMemoryBindings();

// ── KvStore (§2.1)
describe("KvStore", () => {
  it("sets and gets a value", async () => {
    await b.kvStore.set("key1", { hello: "world" });
    const result = await b.kvStore.get<{ hello: string }>("key1");
    expect(result).toEqual({ hello: "world" });
  });

  it("returns null for a missing key", async () => {
    const result = await b.kvStore.get("nonexistent");
    expect(result).toBeNull();
  });

  it("deletes a key", async () => {
    await b.kvStore.set("temp", 42);
    await b.kvStore.delete("temp");
    expect(await b.kvStore.get("temp")).toBeNull();
  });

  it("expires entries after ttl", async () => {
    await b.kvStore.set("ephemeral", "value", { ttlSeconds: -1 });
    expect(await b.kvStore.get("ephemeral")).toBeNull();
  });

  it("getOrCompute returns cached value", async () => {
    let computeCalls = 0;
    await b.kvStore.set("gc-key", "cached");
    const result = await b.kvStore.getOrCompute("gc-key", async () => {
      computeCalls++;
      return "computed";
    });
    expect(result).toBe("cached");
    expect(computeCalls).toBe(0);
  });

  it("getOrCompute runs compute on miss", async () => {
    const result = await b.kvStore.getOrCompute("gc-miss", async () => "fresh");
    expect(result).toBe("fresh");
  });
});

// ── BlobStore (§2.2)
describe("BlobStore", () => {
  it("puts and gets bytes", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await b.blobStore.put("blob1", data);
    const result = await b.blobStore.get("blob1");
    expect(result).toEqual(data);
  });

  it("returns null for a missing blob", async () => {
    const result = await b.blobStore.get("nope");
    expect(result).toBeNull();
  });

  it("deletes a blob", async () => {
    await b.blobStore.put("todelete", new Uint8Array([5]));
    await b.blobStore.delete("todelete");
    expect(await b.blobStore.get("todelete")).toBeNull();
  });

  it("generates a signed URL", async () => {
    await b.blobStore.put("signme", new Uint8Array([0]));
    const url = await b.blobStore.signedUrl("signme");
    expect(url).toContain("memory://blob/signme");
  });

  it("lists blobs by prefix", async () => {
    await b.blobStore.put("list/a", new Uint8Array(1));
    await b.blobStore.put("list/b", new Uint8Array(2));
    await b.blobStore.put("other/c", new Uint8Array(3));

    const result = await b.blobStore.list("list/");
    expect(result.keys).toHaveLength(2);
    expect(result.keys.map((k) => k.key).sort()).toEqual(["list/a", "list/b"]);
  });

  it("lists empty when no match", async () => {
    const result = await b.blobStore.list("zzz/");
    expect(result.keys).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ── MessageQueue (§2.3)
describe("MessageQueue", () => {
  it("publishes and consumes a message", async () => {
    const received: unknown[] = [];
    const handle = b.messageQueue.consume<{ x: number }>("test-topic", async (msg) => {
      received.push(msg.payload);
      await msg.ack();
    });

    await b.messageQueue.publish("test-topic", { x: 42 });
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ x: 42 });
    await handle.stop();
  });

  it("publishes a batch", async () => {
    const received: unknown[] = [];
    const handle = b.messageQueue.consume<number>("batch-topic", async (msg) => {
      received.push(msg.payload);
      await msg.ack();
    });

    await b.messageQueue.publishBatch("batch-topic", [10, 20, 30]);
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toEqual([10, 20, 30]);
    await handle.stop();
  });

  it("deduplicates by idempotency key", async () => {
    const received: unknown[] = [];
    const handle = b.messageQueue.consume<string>("idem-topic", async (msg) => {
      received.push(msg.payload);
      await msg.ack();
    });

    await b.messageQueue.publish("idem-topic", "once", { idempotencyKey: "ik-1" });
    await b.messageQueue.publish("idem-topic", "twice", { idempotencyKey: "ik-1" });
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toEqual(["once"]);
    await handle.stop();
  });

  it("stops consuming after handle.stop()", async () => {
    const received: unknown[] = [];
    const handle = b.messageQueue.consume<string>("stop-topic", async (msg) => {
      received.push(msg.payload);
      await msg.ack();
    });

    await b.messageQueue.publish("stop-topic", "first");
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual(["first"]);

    await handle.stop();
    await b.messageQueue.publish("stop-topic", "second");
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toEqual(["first"]);
  });

  it("exposes attempt count", async () => {
    const attempts: number[] = [];
    const handle = b.messageQueue.consume<number>("attempt-topic", async (msg) => {
      attempts.push(msg.attempt);
      await msg.ack();
    });

    await b.messageQueue.publish("attempt-topic", 1);
    await new Promise((r) => setTimeout(r, 50));
    expect(attempts[0]).toBe(0);
    await handle.stop();
  });

  // codex r2 edge cases — ack/nack mutual exclusivity + stop() consumer-targeting
  it("ack() then nack() throws (mutually exclusive)", async () => {
    let caught: Error | null = null;
    const handle = b.messageQueue.consume<string>("excl-ack-nack", async (msg) => {
      await msg.ack();
      try {
        await msg.nack({ requeue: true });
      } catch (err) {
        caught = err as Error;
      }
    });

    await b.messageQueue.publish("excl-ack-nack", "x");
    await new Promise((r) => setTimeout(r, 50));
    expect(caught).not.toBeNull();
    expect((caught as unknown as Error).message).toMatch(/mutually exclusive/);
    await handle.stop();
  });

  it("nack() then ack() throws (mutually exclusive)", async () => {
    let caught: Error | null = null;
    const handle = b.messageQueue.consume<string>("excl-nack-ack", async (msg) => {
      await msg.nack({ requeue: false });
      try {
        await msg.ack();
      } catch (err) {
        caught = err as Error;
      }
    });

    await b.messageQueue.publish("excl-nack-ack", "x");
    await new Promise((r) => setTimeout(r, 50));
    expect(caught).not.toBeNull();
    expect((caught as unknown as Error).message).toMatch(/mutually exclusive/);
    await handle.stop();
  });

  it("repeated ack() / nack() are idempotent (no throw)", async () => {
    const handle = b.messageQueue.consume<string>("idempotent-acks", async (msg) => {
      await msg.ack();
      await msg.ack();
    });
    await b.messageQueue.publish("idempotent-acks", "x");
    await new Promise((r) => setTimeout(r, 50));
    await handle.stop();
  });

  it("stop() removes the exact registered consumer when multiple are active", async () => {
    const a: string[] = [];
    const c: string[] = [];

    const handleA = b.messageQueue.consume<string>("multi-stop", async (msg) => {
      a.push(msg.payload);
      await msg.ack();
    });
    const handleC = b.messageQueue.consume<string>("multi-stop", async (msg) => {
      c.push(msg.payload);
      await msg.ack();
    });

    // round-robin: with 2 consumers, alternate publishes go to A then C.
    await b.messageQueue.publish("multi-stop", "1");
    await b.messageQueue.publish("multi-stop", "2");
    await new Promise((r) => setTimeout(r, 30));

    // stop A only; C should keep receiving.
    await handleA.stop();
    await b.messageQueue.publish("multi-stop", "3");
    await b.messageQueue.publish("multi-stop", "4");
    await new Promise((r) => setTimeout(r, 30));

    // After A is stopped, all subsequent messages go to C.
    expect(c).toContain("3");
    expect(c).toContain("4");
    expect(a).not.toContain("3");
    expect(a).not.toContain("4");
    await handleC.stop();
  });

  it("drain stops gracefully when all consumers are removed mid-flight", async () => {
    const received: string[] = [];
    let processed = 0;
    const handle = b.messageQueue.consume<string>("stop-mid-drain", async (msg) => {
      received.push(msg.payload);
      processed++;
      // Stop ourselves after the first message; the second pending publish
      // should NOT be delivered (no consumer to receive it). The drain loop
      // must terminate cleanly without throwing.
      if (processed === 1) {
        // microtask boundary; stop after the handler returns
        queueMicrotask(() => {
          void handle.stop();
        });
      }
      await msg.ack();
    });

    await b.messageQueue.publish("stop-mid-drain", "1");
    await b.messageQueue.publish("stop-mid-drain", "2");
    await new Promise((r) => setTimeout(r, 100));

    // First arrived; second is buffered with no consumer, drain returns cleanly.
    expect(received).toContain("1");
  });
});

// ── RuntimePlatform (§2.4)
describe("RuntimePlatform", () => {
  describe("voice", () => {
    it("acquires a voice host", async () => {
      const host = await b.runtimePlatform.voice.acquireHost({
        workspaceId: "ws-1",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-1",
      });
      expect(host.hostId).toBe("voice:ws-1");
      expect(host.workspaceId).toBe("ws-1");
    });

    it("acquiring the same host returns the existing handle", async () => {
      const host1 = await b.runtimePlatform.voice.acquireHost({
        workspaceId: "ws-2",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-2",
      });
      const host2 = await b.runtimePlatform.voice.acquireHost({
        workspaceId: "ws-2",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-2",
      });
      expect(host2.hostId).toBe(host1.hostId);
    });

    it("attaches a session to a host", async () => {
      const host = await b.runtimePlatform.voice.acquireHost({
        workspaceId: "ws-3",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-3",
      });
      const { session, channel } = await b.runtimePlatform.voice.attachSession(host, {
        conversationId: "conv-1",
        carrierHandshake: { callSid: "CA123", accountSid: "AC456" },
      });
      expect(session.sessionId).toContain("conv-1");
      expect(channel).toBeDefined();
    });

    it("throws when attaching session to unknown host", async () => {
      await expect(
        b.runtimePlatform.voice.attachSession(
          { hostId: "voice:unknown", workspaceId: "x" },
          {
            conversationId: "conv-x",
            carrierHandshake: { callSid: "CA", accountSid: "AC" },
          },
        ),
      ).rejects.toThrow("Voice host not found");
    });

    it("begins drain on a host", async () => {
      const host = await b.runtimePlatform.voice.acquireHost({
        workspaceId: "ws-drain",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-drain",
      });
      const plan = await b.runtimePlatform.voice.beginDrain(host, "maintenance");
      expect(plan.hostId).toBe(host.hostId);
      expect(plan.sessionsToDrain).toBe(0);
    });

    it("watch yields current status", async () => {
      const host = await b.runtimePlatform.voice.acquireHost({
        workspaceId: "ws-watch",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-watch",
      });
      const it = b.runtimePlatform.voice.watch({ kind: "host", hostId: host.hostId })[Symbol.asyncIterator]();
      const result = await it.next();
      expect(result.value.phase).toBe("Ready");
      expect(result.value.hostId).toBe(host.hostId);
    });

    it("watch on unknown host resolves immediately", async () => {
      const it = b.runtimePlatform.voice.watch({ kind: "host", hostId: "voice:ghost" })[Symbol.asyncIterator]();
      const result = await it.next();
      expect(result.done).toBe(true);
    });
  });

  describe("messaging", () => {
    it("resolves a messaging actor", async () => {
      const ref = await b.runtimePlatform.messaging.resolveActor({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-1",
      });
      expect(ref.actorId).toBe("messaging:ws-1:conv-1");
      expect(ref.workspaceId).toBe("ws-1");
      expect(ref.conversationId).toBe("conv-1");
    });

    it("dispatches an event to an actor", async () => {
      const ref = await b.runtimePlatform.messaging.resolveActor({
        workspaceId: "ws-disp",
        conversationId: "conv-disp",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-disp",
      });
      const result = await b.runtimePlatform.messaging.dispatch({
        ref,
        event: { kind: "text", payload: { body: "hello" }, receivedAt: new Date() },
      });
      expect(result.producedOutbound).toEqual([]);
    });

    it("throws when dispatching to unknown actor", async () => {
      await expect(
        b.runtimePlatform.messaging.dispatch({
          ref: { actorId: "messaging:unknown:ghost", workspaceId: "x", conversationId: "ghost" },
          event: { kind: "text", payload: null, receivedAt: new Date() },
        }),
      ).rejects.toThrow("Messaging actor not found");
    });

    it("reads conversation log", async () => {
      const ref = await b.runtimePlatform.messaging.resolveActor({
        workspaceId: "ws-log",
        conversationId: "conv-log",
        region: "us-east",
        complianceMode: "none",
        agentVersionId: "av-log",
      });
      await b.runtimePlatform.messaging.dispatch({
        ref,
        event: { kind: "text", payload: { body: "msg1" }, receivedAt: new Date() },
      });
      const log = await b.runtimePlatform.messaging.openConversationLog(ref);
      expect(log.events).toHaveLength(1);
      expect(log.events[0]!.kind).toBe("text");
    });

    it("eviction plan returns candidates for hibernating actors", async () => {
      const plan = b.runtimePlatform.messaging.evictionPlan();
      expect(Array.isArray(plan.candidates)).toBe(true);
    });
  });

  describe("diagnostics", () => {
    it("selfCheck reports healthy", async () => {
      const result = await b.runtimePlatform.diagnostics.selfCheck();
      expect(result.healthy).toBe(true);
    });

    it("listHosts returns empty by default", async () => {
      const hosts = await b.runtimePlatform.diagnostics.listHosts({});
      expect(hosts).toEqual([]);
    });

    it("rehydrateHost returns null", async () => {
      const result = await b.runtimePlatform.diagnostics.rehydrateHost("any");
      expect(result).toBeNull();
    });
  });
});

// ── SessionStore (§2.5)
describe("SessionStore", () => {
  it("creates a session store instance", () => {
    expect(b.sessionStore.__aria_marker).toBe("SessionStore");
  });

  it("placeholder has no runtime methods yet (S2 adds aria-flow)", () => {
    // Structural placeholder — existence is the assertion
    expect(b.sessionStore).toBeDefined();
  });
});

// ── AuthAdapter (§2.6)
describe("AuthAdapter", () => {
  it("resolves a session from cookie", async () => {
    const session = {
      userId: "u-1",
      sessionId: "s-1",
      activeOrganizationId: "org-1",
      role: "owner" as const,
    };
    b.authAdapter.addSession("token-abc", session);

    const req = new Request("https://example.com", {
      headers: { cookie: "session=token-abc" },
    });
    const resolved = await b.authAdapter.resolveSession(req);
    expect(resolved).toEqual(session);
  });

  it("returns null when no session cookie", async () => {
    const req = new Request("https://example.com");
    const resolved = await b.authAdapter.resolveSession(req);
    expect(resolved).toBeNull();
  });

  it("returns null for unknown session token", async () => {
    const req = new Request("https://example.com", {
      headers: { cookie: "session=invalid" },
    });
    const resolved = await b.authAdapter.resolveSession(req);
    expect(resolved).toBeNull();
  });

  it("issues and verifies a widget token", async () => {
    const token = await b.authAdapter.issueWidgetToken({
      workspaceId: "ws-1",
      channelEndpointId: "ce-1",
      ttlSeconds: 3600,
    });
    const verified = await b.authAdapter.verifyWidgetToken(token);
    expect(verified).toEqual({ workspaceId: "ws-1", channelEndpointId: "ce-1" });
  });

  it("returns null for an expired widget token", async () => {
    const token = await b.authAdapter.issueWidgetToken({
      workspaceId: "ws-1",
      channelEndpointId: "ce-1",
      ttlSeconds: -1,
    });
    const verified = await b.authAdapter.verifyWidgetToken(token);
    expect(verified).toBeNull();
  });

  it("returns null for a malformed token", async () => {
    const verified = await b.authAdapter.verifyWidgetToken("not-valid-base64!!!");
    expect(verified).toBeNull();
  });
});

// ── ActorHost (§2.7)
describe("ActorHost", () => {
  class TestActor {
    private counter = 0;

    async increment(): Promise<number> {
      this.counter++;
      return this.counter;
    }

    async getCounter(): Promise<number> {
      return this.counter;
    }

    async fail(): Promise<never> {
      throw new Error("intentional failure");
    }
  }

  it("creates and calls an actor method", async () => {
    const ref = b.actorHost.actor(TestActor, "actor-1");
    const result = await ref.call("increment");
    expect(result).toBe(1);
  });

  it("same actor id returns same instance", async () => {
    const ref1 = b.actorHost.actor(TestActor, "actor-2");
    await ref1.call("increment");
    const ref2 = b.actorHost.actor(TestActor, "actor-2");
    const result = await ref2.call("getCounter");
    expect(result).toBe(1);
  });

  it("different actor ids return different instances", async () => {
    const refA = b.actorHost.actor(TestActor, "actor-a");
    const refB = b.actorHost.actor(TestActor, "actor-b");
    await refA.call("increment");
    expect(await refA.call("getCounter")).toBe(1);
    expect(await refB.call("getCounter")).toBe(0);
  });

  it("propagates method errors thrown inside an actor", async () => {
    const ref = b.actorHost.actor(TestActor, "error-actor");
    await expect(ref.call("fail")).rejects.toThrow("intentional failure");
  });

  it("state.blockConcurrencyWhile serializes access", async () => {
    class ConcurrentActor {
      public runs: number[] = [];
      constructor(private readonly state: { blockConcurrencyWhile: <T>(fn: () => Promise<T>) => Promise<T> }) {}

      async ordered(seq: number): Promise<number[]> {
        return this.state.blockConcurrencyWhile(async () => {
          await new Promise((r) => setTimeout(r, 10));
          this.runs.push(seq);
          return [...this.runs];
        });
      }
    }

    const ref = b.actorHost.actor(ConcurrentActor, "concurrent-1");
    const [, , result] = await Promise.all([
      ref.call("ordered", 1),
      ref.call("ordered", 2),
      ref.call("ordered", 3),
    ]);
    expect(result).toEqual([1, 2, 3]);
  });
});

// ── LlmGateway (§2.8)
describe("LlmGateway", () => {
  it("returns a client for a provider", () => {
    const client = b.llmGateway.client("openai");
    expect(client.provider).toBe("openai");
    expect(client.__llm_placeholder).toBe(true);
  });

  it("returns clients for all known providers", () => {
    for (const p of ["openai", "anthropic", "google", "custom"] as const) {
      expect(b.llmGateway.client(p).provider).toBe(p);
    }
  });

  it("checkQuota always returns allowed in memory", async () => {
    const result = await b.llmGateway.checkQuota("ws-1", "gpt-4");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });
});
