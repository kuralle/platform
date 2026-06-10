/**
 * Cloudflare Queues consumer for the turns shards.
 *
 * The DO produces MessagingEvents onto TURNS_SHARD_* queues; this consumer
 * projects them into conversation_turns (+ SLO lag accounting) via the shared
 * runtime projector. Retries are CF-native (msg.retry up to maxAttempts);
 * poison messages land in the turn-event DLQ table, never lost silently.
 */
import { insertTurnEventDlq } from "@kuralle/core";
import { createDbFromEnv, type HyperdriveBinding } from "@kuralle/db";
import { messagingEventSchema, projectMessagingEventOnce } from "@kuralle/runtime";

const MAX_ATTEMPTS = 3;

interface QueueEnv {
  HYPERDRIVE?: HyperdriveBinding;
  [key: string]: unknown;
}

export async function handleTurnsQueueBatch(
  batch: MessageBatch<unknown>,
  env: QueueEnv,
): Promise<void> {
  const { db, pool } = createDbFromEnv(env);
  try {
    for (const msg of batch.messages) {
      const parsed = messagingEventSchema.safeParse(msg.body);
      if (!parsed.success) {
        await insertTurnEventDlq(db, {
          messageId: msg.id,
          shardId: shardIdFromQueue(batch.queue),
          payload: msg.body,
          errorMessage: `unparseable: ${parsed.error.message}`,
          errorStack: null,
          attempts: msg.attempts,
        });
        msg.ack();
        continue;
      }

      try {
        const result = await projectMessagingEventOnce(db, parsed.data);
        if (result === "conversation-not-found" && msg.attempts < MAX_ATTEMPTS) {
          msg.retry();
        } else if (result === "conversation-not-found") {
          await insertTurnEventDlq(db, {
            messageId: msg.id,
            shardId: shardIdFromQueue(batch.queue),
            payload: msg.body,
            errorMessage: "conversation-not-found",
            errorStack: null,
            attempts: msg.attempts,
          });
          msg.ack();
        } else {
          msg.ack();
        }
      } catch (error) {
        if (msg.attempts < MAX_ATTEMPTS) {
          msg.retry();
        } else {
          await insertTurnEventDlq(db, {
            messageId: msg.id,
            shardId: shardIdFromQueue(batch.queue),
            payload: msg.body,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? (error.stack ?? null) : null,
            attempts: msg.attempts,
          });
          msg.ack();
        }
      }
    }
  } finally {
    try {
      await pool.end();
    } catch {
      // pool teardown races inside workerd are non-fatal
    }
  }
}

function shardIdFromQueue(queueName: string): number {
  const m = /turns-shard-(\d+)$/.exec(queueName);
  return m ? Number(m[1]) : 0;
}
