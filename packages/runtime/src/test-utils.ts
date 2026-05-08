import { vi } from "vitest";
import type { MetaWhatsAppClientDeps, PhoneNumberInfo } from "./clients/meta-whatsapp.js";

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
