import { describe, expect, it } from "vitest";
import { shardKeyForConversation } from "./shard.js";

describe("shardKeyForConversation", () => {
  it("is deterministic for the same conversation id", () => {
    const id = crypto.randomUUID();
    expect(shardKeyForConversation(id)).toBe(shardKeyForConversation(id));
  });

  it("spreads ids uniformly across 16 shards", () => {
    const buckets = new Array<number>(16).fill(0);
    for (let i = 0; i < 1000; i += 1) {
      const key = shardKeyForConversation(crypto.randomUUID());
      const shard = Number(key.replace("turns-shard-", ""));
      buckets[shard] += 1;
    }

    const max = Math.max(...buckets);
    const min = Math.min(...buckets);
    expect(max).toBeLessThanOrEqual(min * 2);
  });
});

