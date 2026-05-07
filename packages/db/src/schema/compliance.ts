import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { conversations, conversationTurns } from "./conversations";
import { agentGuardrails } from "./agents";

export const workspaceCompliancePosture = pgTable(
  "workspace_compliance_posture",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    hipaa: text("hipaa"),
    ferpa: text("ferpa"),
    tcpa: text("tcpa"),
    euAiAct: text("eu_ai_act"),
    evaluatedAt: timestamp("evaluated_at"),
    details: jsonb("details"),
  },
);

export const complianceEvaluations = pgTable(
  "compliance_evaluations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    regulation: text("regulation").notNull(),
    passed: boolean("passed"),
    failures: jsonb("failures"),
    evaluatedAt: timestamp("evaluated_at").defaultNow().notNull(),
  },
  (table) => [
    index("compliance_evaluations_workspace_regulation_evaluated_idx").on(
      table.workspaceId,
      table.regulation,
      table.evaluatedAt.desc(),
    ),
  ],
);

export const guardrailEvents = pgTable(
  "guardrail_events",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => conversationTurns.id),
    guardrailId: text("guardrail_id").references(() => agentGuardrails.id),
    triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
    matchedText: text("matched_text"),
    action: text("action").notNull(),
  },
  (table) => [
    index("guardrail_events_conversation_triggered_idx").on(
      table.conversationId,
      table.triggeredAt,
    ),
  ],
);

export const workspaceCompliancePostureRelations = relations(
  workspaceCompliancePosture,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [workspaceCompliancePosture.workspaceId],
      references: [organization.id],
    }),
  }),
);

export const complianceEvaluationsRelations = relations(
  complianceEvaluations,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [complianceEvaluations.workspaceId],
      references: [organization.id],
    }),
  }),
);

export const guardrailEventsRelations = relations(
  guardrailEvents,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [guardrailEvents.conversationId],
      references: [conversations.id],
    }),
    turn: one(conversationTurns, {
      fields: [guardrailEvents.turnId],
      references: [conversationTurns.id],
    }),
    guardrail: one(agentGuardrails, {
      fields: [guardrailEvents.guardrailId],
      references: [agentGuardrails.id],
    }),
  }),
);
