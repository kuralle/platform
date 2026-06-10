import type { WindowState, WindowStore } from "@kuralle-agents/messaging";
import type { DurableObjectStorage } from "@cloudflare/workers-types";

const WINDOW_KEY = "window:lastInboundAt";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export class DoStorageWindowStore implements WindowStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  async get(_threadId: string): Promise<WindowState> {
    const raw = await this.storage.get<string>(WINDOW_KEY);
    if (!raw) {
      return { open: false, expiresAt: null };
    }
    const lastInboundAt = new Date(raw);
    if (Number.isNaN(lastInboundAt.getTime())) {
      return { open: false, expiresAt: null };
    }
    const expiresAt = new Date(lastInboundAt.getTime() + WINDOW_MS);
    return expiresAt > new Date()
      ? { open: true, expiresAt }
      : { open: false, expiresAt };
  }

  async recordInbound(_threadId: string, ts: Date): Promise<void> {
    const existing = await this.storage.get<string>(WINDOW_KEY);
    if (!existing || ts.getTime() > new Date(existing).getTime()) {
      await this.storage.put(WINDOW_KEY, ts.toISOString());
    }
  }

  async recordExpiry(_threadId: string, at: Date): Promise<void> {
    const lastInboundAt = new Date(at.getTime() - WINDOW_MS);
    await this.storage.put(WINDOW_KEY, lastInboundAt.toISOString());
  }
}
