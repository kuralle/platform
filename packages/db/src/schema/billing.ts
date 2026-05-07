import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  real,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { agents, agentVersions } from "./agents";
import { conversations } from "./conversations";

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    plan: text("plan"),
    status: text("status"),
    trialEndsAt: timestamp("trial_ends_at"),
    currentPeriodEnd: timestamp("current_period_end"),
    hipaaAddon: boolean("hipaa_addon").default(false),
    ferpaAddon: boolean("ferpa_addon").default(false),
  },
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id),
    agentVersionId: text("agent_version_id").references(
      () => agentVersions.id,
    ),
    conversationId: text("conversation_id").references(
      () => conversations.id,
    ),
    kind: text("kind").notNull(),
    quantity: real("quantity").notNull(),
    unitCostUsd: real("unit_cost_usd"),
    totalCostUsd: real("total_cost_usd"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("usage_events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("usage_events_workspace_kind_occurred_idx").on(
      table.workspaceId,
      table.kind,
      table.occurredAt,
    ),
    index("usage_events_conversation_idx").on(table.conversationId),
  ],
);

export const monthlyReceipts = pgTable(
  "monthly_receipts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    recoveredRevenueUsd: real("recovered_revenue_usd").notNull(),
    costUsd: real("cost_usd").notNull(),
    roiMultiplier: real("roi_multiplier").notNull(),
    comparisonDeltaPct: real("comparison_delta_pct"),
    perAgent: jsonb("per_agent").notNull(),
    publishedAt: timestamp("published_at").defaultNow().notNull(),
    pdfStorageKey: text("pdf_storage_key"),
  },
  (table) => [
    uniqueIndex("monthly_receipts_workspace_month_uidx").on(
      table.workspaceId,
      table.month,
    ),
    index("monthly_receipts_workspace_month_desc_idx").on(
      table.workspaceId,
      table.month.desc(),
    ),
  ],
);

export const billingSubscriptionsRelations = relations(
  billingSubscriptions,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [billingSubscriptions.workspaceId],
      references: [organization.id],
    }),
  }),
);

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  workspace: one(organization, {
    fields: [usageEvents.workspaceId],
    references: [organization.id],
  }),
  agent: one(agents, {
    fields: [usageEvents.agentId],
    references: [agents.id],
  }),
  agentVersion: one(agentVersions, {
    fields: [usageEvents.agentVersionId],
    references: [agentVersions.id],
  }),
  conversation: one(conversations, {
    fields: [usageEvents.conversationId],
    references: [conversations.id],
  }),
}));

export const monthlyReceiptsRelations = relations(
  monthlyReceipts,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [monthlyReceipts.workspaceId],
      references: [organization.id],
    }),
  }),
);
