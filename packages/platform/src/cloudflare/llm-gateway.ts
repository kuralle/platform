import type { LlmGateway, LlmProviderClient } from "../interface.js";

const NOT_IMPLEMENTED = "not-implemented (s0 stub; lands in S3-S5)";

export class CloudflareLlmGateway implements LlmGateway {
  client(_provider: "openai" | "anthropic" | "google" | "custom"): LlmProviderClient {
    throw new Error(NOT_IMPLEMENTED);
  }
  async checkQuota(
    _workspaceId: string,
    _model: string,
  ): Promise<{ allowed: boolean; retryAfterMs?: number }> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
