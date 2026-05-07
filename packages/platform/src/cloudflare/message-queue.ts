import type {
  MessageQueue,
  PublishOpts,
  ConsumeMessage,
  ConsumeOpts,
  ConsumerHandle,
} from "../interface.js";

const NOT_IMPLEMENTED = "not-implemented (s0 stub; lands in S3-S5)";

export class CloudflareMessageQueue implements MessageQueue {
  async publish<T>(_topic: string, _payload: T, _opts?: PublishOpts): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  async publishBatch<T>(_topic: string, _payloads: T[], _opts?: PublishOpts): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }
  consume<T>(
    _topic: string,
    _handler: (msg: ConsumeMessage<T>) => Promise<void>,
    _opts?: ConsumeOpts,
  ): ConsumerHandle {
    throw new Error(NOT_IMPLEMENTED);
  }
}
