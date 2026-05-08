import { createHmac } from "node:crypto";

export function metaWebhookInbound(opts?: {
  appSecret?: string;
  waId?: string;
  phoneNumberId?: string;
  messageId?: string;
  text?: string;
}) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: opts?.phoneNumberId ?? "111111" },
              contacts: [{ wa_id: opts?.waId ?? "94770000000", profile: { name: "Test User" } }],
              messages: [
                {
                  id: opts?.messageId ?? "wamid.TEST",
                  from: opts?.waId ?? "94770000000",
                  timestamp: "1710000000",
                  type: "text",
                  text: { body: opts?.text ?? "hello" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const rawBody = JSON.stringify(payload);
  const appSecret = opts?.appSecret ?? "test_secret";
  const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return { rawBody, signature };
}

export function metaWebhookMalformed(): string {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{}] });
}

