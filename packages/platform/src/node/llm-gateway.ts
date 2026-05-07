import type { LlmGateway, LlmProviderClient } from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

export class NodeLlmGateway implements LlmGateway {
  client(_p: "openai" | "anthropic" | "google" | "custom"): LlmProviderClient { throw new Error(NI); }
  async checkQuota(_w: string, _m: string): Promise<{ allowed: boolean; retryAfterMs?: number }> { throw new Error(NI); }
}
