import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { conversations } from "./conversations";
export const webhooks = pgTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: text("events").array().notNull(),
    signingSecret: text("signing_secret").notNull(),
    active: boolean("active").default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("webhooks_workspace_active_idx").on(table.workspaceId, table.active),
  ],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(
      () => conversations.id,
    ),
    deliveryKind: text("delivery_kind").notNull(),
    payload: jsonb("payload"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    attemptCount: integer("attempt_count").default(1),
    deliveredAt: timestamp("delivered_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("webhook_deliveries_webhook_created_idx").on(
      table.webhookId,
      table.createdAt.desc(),
    ),
    index("webhook_deliveries_conversation_idx").on(table.conversationId),
  ],
);

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  workspace: one(organization, {
    fields: [webhooks.workspaceId],
    references: [organization.id],
  }),
  deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(
  webhookDeliveries,
  ({ one }) => ({
    webhook: one(webhooks, {
      fields: [webhookDeliveries.webhookId],
      references: [webhooks.id],
    }),
    conversation: one(conversations, {
      fields: [webhookDeliveries.conversationId],
      references: [conversations.id],
    }),
  }),
);


