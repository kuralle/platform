// ── §2.1 KvStore — hot config cache
export interface KvStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { ttlSeconds?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** Atomic get-or-compute. Single-flight per key within a process. */
  getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    opts?: { ttlSeconds?: number },
  ): Promise<T>;
}

// ── §2.2 BlobStore — durable binary storage
export interface BlobStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, value: Uint8Array | ReadableStream, opts?: BlobPutOpts): Promise<void>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, opts?: { expiresIn?: number; method?: "GET" | "PUT" }): Promise<string>;
  list(prefix: string, opts?: { cursor?: string; limit?: number }): Promise<BlobListResult>;
}

export interface BlobPutOpts {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface BlobListResult {
  keys: ReadonlyArray<{ key: string; size: number; uploadedAt: Date }>;
  nextCursor: string | null;
}

// ── §2.3 MessageQueue — sink path
export interface MessageQueue {
  publish<T>(topic: string, payload: T, opts?: PublishOpts): Promise<void>;
  publishBatch<T>(topic: string, payloads: T[], opts?: PublishOpts): Promise<void>;
  consume<T>(
    topic: string,
    handler: (msg: ConsumeMessage<T>) => Promise<void>,
    opts?: ConsumeOpts,
  ): ConsumerHandle;
}

export interface PublishOpts {
  /** Idempotency key for at-most-once semantics. */
  idempotencyKey?: string;
  /** Per-message routing hint; consumer can use it for sharding. */
  routingKey?: string;
}

export interface ConsumeMessage<T> {
  payload: T;
  attempt: number;
  ack(): Promise<void>;
  nack(opts?: { requeue?: boolean; reason?: string }): Promise<void>;
}

export interface ConsumeOpts {
  concurrency?: number;
  visibilityTimeoutMs?: number;
  maxRetries?: number;
}

export interface ConsumerHandle {
  stop(): Promise<void>;
}

// ── §2.4 RuntimePlatform — agent execution
// Synthesis from INTERFACE_DESIGNS_RuntimeHost.md §5:
// Design C spine + Design A watch() + Design B diagnostics + Design D RuntimeFailure

export interface VoiceAcquireInput {
  workspaceId: string;
  region: string;
  complianceMode: string;
  agentVersionId: string;
}

export interface VoiceAttachInput {
  conversationId: string;
  carrierHandshake: { callSid: string; accountSid: string };
}

export interface VoiceHostHandle {
  readonly hostId: string;
  readonly workspaceId: string;
}

export interface VoiceSessionHandle {
  readonly sessionId: string;
  readonly hostId: string;
}

export interface VoiceMediaChannel {
  pushInbound(frame: Uint8Array): void;
  readonly outbound: AsyncIterable<Uint8Array>;
  pushControl(frame: unknown): void;
  close(): Promise<void>;
}

export interface VoiceSessionTap {
  readonly inboundTapped: AsyncIterable<unknown>;
  readonly outboundTapped: AsyncIterable<unknown>;
  readonly events: AsyncIterable<unknown>;
  close(): void;
}

export interface VoiceSelector {
  kind: "host";
  hostId: string;
}

export interface VoiceStatus {
  hostId: string;
  phase: RuntimePhase;
  lastHeartbeatAt: Date;
}

export interface VoiceDrainPlan {
  hostId: string;
  sessionsToDrain: number;
  deadlineMs: number;
}

export interface VoiceRuntimeHost {
  acquireHost(input: VoiceAcquireInput): Promise<VoiceHostHandle>;
  attachSession(
    host: VoiceHostHandle,
    input: VoiceAttachInput,
  ): Promise<{ session: VoiceSessionHandle; channel: VoiceMediaChannel }>;
  openSupervisorTap(session: VoiceSessionHandle): Promise<VoiceSessionTap>;
  watch(selector: VoiceSelector): AsyncIterable<VoiceStatus>;
  beginDrain(host: VoiceHostHandle, reason: string): Promise<VoiceDrainPlan>;
}

export interface MessagingResolveInput {
  workspaceId: string;
  conversationId: string;
  region: string;
  complianceMode: string;
  agentVersionId: string;
}

export interface MessagingDispatchInput {
  ref: MessagingActorRef;
  event: { kind: string; payload: unknown; receivedAt: Date };
}

export interface MessagingActorRef {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly conversationId: string;
}

export interface MessagingDispatchResult {
  producedOutbound: ReadonlyArray<{ kind: string; payload: unknown }>;
}

export interface MessagingConversationLog {
  readonly actorId: string;
  events: ReadonlyArray<{ kind: string; payload: unknown; at: Date }>;
}

export interface MessagingHibernationStatus {
  actorId: string;
  hibernating: boolean;
  lastActiveAt: Date | null;
}

export interface MessagingEvictionPlan {
  candidates: ReadonlyArray<{ actorId: string; idleMs: number }>;
}

export interface MessagingSelector {
  kind: "actor";
  actorId: string;
}

export interface MessagingStatus {
  actorId: string;
  hibernating: boolean;
  lastActiveAt: Date | null;
}

export interface MessagingRuntimeHost {
  resolveActor(input: MessagingResolveInput): Promise<MessagingActorRef>;
  dispatch(input: MessagingDispatchInput): Promise<MessagingDispatchResult>;
  openConversationLog(ref: MessagingActorRef): Promise<MessagingConversationLog>;
  watch(selector: MessagingSelector): AsyncIterable<MessagingStatus>;
  evictionPlan(): MessagingEvictionPlan;
}

export type RuntimePhase =
  | "Pending"
  | "Provisioning"
  | "Ready"
  | "Draining"
  | "Terminated"
  | "Failed";

export interface ListHostsFilter {
  workspaceId?: string;
  phase?: RuntimePhase;
}

export interface HostHandle {
  hostId: string;
  workspaceId: string;
  phase: RuntimePhase;
  region: string;
  startedAt: Date | null;
}

export interface RuntimePlatformDiagnostics {
  listHosts(filter: ListHostsFilter): Promise<ReadonlyArray<HostHandle>>;
  selfCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }>;
  rehydrateHost(hostId: string): Promise<HostHandle | null>;
}

