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
  private readonly consumers = new Map<string, Consumer<unknown>[]>();
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
    this.drain(topic);
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
    const consumerList = this.consumers.get(topic) ?? [];
    consumerList.push({ handler: handler as (msg: ConsumeMessage<unknown>) => Promise<void> });
    this.consumers.set(topic, consumerList);

    const handle: ConsumerHandle = {
      stop: async () => {
        const list = this.consumers.get(topic);
        if (list) {
          const idx = list.indexOf(consumerList[consumerList.length - 1]!);
          if (idx >= 0) list.splice(idx, 1);
        }
      },
    };

    this.drain(topic);
    return handle;
  }

  private async drain(topic: string): Promise<void> {
    const queue = this.topics.get(topic);
    const consumerList = this.consumers.get(topic);
    if (!queue || !consumerList || consumerList.length === 0) return;

    let consumerIdx = 0;
    while (queue.length > 0) {
      const msg = queue.shift()!;
      const consumer = consumerList[consumerIdx % consumerList.length]!;
      consumerIdx++;

      let acked = false;
      let nacked = false;

      const ack = async () => {
        acked = true;
      };
      const nack = async (nackOpts?: { requeue?: boolean; reason?: string }) => {
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
