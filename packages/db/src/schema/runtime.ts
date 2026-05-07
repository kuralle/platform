import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { agents, agentVersions } from "./agents";
import { conversations } from "./conversations";

export const runtimeDeployments = pgTable(
  "runtime_deployments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    region: text("region").notNull(),
    platform: text("platform").notNull(),
    bundleHash: text("bundle_hash"),
    imageDigest: text("image_digest"),
    agentVersionIds: text("agent_version_ids").array().default([]),
    actorAddress: text("actor_address"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    lastHeartbeatAt: timestamp("last_heartbeat_at"),
    terminatedAt: timestamp("terminated_at"),
    terminationReason: text("termination_reason"),
    resourceTier: text("resource_tier"),
    maxConcurrentSessions: integer("max_concurrent_sessions"),
    activeSessionCount: integer("active_session_count").default(0),
    totalSessionsServed: integer("total_sessions_served").default(0),
    complianceMode: text("compliance_mode").notNull(),
    isolationKind: text("isolation_kind").notNull(),
  },
  (table) => [
    index("runtime_deployments_workspace_kind_status_idx").on(
      table.workspaceId,
      table.kind,
      table.status,
    ),
    index("runtime_deployments_workspace_terminated_idx").on(
      table.workspaceId,
      table.terminatedAt,
    ),
    index("runtime_deployments_heartbeat_idx").on(table.lastHeartbeatAt),
    index("runtime_deployments_workspace_started_idx").on(
      table.workspaceId,
      table.startedAt.desc(),
    ),
  ],
);

export const runtimeSessions = pgTable(
  "runtime_sessions",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id),
    agentVersionId: text("agent_version_id").references(
      (): AnyPgColumn => agentVersions.id,
    ),
    deploymentId: text("deployment_id").references(
      () => runtimeDeployments.id,
    ),
    workingMemory: jsonb("working_memory"),
    flowStateByAgent: jsonb("flow_state_by_agent"),
    routingState: jsonb("routing_state"),
    sequenceNumber: integer("sequence_number").default(0),
    lastCheckpointAt: timestamp("last_checkpoint_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("runtime_sessions_conversation_uidx").on(table.conversationId),
    index("runtime_sessions_deployment_idx").on(table.deploymentId),
  ],
);

export const sessionCheckpoints = pgTable(
  "session_checkpoints",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => runtimeSessions.id, { onDelete: "cascade" }),
    trigger: text("trigger"),
    state: jsonb("state").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("session_checkpoints_session_created_idx").on(
      table.sessionId,
      table.createdAt.desc(),
    ),
  ],
);

export const runtimeDeploymentsRelations = relations(
  runtimeDeployments,
  ({ one, many }) => ({
    workspace: one(organization, {
      fields: [runtimeDeployments.workspaceId],
      references: [organization.id],
    }),
    sessions: many(runtimeSessions),
  }),
);

export const runtimeSessionsRelations = relations(
  runtimeSessions,
  ({ one, many }) => ({
    conversation: one(conversations, {
      fields: [runtimeSessions.conversationId],
      references: [conversations.id],
    }),
    agent: one(agents, {
      fields: [runtimeSessions.agentId],
      references: [agents.id],
    }),
    agentVersion: one(agentVersions, {
      fields: [runtimeSessions.agentVersionId],
      references: [agentVersions.id],
    }),
    deployment: one(runtimeDeployments, {
      fields: [runtimeSessions.deploymentId],
      references: [runtimeDeployments.id],
    }),
    checkpoints: many(sessionCheckpoints),
  }),
);

export const sessionCheckpointsRelations = relations(
  sessionCheckpoints,
  ({ one }) => ({
    session: one(runtimeSessions, {
      fields: [sessionCheckpoints.sessionId],
      references: [runtimeSessions.id],
    }),
  }),
);
