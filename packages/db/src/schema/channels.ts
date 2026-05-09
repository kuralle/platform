import { relations } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { agents, agentVersions } from "./agents";
import { secrets } from "./secrets";

export const channelConnections = pgTable(
  "channel_connections",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    channelKind: text("channel_kind").notNull(),
    provider: text("provider").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    credentialsSecretId: text("credentials_secret_id").references(
      () => secrets.id,
    ),
    config: jsonb("config").notNull(),
    capabilities: text("capabilities").array().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("channel_connections_workspace_kind_idx").on(
      table.workspaceId,
      table.channelKind,
    ),
    index("channel_connections_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
  ],
);

export const channelEndpoints = pgTable(
  "channel_endpoints",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(
      () => channelConnections.id,
      { onDelete: "cascade" },
    ),
    channelKind: text("channel_kind").notNull(),
    identifier: text("identifier").notNull(),
    displayName: text("display_name"),
    attachedAgentId: text("attached_agent_id").references(() => agents.id),
    attachedAgentVersionId: text("attached_agent_version_id").references(
      () => agentVersions.id,
    ),
    routingRulesId: text("routing_rules_id").references(
      (): AnyPgColumn => routingRules.id,
    ),
    publicWebhookUrl: text("public_webhook_url"),
    publicStreamUrl: text("public_stream_url"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    releasedAt: timestamp("released_at"),
  },
  (table) => [
    uniqueIndex("channel_endpoints_kind_identifier_uidx").on(
      table.channelKind,
      table.identifier,
    ),
    index("channel_endpoints_workspace_kind_agent_idx").on(
      table.workspaceId,
      table.channelKind,
      table.attachedAgentId,
    ),
    index("channel_endpoints_public_webhook_url_idx").on(
      table.publicWebhookUrl,
    ),
    index("channel_endpoints_public_stream_url_idx").on(
      table.publicStreamUrl,
    ),
  ],
);

export const routingRules = pgTable(
  "routing_rules",
  {
    id: text("id").primaryKey(),
    channelEndpointId: text("channel_endpoint_id")
      .notNull()
      .references(() => channelEndpoints.id, { onDelete: "cascade" }),
    ruleKind: text("rule_kind").notNull(),
    pattern: text("pattern"),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    priority: integer("priority").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("routing_rules_endpoint_priority_idx").on(
      table.channelEndpointId,
      table.priority,
    ),
  ],
);

export const channelConnectionsRelations = relations(
  channelConnections,
  ({ one, many }) => ({
    workspace: one(organization, {
      fields: [channelConnections.workspaceId],
      references: [organization.id],
    }),
    endpoints: many(channelEndpoints),
  }),
);

export const channelEndpointsRelations = relations(
  channelEndpoints,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [channelEndpoints.workspaceId],
      references: [organization.id],
    }),
    connection: one(channelConnections, {
      fields: [channelEndpoints.connectionId],
      references: [channelConnections.id],
    }),
    attachedAgent: one(agents, {
      fields: [channelEndpoints.attachedAgentId],
      references: [agents.id],
    }),
    attachedAgentVersion: one(agentVersions, {
      fields: [channelEndpoints.attachedAgentVersionId],
      references: [agentVersions.id],
    }),
    routingRule: one(routingRules, {
      fields: [channelEndpoints.routingRulesId],
      references: [routingRules.id],
      relationName: "channel_endpoints_routing_rules",
    }),
  }),
);

export const routingRulesRelations = relations(routingRules, ({ one }) => ({
  channelEndpoint: one(channelEndpoints, {
    fields: [routingRules.channelEndpointId],
    references: [channelEndpoints.id],
  }),
  agent: one(agents, {
    fields: [routingRules.agentId],
    references: [agents.id],
  }),
}));
