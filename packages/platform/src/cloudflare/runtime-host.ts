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
  RuntimePlatformDiagnostics,
  ListHostsFilter,
  HostHandle,
} from "../interface.js";

const NOT_IMPLEMENTED = "not-implemented (s0 stub; lands in S3-S5)";

class CloudflareVoiceRuntimeHost implements VoiceRuntimeHost {
  async acquireHost(_input: VoiceAcquireInput): Promise<VoiceHostHandle> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async attachSession(
    _host: VoiceHostHandle,
    _input: VoiceAttachInput,
  ): Promise<{ session: VoiceSessionHandle; channel: VoiceMediaChannel }> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async openSupervisorTap(_session: VoiceSessionHandle): Promise<VoiceSessionTap> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async *watch(_selector: VoiceSelector): AsyncIterable<VoiceStatus> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async beginDrain(_host: VoiceHostHandle, _reason: string): Promise<VoiceDrainPlan> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

class CloudflareMessagingRuntimeHost implements MessagingRuntimeHost {
  async resolveActor(_input: MessagingResolveInput): Promise<MessagingActorRef> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async dispatch(_input: MessagingDispatchInput): Promise<MessagingDispatchResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async openConversationLog(
    _ref: MessagingActorRef,
  ): Promise<MessagingConversationLog> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async *watch(_selector: MessagingSelector): AsyncIterable<MessagingStatus> {
    throw new Error(NOT_IMPLEMENTED);
  }
  evictionPlan(): MessagingEvictionPlan {
    throw new Error(NOT_IMPLEMENTED);
  }
}

class CloudflareRuntimePlatformDiagnostics implements RuntimePlatformDiagnostics {
  async listHosts(_filter: ListHostsFilter): Promise<ReadonlyArray<HostHandle>> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async selfCheck(): Promise<{ healthy: boolean; details: Record<string, unknown> }> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async rehydrateHost(_hostId: string): Promise<HostHandle | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
}

export const cloudflareVoiceRuntimeHost = new CloudflareVoiceRuntimeHost();
export const cloudflareMessagingRuntimeHost = new CloudflareMessagingRuntimeHost();
export const cloudflareDiagnostics = new CloudflareRuntimePlatformDiagnostics();
