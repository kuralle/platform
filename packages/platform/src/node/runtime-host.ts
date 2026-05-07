import type {
  VoiceRuntimeHost, VoiceAcquireInput, VoiceHostHandle, VoiceAttachInput,
  VoiceSessionHandle, VoiceMediaChannel, VoiceSessionTap, VoiceSelector,
  VoiceStatus, VoiceDrainPlan,
  MessagingRuntimeHost, MessagingResolveInput, MessagingActorRef,
  MessagingDispatchInput, MessagingDispatchResult, MessagingConversationLog,
  MessagingSelector, MessagingStatus, MessagingEvictionPlan,
  RuntimePlatformDiagnostics, ListHostsFilter, HostHandle,
} from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

class NodeVoiceRuntimeHost implements VoiceRuntimeHost {
  async acquireHost(_i: VoiceAcquireInput): Promise<VoiceHostHandle> { throw new Error(NI); }
  async attachSession(_h: VoiceHostHandle, _i: VoiceAttachInput): Promise<{ session: VoiceSessionHandle; channel: VoiceMediaChannel }> { throw new Error(NI); }
  async openSupervisorTap(_s: VoiceSessionHandle): Promise<VoiceSessionTap> { throw new Error(NI); }
  async *watch(_s: VoiceSelector): AsyncIterable<VoiceStatus> { throw new Error(NI); }
  async beginDrain(_h: VoiceHostHandle, _r: string): Promise<VoiceDrainPlan> { throw new Error(NI); }
}

class NodeMessagingRuntimeHost implements MessagingRuntimeHost {
  async resolveActor(_i: MessagingResolveInput): Promise<MessagingActorRef> { throw new Error(NI); }
  async dispatch(_i: MessagingDispatchInput): Promise<MessagingDispatchResult> { throw new Error(NI); }
  async openConversationLog(_r: MessagingActorRef): Promise<MessagingConversationLog> { throw new Error(NI); }
  async *watch(_s: MessagingSelector): AsyncIterable<MessagingStatus> { throw new Error(NI); }
  evictionPlan(): MessagingEvictionPlan { throw new Error(NI); }
}

class NodeRuntimePlatformDiagnostics implements RuntimePlatformDiagnostics {
  async listHosts(_f: ListHostsFilter): Promise<ReadonlyArray<HostHandle>> { throw new Error(NI); }
  async selfCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> { throw new Error(NI); }
  async rehydrateHost(_h: string): Promise<HostHandle | null> { throw new Error(NI); }
}

export const nodeVoiceRuntimeHost = new NodeVoiceRuntimeHost();
export const nodeMessagingRuntimeHost = new NodeMessagingRuntimeHost();
export const nodeDiagnostics = new NodeRuntimePlatformDiagnostics();
