-- S1-04 hand-authored partitioned audit_log_events.
-- DIVERGENCE from DATA_MODEL.md §11 line 1010 (id text primary key):
-- Postgres requires the partition key in the PK for range-partitioned tables,
-- so the PK is composite (id, created_at). id alone remains globally unique
-- by virtue of the prefixed nanoid scheme; the composite key is a Postgres artifact.
-- The drizzle-kit auto-emitted CREATE TABLE was deleted and replaced with this block.

CREATE TABLE audit_log_events (
  id text NOT NULL,
  workspace_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES "user"(id),
  actor_kind text,
  api_key_id text REFERENCES apikey(id),
  event text NOT NULL,
  resource_kind text,
  resource_id text,
  diff jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_log_events_2026_05 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_log_events_2026_06 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE audit_log_events_2026_07 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE INDEX audit_log_events_workspace_created_idx
  ON audit_log_events (workspace_id, created_at DESC);

CREATE INDEX audit_log_events_workspace_event_created_idx
  ON audit_log_events (workspace_id, event, created_at DESC);

CREATE INDEX audit_log_events_resource_created_idx
  ON audit_log_events (resource_kind, resource_id, created_at DESC);
--> statement-breakpoint
CREATE TABLE "batch_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"identifier" text NOT NULL,
	"dynamic_variables" jsonb,
	"status" text NOT NULL,
	"conversation_id" text,
	"attempt_count" integer DEFAULT 0,
	"scheduled_for" timestamp,
	"last_attempt_at" timestamp,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"agent_id" text,
	"channel_kind" text NOT NULL,
	"channel_endpoint_id" text,
	"vertical" text NOT NULL,
	"status" text NOT NULL,
	"scheduled_for" timestamp,
	"concurrency" integer DEFAULT 8,
	"total_recipients" integer NOT NULL,
	"completed" integer DEFAULT 0,
	"booked" integer DEFAULT 0,
	"failed" integer DEFAULT 0,
	"cost_usd" real DEFAULT 0,
	"recovered_revenue_usd" real DEFAULT 0,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text,
	"status" text,
	"trial_ends_at" timestamp,
	"current_period_end" timestamp,
	"hipaa_addon" boolean DEFAULT false,
	"ferpa_addon" boolean DEFAULT false,
	CONSTRAINT "billing_subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "monthly_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"month" text NOT NULL,
	"recovered_revenue_usd" real NOT NULL,
	"cost_usd" real NOT NULL,
	"roi_multiplier" real NOT NULL,
	"comparison_delta_pct" real,
	"per_agent" jsonb NOT NULL,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"pdf_storage_key" text
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"agent_id" text,
	"agent_version_id" text,
	"conversation_id" text,
	"kind" text NOT NULL,
	"quantity" real NOT NULL,
	"unit_cost_usd" real,
	"total_cost_usd" real,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_evaluations" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"regulation" text NOT NULL,
	"passed" boolean,
	"failures" jsonb,
	"evaluated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardrail_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"turn_id" text,
	"guardrail_id" text,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"matched_text" text,
	"action" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_compliance_posture" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"hipaa" text,
	"ferpa" text,
	"tcpa" text,
	"eu_ai_act" text,
	"evaluated_at" timestamp,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"kms_key_id" text NOT NULL,
	"scope" text DEFAULT 'workspace',
	"agent_id" text,
	"last_used_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text NOT NULL,
	"conversation_id" text,
	"delivery_kind" text NOT NULL,
	"payload" jsonb,
	"response_status" integer,
	"response_body" text,
	"attempt_count" integer DEFAULT 1,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"signing_secret" text NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "batch_recipients" ADD CONSTRAINT "batch_recipients_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batch_recipients" ADD CONSTRAINT "batch_recipients_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_channel_endpoint_id_channel_endpoints_id_fk" FOREIGN KEY ("channel_endpoint_id") REFERENCES "public"."channel_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_receipts" ADD CONSTRAINT "monthly_receipts_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_evaluations" ADD CONSTRAINT "compliance_evaluations_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail_events" ADD CONSTRAINT "guardrail_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail_events" ADD CONSTRAINT "guardrail_events_turn_id_conversation_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."conversation_turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardrail_events" ADD CONSTRAINT "guardrail_events_guardrail_id_agent_guardrails_id_fk" FOREIGN KEY ("guardrail_id") REFERENCES "public"."agent_guardrails"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_compliance_posture" ADD CONSTRAINT "workspace_compliance_posture_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "batch_recipients_batch_status_idx" ON "batch_recipients" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "batch_recipients_conversation_idx" ON "batch_recipients" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "batches_workspace_status_idx" ON "batches" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "batches_workspace_scheduled_idx" ON "batches" USING btree ("workspace_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_receipts_workspace_month_uidx" ON "monthly_receipts" USING btree ("workspace_id","month");--> statement-breakpoint
CREATE INDEX "monthly_receipts_workspace_month_desc_idx" ON "monthly_receipts" USING btree ("workspace_id","month" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usage_events_workspace_occurred_idx" ON "usage_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_workspace_kind_occurred_idx" ON "usage_events" USING btree ("workspace_id","kind","occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_conversation_idx" ON "usage_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "compliance_evaluations_workspace_regulation_evaluated_idx" ON "compliance_evaluations" USING btree ("workspace_id","regulation","evaluated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "guardrail_events_conversation_triggered_idx" ON "guardrail_events" USING btree ("conversation_id","triggered_at");--> statement-breakpoint
CREATE UNIQUE INDEX "secrets_workspace_agent_name_uidx" ON "secrets" USING btree ("workspace_id","agent_id","name");--> statement-breakpoint
CREATE INDEX "secrets_workspace_name_idx" ON "secrets" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_created_idx" ON "webhook_deliveries" USING btree ("webhook_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "webhook_deliveries_conversation_idx" ON "webhook_deliveries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "webhooks_workspace_active_idx" ON "webhooks" USING btree ("workspace_id","active");--> statement-breakpoint
ALTER TABLE "channel_connections" ADD CONSTRAINT "channel_connections_credentials_secret_id_secrets_id_fk" FOREIGN KEY ("credentials_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_catalog_providers" ADD CONSTRAINT "tool_catalog_providers_credentials_secret_id_secrets_id_fk" FOREIGN KEY ("credentials_secret_id") REFERENCES "public"."secrets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- S1-04 enum-text CHECK constraints per DATA_MODEL.md §10-§13

ALTER TABLE secrets ADD CONSTRAINT secrets_scope_check
  CHECK (scope IN ('workspace','agent','channel'));--> statement-breakpoint

ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_delivery_kind_check
  CHECK (delivery_kind IN ('conversation_completed','batch_completed','call_initiation_failure','audio_ready','transcription_ready'));--> statement-breakpoint

ALTER TABLE audit_log_events ADD CONSTRAINT audit_log_events_actor_kind_check
  CHECK (actor_kind IN ('user','api_key','system'));--> statement-breakpoint

ALTER TABLE workspace_compliance_posture ADD CONSTRAINT workspace_compliance_posture_hipaa_check
  CHECK (hipaa IN ('active','action-required','violation','inactive'));--> statement-breakpoint
ALTER TABLE workspace_compliance_posture ADD CONSTRAINT workspace_compliance_posture_ferpa_check
  CHECK (ferpa IN ('active','action-required','violation','inactive'));--> statement-breakpoint
ALTER TABLE workspace_compliance_posture ADD CONSTRAINT workspace_compliance_posture_tcpa_check
  CHECK (tcpa IN ('active','action-required','violation','inactive'));--> statement-breakpoint
ALTER TABLE workspace_compliance_posture ADD CONSTRAINT workspace_compliance_posture_eu_ai_act_check
  CHECK (eu_ai_act IN ('active','action-required','violation','inactive'));--> statement-breakpoint

ALTER TABLE compliance_evaluations ADD CONSTRAINT compliance_evaluations_regulation_check
  CHECK (regulation IN ('hipaa','ferpa','tcpa','eu-ai-act'));--> statement-breakpoint

ALTER TABLE guardrail_events ADD CONSTRAINT guardrail_events_action_check
  CHECK (action IN ('blocked','redacted','flagged','escalated'));--> statement-breakpoint

ALTER TABLE billing_subscriptions ADD CONSTRAINT billing_subscriptions_plan_check
  CHECK (plan IN ('free','starter','pro','business','enterprise'));--> statement-breakpoint
ALTER TABLE billing_subscriptions ADD CONSTRAINT billing_subscriptions_status_check
  CHECK (status IN ('trialing','active','past_due','canceled'));--> statement-breakpoint

ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind IN ('llm_input_tokens','llm_output_tokens','tts_seconds','stt_seconds','minutes','tool_call','rag_query','seat','container_seconds','do_seconds','queue_messages'));--> statement-breakpoint

ALTER TABLE batches ADD CONSTRAINT batches_channel_kind_check
  CHECK (channel_kind IN ('voice','whatsapp','messenger','instagram','web_chat','sms'));--> statement-breakpoint
ALTER TABLE batches ADD CONSTRAINT batches_vertical_check
  CHECK (vertical IN ('home-services','appointment-services','education'));--> statement-breakpoint
ALTER TABLE batches ADD CONSTRAINT batches_status_check
  CHECK (status IN ('draft','scheduled','running','paused','completed','failed'));--> statement-breakpoint

ALTER TABLE batch_recipients ADD CONSTRAINT batch_recipients_status_check
  CHECK (status IN ('pending','vetting','dnc','queued','dialing','completed','failed','deferred'));