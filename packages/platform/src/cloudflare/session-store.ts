import type { SessionStore } from "../interface.js";

export class CloudflareSessionStore implements SessionStore {
  readonly __aria_marker = "SessionStore" as const;
}