export type RuntimeFailure =
  | { kind: "noproc"; hostId: string }
  | { kind: "timeout"; phase: "spawn" | "attach" | "drain" }
  | { kind: "compliance"; reason: string }
  | {
      kind: "platform";
      detail:
        | { adapter: "cf"; subKind: "do-evicted" | "container-oom" | "cpu-budget" }
        | { adapter: "fly"; subKind: "machine-restarted" | "host-drained" | "oom" }
        | { adapter: "k8s"; subKind: "pod-evicted" | "oom-killed" | "preempted" };
    };

export interface RuntimePlatform {
  readonly voice: VoiceRuntimeHost;
  readonly messaging: MessagingRuntimeHost;
  readonly diagnostics: RuntimePlatformDiagnostics;
}

// ── §2.5 SessionStore — per-conversation runtime state
// Owned by AriaFlow. Will be re-exported from @ariaflowagents/core in S2.
// Until then this is a structural placeholder.
export interface SessionStore {
  readonly __aria_marker: "SessionStore";
}

// ── §2.6 AuthAdapter — better-auth binding
export interface AuthAdapter {
  resolveSession(req: Request): Promise<ResolvedSession | null>;
  issueWidgetToken(opts: {
    workspaceId: string;
    channelEndpointId: string;
    ttlSeconds: number;
  }): Promise<string>;
  verifyWidgetToken(
    token: string,
  ): Promise<{ workspaceId: string; channelEndpointId: string } | null>;
}

export interface ResolvedSession {
  userId: string;
  sessionId: string;
  activeOrganizationId: string;
  role: "owner" | "admin" | "member" | "viewer";
}

// ── §2.7 ActorHost — generic actor primitive
export interface ActorHost {
  actor<T extends ActorClass>(klass: T, id: string): ActorRef<InstanceType<T>>;
}

export interface ActorRef<T> {
  call<K extends keyof T>(
    method: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spec match per HEXAGONAL §2.7
    ...args: T[K] extends (...a: infer A) => any ? A : never
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- spec match per HEXAGONAL §2.7
  ): Promise<T[K] extends (...a: any[]) => Promise<infer R> ? R : never>;
}

export interface ActorClass {
  new (state: ActorState): unknown;
}

export interface ActorState {
  storage: KvStore;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
}

// ── §2.8 LlmGateway — provider proxy
// LlmProviderClient shape is not fully specified in §2.8.
// S2 fills in the shape when AriaFlow integrates the gateway.
export interface LlmProviderClient {
  readonly provider: "openai" | "anthropic" | "google" | "custom";
  /** Shape not yet specified — S2 fills this in when the LLM gateway is exercised. */
  readonly __llm_placeholder: true;
}

export interface LlmGateway {
  client(provider: "openai" | "anthropic" | "google" | "custom"): LlmProviderClient;
  checkQuota(
    workspaceId: string,
    model: string,
  ): Promise<{ allowed: boolean; retryAfterMs?: number }>;
}
