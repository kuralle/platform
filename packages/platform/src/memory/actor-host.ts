import type { ActorHost, ActorRef, ActorClass, ActorState } from "../interface.js";
import { MemoryKvStore } from "./kv-store.js";

interface ActorInstance {
  instance: Record<string, (...args: unknown[]) => Promise<unknown>>;
  kvStore: MemoryKvStore;
  concurrencyQueue: Promise<void>;
}

export class MemoryActorHost implements ActorHost {
  private readonly instances = new Map<string, ActorInstance>();

  actor<T extends ActorClass>(klass: T, id: string): ActorRef<InstanceType<T>> {
    const existing = this.instances.get(id);
    if (existing) {
      return this.makeRef<T>(id);
    }

    const kvStore = new MemoryKvStore();
    let concurrencyQueue = Promise.resolve();

    const state: ActorState = {
      storage: kvStore,
      blockConcurrencyWhile: async <R>(fn: () => Promise<R>): Promise<R> => {
        const prev = concurrencyQueue;
        let resolve: (() => void) | undefined;
        concurrencyQueue = new Promise<void>((r) => {
          resolve = r;
        });
        try {
          await prev;
          return await fn();
        } finally {
          resolve?.();
        }
      },
    };

    const instance = new klass(state) as Record<string, (...args: unknown[]) => Promise<unknown>>;

    const bound: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(instance))) {
      if (key === "constructor") continue;
      const val = (instance as Record<string, unknown>)[key];
      if (typeof val === "function") {
        bound[key] = val.bind(instance) as (...args: unknown[]) => Promise<unknown>;
      }
    }

    this.instances.set(id, {
      instance: bound,
      kvStore,
      concurrencyQueue,
    });

    return this.makeRef<T>(id);
  }

  private makeRef<T extends ActorClass>(id: string): ActorRef<InstanceType<T>> {
    return {
      call: async <K extends keyof InstanceType<T>>(
        method: K,
        ...args: unknown[]
      ): Promise<unknown> => {
        const actorInstance = this.instances.get(id);
        if (!actorInstance) throw new Error(`Actor not found: ${id}`);
        const fn = actorInstance.instance[method as string];
        if (typeof fn !== "function") throw new Error(`Method ${String(method)} not found on actor ${id}`);
        return fn(...args);
      },
    } as ActorRef<InstanceType<T>>;
  }
}
