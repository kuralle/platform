import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { agents, agentVersions } from "./agents";
import { channelEndpoints } from "./channels";
import { agentEvalCriteria } from "./agents";
import { tools } from "./tools";
import { runtimeDeployments } from "./runtime";

export const conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agents.id),
    agentVersionId: text("agent_version_id").references(
      (): AnyPgColumn => agentVersions.id,
    ),
    bundleHash: text("bundle_hash"),
    channelKind: text("channel_kind").notNull(),
    channelEndpointId: text("channel_endpoint_id").references(
      () => channelEndpoints.id,
    ),
    threadKey: text("thread_key").notNull(),
    direction: text("direction"),
    participantId: text("participant_id"),
    participantName: text("participant_name"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    durationSec: integer("duration_sec"),
    outcome: text("outcome"),
    recordingStorageKey: text("recording_storage_key"),
    costUsd: real("cost_usd"),
    evalsPassed: integer("evals_passed").default(0),
    evalsTotal: integer("evals_total").default(0),
    topics: text("topics").array().default([]),
    metadata: jsonb("metadata"),
    deploymentId: text("deployment_id").references(
      () => runtimeDeployments.id,
    ),
    turnsArchiveKey: text("turns_archive_key"),
    guardrailEventsArchiveKey: text("guardrail_events_archive_key"),
  },
  (table) => [
    uniqueIndex("conversations_workspace_thread_started_uidx").on(
      table.workspaceId,
      table.threadKey,
      table.startedAt,
    ),
    index("conversations_workspace_kind_started_idx").on(
      table.workspaceId,
      table.channelKind,
      table.startedAt.desc(),
    ),
    index("conversations_workspace_ended_idx").on(
      table.workspaceId,
      table.endedAt,
    ),
    index("conversations_agent_started_idx").on(
      table.agentId,
      table.startedAt.desc(),
    ),
    index("conversations_workspace_thread_idx").on(
      table.workspaceId,
      table.threadKey,
    ),
    index("conversations_deployment_started_idx").on(
      table.deploymentId,
      table.startedAt.desc(),
    ),
    index("conversations_bundle_hash_idx").on(table.bundleHash),
  ],
);

export const voiceCalls = pgTable(
  "voice_calls",
  {
    conversationId: text("conversation_id")
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    callerId: text("caller_id").notNull(),
    twilioCallSid: text("twilio_call_sid"),
    livekitRoom: text("livekit_room"),
    ringingTimeoutSec: integer("ringing_timeout_sec").default(60),
    voicemailDetected: boolean("voicemail_detected").default(false),
    warmTransferTo: text("warm_transfer_to"),
    hangupBy: text("hangup_by"),
  },
  (table) => [
    index("voice_calls_twilio_call_sid_idx").on(table.twilioCallSid),
    index("voice_calls_livekit_room_idx").on(table.livekitRoom),
  ],
);

export const messagingThreads = pgTable(
  "messaging_threads",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadKey: text("thread_key").notNull(),
    channelEndpointId: text("channel_endpoint_id").references(
      () => channelEndpoints.id,
    ),
    lastInboundAt: timestamp("last_inbound_at"),
    windowExpiresAt: timestamp("window_expires_at"),
    lastTemplateAt: timestamp("last_template_at"),
    lastConversationId: text("last_conversation_id").references(
      () => conversations.id,
    ),
  },
  (table) => [
    index("messaging_threads_workspace_window_idx").on(
      table.workspaceId,
      table.windowExpiresAt,
    ),
  ],
);

export const conversationTurns = pgTable(
  "conversation_turns",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    speaker: text("speaker"),
    text: text("text").notNull(),
    messageId: text("message_id"),
    mediaPayload: jsonb("media_payload"),
    deliveryStatus: text("delivery_status"),
    statusUpdatedAt: timestamp("status_updated_at"),
    timestampSec: integer("timestamp_sec").notNull(),
    evalVerdict: text("eval_verdict"),
    workflowNodeId: text("workflow_node_id"),
    tokensInput: integer("tokens_input"),
    tokensOutput: integer("tokens_output"),
    latencyMs: integer("latency_ms"),
    contextUtilization: real("context_utilization"),
    modelUsed: text("model_used"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("conversation_turns_conversation_ordinal_uidx").on(
      table.conversationId,
      table.ordinal,
    ),
    uniqueIndex("conversation_turns_conversation_message_id_uidx")
      .on(table.conversationId, table.messageId)
      .where(sql`message_id IS NOT NULL`),
  ],
);

