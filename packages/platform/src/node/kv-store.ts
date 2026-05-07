import type { KvStore } from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

export class NodeKvStore implements KvStore {
  async get<T>(_key: string): Promise<T | null> { throw new Error(NI); }
  async set<T>(_key: string, _value: T, _opts?: { ttlSeconds?: number }): Promise<void> { throw new Error(NI); }
  async delete(_key: string): Promise<void> { throw new Error(NI); }
  async getOrCompute<T>(_key: string, _compute: () => Promise<T>, _opts?: { ttlSeconds?: number }): Promise<T> { throw new Error(NI); }
}
