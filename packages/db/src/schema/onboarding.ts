import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const onboardingStates = pgTable("onboarding_states", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  currentStep: text("current_step").default("vertical").notNull(),
  completedAt: timestamp("completed_at"),
  vertical: text("vertical"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const onboardingStatesRelations = relations(
  onboardingStates,
  ({ one }) => ({
    workspace: one(organization, {
      fields: [onboardingStates.workspaceId],
      references: [organization.id],
    }),
  }),
);
