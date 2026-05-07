import type { SessionStore } from "../interface.js";

export class NodeSessionStore implements SessionStore {
  readonly __aria_marker = "SessionStore" as const;
}
