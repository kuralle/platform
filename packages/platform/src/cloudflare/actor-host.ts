import type { ActorHost, ActorRef, ActorClass } from "../interface.js";

const NOT_IMPLEMENTED = "not-implemented (s0 stub; lands in S3-S5)";

export class CloudflareActorHost implements ActorHost {
  actor<T extends ActorClass>(_klass: T, _id: string): ActorRef<InstanceType<T>> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
