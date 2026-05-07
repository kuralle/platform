import { CloudflareKvStore } from "./kv-store.js";
import { CloudflareBlobStore } from "./blob-store.js";
import { CloudflareMessageQueue } from "./message-queue.js";
import {
  cloudflareVoiceRuntimeHost,
  cloudflareMessagingRuntimeHost,
  cloudflareDiagnostics,
} from "./runtime-host.js";
import { CloudflareSessionStore } from "./session-store.js";
import { CloudflareAuthAdapter } from "./auth-adapter.js";
import { CloudflareActorHost } from "./actor-host.js";
import { CloudflareLlmGateway } from "./llm-gateway.js";

export function createCloudflareBindings(_env: Record<string, unknown>) {
  return {
    kvStore: new CloudflareKvStore(),
    blobStore: new CloudflareBlobStore(),
    messageQueue: new CloudflareMessageQueue(),
    runtimePlatform: {
      voice: cloudflareVoiceRuntimeHost,
      messaging: cloudflareMessagingRuntimeHost,
      diagnostics: cloudflareDiagnostics,
    },
    sessionStore: new CloudflareSessionStore(),
    authAdapter: new CloudflareAuthAdapter(),
    actorHost: new CloudflareActorHost(),
    llmGateway: new CloudflareLlmGateway(),
  };
}
