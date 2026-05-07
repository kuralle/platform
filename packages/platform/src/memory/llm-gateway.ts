import type { LlmGateway, LlmProviderClient } from "../interface.js";

class MemoryLlmProviderClient implements LlmProviderClient {
  readonly provider: "openai" | "anthropic" | "google" | "custom";
  readonly __llm_placeholder = true as const;

  constructor(provider: "openai" | "anthropic" | "google" | "custom") {
    this.provider = provider;
  }
}

export class MemoryLlmGateway implements LlmGateway {
  client(provider: "openai" | "anthropic" | "google" | "custom"): LlmProviderClient {
    return new MemoryLlmProviderClient(provider);
  }

  async checkQuota(
    _workspaceId: string,
    _model: string,
  ): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    return { allowed: true };
  }
}
