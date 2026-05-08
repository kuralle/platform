import { describe, it, expect, vi } from "vitest";
import { NodeMessageQueue } from "./message-queue.js";

type JobRecord = { data: unknown; attemptsMade: number; discarded?: boolean };
const topicJobs = new Map<string, JobRecord[]>();

vi.mock("bullmq", () => {
  class Queue {
    constructor(private readonly topic: string) {}
    async add(_name: string, data: unknown, opts?: { jobId?: string }) {
      const jobs = topicJobs.get(this.topic) ?? [];
      if (opts?.jobId && jobs.some((job) => (job as { jobId?: string }).jobId === opts.jobId)) return;
      jobs.push(Object.assign({ data, attemptsMade: 0 }, { jobId: opts?.jobId }));
      topicJobs.set(this.topic, jobs);
    }
    async addBulk(entries: Array<{ data: unknown; opts?: { jobId?: string } }>) {
      for (const entry of entries) {
        await this.add("", entry.data, entry.opts);
      }
    }
    async close() {}
  }

  class Worker {
    private stopped = false;
    constructor(
      private readonly topic: string,
      private readonly handler: (job: {
        data: unknown;
        attemptsMade: number;
        discard: () => Promise<void>;
      }) => Promise<void>,
    ) {
      void this.loop();
    }
    private async loop() {
      while (!this.stopped) {
        const jobs = topicJobs.get(this.topic) ?? [];
        const job = jobs.shift();
        if (job) {
          await this.handler({
            data: job.data,
            attemptsMade: job.attemptsMade,
            discard: async () => {
              job.discarded = true;
            },
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
    }
    async close() {
      this.stopped = true;
    }
  }
  return { Queue, Worker };
});

describe("NodeMessageQueue", () => {
  it("publishes and consumes payloads", async () => {
    topicJobs.clear();
    const queue = new NodeMessageQueue({ redis: {} });
    const received: string[] = [];
    const handle = queue.consume<string>("topic-a", async (msg) => {
      received.push(msg.payload);
      await msg.ack();
    });

    await queue.publish("topic-a", "a");
    await queue.publish("topic-a", "b");
    await new Promise((resolve) => setTimeout(resolve, 50));
    await handle.stop();

    expect(received).toEqual(["a", "b"]);
  });

  it("deduplicates job by idempotency key", async () => {
    topicJobs.clear();
    const queue = new NodeMessageQueue({ redis: {} });
    const received: number[] = [];
    const handle = queue.consume<number>("topic-b", async (msg) => {
      received.push(msg.payload);
      await msg.ack();
    });

    await queue.publish("topic-b", 1, { idempotencyKey: "same" });
    await queue.publish("topic-b", 2, { idempotencyKey: "same" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await handle.stop();

    expect(received).toEqual([1]);
  });
});
