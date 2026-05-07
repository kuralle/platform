import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { secrets } from "./secrets";

export const toolCatalogProviders = pgTable(
  "tool_catalog_providers",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    displayName: text("display_name").notNull(),
    mcpServerUrl: text("mcp_server_url").notNull(),
    authMode: text("auth_mode").default("none"),
    credentialsSecretId: text("credentials_secret_id").references(
      () => secrets.id,
    ),
    status: text("status").default("connected"),
    lastSyncedAt: timestamp("last_synced_at"),
    toolsetIds: text("toolset_ids").array().default([]),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tool_catalog_providers_workspace_kind_idx").on(
      table.workspaceId,
      table.kind,
    ),
  ],
);

export const tools = pgTable(
  "tools",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    displayName: text("display_name"),
    description: text("description"),
    kind: text("kind").notNull(),
    catalogProviderId: text("catalog_provider_id").references(
      () => toolCatalogProviders.id,
    ),
    externalToolKey: text("external_tool_key"),
    inputSchema: jsonb("input_schema"),
    outputSchema: jsonb("output_schema"),
    config: jsonb("config").notNull(),
    status: text("status").default("active"),
    lastValidatedAt: timestamp("last_validated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    uniqueIndex("tools_workspace_name_uidx").on(table.workspaceId, table.name),
    index("tools_workspace_kind_idx").on(table.workspaceId, table.kind),
    index("tools_workspace_status_idx").on(table.workspaceId, table.status),
    index("tools_catalog_provider_external_idx").on(
      table.catalogProviderId,
      table.externalToolKey,
    ),
  ],
);

export const toolCatalogProvidersRelations = relations(
  toolCatalogProviders,
  ({ many }) => ({
    tools: many(tools),
  }),
);

export const toolsRelations = relations(tools, ({ one }) => ({
  catalogProvider: one(toolCatalogProviders, {
    fields: [tools.catalogProviderId],
    references: [toolCatalogProviders.id],
  }),
}));
