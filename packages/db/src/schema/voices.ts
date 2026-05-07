import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { organization } from "./auth";

export const voices = pgTable(
  "voices",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    externalId: text("external_id"),
    provider: text("provider").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull(),
    style: text("style"),
    isCloned: boolean("is_cloned").default(false),
    previewUrl: text("preview_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("voices_workspace_id_idx").on(table.workspaceId),
    index("voices_provider_external_idx").on(table.provider, table.externalId),
  ],
);

export const voicesRelations = relations(voices, ({ one }) => ({
  workspace: one(organization, {
    fields: [voices.workspaceId],
    references: [organization.id],
  }),
}));
