-- S1-03-fix manager fix-pass per gate-S1-03.md Apply-now items 1-3+5
-- Items 2-3: late FK adds for channel_endpoints.attachedAgentVersionId / routingRulesId
-- Item 5: drop redundant non-unique index (uniqueIndex on same columns covers it)
-- Item 1: 16 enum CHECK constraints on the new S1-03 enum-text columns

DROP INDEX "conversation_turns_conversation_ordinal_idx";--> statement-breakpoint
ALTER TABLE "channel_endpoints" ADD CONSTRAINT "channel_endpoints_attached_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("attached_agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_endpoints" ADD CONSTRAINT "channel_endpoints_routing_rules_id_routing_rules_id_fk" FOREIGN KEY ("routing_rules_id") REFERENCES "public"."routing_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- channel_connections.status §8:587
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_status_check
  CHECK (status IN ('connected','available','coming-soon','error','degraded'));--> statement-breakpoint

-- routing_rules.rule_kind §8:646
ALTER TABLE routing_rules ADD CONSTRAINT routing_rules_rule_kind_check
  CHECK (rule_kind IN ('path','query_param','header','default'));--> statement-breakpoint

-- conversations.direction §9:682
ALTER TABLE conversations ADD CONSTRAINT conversations_direction_check
  CHECK (direction IN ('inbound','outbound'));--> statement-breakpoint

-- conversations.outcome §9:688
ALTER TABLE conversations ADD CONSTRAINT conversations_outcome_check
  CHECK (outcome IN ('booked','qualified','missed','voicemail','abandoned','escalated','resolved','dropped'));--> statement-breakpoint

-- voice_calls.hangup_by §9:723
ALTER TABLE voice_calls ADD CONSTRAINT voice_calls_hangup_by_check
  CHECK (hangup_by IN ('caller','agent','system','transfer'));--> statement-breakpoint

-- conversation_turns.speaker §9:753
ALTER TABLE conversation_turns ADD CONSTRAINT conversation_turns_speaker_check
  CHECK (speaker IN ('agent','caller','system'));--> statement-breakpoint

-- conversation_turns.delivery_status §9:757
ALTER TABLE conversation_turns ADD CONSTRAINT conversation_turns_delivery_status_check
  CHECK (delivery_status IN ('sending','sent','delivered','read','failed'));--> statement-breakpoint

-- conversation_turns.eval_verdict §9:760
ALTER TABLE conversation_turns ADD CONSTRAINT conversation_turns_eval_verdict_check
  CHECK (eval_verdict IN ('passed','failed','warning'));--> statement-breakpoint

-- runtime_deployments enums §9:862-879 (7 columns)
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_kind_check
  CHECK (kind IN ('voice_dedicated','messaging_pooled'));--> statement-breakpoint
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_status_check
  CHECK (status IN ('provisioning','ready','draining','terminated','failed'));--> statement-breakpoint
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_platform_check
  CHECK (platform IN ('cloudflare','fly','railway','self-hosted'));--> statement-breakpoint
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_termination_reason_check
  CHECK (termination_reason IN ('idle_timeout','manual','crashed','migrated','hipaa_isolation_end','platform'));--> statement-breakpoint
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_resource_tier_check
  CHECK (resource_tier IN ('lite','basic','standard','pro'));--> statement-breakpoint
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_compliance_mode_check
  CHECK (compliance_mode IN ('none','hipaa','ferpa','tcpa'));--> statement-breakpoint
ALTER TABLE runtime_deployments ADD CONSTRAINT runtime_deployments_isolation_kind_check
  CHECK (isolation_kind IN ('per-conversation','per-workspace','pooled'));--> statement-breakpoint

-- session_checkpoints.trigger §9:849
ALTER TABLE session_checkpoints ADD CONSTRAINT session_checkpoints_trigger_check
  CHECK (trigger IN ('tool-result','tool-error','flow-transition','handoff','manual'));