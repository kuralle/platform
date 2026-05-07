import type { KvStore } from "../interface.js";

export class MemoryKvStore implements KvStore {
  private readonly store = new Map<string, { value: unknown; expiresAt: number | null }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, opts?: { ttlSeconds?: number }): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: opts?.ttlSeconds ? Date.now() + opts.ttlSeconds * 1000 : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    opts?: { ttlSeconds?: number },
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      try {
        const value = await compute();
        await this.set(key, value, opts);
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise as Promise<T>;
  }
}
