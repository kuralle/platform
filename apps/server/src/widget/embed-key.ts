const EMBED_KEY_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateWidgetEmbedKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let suffix = "";
  for (let i = 0; i < 24; i++) {
    suffix += EMBED_KEY_ALPHABET[bytes[i]! % EMBED_KEY_ALPHABET.length]!;
  }
  return `wk_${suffix}`;
}

export const WIDGET_VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;
