/**
 * S3-06 Real-DO loop test (workerd, via @cloudflare/vitest-pool-workers).
 *
 * **Scope:** verifies that the REAL `MessagingDO` (extending
 * `@kuralle-agents/cf-agent` `KuralleAgent`) loads inside the Cloudflare
 * Workers runtime and processes an inbound envelope without falling back to
 * any shell behaviour. This is the workerd-side complement to the Node-side
 * projector-pipeline test in `slo-whatsapp-e2e.test.ts`.
 *
 * Run via: `bun -F server test:slo:do` (config: `vitest.slo.do.config.ts`).
 *
 * What this test verifies:
 *   - `MessagingDO` loads via the real `cloudflare:workers` import chain.
 *   - The DO accepts an internal inbound envelope on `/internal/inbound`.
 *   - The caller-turn `MessagingEvent` is emitted (collected via test deps).
 *   - Working-memory persistence flows through the documented seam.
 *
 * What this test does NOT verify (deferred to S4 voice work):
 *   - The full `KuralleAgent.onChatMessage` runtime invocation. CF's
 *     AIChatAgent base fires `onChatMessage` from the WebSocket chat protocol
 *     (`CF_AGENT_USE_CHAT_REQUEST` frame) — exercising it requires either a
 *     real WebSocket client or extracting `onChatMessage` to be callable from
 *     `processInbound` directly. Both are larger architectural moves than the
 *     [S3-fix] scope.
 *
 * Per `feedback_no_shell_implementations.md`: this test does NOT mock the
 * KuralleAgent base. It loads the real class via workerd, exercises
 * documented integration seams (deps injection, queue capture), and asserts
 * on real behaviour.
 */
import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { MessagingDO } from "../durable-objects/MessagingDO.js";
import type { MessagingEvent } from "@kuralle/runtime";

interface MessagingDoEnvShape {
  MESSAGING_DO: DurableObjectNamespace<MessagingDO>;
  __messagingDODeps?: {
    loadAgentIr?: (
      conversationId: string,
    ) => Promise<{ agentId: string; ir: unknown } | null>;
    resolveModel?: () => unknown;
    loadWorkingMemory: (
      conversationId: string,
    ) => Promise<Record<string, unknown> | null>;
    persistWorkingMemory: (
      conversationId: string,
      workingMemory: Record<string, unknown>,
    ) => Promise<void>;
    emitEvents: (conversationId: string, events: MessagingEvent[]) => Promise<void>;
  };
}

describe("S3-06 real MessagingDO loop in workerd", () => {
  it("loads the real DO and emits a caller turn on inbound", async () => {
    // Inject test deps onto the env (pool-workers gives us a live env binding;
    // we attach a `__messagingDODeps` slot the DO checks for at runtime).
    const collected: MessagingEvent[] = [];
    const persisted = new Map<string, Record<string, unknown>>();
    (env as unknown as MessagingDoEnvShape).__messagingDODeps = {
      loadWorkingMemory: async () => null,
      persistWorkingMemory: async (conversationId, wm) => {
        persisted.set(conversationId, wm);
      },
      emitEvents: async (_conversationId, events) => {
        for (const e of events) collected.push(e);
      },
    };

    const ns = (env as unknown as MessagingDoEnvShape).MESSAGING_DO;
    const id = ns.idFromName("whatsapp:94770000777");
    const stub = ns.get(id);

    // Use runInDurableObject to access the instance directly. This proves the
    // DO loaded the real `cloudflare:workers` import chain — which is the
    // contract that broke in plain Node (ERR_UNSUPPORTED_RESOLVE_REQUEST on
    // `cloudflare:workers`).
    await runInDurableObject(stub, async (instance) => {
      expect(instance).toBeDefined();
      expect(typeof (instance as MessagingDO).onRequest).toBe("function");
    });

    // Drive an inbound envelope through the real DO.
    const envelope = {
      waId: "94770000777",
      threadKey: "whatsapp:94770000777",
      conversationId: "cv_real_do_test",
      workspaceId: "ws_real_do_test",
      channelEndpointId: "ce_real_do_test",
      text: "hello from real DO test",
      messageId: "wamid.real-do-test-1",
    };
    const response = await stub.fetch(
      "https://test.local/internal/inbound",
      {
        method: "POST",
        body: JSON.stringify(envelope),
      },
    );
    expect(response.status).toBe(200);

    // Caller turn must have flowed through the real adapter pipeline.
    const callerTurn = collected.find(
      (e): e is Extract<MessagingEvent, { kind: "turn.end" }> =>
        e.kind === "turn.end" && e.payload.speaker === "caller",
    );
    expect(callerTurn).toBeDefined();
    expect(callerTurn!.payload.messageId).toBe("wamid.real-do-test-1");
    expect(callerTurn!.payload.fullText).toBe("hello from real DO test");
    expect(callerTurn!.conversationId).toBe("cv_real_do_test");

    // Working memory persisted via the documented seam.
    const wm = persisted.get("cv_real_do_test");
    expect(wm).toBeDefined();
    expect(wm!.lastMessageId).toBe("wamid.real-do-test-1");
    expect(wm!.lastInboundText).toBe("hello from real DO test");
  });
});
