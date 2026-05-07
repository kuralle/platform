import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";
import { organization, user, apikey } from "./auth";

/**
 * audit_log_events — append-only, monthly range-partitioned.
 *
 * DIVERGENCE from DATA_MODEL.md §11 line 1010 (`id text primary key`):
 * Postgres requires the partition key in the PK for range-partitioned tables.
 * The actual PK is composite `(id, created_at)`. `id` alone remains globally
 * unique by virtue of the prefixed nanoid scheme. The composite key is a
 * Postgres artifact — see the hand-authored partition DDL in the migration.
 */

const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return "inet";
  },
});

export const auditLogEvents = pgTable(
  "audit_log_events",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").references(() => user.id),
    actorKind: text("actor_kind"),
    apiKeyId: text("api_key_id").references(() => apikey.id),
    event: text("event").notNull(),
    resourceKind: text("resource_kind"),
    resourceId: text("resource_id"),
    diff: jsonb("diff"),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    index("audit_log_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    index("audit_log_events_workspace_event_created_idx").on(
      table.workspaceId,
      table.event,
      table.createdAt.desc(),
    ),
    index("audit_log_events_resource_created_idx").on(
      table.resourceKind,
      table.resourceId,
      table.createdAt.desc(),
    ),
  ],
);

export const auditLogEventsRelations = relations(auditLogEvents, ({ one }) => ({
  workspace: one(organization, {
    fields: [auditLogEvents.workspaceId],
    references: [organization.id],
  }),
  actorUser: one(user, {
    fields: [auditLogEvents.actorUserId],
    references: [user.id],
  }),
  apiKey: one(apikey, {
    fields: [auditLogEvents.apiKeyId],
    references: [apikey.id],
  }),
}));
