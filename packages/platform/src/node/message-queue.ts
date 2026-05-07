import type { MessageQueue, PublishOpts, ConsumeMessage, ConsumeOpts, ConsumerHandle } from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

export class NodeMessageQueue implements MessageQueue {
  async publish<T>(_topic: string, _payload: T, _opts?: PublishOpts): Promise<void> { throw new Error(NI); }
  async publishBatch<T>(_topic: string, _payloads: T[], _opts?: PublishOpts): Promise<void> { throw new Error(NI); }
  consume<T>(_topic: string, _handler: (msg: ConsumeMessage<T>) => Promise<void>, _opts?: ConsumeOpts): ConsumerHandle { throw new Error(NI); }
}
