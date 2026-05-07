import type { BlobStore, BlobPutOpts, BlobListResult } from "../interface.js";

interface BlobEntry {
  value: Uint8Array;
  opts?: BlobPutOpts;
  uploadedAt: Date;
}

export class MemoryBlobStore implements BlobStore {
  private readonly store = new Map<string, BlobEntry>();

  async get(key: string): Promise<Uint8Array | null> {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async put(key: string, value: Uint8Array | ReadableStream, opts?: BlobPutOpts): Promise<void> {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else {
      const chunks: Uint8Array[] = [];
      const reader = value.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      bytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
    }
    this.store.set(key, { value: bytes, opts, uploadedAt: new Date() });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async signedUrl(
    key: string,
    _opts?: { expiresIn?: number; method?: "GET" | "PUT" },
  ): Promise<string> {
    return `memory://blob/${key}`;
  }

  async list(
    prefix: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<BlobListResult> {
    const limit = opts?.limit ?? 100;
    const allKeys = Array.from(this.store.entries())
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, entry]) => ({
        key,
        size: entry.value.length,
        uploadedAt: entry.uploadedAt,
      }));

    if (allKeys.length === 0) return { keys: [], nextCursor: null };

    const cursorIdx = opts?.cursor ? allKeys.findIndex((k) => k.key > opts.cursor!) : 0;
    const start = cursorIdx >= 0 ? cursorIdx : 0;
    const slice = allKeys.slice(start, start + limit);

    return {
      keys: slice,
      nextCursor: start + limit < allKeys.length ? slice[slice.length - 1]!.key : null,
    };
  }
}
