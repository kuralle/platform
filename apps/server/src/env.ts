/**
 * Runtime env reader with test substrate fallback.
 *
 * In production (Cloudflare Workers), env bindings are injected by
 * the Alchemy/CF runtime and surfaced via `cloudflare:workers`.
 * In test (vitest), `process.env` is the substrate — vitest cannot
 * load the `cloudflare:workers` virtual module.
 *
 * All apps/server code reads META/PUBLIC_BASE_URL through this shim
 * so tests can inject via `process.env.META_*` in vitest setup.
 */
export interface RuntimeEnv {
  META_APP_ID: string;
  META_APP_SECRET: string;
  META_SYSTEM_USER_TOKEN: string;
  META_VERIFY_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  PUBLIC_BASE_URL: string;
}

export function getEnv(): RuntimeEnv {
  return {
    META_APP_ID: process.env.META_APP_ID ?? "",
    META_APP_SECRET: process.env.META_APP_SECRET ?? "",
    META_SYSTEM_USER_TOKEN: process.env.META_SYSTEM_USER_TOKEN ?? "",
    META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN ?? "",
    META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID ?? "",
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  };
}
