import { KuralleAgent } from "@kuralle-agents/cf-agent";
import type { AgentConfig, HarnessConfig, HarnessStreamPart } from "@kuralle-agents/core";
import type { WindowStore } from "@kuralle-agents/messaging";
import {
  buildHarnessHooks,
  emitCallerTurn,
  type MessagingEvent,
  irToAgentConfig,
} from "@kuralle/runtime";
import type { DurableObjectState } from "@cloudflare/workers-types";
import { DoStorageWindowStore } from "./do-storage-window-store.js";
import type { ConversationPlatformEvent } from "./delivery-events.js";
import {
  createMessagingDoDeps,
  type MessagingDoDeps,
  type MessagingDoEnv,
  type WhatsAppSender,
} from "./deps.js";
import { deliverAssistantTurn } from "./outbound-delivery.js";
import { shardKeyForConversation } from "./shard.js";

interface InboundEnvelope {
  waId: string;
  threadKey: string;
  conversationId: string;
  workspaceId: string;
  channelEndpointId: string;
  text: string;
  messageId: string;
}

interface RuntimeSessionSnapshot {
  workingMemory: Record<string, unknown>;
}

interface QueueProducerBinding {
  send(body: unknown): Promise<void>;
}

export type { MessagingDoDeps, MessagingDoEnv };

export class MessagingDO extends KuralleAgent<MessagingDoEnv> {
  private readonly stateRef: DurableObjectState;
  private readonly envRef: MessagingDoEnv;
  private restorePromise: Promise<void> | null = null;
  private currentConversationId = "";
  private runtimeAgents: HarnessConfig["agents"] = [];
  private defaultAgentId = "messaging";
  private sequenceNumber = 0;
  private workingMemory: Record<string, unknown> = {};
  private resolvedDeps: MessagingDoDeps | null = null;
  private windowStore: WindowStore;
  private readonly turnStreamParts: HarnessStreamPart[] = [];
  private readonly whatsAppSenders = new Map<string, WhatsAppSender>();
  private deliverySequence = 0;

  constructor(state: DurableObjectState, env: MessagingDoEnv) {
    super(state, env);
    this.stateRef = state;
    this.envRef = env;
    this.windowStore = new DoStorageWindowStore(state.storage);
  }

  protected getAgents(): HarnessConfig["agents"] {
    return this.runtimeAgents;
  }

  protected getDefaultAgentId(): string {
    return this.defaultAgentId;
  }

  protected getRuntimeConfig(): Partial<HarnessConfig> {
    if (!this.currentConversationId) {
      return {};
    }
    const queue = this.createQueueAdapter(this.currentConversationId);
    const baseHooks = buildHarnessHooks({
      queue,
      conversationId: this.currentConversationId,
      initialSequence: this.sequenceNumber,
      onSequenceAllocated: (value) => {
        this.sequenceNumber = value;
      },
    });
    const streamParts = this.turnStreamParts;
    return {
      hooks: {
        ...baseHooks,
        onStreamPart: async (context, part) => {
          streamParts.push(part);
          await baseHooks.onStreamPart?.(context, part);
        },
      },
    };
  }

  static threadKeyForWaId(waId: string): string {
    return `whatsapp:${waId}`;
  }

