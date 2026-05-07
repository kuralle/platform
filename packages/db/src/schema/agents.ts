import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { tools } from "./tools";
import { kbDocuments } from "./knowledge";

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status").default("draft").notNull(),
    activeVersionId: text("active_version_id").references(
      (): AnyPgColumn => agentVersions.id,
    ),
    authorUserId: text("author_user_id").references(() => user.id),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("agents_workspace_status_idx").on(table.workspaceId, table.status),
    index("agents_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
  ],
);

export const agentVersions = pgTable(
  "agent_versions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references((): AnyPgColumn => agents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    versionKind: text("version_kind").default("manual_save").notNull(),
    parentVersionId: text("parent_version_id").references(
      (): AnyPgColumn => agentVersions.id,
      { onDelete: "set null" },
    ),
    changeSummary: text("change_summary"),
    changedFields: text("changed_fields").array().default([]),
    publishedByUserId: text("published_by_user_id").references(() => user.id),
    publishedAt: timestamp("published_at"),
    snapshot: jsonb("snapshot").notNull(),
    bundleStorageKey: text("bundle_storage_key"),
    bundleHash: text("bundle_hash"),
    bundleStatus: text("bundle_status"),
    bundleSizeBytes: integer("bundle_size_bytes"),
    builderVersion: text("builder_version"),
    builtAt: timestamp("built_at"),
  },
  (table) => [
    uniqueIndex("agent_versions_agent_version_uidx").on(
      table.agentId,
      table.versionNumber,
    ),
    index("agent_versions_agent_published_idx").on(
      table.agentId,
      table.publishedAt,
    ),
    index("agent_versions_agent_kind_published_idx").on(
      table.agentId,
      table.versionKind,
      table.publishedAt,
    ),
    index("agent_versions_bundle_hash_idx").on(table.bundleHash),
  ],
);

export const agentToolAttachments = pgTable(
  "agent_tool_attachments",
  {
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    toolId: text("tool_id")
      .notNull()
      .references(() => tools.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    config: jsonb("config"),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_tool_attachments_tool_idx").on(table.toolId),
    index("agent_tool_attachments_pk").on(
      table.agentVersionId,
      table.toolId,
      table.source,
    ),
  ],
);

export const agentKbAttachments = pgTable(
  "agent_kb_attachments",
  {
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    attachedAt: timestamp("attached_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_kb_attachments_document_idx").on(table.documentId),
    index("agent_kb_attachments_pk").on(
      table.agentVersionId,
      table.documentId,
    ),
  ],
);

export const agentGuardrails = pgTable(
  "agent_guardrails",
  {
    id: text("id").primaryKey(),
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    direction: text("direction").notNull(),
    evaluationModel: text("evaluation_model").notNull(),
    prompt: text("prompt").notNull(),
    onTrigger: text("on_trigger").default("block"),
    enabled: boolean("enabled").default(true),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    index("agent_guardrails_version_dir_ord_idx").on(
      table.agentVersionId,
      table.direction,
      table.ordinal,
    ),
  ],
);

export const agentEvalCriteria = pgTable(
  "agent_eval_criteria",
  {
    id: text("id").primaryKey(),
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind").notNull(),
    rubric: text("rubric").notNull(),
    weight: real("weight").default(1),
    ordinal: integer("ordinal").notNull(),
  },
  (table) => [
    uniqueIndex("agent_eval_criteria_version_name_uidx").on(
      table.agentVersionId,
      table.name,
    ),
    index("agent_eval_criteria_version_kind_ord_idx").on(
      table.agentVersionId,
      table.kind,
      table.ordinal,
    ),
  ],
);

export const workflowNodesProjection = pgTable(
  "workflow_nodes_projection",
  {
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    positionX: integer("position_x"),
    positionY: integer("position_y"),
  },
  (table) => [
    index("workflow_nodes_projection_version_kind_idx").on(
      table.agentVersionId,
      table.kind,
    ),
    index("workflow_nodes_projection_pk").on(
      table.agentVersionId,
      table.nodeId,
    ),
  ],
);

export const workflowEdgesProjection = pgTable(
  "workflow_edges_projection",
  {
    id: text("id").primaryKey(),
    agentVersionId: text("agent_version_id")
      .notNull()
      .references(() => agentVersions.id, { onDelete: "cascade" }),
    sourceNodeId: text("source_node_id").notNull(),
    targetNodeId: text("target_node_id").notNull(),
    conditionType: text("condition_type"),
    conditionLabel: text("condition_label"),
  },
  (table) => [
    index("workflow_edges_projection_version_source_idx").on(
      table.agentVersionId,
      table.sourceNodeId,
    ),
    index("workflow_edges_projection_version_target_idx").on(
      table.agentVersionId,
      table.targetNodeId,
    ),
  ],
);

// agents → agentVersions
export const agentsRelations = relations(agents, ({ many }) => ({
  versions: many(agentVersions),
}));

export const agentVersionsRelations = relations(agentVersions, ({ one }) => ({
  agent: one(agents, {
    fields: [agentVersions.agentId],
    references: [agents.id],
  }),
}));
