import { AriaFlowAgent } from "@ariaflowagents/cf-agent";
import type { HarnessConfig } from "@ariaflowagents/core";
import { buildHarnessHooks, type MessagingEvent } from "@kuralle/runtime";
import type { DurableObjectState } from "@cloudflare/workers-types";
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

interface MessagingDoDeps {
  loadWorkingMemory: (conversationId: string) => Promise<Record<string, unknown> | null>;
  persistWorkingMemory: (
    conversationId: string,
    workingMemory: Record<string, unknown>,
  ) => Promise<void>;
  emitEvents: (conversationId: string, events: MessagingEvent[]) => Promise<void>;
}

export interface MessagingDoEnv {
  __messagingDODeps?: MessagingDoDeps;
  [key: string]: unknown;
}

export class MessagingDO extends AriaFlowAgent<MessagingDoEnv> {
  private readonly stateRef: DurableObjectState;
  private readonly envRef: MessagingDoEnv;
  private restorePromise: Promise<void> | null = null;
  private workingMemory: Record<string, unknown> = {};

  constructor(state: DurableObjectState, env: MessagingDoEnv) {
    super(state, env);
    this.stateRef = state;
    this.envRef = env;
  }

  protected getAgents(): HarnessConfig["agents"] {
    return [];
  }

  protected getDefaultAgentId(): string {
    return "messaging";
  }

  static threadKeyForWaId(waId: string): string {
    return `whatsapp:${waId}`;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureRestored();
    const envelope = (await request.json()) as InboundEnvelope;
    await this.processInbound(envelope);
    return new Response("OK", { status: 200 });
  }

  async alarm(): Promise<void> {
    await this.ensureRestored();
  }

  private async ensureRestored(): Promise<void> {
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = this.stateRef.blockConcurrencyWhile(async () => {
      const cached = await this.stateRef.storage.get<RuntimeSessionSnapshot>("runtime-session");
      if (cached?.workingMemory) {
        this.workingMemory = cached.workingMemory;
      }
    });
    await this.restorePromise;
  }

  async processInbound(envelope: InboundEnvelope): Promise<void> {
    const deps = this.envRef.__messagingDODeps;
    if (deps) {
      const dbSnapshot = await deps.loadWorkingMemory(envelope.conversationId);
      if (dbSnapshot) {
        this.workingMemory = dbSnapshot;
      }
    }

    this.workingMemory.lastInboundText = envelope.text;
    this.workingMemory.lastInboundAt = new Date().toISOString();
    this.workingMemory.lastMessageId = envelope.messageId;

    await this.stateRef.storage.put("runtime-session", {
      workingMemory: this.workingMemory,
    } satisfies RuntimeSessionSnapshot);

    if (deps) {
      await deps.persistWorkingMemory(envelope.conversationId, this.workingMemory);
    }

    const emitted: MessagingEvent[] = [];
    const hooks = buildHarnessHooks({
      queue: {
        publish: async (_topic, payload) => {
          emitted.push(payload as MessagingEvent);
        },
        publishBatch: async (_topic, payloads) => {
          for (const payload of payloads) emitted.push(payload as MessagingEvent);
        },
        consume: () => {
          return { stop: async () => {} };
        },
      },
      conversationId: envelope.conversationId,
    });

    await hooks.onAgentStart?.({} as never, "messaging");
    await hooks.onMessage?.(
      { session: { id: envelope.conversationId } } as never,
      {
        id: envelope.messageId,
        role: "assistant",
        content: `Received: ${envelope.text}`,
      } as never,
    );
    await hooks.onAgentEnd?.({} as never, "messaging");

    const queueName = shardKeyForConversation(envelope.conversationId);
    const queueBinding = this.envRef[this.toQueueBindingName(queueName)] as
      | QueueProducerBinding
      | undefined;
    if (queueBinding) {
      for (const event of emitted) {
        await queueBinding.send(event);
      }
    }
    if (deps) {
      await deps.emitEvents(envelope.conversationId, emitted);
    }
  }

  private toQueueBindingName(queueName: string): string {
    return queueName.replace(/-/g, "_").toUpperCase();
  }
}

