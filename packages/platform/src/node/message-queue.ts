import { Queue, Worker } from "bullmq";
import type {
  MessageQueue,
  PublishOpts,
  ConsumeMessage,
  ConsumeOpts,
  ConsumerHandle,
} from "../interface.js";

type RedisConfig = { host: string; port: number } | Record<string, unknown>;

export interface NodeMessageQueueOpts {
  redis?: RedisConfig;
}

const DEFAULT_REDIS: RedisConfig = { host: "127.0.0.1", port: 6379 };
const DEFAULT_ATTEMPTS = 3;

export class NodeMessageQueue implements MessageQueue {
  private readonly connection: RedisConfig;
  private readonly queues = new Map<string, Queue>();

  constructor(opts?: NodeMessageQueueOpts) {
    this.connection = opts?.redis ?? DEFAULT_REDIS;
  }

  private queue(topic: string): Queue {
    const existing = this.queues.get(topic);
    if (existing) return existing;
    const created = new Queue(topic, { connection: this.connection });
    this.queues.set(topic, created);
    return created;
  }

  async publish<T>(topic: string, payload: T, opts?: PublishOpts): Promise<void> {
    await this.queue(topic).add(topic, payload, {
      jobId: opts?.idempotencyKey,
      attempts: DEFAULT_ATTEMPTS,
    });
  }

  async publishBatch<T>(topic: string, payloads: T[], opts?: PublishOpts): Promise<void> {
    if (payloads.length === 0) return;
    await this.queue(topic).addBulk(
      payloads.map((payload, index) => ({
        name: topic,
        data: payload,
        opts: {
          jobId: opts?.idempotencyKey ? `${opts.idempotencyKey}:${index}` : undefined,
          attempts: DEFAULT_ATTEMPTS,
        },
      })),
    );
  }

  consume<T>(
    topic: string,
    handler: (msg: ConsumeMessage<T>) => Promise<void>,
    opts?: ConsumeOpts,
  ): ConsumerHandle {
    const queue = this.queue(topic);
    const worker = new Worker(
      topic,
      async (job) => {
        let done = false;
        let shouldRequeue = true;

        const msg: ConsumeMessage<T> = {
          payload: job.data as T,
          attempt: job.attemptsMade,
          ack: async () => {
            done = true;
          },
          nack: async (nackOpts) => {
            done = true;
            shouldRequeue = nackOpts?.requeue ?? true;
            if (!shouldRequeue) {
              await opts?.onPoison?.({
                topic,
                payload: job.data,
                attemptsMade: job.attemptsMade,
                reason: nackOpts?.reason,
                cause: nackOpts?.cause,
              });
              await job.discard();
            }
            throw new Error(nackOpts?.reason ?? "nack");
          },
        };

        await handler(msg);
        if (!done) {
          await msg.ack();
        }
        if (!shouldRequeue) {
          await job.discard();
        }
      },
      {
        connection: this.connection,
        concurrency: opts?.concurrency ?? 1,
      },
    );

    return {
      stop: async () => {
        await worker.close();
        await queue.close();
        this.queues.delete(topic);
      },
    };
  }
}
