import type { BlobStore, BlobPutOpts, BlobListResult } from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

export class NodeBlobStore implements BlobStore {
  async get(_key: string): Promise<Uint8Array | null> { throw new Error(NI); }
  async put(_key: string, _value: Uint8Array | ReadableStream, _opts?: BlobPutOpts): Promise<void> { throw new Error(NI); }
  async delete(_key: string): Promise<void> { throw new Error(NI); }
  async signedUrl(_key: string, _opts?: { expiresIn?: number; method?: "GET" | "PUT" }): Promise<string> { throw new Error(NI); }
  async list(_prefix: string, _opts?: { cursor?: string; limit?: number }): Promise<BlobListResult> { throw new Error(NI); }
}
