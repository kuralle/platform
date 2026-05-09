import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const turnEventsDlq = pgTable(
  "turn_events_dlq",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").notNull(),
    shardId: integer("shard_id").notNull(),
    payload: jsonb("payload").notNull(),
    errorMessage: text("error_message").notNull(),
    errorStack: text("error_stack"),
    attempts: integer("attempts").notNull(),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }).defaultNow().notNull(),
    dlqAt: timestamp("dlq_at", { withTimezone: true }).defaultNow().notNull(),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("turn_events_dlq_unresolved_idx")
      .on(table.dlqAt)
      .where(sql`${table.resolved} = false`),
  ],
);
