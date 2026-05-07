import type {
  VoiceRuntimeHost,
  VoiceAcquireInput,
  VoiceHostHandle,
  VoiceAttachInput,
  VoiceSessionHandle,
  VoiceMediaChannel,
  VoiceSessionTap,
  VoiceSelector,
  VoiceStatus,
  VoiceDrainPlan,
  MessagingRuntimeHost,
  MessagingResolveInput,
  MessagingActorRef,
  MessagingDispatchInput,
  MessagingDispatchResult,
  MessagingConversationLog,
  MessagingSelector,
  MessagingStatus,
  MessagingEvictionPlan,
  RuntimePlatform,
  RuntimePlatformDiagnostics,
  RuntimePhase,
  ListHostsFilter,
  HostHandle,
} from "../interface.js";

// ── Voice memory adapter

interface VoiceHostState {
  handle: VoiceHostHandle;
  phase: RuntimePhase;
  sessions: Map<string, VoiceSessionState>;
  lastHeartbeatAt: Date;
}

interface VoiceSessionState {
  handle: VoiceSessionHandle;
  inboundQueue: Uint8Array[];
  outboundQueue: Uint8Array[];
  inboundResolvers: Array<() => void>;
  outboundResolvers: Array<() => void>;
  taps: VoiceSessionTap[];
  closed: boolean;
}

class MemoryVoiceRuntimeHost implements VoiceRuntimeHost {
  private readonly hosts = new Map<string, VoiceHostState>();
  private readonly statusListeners = new Set<(status: VoiceStatus) => void>();

  async acquireHost(input: VoiceAcquireInput): Promise<VoiceHostHandle> {
    const hostId = `voice:${input.workspaceId}`;
    const existing = this.hosts.get(hostId);
    if (existing) {
      return existing.handle;
    }
    const handle: VoiceHostHandle = { hostId, workspaceId: input.workspaceId };
    this.hosts.set(hostId, {
      handle,
      phase: "Ready",
      sessions: new Map(),
      lastHeartbeatAt: new Date(),
    });
    this.emitStatus({ hostId, phase: "Ready", lastHeartbeatAt: new Date() });
    return handle;
  }

  async attachSession(
    host: VoiceHostHandle,
    input: VoiceAttachInput,
  ): Promise<{ session: VoiceSessionHandle; channel: VoiceMediaChannel }> {
    const hostState = this.hosts.get(host.hostId);
    if (!hostState) throw new Error(`Voice host not found: ${host.hostId}`);

    const sessionId = `voice-session:${input.conversationId}`;
    const sessionHandle: VoiceSessionHandle = { sessionId, hostId: host.hostId };

    const inboundQueue: Uint8Array[] = [];
    const outboundQueue: Uint8Array[] = [];
    const inboundResolvers: Array<() => void> = [];
    const outboundResolvers: Array<() => void> = [];

    const session: VoiceSessionState = {
      handle: sessionHandle,
      inboundQueue,
      outboundQueue,
      inboundResolvers,
      outboundResolvers,
      taps: [],
      closed: false,
    };

    hostState.sessions.set(sessionId, session);

    const channel: VoiceMediaChannel = {
      pushInbound(frame: Uint8Array): void {
        if (session.closed) return;
        inboundQueue.push(frame);
        for (const tap of session.taps) {
          (tap as unknown as { pushEvent(e: unknown): void }).pushEvent?.({ kind: "inbound-frame", data: frame });
        }
        const r = inboundResolvers.shift();
        r?.();
      },
      outbound: this.makeAsyncIterable(outboundQueue, outboundResolvers),
      pushControl(_frame: unknown): void {
        // stub — no-op in memory
      },
      async close(): Promise<void> {
        session.closed = true;
        const r = outboundResolvers.shift();
        r?.();
      },
    };

    return { session: sessionHandle, channel };
  }