export const conversationToolCalls = pgTable(
  "conversation_tool_calls",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => conversationTurns.id, { onDelete: "cascade" }),
    toolId: text("tool_id").references(() => tools.id),
    toolName: text("tool_name").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("conversation_tool_calls_turn_idx").on(table.turnId),
  ],
);

export const conversationExtractedFields = pgTable(
  "conversation_extracted_fields",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value"),
  },
  (table) => [
    index("conversation_extracted_fields_conversation_pk").on(
      table.conversationId,
      table.label,
    ),
  ],
);

export const conversationEvals = pgTable(
  "conversation_evals",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    criterionId: text("criterion_id").references(
      () => agentEvalCriteria.id,
    ),
    rubricSnapshot: text("rubric_snapshot").notNull(),
    score: real("score"),
    passed: boolean("passed"),
    details: jsonb("details"),
    scoredAt: timestamp("scored_at").defaultNow().notNull(),
  },
  (table) => [
    index("conversation_evals_conversation_idx").on(table.conversationId),
    index("conversation_evals_criterion_idx").on(table.criterionId),
  ],
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    workspace: one(organization, {
      fields: [conversations.workspaceId],
      references: [organization.id],
    }),
    agent: one(agents, {
      fields: [conversations.agentId],
      references: [agents.id],
    }),
    agentVersion: one(agentVersions, {
      fields: [conversations.agentVersionId],
      references: [agentVersions.id],
    }),
    channelEndpoint: one(channelEndpoints, {
      fields: [conversations.channelEndpointId],
      references: [channelEndpoints.id],
    }),
    deployment: one(runtimeDeployments, {
      fields: [conversations.deploymentId],
      references: [runtimeDeployments.id],
    }),
    voiceCall: one(voiceCalls, {
      fields: [conversations.id],
      references: [voiceCalls.conversationId],
    }),
    turns: many(conversationTurns),
    extractedFields: many(conversationExtractedFields),
    evals: many(conversationEvals),
  }),
);

export const voiceCallsRelations = relations(voiceCalls, ({ one }) => ({
  conversation: one(conversations, {
    fields: [voiceCalls.conversationId],
    references: [conversations.id],
  }),
}));

export const messagingThreadsRelations = relations(
  messagingThreads,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [messagingThreads.workspaceId],
      references: [organization.id],
    }),
    channelEndpoint: one(channelEndpoints, {
      fields: [messagingThreads.channelEndpointId],
      references: [channelEndpoints.id],
    }),
    lastConversation: one(conversations, {
      fields: [messagingThreads.lastConversationId],
      references: [conversations.id],
    }),
  }),
);

export const conversationTurnsRelations = relations(
  conversationTurns,
  ({ one, many }) => ({
    conversation: one(conversations, {
      fields: [conversationTurns.conversationId],
      references: [conversations.id],
    }),
    toolCalls: many(conversationToolCalls),
  }),
);

export const conversationToolCallsRelations = relations(
  conversationToolCalls,
  ({ one }) => ({
    turn: one(conversationTurns, {
      fields: [conversationToolCalls.turnId],
      references: [conversationTurns.id],
    }),
    tool: one(tools, {
      fields: [conversationToolCalls.toolId],
      references: [tools.id],
    }),
  }),
);

export const conversationExtractedFieldsRelations = relations(
  conversationExtractedFields,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationExtractedFields.conversationId],
      references: [conversations.id],
    }),
  }),
);

export const conversationEvalsRelations = relations(
  conversationEvals,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationEvals.conversationId],
      references: [conversations.id],
    }),
    criterion: one(agentEvalCriteria, {
      fields: [conversationEvals.criterionId],
      references: [agentEvalCriteria.id],
    }),
  }),
);
