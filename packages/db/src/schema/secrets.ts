import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";
import { agents } from "./agents";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const secrets = pgTable(
  "secrets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    kmsKeyId: text("kms_key_id").notNull(),
    scope: text("scope").default("workspace"),
    agentId: text("agent_id").references(() => agents.id),
    lastUsedAt: timestamp("last_used_at"),
    createdByUserId: text("created_by_user_id").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    rotatedAt: timestamp("rotated_at"),
  },
  (table) => [
    uniqueIndex("secrets_workspace_agent_name_uidx").on(
      table.workspaceId,
      table.agentId,
      table.name,
    ),
    index("secrets_workspace_name_idx").on(table.workspaceId, table.name),
  ],
);

export const secretsRelations = relations(secrets, ({ one }) => ({
  workspace: one(organization, {
    fields: [secrets.workspaceId],
    references: [organization.id],
  }),
  agent: one(agents, {
    fields: [secrets.agentId],
    references: [agents.id],
  }),
  createdByUser: one(user, {
    fields: [secrets.createdByUserId],
    references: [user.id],
  }),
}));
