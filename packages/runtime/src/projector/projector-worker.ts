import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { insertTurnEventDlq, type TurnEventDlqInsert } from "@kuralle/core";
import * as schema from "@kuralle/db/schema";
import type { ConsumeMessage, ConsumerHandle, MessageQueue } from "@kuralle/platform/interface";
import { messagingEventSchema } from "../adapter/events.js";
import {
  SLO_PROJECTOR_LAG_NAME,
  SLO_PROJECTOR_LAG_THRESHOLD_MS,
} from "../instrumentation/slo.js";
import type { MessagingEvent } from "../adapter/events.js";
import { projectConversationEvent } from "./conversation.js";

type AnyPgDb = NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;

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

function shardKeyToId(shardKey: string): number {
  const m = /^turns-shard-(\d+)$/.exec(shardKey);
  return m ? Number(m[1]) : 0;
}

function logProjectorError(fields: Record<string, unknown>): void {
  console.error(
    JSON.stringify({
      level: "error",
      at: "projector-worker",
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

function buildDlqInsert(info: {
  payload: unknown;
  shardId: number;
  attemptsMade: number;
  reason?: string;
  cause?: unknown;
}): TurnEventDlqInsert {
  const err = info.cause instanceof Error ? info.cause : undefined;
  const parsed = messagingEventSchema.safeParse(info.payload);
  const messageId = parsed.success
    ? `${parsed.data.conversationId}:${parsed.data.sequenceNumber}`
    : `invalid-payload:${info.shardId}:${info.attemptsMade}`;
  return {
    messageId,
    shardId: info.shardId,
    payload: info.payload,
    errorMessage: info.reason ?? err?.message ?? "poison",
    errorStack: err?.stack ?? null,
    attempts: info.attemptsMade + 1,
  };
}

export function runProjectorWorker(opts: RunProjectorWorkerOpts): ConsumerHandle {
  const handles: ConsumerHandle[] = [];
  const shardKeys = opts.shardKeys ?? defaultShardKeys();

  const consumeOne = async (msg: ConsumeMessage<unknown>, shardId: number): Promise<void> => {
    const parsed = messagingEventSchema.safeParse(msg.payload);
    if (!parsed.success) {
      logProjectorError({
        messageId: "unparseable",
        shardId,
        attempt: msg.attempt,
        error: parsed.error.message,
      });
      await msg.nack({ requeue: false, reason: "unparseable", cause: parsed.error });
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
      const requeue = msg.attempt < 2;
      logProjectorError({
        messageId: `${event.conversationId}:${event.sequenceNumber}`,
        shardId,
        attempt: msg.attempt,
        error: "conversation-not-found",
      });
      await msg.nack({ requeue, reason: "conversation-not-found" });
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
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logProjectorError({
        messageId: `${event.conversationId}:${event.sequenceNumber}`,
        shardId,
        attempt: msg.attempt,
        error: error.message,
        stack: error.stack,
      });
      await msg.nack({ requeue: msg.attempt < 2, reason: error.message, cause: error });
    }
  };

  for (const shard of shardKeys) {
    const shardId = shardKeyToId(shard);
    handles.push(
      opts.queue.consume(shard, (msg) => consumeOne(msg, shardId), {
        onPoison: async (info) => {
          await insertTurnEventDlq(opts.db, buildDlqInsert({
            payload: info.payload,
            shardId,
            attemptsMade: info.attemptsMade,
            reason: info.reason,
            cause: info.cause,
          }));
        },
      }),
    );
  }

  return {
    stop: async () => {
      await Promise.all(handles.map((h) => h.stop()));
    },
  };
}
