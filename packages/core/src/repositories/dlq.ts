import * as schema from "@kuralle/db/schema";

import type { RepoDb } from "./types.js";

export interface TurnEventDlqInsert {
  messageId: string;
  shardId: number;
  payload: unknown;
  errorMessage: string;
  errorStack: string | null;
  attempts: number;
}

function newDlqId(): string {
  return `dlq_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function insertTurnEventDlq(db: RepoDb, row: TurnEventDlqInsert): Promise<void> {
  await db.insert(schema.turnEventsDlq).values({
    id: newDlqId(),
    messageId: row.messageId,
    shardId: row.shardId,
    payload: row.payload,
    errorMessage: row.errorMessage,
    errorStack: row.errorStack,
    attempts: row.attempts,
  });
}
