CREATE TABLE "channel_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"channel_kind" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"credentials_secret_id" text,
	"config" jsonb NOT NULL,
	"capabilities" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "channel_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"channel_kind" text NOT NULL,
	"identifier" text NOT NULL,
	"display_name" text,
	"attached_agent_id" text,
	"attached_agent_version_id" text,
	"routing_rules_id" text,
	"public_webhook_url" text,
	"public_stream_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_endpoint_id" text NOT NULL,
	"rule_kind" text NOT NULL,
	"pattern" text,
	"agent_id" text NOT NULL,
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_evals" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"criterion_id" text,
	"rubric_snapshot" text NOT NULL,
	"score" real,
	"passed" boolean,
	"details" jsonb,
	"scored_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_extracted_fields" (
	"conversation_id" text NOT NULL,
	"label" text NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "conversation_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	"tool_id" text,
	"tool_name" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"duration_ms" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"speaker" text,
	"text" text NOT NULL,
	"message_id" text,
	"media_payload" jsonb,
	"delivery_status" text,
	"status_updated_at" timestamp,
	"timestamp_sec" integer NOT NULL,
	"eval_verdict" text,
	"workflow_node_id" text,
	"tokens_input" integer,
	"tokens_output" integer,
	"latency_ms" integer,
	"context_utilization" real,
	"model_used" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text,
	"agent_version_id" text,
	"bundle_hash" text,
	"channel_kind" text NOT NULL,
	"channel_endpoint_id" text,
	"thread_key" text NOT NULL,
	"direction" text,
	"participant_id" text,
	"participant_name" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"duration_sec" integer,
	"outcome" text,
	"recording_storage_key" text,
	"cost_usd" real,
	"evals_passed" integer DEFAULT 0,
	"evals_total" integer DEFAULT 0,
	"topics" text[] DEFAULT '{}',
	"metadata" jsonb,
	"deployment_id" text,
	"turns_archive_key" text,
	"guardrail_events_archive_key" text
);
--> statement-breakpoint
CREATE TABLE "messaging_threads" (
	"workspace_id" text NOT NULL,
	"thread_key" text NOT NULL,
	"channel_endpoint_id" text,
	"last_inbound_at" timestamp,
	"window_expires_at" timestamp,
	"last_template_at" timestamp,
	"last_conversation_id" text
);
--> statement-breakpoint
CREATE TABLE "voice_calls" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"caller_id" text NOT NULL,
	"twilio_call_sid" text,
	"livekit_room" text,
	"ringing_timeout_sec" integer DEFAULT 60,
	"voicemail_detected" boolean DEFAULT false,
	"warm_transfer_to" text,
	"hangup_by" text
);
--> statement-breakpoint
CREATE TABLE "runtime_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"region" text NOT NULL,
	"platform" text NOT NULL,
	"bundle_hash" text,
	"image_digest" text,
	"agent_version_ids" text[] DEFAULT '{}',
	"actor_address" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp,
	"terminated_at" timestamp,
	"termination_reason" text,
	"resource_tier" text,
	"max_concurrent_sessions" integer,
	"active_session_count" integer DEFAULT 0,
	"total_sessions_served" integer DEFAULT 0,
	"compliance_mode" text NOT NULL,
	"isolation_kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"agent_id" text,
	"agent_version_id" text,
	"deployment_id" text,
	"working_memory" jsonb,
	"flow_state_by_agent" jsonb,
	"routing_state" jsonb,
	"sequence_number" integer DEFAULT 0,
	"last_checkpoint_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"trigger" text,
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_endpoints" ADD CONSTRAINT "channel_endpoints_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_endpoints" ADD CONSTRAINT "channel_endpoints_connection_id_channel_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_endpoints" ADD CONSTRAINT "channel_endpoints_attached_agent_id_agents_id_fk" FOREIGN KEY ("attached_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_channel_endpoint_id_channel_endpoints_id_fk" FOREIGN KEY ("channel_endpoint_id") REFERENCES "public"."channel_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_rules" ADD CONSTRAINT "routing_rules_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_evals" ADD CONSTRAINT "conversation_evals_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_evals" ADD CONSTRAINT "conversation_evals_criterion_id_agent_eval_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."agent_eval_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_extracted_fields" ADD CONSTRAINT "conversation_extracted_fields_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tool_calls" ADD CONSTRAINT "conversation_tool_calls_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_tool_calls" ADD CONSTRAINT "conversation_tool_calls_tool_id_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."tools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_channel_endpoint_id_channel_endpoints_id_fk" FOREIGN KEY ("channel_endpoint_id") REFERENCES "public"."channel_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_deployment_id_runtime_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."runtime_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_channel_endpoint_id_channel_endpoints_id_fk" FOREIGN KEY ("channel_endpoint_id") REFERENCES "public"."channel_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_threads" ADD CONSTRAINT "messaging_threads_last_conversation_id_conversations_id_fk" FOREIGN KEY ("last_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_deployments" ADD CONSTRAINT "runtime_deployments_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_sessions" ADD CONSTRAINT "runtime_sessions_deployment_id_runtime_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."runtime_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_checkpoints" ADD CONSTRAINT "session_checkpoints_session_id_runtime_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."runtime_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_connections_workspace_kind_idx" ON "channel_connections" USING btree ("workspace_id","channel_kind");--> statement-breakpoint
CREATE INDEX "channel_connections_workspace_status_idx" ON "channel_connections" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_endpoints_kind_identifier_uidx" ON "channel_endpoints" USING btree ("channel_kind","identifier");--> statement-breakpoint
CREATE INDEX "channel_endpoints_workspace_kind_agent_idx" ON "channel_endpoints" USING btree ("workspace_id","channel_kind","attached_agent_id");--> statement-breakpoint
CREATE INDEX "channel_endpoints_public_webhook_url_idx" ON "channel_endpoints" USING btree ("public_webhook_url");--> statement-breakpoint
CREATE INDEX "channel_endpoints_public_stream_url_idx" ON "channel_endpoints" USING btree ("public_stream_url");--> statement-breakpoint
CREATE INDEX "routing_rules_endpoint_priority_idx" ON "routing_rules" USING btree ("channel_endpoint_id","priority");--> statement-breakpoint
CREATE INDEX "conversation_evals_conversation_idx" ON "conversation_evals" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_evals_criterion_idx" ON "conversation_evals" USING btree ("criterion_id");--> statement-breakpoint
CREATE INDEX "conversation_extracted_fields_conversation_pk" ON "conversation_extracted_fields" USING btree ("conversation_id","label");--> statement-breakpoint
CREATE INDEX "conversation_tool_calls_turn_idx" ON "conversation_tool_calls" USING btree ("turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_turns_conversation_ordinal_uidx" ON "conversation_turns" USING btree ("conversation_id","ordinal");--> statement-breakpoint
CREATE INDEX "conversation_turns_conversation_ordinal_idx" ON "conversation_turns" USING btree ("conversation_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_workspace_thread_started_uidx" ON "conversations" USING btree ("workspace_id","thread_key","started_at");--> statement-breakpoint
CREATE INDEX "conversations_workspace_kind_started_idx" ON "conversations" USING btree ("workspace_id","channel_kind","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_workspace_ended_idx" ON "conversations" USING btree ("workspace_id","ended_at");--> statement-breakpoint
CREATE INDEX "conversations_agent_started_idx" ON "conversations" USING btree ("agent_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_workspace_thread_idx" ON "conversations" USING btree ("workspace_id","thread_key");--> statement-breakpoint
CREATE INDEX "conversations_deployment_started_idx" ON "conversations" USING btree ("deployment_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "conversations_bundle_hash_idx" ON "conversations" USING btree ("bundle_hash");--> statement-breakpoint
CREATE INDEX "messaging_threads_workspace_window_idx" ON "messaging_threads" USING btree ("workspace_id","window_expires_at");--> statement-breakpoint
CREATE INDEX "voice_calls_twilio_call_sid_idx" ON "voice_calls" USING btree ("twilio_call_sid");--> statement-breakpoint
CREATE INDEX "voice_calls_livekit_room_idx" ON "voice_calls" USING btree ("livekit_room");--> statement-breakpoint
CREATE INDEX "runtime_deployments_workspace_kind_status_idx" ON "runtime_deployments" USING btree ("workspace_id","kind","status");--> statement-breakpoint
CREATE INDEX "runtime_deployments_workspace_terminated_idx" ON "runtime_deployments" USING btree ("workspace_id","terminated_at");--> statement-breakpoint
CREATE INDEX "runtime_deployments_heartbeat_idx" ON "runtime_deployments" USING btree ("last_heartbeat_at");--> statement-breakpoint
CREATE INDEX "runtime_deployments_workspace_started_idx" ON "runtime_deployments" USING btree ("workspace_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_sessions_conversation_uidx" ON "runtime_sessions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "runtime_sessions_deployment_idx" ON "runtime_sessions" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "session_checkpoints_session_created_idx" ON "session_checkpoints" USING btree ("session_id","created_at" DESC NULLS LAST);