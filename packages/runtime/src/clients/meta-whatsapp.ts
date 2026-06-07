import {
  GraphAPIClient,
  verifySignature,
} from "@kuralle-agents/messaging-meta";
import type { GraphAPIClientConfig } from "@kuralle-agents/messaging-meta";
import type { VerifySignatureOptions } from "@kuralle-agents/messaging-meta";

export interface MetaWhatsAppClientDeps {
  graphApi: GraphAPIClient;
}

export interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber: string;
  qualityRating?: string;
  verifiedName?: string;
  codeVerificationStatus?: string;
}

export interface ListPhoneNumbersOpts {
  appId: string;
}

export interface SubscribeAppOpts {
  phoneNumberId: string;
}

export interface UnsubscribeAppOpts {
  phoneNumberId: string;
}

export interface VerifyHmacOpts {
  appSecret: string;
  rawBody: Buffer | string;
  signatureHeader: string;
}

/**
 * Thin typed wrapper around @kuralle-agents/messaging-meta's Graph API + webhook
 * verifier. This is the test seam — router handlers import from here, NOT from
 * the Kuralle package directly. S3-03 imports `verifyHmac` from here as well.
 */
export function createMetaWhatsAppClient(config: GraphAPIClientConfig): MetaWhatsAppClientDeps {
  const graphApi = new GraphAPIClient(config);
  return { graphApi };
}

/**
 * List all phone numbers registered to a WhatsApp Business App.
 *
 * Calls GET /{appId}/phone_numbers on the Meta Graph API, returning the
 * standard `data` envelope from paginated-list endpoints.
 */
export async function listPhoneNumbers(
  { graphApi }: MetaWhatsAppClientDeps,
  opts: ListPhoneNumbersOpts,
): Promise<PhoneNumberInfo[]> {
  const response = await graphApi.get<{ data: PhoneNumberInfo[] }>(
    `${opts.appId}/phone_numbers`,
    { fields: "id,display_phone_number,quality_rating,verified_name,code_verification_status" },
  );
  return response.data;
}

/**
 * Subscribe a webhook URL to a WhatsApp phone number.
 *
 * Calls POST /{phoneNumberId}/subscribed_apps to register the default app's
 * webhook for inbound message delivery.
 */
export async function subscribeApp(
  { graphApi }: MetaWhatsAppClientDeps,
  opts: SubscribeAppOpts,
): Promise<void> {
  await graphApi.post(`${opts.phoneNumberId}/subscribed_apps`, {});
}

/**
 * Unsubscribe all apps from a WhatsApp phone number's webhook.
 *
 * Graph API's subscribed_apps endpoint uses POST with a _method=DELETE
 * override. This effectively removes all webhook subscriptions for the
 * phone number.
 */
export async function unsubscribeApp(
  { graphApi }: MetaWhatsAppClientDeps,
  opts: UnsubscribeAppOpts,
): Promise<void> {
  await graphApi.post<unknown>(`${opts.phoneNumberId}/subscribed_apps`, {
    _method: "DELETE",
  });
}

/**
 * Verify HMAC-SHA256 signature on a Meta webhook payload.
 *
 * Thin export-passthrough so S3-03 doesn't reach into another package.
 * Uses timing-safe comparison internally.
 */
export function verifyHmac(opts: VerifyHmacOpts): boolean {
  const verifyOpts: VerifySignatureOptions = {
    appSecret: opts.appSecret,
    rawBody: opts.rawBody,
    signatureHeader: opts.signatureHeader,
  };
  return verifySignature(verifyOpts);
}
