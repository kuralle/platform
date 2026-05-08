import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const widgetConfigs = pgTable("widget_configs", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  modality: text("modality").default("both").notNull(),
  theme: jsonb("theme"),
  strings: jsonb("strings"),
  vars: jsonb("vars"),
  feedbackEnabled: boolean("feedback_enabled").default(false),
  termsUrl: text("terms_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});

export const widgetConfigsRelations = relations(widgetConfigs, ({ one }) => ({
  workspace: one(organization, {
    fields: [widgetConfigs.workspaceId],
    references: [organization.id],
  }),
}));
