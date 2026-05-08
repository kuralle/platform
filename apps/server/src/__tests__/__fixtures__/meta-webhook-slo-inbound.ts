import { createHmac } from "node:crypto";
import { z } from "zod";

const envelopeInputSchema = z
  .object({
    appSecret: z.string().min(1),
    messageId: z.string().min(1),
    phoneNumberId: z.string().min(1),
    waId: z.string().min(1),
    text: z.string().min(1),
  })
  .strict();

export function buildSloWebhookEnvelope(input: z.input<typeof envelopeInputSchema>): {
  rawBody: string;
  signature: string;
} {
  const parsed = envelopeInputSchema.parse(input);
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: parsed.phoneNumberId },
              contacts: [{ wa_id: parsed.waId, profile: { name: "SLO Tester" } }],
              messages: [
                {
                  id: parsed.messageId,
                  from: parsed.waId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: parsed.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const rawBody = JSON.stringify(payload);
  const signature = `sha256=${createHmac("sha256", parsed.appSecret).update(rawBody).digest("hex")}`;
  return { rawBody, signature };
}
