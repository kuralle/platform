import { NodeKvStore } from "./kv-store.js";
import { NodeBlobStore } from "./blob-store.js";
import { NodeMessageQueue } from "./message-queue.js";
import { nodeVoiceRuntimeHost, nodeMessagingRuntimeHost, nodeDiagnostics } from "./runtime-host.js";
import { NodeSessionStore } from "./session-store.js";
import { NodeAuthAdapter } from "./auth-adapter.js";
import { NodeActorHost } from "./actor-host.js";
import { NodeLlmGateway } from "./llm-gateway.js";

export function createNodeBindings() {
  return {
    kvStore: new NodeKvStore(),
    blobStore: new NodeBlobStore(),
    messageQueue: new NodeMessageQueue(),
    runtimePlatform: {
      voice: nodeVoiceRuntimeHost,
      messaging: nodeMessagingRuntimeHost,
      diagnostics: nodeDiagnostics,
    },
    sessionStore: new NodeSessionStore(),
    authAdapter: new NodeAuthAdapter(),
    actorHost: new NodeActorHost(),
    llmGateway: new NodeLlmGateway(),
  };
}
