/**
 * Runtime env reader with test substrate fallback.
 *
 * Production: Cloudflare Workers injects bindings via the
 * `cloudflare:workers` virtual module (Alchemy → Worker → CF runtime).
 * Test: vitest cannot resolve `cloudflare:workers`, so we fall back to
 * `process.env`. The shim prefers CF env when available (matching the
 * brief's hexagonal intent) and falls back to node otherwise.
 *
 * All apps/server code reads META/PUBLIC_BASE_URL through this shim so
 * tests can inject via `process.env.META_*` in vitest setup, and
 * production reads from the CF binding without any per-call branching.
 */
export interface RuntimeEnv {
  META_APP_ID: string;
  META_APP_SECRET: string;
  META_SYSTEM_USER_TOKEN: string;
  META_VERIFY_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  PUBLIC_BASE_URL: string;
}

type CfEnvShape = Partial<RuntimeEnv>;

/**
 * Best-effort load of the `cloudflare:workers` virtual module. Returns
 * undefined in any environment where the module is unavailable
 * (vitest, plain node) instead of throwing.
 */
async function loadCfEnv(): Promise<CfEnvShape | undefined> {
  try {
    const mod = (await import(
      /* @vite-ignore */ "cloudflare:workers"
    )) as { env?: CfEnvShape } | undefined;
    return mod?.env;
  } catch {
    return undefined;
  }
}

let cachedEnv: RuntimeEnv | null = null;

export async function getEnv(): Promise<RuntimeEnv> {
  if (cachedEnv) return cachedEnv;

  const cf = await loadCfEnv();
  const get = (key: keyof RuntimeEnv, fallback = ""): string =>
    cf?.[key] ?? process.env[key] ?? fallback;

  cachedEnv = {
    META_APP_ID: get("META_APP_ID"),
    META_APP_SECRET: get("META_APP_SECRET"),
    META_SYSTEM_USER_TOKEN: get("META_SYSTEM_USER_TOKEN"),
    META_VERIFY_TOKEN: get("META_VERIFY_TOKEN"),
    META_PHONE_NUMBER_ID: get("META_PHONE_NUMBER_ID"),
    PUBLIC_BASE_URL: get("PUBLIC_BASE_URL", "http://localhost:3000"),
  };
  return cachedEnv;
}

/**
 * Synchronous variant for `createContext` paths that cannot await.
 * Reads `process.env` directly — relies on Alchemy `compatibility: "node"`
 * polyfilling `process.env` from CF bindings at boot. Tests inject via
 * `process.env` in vitest setup. The async `getEnv()` is preferred when
 * available because it can also read fresh CF env on each call.
 */
export function getEnvSync(): RuntimeEnv {
  return {
    META_APP_ID: process.env.META_APP_ID ?? "",
    META_APP_SECRET: process.env.META_APP_SECRET ?? "",
    META_SYSTEM_USER_TOKEN: process.env.META_SYSTEM_USER_TOKEN ?? "",
    META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN ?? "",
    META_PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID ?? "",
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  };
}
