import { describe, expect, it } from "vitest";
import { DoStorageWindowStore } from "./do-storage-window-store.js";

class InMemoryStorage {
  private readonly map = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.map.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }
}

describe("DoStorageWindowStore", () => {
  it("is closed when no inbound has been recorded", async () => {
    const store = new DoStorageWindowStore(new InMemoryStorage() as never);
    const state = await store.get("whatsapp:1");
    expect(state.open).toBe(false);
    expect(state.expiresAt).toBeNull();
  });

  it("is open within 24h of the last inbound user message", async () => {
    const storage = new InMemoryStorage();
    const store = new DoStorageWindowStore(storage as never);
    const inboundAt = new Date("2026-06-10T12:00:00.000Z");
    await store.recordInbound("whatsapp:1", inboundAt);

    const state = await store.get("whatsapp:1");
    expect(state.open).toBe(true);
    expect(state.expiresAt?.toISOString()).toBe("2026-06-11T12:00:00.000Z");
  });

  it("is closed after the 24h window expires", async () => {
    const storage = new InMemoryStorage();
    const store = new DoStorageWindowStore(storage as never);
    const expiredInbound = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await store.recordInbound("whatsapp:1", expiredInbound);

    const state = await store.get("whatsapp:1");
    expect(state.open).toBe(false);
    expect(state.expiresAt).not.toBeNull();
  });

  it("recordExpiry aligns expiry to the platform-reported timestamp", async () => {
    const storage = new InMemoryStorage();
    const store = new DoStorageWindowStore(storage as never);
    const expiresAt = new Date("2026-06-11T08:00:00.000Z");
    await store.recordExpiry("whatsapp:1", expiresAt);

    const state = await store.get("whatsapp:1");
    expect(state.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
  });
});
