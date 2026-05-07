import type { BlobStore, BlobPutOpts, BlobListResult } from "../interface.js";

const NOT_IMPLEMENTED = "not-implemented (s0 stub; lands in S3-S5)";

export class CloudflareBlobStore implements BlobStore {
  async get(_key: string): Promise<Uint8Array | null> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async put(_key: string, _value: Uint8Array | ReadableStream, _opts?: BlobPutOpts): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async delete(_key: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async signedUrl(
    _key: string,
    _opts?: { expiresIn?: number; method?: "GET" | "PUT" },
  ): Promise<string> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async list(
    _prefix: string,
    _opts?: { cursor?: string; limit?: number },
  ): Promise<BlobListResult> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