  private getDeps(): MessagingDoDeps | undefined {
    if (this.envRef.__messagingDODeps) {
      return this.envRef.__messagingDODeps;
    }
    if (!this.resolvedDeps) {
      this.resolvedDeps = createMessagingDoDeps(
        this.envRef,
        this.envRef.__messagingDoDepsOverrides,
      );
    }
    return this.resolvedDeps;
  }

  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/internal/inbound")) {
      const envelope = (await request.json()) as InboundEnvelope;
      await this.processInbound(envelope);
      return new Response("OK", { status: 200 });
    }
    return super.onRequest(request);
  }

  async alarm(): Promise<void> {
    await this.ensureRestored();
  }

  private async ensureRestored(): Promise<void> {
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = this.stateRef.blockConcurrencyWhile(async () => {
      const cached = await this.stateRef.storage.get<RuntimeSessionSnapshot>("runtime-session");
      const cachedSeq = await this.stateRef.storage.get<number>("runtime-seq");
      if (typeof cachedSeq === "number") {
        this.sequenceNumber = cachedSeq;
      }
      if (cached?.workingMemory) {
        this.workingMemory = cached.workingMemory;
      }
    });
    await this.restorePromise;
  }

  async processInbound(envelope: InboundEnvelope): Promise<void> {
    // [S3-fix-2] r2 finding #1: ensureRestored() loads cached `runtime-seq`
    // from `state.storage`. Without this call on the inbound path, a DO
    // cold-start would reset `this.sequenceNumber` to 0 and replay ordinals
    // (corrupting the projector's idempotency/turn-ordering invariants).
    await this.ensureRestored();

    this.currentConversationId = envelope.conversationId;
    this.turnStreamParts.length = 0;
    const deps = this.getDeps();
    deps?.bindConversation?.(envelope.conversationId, envelope.workspaceId);
    await this.windowStore.recordInbound(envelope.threadKey, new Date());
    await this.stateRef.blockConcurrencyWhile(async () => {
      if (!deps) return;
      const dbSnapshot = await deps.loadWorkingMemory(envelope.conversationId);
      if (!dbSnapshot) return;
      this.workingMemory = dbSnapshot;
      await this.stateRef.storage.put("runtime-session", {
        workingMemory: this.workingMemory,
      } satisfies RuntimeSessionSnapshot);
    });

    await this.resolveAgents(envelope.conversationId);

    const nextSequence = this.sequenceNumber + 1;
    this.sequenceNumber = nextSequence;
    await emitCallerTurn({
      queue: this.createQueueAdapter(envelope.conversationId),
      conversationId: envelope.conversationId,
      sequenceNumber: nextSequence,
      turnId: crypto.randomUUID(),
      messageId: envelope.messageId,
      fullText: envelope.text,
      occurredAt: new Date(),
    });

    // saveMessages triggers a programmatic chat turn (onChatMessage + _reply).
    // Only run when agents are resolved — otherwise CF would invoke the runtime
    // with the default agent id and no configured agents.
    if (this.runtimeAgents.length > 0) {
      const userMessage = {
        id: envelope.messageId,
        role: "user",
        parts: [{ type: "text", text: envelope.text }],
      } as const;
      const existingMessages =
        "messages" in this && Array.isArray(this.messages) ? this.messages : [];
      try {
        const result = await this.saveMessages([...existingMessages, userMessage]);
        if (result.status !== "completed") {
          const message =
            result.error instanceof Error
              ? result.error.message
              : String(result.error ?? result.status);
          this.workingMemory.lastRuntimeError = message;
          console.error(
            JSON.stringify({
              level: "error",
              at: "messaging-do",
              doId: this.stateRef.id.toString(),
              operation: "saveMessages",
              conversationId: envelope.conversationId,
              status: result.status,
              error: message,
              ts: new Date().toISOString(),
            }),
          );
        } else if (deps) {
          await this.deliverAssistantOutbound(envelope, deps);
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.workingMemory.lastRuntimeError = error.message;
        console.error(
          JSON.stringify({
            level: "error",
            at: "messaging-do",
            doId: this.stateRef.id.toString(),
            operation: "saveMessages",
            conversationId: envelope.conversationId,
            error: error.message,
            stack: error.stack,
            ts: new Date().toISOString(),
          }),
        );
      }
    }

    this.workingMemory.lastInboundText = envelope.text;
    this.workingMemory.lastInboundAt = new Date().toISOString();
    this.workingMemory.lastMessageId = envelope.messageId;

    await this.stateRef.storage.put("runtime-session", {
      workingMemory: this.workingMemory,
    } satisfies RuntimeSessionSnapshot);
    await this.stateRef.storage.put("runtime-seq", this.sequenceNumber);

    if (deps) {
      await deps.persistWorkingMemory(envelope.conversationId, this.workingMemory);
    }
  }

  private async resolveAgents(conversationId: string): Promise<void> {
    const deps = this.getDeps();
    if (!deps?.resolveModel) return;

    const graph = deps.loadAgentGraph
      ? await deps.loadAgentGraph(conversationId)
      : deps.loadAgentIr
        ? await deps.loadAgentIr(conversationId).then((resolved) =>
            resolved
              ? {
                  defaultAgentId: resolved.agentId,
                  agents: [resolved],
                  workspaceId: "",
                }
              : null,
          )
        : null;

    if (!graph || graph.agents.length === 0) return;

    const configs: AgentConfig[] = [];
    for (const entry of graph.agents) {
      configs.push(
        (await irToAgentConfig(entry.ir, {
          agentId: entry.agentId,
          resolveModel: deps.resolveModel,
          resolveTool: deps.resolveTool,
          resolveIntegrationTools: deps.resolveIntegrationTools,
          resolveMcpTools: deps.resolveMcpTools,
          maxSteps: deps.runtimeDefaults?.maxSteps,
          maxTurns: deps.runtimeDefaults?.maxTurns,
          toolMaxSteps: deps.runtimeDefaults?.toolMaxSteps,
        })) as AgentConfig,
      );
    }

    this.runtimeAgents = configs;
    this.defaultAgentId = graph.defaultAgentId;
  }

  private createQueueAdapter(conversationId: string) {
    return {
      publish: async (_topic: string, payload: unknown) => {
        await this.emitQueueEvent(conversationId, payload as MessagingEvent);
      },
      publishBatch: async (_topic: string, payloads: unknown[]) => {
        for (const payload of payloads) {
          await this.emitQueueEvent(conversationId, payload as MessagingEvent);
        }
      },
      consume: () => ({ stop: async () => {} }),
    };
  }

  private async deliverAssistantOutbound(
    envelope: InboundEnvelope,
    deps: MessagingDoDeps,
  ): Promise<void> {
    if (!deps.createWhatsAppSender || this.turnStreamParts.length === 0) {
      return;
    }

    let sender = this.whatsAppSenders.get(envelope.conversationId);
    if (!sender) {
      const resolved = await deps.createWhatsAppSender(envelope.conversationId);
      if (!resolved) {
        return;
      }
      this.whatsAppSenders.set(envelope.conversationId, resolved);
      sender = resolved;
    }

    try {
      await deliverAssistantTurn({
        conversationId: envelope.conversationId,
        waId: envelope.waId,
        threadKey: envelope.threadKey,
        streamParts: [...this.turnStreamParts],
        sessionId: this.stateRef.id.toString(),
        platform: sender.client,
        windowStore: this.windowStore,
        allocateSequence: () => ++this.deliverySequence,
        emitDelivery: async (event) => {
          await this.emitQueueEvent(envelope.conversationId, event);
        },
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(
        JSON.stringify({
          level: "error",
          at: "messaging-do",
          doId: this.stateRef.id.toString(),
          operation: "deliverAssistantOutbound",
          conversationId: envelope.conversationId,
          error: error.message,
          ts: new Date().toISOString(),
        }),
      );
    }
  }

  private async emitQueueEvent(
    conversationId: string,
    event: ConversationPlatformEvent,
  ): Promise<void> {
    const queueName = shardKeyForConversation(conversationId);
    const queueBinding = this.envRef[this.toQueueBindingName(queueName)] as
      | QueueProducerBinding
      | undefined;
    if (queueBinding) {
      await queueBinding.send(event);
    }
    const deps = this.getDeps();
    if (deps) {
      await deps.emitEvents(conversationId, [event]);
    }
  }

  /** Test seam: inject a fixed window store (e.g. closed-window defer tests). */
  setWindowStoreForTests(store: WindowStore): void {
    this.windowStore = store;
  }

  private toQueueBindingName(queueName: string): string {
    return queueName.replace(/-/g, "_").toUpperCase();
  }
}

