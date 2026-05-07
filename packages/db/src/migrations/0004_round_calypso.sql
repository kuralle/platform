CREATE TABLE "agent_eval_criteria" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_version_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"rubric" text NOT NULL,
	"weight" real DEFAULT 1,
	"ordinal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_guardrails" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_version_id" text NOT NULL,
	"name" text NOT NULL,
	"direction" text NOT NULL,
	"evaluation_model" text NOT NULL,
	"prompt" text NOT NULL,
	"on_trigger" text DEFAULT 'block',
	"enabled" boolean DEFAULT true,
	"ordinal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_kb_attachments" (
	"agent_version_id" text NOT NULL,
	"document_id" text NOT NULL,
	"attached_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_tool_attachments" (
	"agent_version_id" text NOT NULL,
	"tool_id" text NOT NULL,
	"source" text NOT NULL,
	"config" jsonb,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"version_kind" text DEFAULT 'manual_save' NOT NULL,
	"parent_version_id" text,
	"change_summary" text,
	"changed_fields" text[] DEFAULT '{}',
	"published_by_user_id" text,
	"published_at" timestamp,
	"snapshot" jsonb NOT NULL,
	"bundle_storage_key" text,
	"bundle_hash" text,
	"bundle_status" text,
	"bundle_size_bytes" integer,
	"builder_version" text,
	"built_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"active_version_id" text,
	"author_user_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_edges_projection" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_version_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"condition_type" text,
	"condition_label" text
);
--> statement-breakpoint
CREATE TABLE "workflow_nodes_projection" (
	"agent_version_id" text NOT NULL,
	"node_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"position_x" integer,
	"position_y" integer
);
--> statement-breakpoint
ALTER TABLE "agent_eval_criteria" ADD CONSTRAINT "agent_eval_criteria_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_guardrails" ADD CONSTRAINT "agent_guardrails_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kb_attachments" ADD CONSTRAINT "agent_kb_attachments_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_kb_attachments" ADD CONSTRAINT "agent_kb_attachments_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_attachments" ADD CONSTRAINT "agent_tool_attachments_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tool_attachments" ADD CONSTRAINT "agent_tool_attachments_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_parent_version_id_agent_versions_id_fk" FOREIGN KEY ("parent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_active_version_id_agent_versions_id_fk" FOREIGN KEY ("active_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_edges_projection" ADD CONSTRAINT "workflow_edges_projection_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_nodes_projection" ADD CONSTRAINT "workflow_nodes_projection_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_eval_criteria_version_name_uidx" ON "agent_eval_criteria" USING btree ("agent_version_id","name");--> statement-breakpoint
CREATE INDEX "agent_eval_criteria_version_kind_ord_idx" ON "agent_eval_criteria" USING btree ("agent_version_id","kind","ordinal");--> statement-breakpoint
CREATE INDEX "agent_guardrails_version_dir_ord_idx" ON "agent_guardrails" USING btree ("agent_version_id","direction","ordinal");--> statement-breakpoint
CREATE INDEX "agent_kb_attachments_document_idx" ON "agent_kb_attachments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "agent_kb_attachments_pk" ON "agent_kb_attachments" USING btree ("agent_version_id","document_id");--> statement-breakpoint
CREATE INDEX "agent_tool_attachments_tool_idx" ON "agent_tool_attachments" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "agent_tool_attachments_pk" ON "agent_tool_attachments" USING btree ("agent_version_id","tool_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_agent_version_uidx" ON "agent_versions" USING btree ("agent_id","version_number");--> statement-breakpoint
CREATE INDEX "agent_versions_agent_published_idx" ON "agent_versions" USING btree ("agent_id","published_at");--> statement-breakpoint
CREATE INDEX "agent_versions_agent_kind_published_idx" ON "agent_versions" USING btree ("agent_id","version_kind","published_at");--> statement-breakpoint
CREATE INDEX "agent_versions_bundle_hash_idx" ON "agent_versions" USING btree ("bundle_hash");--> statement-breakpoint
CREATE INDEX "agents_workspace_status_idx" ON "agents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "agents_workspace_updated_idx" ON "agents" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "workflow_edges_projection_version_source_idx" ON "workflow_edges_projection" USING btree ("agent_version_id","source_node_id");--> statement-breakpoint
CREATE INDEX "workflow_edges_projection_version_target_idx" ON "workflow_edges_projection" USING btree ("agent_version_id","target_node_id");--> statement-breakpoint
CREATE INDEX "workflow_nodes_projection_version_kind_idx" ON "workflow_nodes_projection" USING btree ("agent_version_id","kind");--> statement-breakpoint
CREATE INDEX "workflow_nodes_projection_pk" ON "workflow_nodes_projection" USING btree ("agent_version_id","node_id");