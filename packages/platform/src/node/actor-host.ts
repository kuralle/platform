import type { ActorHost, ActorRef, ActorClass } from "../interface.js";

const NI = "not-implemented (s0 stub; lands in S5)";

export class NodeActorHost implements ActorHost {
  actor<T extends ActorClass>(_k: T, _id: string): ActorRef<InstanceType<T>> { throw new Error(NI); }
}
