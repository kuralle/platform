import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { agents } from "./agents";
import { channelEndpoints } from "./channels";
import { conversations } from "./conversations";

export const batches = pgTable(
  "batches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    agentId: text("agent_id").references(() => agents.id),
    channelKind: text("channel_kind").notNull(),
    channelEndpointId: text("channel_endpoint_id").references(
      () => channelEndpoints.id,
    ),
    vertical: text("vertical").notNull(),
    status: text("status").notNull(),
    scheduledFor: timestamp("scheduled_for"),
    concurrency: integer("concurrency").default(8),
    totalRecipients: integer("total_recipients").notNull(),
    completed: integer("completed").default(0),
    booked: integer("booked").default(0),
    failed: integer("failed").default(0),
    costUsd: real("cost_usd").default(0),
    recoveredRevenueUsd: real("recovered_revenue_usd").default(0),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("batches_workspace_status_idx").on(table.workspaceId, table.status),
    index("batches_workspace_scheduled_idx").on(
      table.workspaceId,
      table.scheduledFor,
    ),
  ],
);

export const batchRecipients = pgTable(
  "batch_recipients",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    identifier: text("identifier").notNull(),
    dynamicVariables: jsonb("dynamic_variables"),
    status: text("status").notNull(),
    conversationId: text("conversation_id").references(
      () => conversations.id,
    ),
    attemptCount: integer("attempt_count").default(0),
    scheduledFor: timestamp("scheduled_for"),
    lastAttemptAt: timestamp("last_attempt_at"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("batch_recipients_batch_status_idx").on(
      table.batchId,
      table.status,
    ),
    index("batch_recipients_conversation_idx").on(table.conversationId),
  ],
);

export const batchesRelations = relations(batches, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [batches.workspaceId],
    references: [organization.id],
  }),
  agent: one(agents, {
    fields: [batches.agentId],
    references: [agents.id],
  }),
  channelEndpoint: one(channelEndpoints, {
    fields: [batches.channelEndpointId],
    references: [channelEndpoints.id],
  }),
  createdByUser: one(user, {
    fields: [batches.createdByUserId],
    references: [user.id],
  }),
  recipients: many(batchRecipients),
}));

export const batchRecipientsRelations = relations(
  batchRecipients,
  ({ one }) => ({
    batch: one(batches, {
      fields: [batchRecipients.batchId],
      references: [batches.id],
    }),
    conversation: one(conversations, {
      fields: [batchRecipients.conversationId],
      references: [conversations.id],
    }),
  }),
);
