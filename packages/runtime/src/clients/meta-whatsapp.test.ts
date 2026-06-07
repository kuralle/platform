import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMetaWhatsAppClient,
  listPhoneNumbers,
  subscribeApp,
  unsubscribeApp,
  verifyHmac,
} from "./meta-whatsapp.js";
import type { MetaWhatsAppClientDeps } from "./meta-whatsapp.js";

vi.mock("@kuralle-agents/messaging-meta", () => {
  const mockGet = vi.fn();
  const mockPost = vi.fn();
  // Arrow fns have no [[Construct]] internal method; the thin client calls
  // `new GraphAPIClient(...)`. Use a regular function so vi.fn() can be
  // invoked as a constructor; bind shared mocks onto `this`.
  return {
    GraphAPIClient: vi.fn(function (this: Record<string, unknown>) {
      this.get = mockGet;
      this.post = mockPost;
      this.postFormData = vi.fn();
      this.fetchBinary = vi.fn();
    }),
    verifySignature: vi.fn(),
  };
});

import { GraphAPIClient, verifySignature } from "@kuralle-agents/messaging-meta";

const MockGraphAPIClient = GraphAPIClient as unknown as ReturnType<typeof vi.fn>;
const mockVerifySignature = verifySignature as ReturnType<typeof vi.fn>;

describe("MetaWhatsAppClient", () => {
  let deps: MetaWhatsAppClientDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMetaWhatsAppClient({
      accessToken: "test-token",
      appSecret: "test-secret",
    });
  });

  describe("listPhoneNumbers", () => {
    it("fetches phone numbers from Graph API", async () => {
      const stubNumbers = [
        { id: "123", displayPhoneNumber: "+15551234567", qualityRating: "HIGH" },
        { id: "456", displayPhoneNumber: "+15559876543", qualityRating: "GREEN" },
      ];
      const mockInstance = MockGraphAPIClient.mock.results[0]?.value;
      mockInstance.get.mockResolvedValueOnce({ data: stubNumbers });

      const result = await listPhoneNumbers(deps, { appId: "111111" });

      expect(result).toEqual(stubNumbers);
      expect(mockInstance.get).toHaveBeenCalledWith(
        "111111/phone_numbers",
        expect.objectContaining({ fields: expect.stringContaining("display_phone_number") }),
      );
    });

    it("returns empty array when no phone numbers exist", async () => {
      const mockInstance = MockGraphAPIClient.mock.results[0]?.value;
      mockInstance.get.mockResolvedValueOnce({ data: [] });

      const result = await listPhoneNumbers(deps, { appId: "111111" });
      expect(result).toEqual([]);
    });
  });

  describe("subscribeApp", () => {
    it("posts to subscribed_apps", async () => {
      const mockInstance = MockGraphAPIClient.mock.results[0]?.value;
      mockInstance.post.mockResolvedValueOnce({ success: true });

      await subscribeApp(deps, { phoneNumberId: "123" });
      expect(mockInstance.post).toHaveBeenCalledWith("123/subscribed_apps", {});
    });
  });

  describe("unsubscribeApp", () => {
    it("posts with DELETE method override", async () => {
      const mockInstance = MockGraphAPIClient.mock.results[0]?.value;
      mockInstance.post.mockResolvedValueOnce({ success: true });

      await unsubscribeApp(deps, { phoneNumberId: "123" });
      expect(mockInstance.post).toHaveBeenCalledWith("123/subscribed_apps", {
        _method: "DELETE",
      });
    });
  });

  describe("verifyHmac", () => {
    it("delegates to verifySignature", () => {
      mockVerifySignature.mockReturnValueOnce(true);

      const result = verifyHmac({
        appSecret: "secret",
        rawBody: Buffer.from("body"),
        signatureHeader: "sha256=abc",
      });

      expect(result).toBe(true);
      expect(mockVerifySignature).toHaveBeenCalledWith({
        appSecret: "secret",
        rawBody: Buffer.from("body"),
        signatureHeader: "sha256=abc",
      });
    });

    it("returns false for invalid signature", () => {
      mockVerifySignature.mockReturnValueOnce(false);
      const result = verifyHmac({
        appSecret: "wrong",
        rawBody: Buffer.from("body"),
        signatureHeader: "sha256=bad",
      });
      expect(result).toBe(false);
    });
  });
});
