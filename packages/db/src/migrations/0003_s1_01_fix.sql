-- S1-01-fix: enum CHECK constraints on the 8 new enum-text columns from S1-01
-- (BL-S0-02 spirit per gate-S1-01.md AC 1) plus the kb_documents soft-delete
-- partial index missed against DATA_MODEL.md §4 line 279.

-- kb_documents.source: enum('file','url','text') §4
ALTER TABLE kb_documents ADD CONSTRAINT kb_documents_source_check
  CHECK (source IN ('file','url','text'));
--> statement-breakpoint
-- kb_documents.status: enum('ready','indexing','needs_refresh','failed') §4
ALTER TABLE kb_documents ADD CONSTRAINT kb_documents_status_check
  CHECK (status IN ('ready','indexing','needs_refresh','failed'));
--> statement-breakpoint
-- tools.kind: enum('webhook','mcp','client','system') §7
ALTER TABLE tools ADD CONSTRAINT tools_kind_check
  CHECK (kind IN ('webhook','mcp','client','system'));
--> statement-breakpoint
-- tools.status: enum('active','deprecated','error','deleted') §7
ALTER TABLE tools ADD CONSTRAINT tools_status_check
  CHECK (status IN ('active','deprecated','error','deleted'));
--> statement-breakpoint
-- tool_catalog_providers.kind: enum('composio','arcade','pipedream','mcp-custom','mcp-self-hosted') §7
ALTER TABLE tool_catalog_providers ADD CONSTRAINT tool_catalog_providers_kind_check
  CHECK (kind IN ('composio','arcade','pipedream','mcp-custom','mcp-self-hosted'));
--> statement-breakpoint
-- tool_catalog_providers.auth_mode: enum('oauth','api-key','none') §7
ALTER TABLE tool_catalog_providers ADD CONSTRAINT tool_catalog_providers_auth_mode_check
  CHECK (auth_mode IN ('oauth','api-key','none'));
--> statement-breakpoint
-- tool_catalog_providers.status: enum('connected','degraded','error','disabled') §7
ALTER TABLE tool_catalog_providers ADD CONSTRAINT tool_catalog_providers_status_check
  CHECK (status IN ('connected','degraded','error','disabled'));
--> statement-breakpoint
-- voices.provider: enum('elevenlabs','cartesia','openai','google','deepgram') §5
ALTER TABLE voices ADD CONSTRAINT voices_provider_check
  CHECK (provider IN ('elevenlabs','cartesia','openai','google','deepgram'));
--> statement-breakpoint
-- kb_documents soft-delete partial index per DATA_MODEL.md §4 line 279
CREATE INDEX IF NOT EXISTS kb_documents_workspace_deleted_idx
  ON kb_documents (workspace_id, deleted_at)
  WHERE deleted_at IS NULL;
