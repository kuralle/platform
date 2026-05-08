import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@kuralle/db/schema";
import type { ConsumeMessage, ConsumerHandle, MessageQueue } from "@kuralle/platform/interface";
import { messagingEventSchema } from "../adapter/events.js";
import {
  SLO_PROJECTOR_LAG_NAME,
  SLO_PROJECTOR_LAG_THRESHOLD_MS,
} from "../instrumentation/slo.js";
import type { MessagingEvent } from "../adapter/events.js";
import { projectConversationEvent } from "./conversation.js";

type AnyPgDb = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

export interface RunProjectorWorkerOpts {
  queue: MessageQueue;
  db: AnyPgDb;
  shardKeys?: string[];
  onConsume?: (event: MessagingEvent) => void;
  onCommit?: (event: MessagingEvent) => void;
}

export function defaultShardKeys(): string[] {
  return Array.from({ length: 16 }, (_, idx) => `turns-shard-${idx}`);
}

export function runProjectorWorker(opts: RunProjectorWorkerOpts): ConsumerHandle {
  const handles: ConsumerHandle[] = [];
  const shardKeys = opts.shardKeys ?? defaultShardKeys();

  const consumeOne = async (msg: ConsumeMessage<unknown>): Promise<void> => {
    const parsed = messagingEventSchema.safeParse(msg.payload);
    if (!parsed.success) {
      await msg.nack({ requeue: false, reason: "unparseable" });
      return;
    }
    const event = parsed.data;
    opts.onConsume?.(event);

    const conversation = await opts.db
      .select({
        workspaceId: schema.conversations.workspaceId,
        agentId: schema.conversations.agentId,
        channelEndpointId: schema.conversations.channelEndpointId,
      })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, event.conversationId))
      .limit(1);

    if (conversation.length === 0) {
      await msg.nack({ requeue: msg.attempt < 3, reason: "conversation-not-found" });
      return;
    }

    const ctx = conversation[0]!;
    try {
      await opts.db.transaction(async (tx) => {
        await projectConversationEvent(tx, event, ctx);
        const observedMs = Date.now() - event.occurredAt.getTime();
        if (observedMs > SLO_PROJECTOR_LAG_THRESHOLD_MS) {
          await tx
            .insert(schema.usageEvents)
            .values({
              id: `ue_slo_${event.conversationId}_${event.sequenceNumber}`,
              workspaceId: ctx.workspaceId,
              agentId: ctx.agentId,
              agentVersionId: null,
              conversationId: event.conversationId,
              kind: "slo_violation",
              quantity: observedMs,
              payload: {
                slo: SLO_PROJECTOR_LAG_NAME,
                observedMs,
                thresholdMs: SLO_PROJECTOR_LAG_THRESHOLD_MS,
              },
              occurredAt: new Date(),
            })
            .onConflictDoNothing();
        }
      });
      await msg.ack();
      opts.onCommit?.(event);
    } catch {
      await msg.nack({ requeue: msg.attempt < 3 });
    }
  };

  for (const shard of shardKeys) {
    handles.push(opts.queue.consume(shard, consumeOne));
  }

  return {
    stop: async () => {
      await Promise.all(handles.map((h) => h.stop()));
    },
  };
}
