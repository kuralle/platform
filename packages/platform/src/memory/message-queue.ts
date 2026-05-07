import type {
  MessageQueue,
  PublishOpts,
  ConsumeMessage,
  ConsumeOpts,
  ConsumerHandle,
} from "../interface.js";

interface EnqueuedMessage<T> {
  payload: T;
  attempt: number;
  id: string;
}

interface Consumer<T> {
  handler: (msg: ConsumeMessage<T>) => Promise<void>;
  opts?: ConsumeOpts;
}

export class MemoryMessageQueue implements MessageQueue {
  private readonly topics = new Map<string, EnqueuedMessage<unknown>[]>();
  private readonly consumers = new Map<string, Set<Consumer<unknown>>>();
  private readonly seenKeys = new Map<string, Set<string>>();
  private messageSeq = 0;

  async publish<T>(topic: string, payload: T, opts?: PublishOpts): Promise<void> {
    if (opts?.idempotencyKey) {
      const seen = this.seenKeys.get(topic) ?? new Set();
      if (seen.has(opts.idempotencyKey)) return;
      seen.add(opts.idempotencyKey);
      this.seenKeys.set(topic, seen);
    }
    const msg: EnqueuedMessage<T> = {
      payload,
      attempt: 0,
      id: `msg-${++this.messageSeq}`,
    };
    const queue = this.topics.get(topic) ?? [];
    queue.push(msg as EnqueuedMessage<unknown>);
    this.topics.set(topic, queue);
    void this.drain(topic);
  }

  async publishBatch<T>(topic: string, payloads: T[], opts?: PublishOpts): Promise<void> {
    for (const p of payloads) {
      await this.publish(topic, p, opts);
    }
  }

  consume<T>(
    topic: string,
    handler: (msg: ConsumeMessage<T>) => Promise<void>,
    _opts?: ConsumeOpts,
  ): ConsumerHandle {
    const consumerSet = this.consumers.get(topic) ?? new Set<Consumer<unknown>>();
    const consumer: Consumer<unknown> = {
      handler: handler as (msg: ConsumeMessage<unknown>) => Promise<void>,
    };
    consumerSet.add(consumer);
    this.consumers.set(topic, consumerSet);

    const handle: ConsumerHandle = {
      // Removes the *exact* consumer registered by this consume() call,
      // even if multiple consumers are registered on the same topic. Closes
      // codex r2 finding: previous index-based lookup could remove the wrong
      // consumer when consumers were registered/removed out of insertion
      // order.
      stop: async () => {
        const set = this.consumers.get(topic);
        if (set) set.delete(consumer);
      },
    };

    void this.drain(topic);
    return handle;
  }

  // Round-robin cursor per topic so we don't always favour the first
  // registered consumer when multiple are active.
  private readonly drainCursors = new Map<string, number>();

  private async drain(topic: string): Promise<void> {
    const queue = this.topics.get(topic);
    if (!queue) return;

    while (queue.length > 0) {
      // Re-snapshot the consumer set every loop iteration. Closes codex r2
      // finding: if all consumers are removed mid-drain, the snapshot taken
      // at the top would still index into a stale array. Re-checking each
      // iteration also picks up newly-registered consumers.
      const consumerSet = this.consumers.get(topic);
      if (!consumerSet || consumerSet.size === 0) return;
      const consumerArr = [...consumerSet];

      const cursor = (this.drainCursors.get(topic) ?? 0) % consumerArr.length;
      this.drainCursors.set(topic, cursor + 1);
      const consumer = consumerArr[cursor]!;

      const msg = queue.shift()!;

      let acked = false;
      let nacked = false;

      const ack = async () => {
        if (nacked) {
          throw new Error(
            `[memory MessageQueue] ack() called after nack() on topic "${topic}" message ${msg.id}; ack/nack are mutually exclusive`,
          );
        }
        if (acked) return; // idempotent on repeated ack
        acked = true;
      };
      const nack = async (nackOpts?: { requeue?: boolean; reason?: string }) => {
        if (acked) {
          throw new Error(
            `[memory MessageQueue] nack() called after ack() on topic "${topic}" message ${msg.id}; ack/nack are mutually exclusive`,
          );
        }
        if (nacked) return; // idempotent on repeated nack
        nacked = true;
        if (nackOpts?.requeue) {
          queue.push({ ...msg, attempt: msg.attempt + 1 });
        }
      };

      try {
        await consumer.handler({
          payload: msg.payload,
          attempt: msg.attempt,
          ack,
          nack,
        } as ConsumeMessage<unknown>);
      } catch (err) {
        console.error(
          `[memory MessageQueue] consumer handler threw on topic "${topic}":`,
          err,
        );
      }

      if (!acked && !nacked) {
        queue.push({ ...msg, attempt: msg.attempt + 1 });
      }
    }
  }
}
