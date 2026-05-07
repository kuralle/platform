import type { SessionStore } from "../interface.js";

export class MemorySessionStore implements SessionStore {
  readonly __aria_marker = "SessionStore" as const;
}