  private makeAsyncIterable<T>(
    queue: T[],
    resolvers: Array<() => void>,
  ): AsyncIterable<T> {
    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          async next(): Promise<IteratorResult<T>> {
            while (queue.length === 0) {
              await new Promise<void>((resolve) => {
                resolvers.push(resolve);
              });
            }
            return { value: queue.shift()!, done: false };
          },
        };
      },
    };
  }

  async openSupervisorTap(session: VoiceSessionHandle): Promise<VoiceSessionTap> {
    void session;
    const tap: VoiceSessionTap = {
      inboundTapped: {
        [Symbol.asyncIterator]() {
          return { async next() { await new Promise(() => {}); return { value: undefined, done: true }; } };
        },
      },
      outboundTapped: {
        [Symbol.asyncIterator]() {
          return { async next() { await new Promise(() => {}); return { value: undefined, done: true }; } };
        },
      },
      events: {
        [Symbol.asyncIterator]() {
          return { async next() { await new Promise(() => {}); return { value: undefined, done: true }; } };
        },
      },
      close(): void {},
    };
    return tap;
  }

  async *watch(selector: VoiceSelector): AsyncIterable<VoiceStatus> {
    const hostState = this.hosts.get(selector.hostId);
    if (!hostState) return;
    yield {
      hostId: hostState.handle.hostId,
      phase: hostState.phase,
      lastHeartbeatAt: hostState.lastHeartbeatAt,
    };

    const queue: VoiceStatus[] = [];
    let resolve: (() => void) | null = null;
    const listener = (s: VoiceStatus) => {
      if (s.hostId === selector.hostId) {
        queue.push(s);
        resolve?.();
      }
    };
    this.statusListeners.add(listener);

    try {
      while (true) {
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    } finally {
      this.statusListeners.delete(listener);
    }
  }

  async beginDrain(host: VoiceHostHandle, _reason: string): Promise<VoiceDrainPlan> {
    const hostState = this.hosts.get(host.hostId);
    if (!hostState) throw new Error(`Voice host not found: ${host.hostId}`);
    hostState.phase = "Draining";
    this.emitStatus({
      hostId: host.hostId,
      phase: "Draining",
      lastHeartbeatAt: new Date(),
    });
    return {
      hostId: host.hostId,
      sessionsToDrain: hostState.sessions.size,
      deadlineMs: 30_000,
    };
  }

  private emitStatus(status: VoiceStatus): void {
    for (const l of this.statusListeners) l(status);
  }
}

// ── Messaging memory adapter (follows INTERFACE_DESIGNS_RuntimeHost.md §A.2(d))

interface MessagingActorState {
  ref: MessagingActorRef;
  events: Array<{ kind: string; payload: unknown; at: Date }>;
  hibernating: boolean;
  lastActiveAt: Date;
}

class MemoryMessagingRuntimeHost implements MessagingRuntimeHost {
  private readonly actors = new Map<string, MessagingActorState>();

  async resolveActor(input: MessagingResolveInput): Promise<MessagingActorRef> {
    const actorId = `messaging:${input.workspaceId}:${input.conversationId}`;
    const existing = this.actors.get(actorId);
    if (existing) {
      existing.lastActiveAt = new Date();
      existing.hibernating = false;
      return existing.ref;
    }
    const ref: MessagingActorRef = {
      actorId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
    };
    this.actors.set(actorId, {
      ref,
      events: [],
      hibernating: false,
      lastActiveAt: new Date(),
    });
    return ref;
  }

  async dispatch(input: MessagingDispatchInput): Promise<MessagingDispatchResult> {
    const state = this.actors.get(input.ref.actorId);
    if (!state) throw new Error(`Messaging actor not found: ${input.ref.actorId}`);
    state.events.push({
      kind: input.event.kind,
      payload: input.event.payload,
      at: input.event.receivedAt,
    });
    state.lastActiveAt = new Date();
    return { producedOutbound: [] };
  }

  async openConversationLog(ref: MessagingActorRef): Promise<MessagingConversationLog> {
    const state = this.actors.get(ref.actorId);
    if (!state) throw new Error(`Messaging actor not found: ${ref.actorId}`);
    return { actorId: ref.actorId, events: [...state.events] };
  }

  async *watch(selector: MessagingSelector): AsyncIterable<MessagingStatus> {
    const state = this.actors.get(selector.actorId);
    if (!state) return;
    yield {
      actorId: state.ref.actorId,
      hibernating: state.hibernating,
      lastActiveAt: state.lastActiveAt,
    };
  }

  evictionPlan(): MessagingEvictionPlan {
    const candidates: Array<{ actorId: string; idleMs: number }> = [];
    const now = Date.now();
    for (const [id, state] of this.actors) {
      if (state.hibernating) {
        candidates.push({ actorId: id, idleMs: now - state.lastActiveAt.getTime() });
      }
    }
    return { candidates };
  }
}

// ── Diagnostics memory adapter

class MemoryRuntimePlatformDiagnostics implements RuntimePlatformDiagnostics {
  constructor(
    _voice: MemoryVoiceRuntimeHost,
    _messaging: MemoryMessagingRuntimeHost,
  ) {}

  async listHosts(_filter: ListHostsFilter): Promise<ReadonlyArray<HostHandle>> {
    return [];
  }

  async selfCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    return { healthy: true, details: {} };
  }

  async rehydrateHost(_hostId: string): Promise<HostHandle | null> {
    return null;
  }
}

// ── RuntimePlatform factory

export class MemoryRuntimePlatform implements RuntimePlatform {
  readonly voice: MemoryVoiceRuntimeHost;
  readonly messaging: MemoryMessagingRuntimeHost;
  readonly diagnostics: MemoryRuntimePlatformDiagnostics;

  constructor() {
    this.voice = new MemoryVoiceRuntimeHost();
    this.messaging = new MemoryMessagingRuntimeHost();
    this.diagnostics = new MemoryRuntimePlatformDiagnostics(this.voice, this.messaging);
  }
}
