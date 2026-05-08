import type { Context } from "./context";

/**
 * better-auth's `auth.api.*` organization endpoints resolve the caller via
 * `getSession(headers)`, which reads a signed session cookie — not the raw
 * `session.token` from the DB. Callers must pass the same `Cookie` header the
 * browser would send (or tests must use `signUpEmail({ asResponse: true })` and
 * forward `Set-Cookie`).
 *
 * For managed fields (name/slug/logo/metadata), `updateOrganization` still runs
 * through better-auth; custom Drizzle columns are updated separately (workspace
 * router, onboarding `complete`).
 */
export function headersForBetterAuthApi(context: Context): Headers {
  return new Headers(context.requestHeaders);
}
