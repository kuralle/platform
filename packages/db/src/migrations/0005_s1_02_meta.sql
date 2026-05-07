-- S1-02: enum CHECK constraints, composite primary keys, partial index, and append-only trigger
-- on agent_versions. Complements drizzle-kit-generated 0004_round_calypso.sql.

-- CHECK constraints (enum-text columns)
ALTER TABLE agents ADD CONSTRAINT agents_status_check
  CHECK (status IN ('draft','published','archived'));
--> statement-breakpoint
ALTER TABLE agent_versions ADD CONSTRAINT agent_versions_version_kind_check
  CHECK (version_kind IN ('auto_save','manual_save','publish'));
--> statement-breakpoint
ALTER TABLE agent_versions ADD CONSTRAINT agent_versions_bundle_status_check
  CHECK (bundle_status IN ('pending','building','ready','failed'));
--> statement-breakpoint
ALTER TABLE agent_tool_attachments ADD CONSTRAINT agent_tool_attachments_source_check
  CHECK (source IN ('native','workflow','subagent','integration','mcp'));
--> statement-breakpoint
ALTER TABLE agent_guardrails ADD CONSTRAINT agent_guardrails_direction_check
  CHECK (direction IN ('input','output','both'));
--> statement-breakpoint
ALTER TABLE agent_guardrails ADD CONSTRAINT agent_guardrails_on_trigger_check
  CHECK (on_trigger IN ('block','redact','flag','escalate'));
--> statement-breakpoint
ALTER TABLE agent_eval_criteria ADD CONSTRAINT agent_eval_criteria_kind_check
  CHECK (kind IN ('success','data','safety'));
--> statement-breakpoint
ALTER TABLE workflow_nodes_projection ADD CONSTRAINT workflow_nodes_projection_kind_check
  CHECK (kind IN ('subagent','extraction','dispatch','transfer-agent','transfer-number','end'));
--> statement-breakpoint
ALTER TABLE workflow_edges_projection ADD CONSTRAINT workflow_edges_projection_condition_type_check
  CHECK (condition_type IN ('llm','expression','none'));

--> statement-breakpoint
-- Composite primary keys for projection tables (drizzle-kit emitted indexes, not PKs)
ALTER TABLE agent_tool_attachments ADD PRIMARY KEY (agent_version_id, tool_id, source);
--> statement-breakpoint
ALTER TABLE agent_kb_attachments ADD PRIMARY KEY (agent_version_id, document_id);
--> statement-breakpoint
ALTER TABLE workflow_nodes_projection ADD PRIMARY KEY (agent_version_id, node_id);

--> statement-breakpoint
-- Partial index: soft-delete-aware workspace lookup per DATA_MODEL.md §5:323
CREATE INDEX IF NOT EXISTS agents_workspace_deleted_idx
  ON agents (workspace_id, deleted_at)
  WHERE deleted_at IS NULL;

--> statement-breakpoint
-- Append-only trigger on agent_versions per DATA_MODEL.md §5
-- INSERT and DELETE remain allowed (DELETE for nightly auto-save prune;
-- CASCADE delete via parent agents). Only UPDATE is blocked.
CREATE OR REPLACE FUNCTION agent_versions_append_only() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'agent_versions is append-only; UPDATE is not permitted (table=%, id=%)', TG_TABLE_NAME, OLD.id
    USING ERRCODE = 'feature_not_supported';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER agent_versions_no_update
  BEFORE UPDATE ON agent_versions
  FOR EACH ROW
  EXECUTE FUNCTION agent_versions_append_only();
