import { MemoryKvStore } from "./kv-store.js";
import { MemoryBlobStore } from "./blob-store.js";
import { MemoryMessageQueue } from "./message-queue.js";
import { MemoryRuntimePlatform } from "./runtime-host.js";
import { MemorySessionStore } from "./session-store.js";
import { MemoryAuthAdapter } from "./auth-adapter.js";
import { MemoryActorHost } from "./actor-host.js";
import { MemoryLlmGateway } from "./llm-gateway.js";

export function createMemoryBindings() {
  const kvStore = new MemoryKvStore();
  const blobStore = new MemoryBlobStore();
  const messageQueue = new MemoryMessageQueue();
  const runtimePlatform = new MemoryRuntimePlatform();
  const sessionStore = new MemorySessionStore();
  const authAdapter = new MemoryAuthAdapter();
  const actorHost = new MemoryActorHost();
  const llmGateway = new MemoryLlmGateway();

  return {
    kvStore,
    blobStore,
    messageQueue,
    runtimePlatform,
    sessionStore,
    authAdapter,
    actorHost,
    llmGateway,
  };
}

export {
  MemoryKvStore,
  MemoryBlobStore,
  MemoryMessageQueue,
  MemoryRuntimePlatform,
  MemorySessionStore,
  MemoryAuthAdapter,
  MemoryActorHost,
  MemoryLlmGateway,
};
