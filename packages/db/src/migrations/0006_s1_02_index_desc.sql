DROP INDEX "agent_versions_agent_published_idx";--> statement-breakpoint
DROP INDEX "agent_versions_agent_kind_published_idx";--> statement-breakpoint
DROP INDEX "agents_workspace_updated_idx";--> statement-breakpoint
CREATE INDEX "agent_versions_agent_published_idx" ON "agent_versions" USING btree ("agent_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_versions_agent_kind_published_idx" ON "agent_versions" USING btree ("agent_id","version_kind","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agents_workspace_updated_idx" ON "agents" USING btree ("workspace_id","updated_at" DESC NULLS LAST);