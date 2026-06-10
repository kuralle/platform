import type { AgentConfig } from "@kuralle-agents/core";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { vi } from "vitest";
import type { MetaWhatsAppClientDeps, PhoneNumberInfo } from "./clients/meta-whatsapp.js";

type LanguageModel = NonNullable<AgentConfig["model"]>;

export function createStubLanguageModel(text: string): LanguageModel {
  return new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "text-1" },
          { type: "text-delta", id: "text-1", delta: text },
          { type: "text-end", id: "text-1" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: {
                total: 1,
                text: 1,
                reasoning: undefined,
              },
            },
          },
        ],
      }),
    }),
  }) as unknown as LanguageModel;
}

export interface MockMetaClientOverrides {
  listPhoneNumbers?: PhoneNumberInfo[];
  subscribeApp?: () => Promise<void>;
  unsubscribeApp?: () => Promise<void>;
}

/**
 * Factory returning a stub MetaWhatsAppClientDeps with vi.fn() methods.
 * Callers configure stub behaviour per test through overrides.
 */
export function mockMetaClient(
  overrides: MockMetaClientOverrides = {},
): MetaWhatsAppClientDeps {
  const graphApi = {
    get: vi.fn().mockResolvedValue({
      data: overrides.listPhoneNumbers ?? [
        {
          id: "4156066651724687",
          displayPhoneNumber: "+1 555-555-0199",
          qualityRating: "GREEN",
          verifiedName: "Test Business",
          codeVerificationStatus: "VERIFIED",
        },
      ],
    }),
    post: vi.fn().mockResolvedValue(overrides.subscribeApp ? undefined : { success: true }),
    postFormData: vi.fn(),
    fetchBinary: vi.fn(),
  } as unknown as MetaWhatsAppClientDeps["graphApi"];

  return { graphApi };
}
