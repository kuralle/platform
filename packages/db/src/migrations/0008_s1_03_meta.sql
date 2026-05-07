-- S1-03: enum CHECK constraints, polymorphic CHECK trigger, partial indexes,
-- compound primary keys, and messageId dedup index.
-- Complements drizzle-kit-generated 0007_moaning_arachne.sql.

-- ============================================================================
-- 1. Enum CHECK constraints (channel_kind)
-- Per DATA_MODEL.md §8 lines 564-571
-- ============================================================================
ALTER TABLE channel_connections ADD CONSTRAINT channel_connections_channel_kind_check
  CHECK (channel_kind IN ('voice','whatsapp','messenger','instagram','web_chat','sms'));
--> statement-breakpoint
ALTER TABLE channel_endpoints ADD CONSTRAINT channel_endpoints_channel_kind_check
  CHECK (channel_kind IN ('voice','whatsapp','messenger','instagram','web_chat','sms'));

--> statement-breakpoint
-- ============================================================================
-- 2. channel_endpoints endpoint-attachment CHECK
-- Per DATA_MODEL.md §8:626 — must have either an agent or routing rules attached
-- ============================================================================
ALTER TABLE channel_endpoints ADD CONSTRAINT channel_endpoints_attachment_check
  CHECK (attached_agent_id IS NOT NULL OR routing_rules_id IS NOT NULL);

--> statement-breakpoint
-- ============================================================================
-- 3. Polymorphic CHECK trigger: channel_endpoints.channel_kind must match
--    channel_connections.channel_kind for the same connection_id.
-- Per DATA_MODEL.md §15 denormalisation integrity guards.
-- Fires BEFORE INSERT OR UPDATE; DELETE is unaffected.
-- ============================================================================
CREATE OR REPLACE FUNCTION channel_endpoint_kind_matches() RETURNS TRIGGER AS $$
DECLARE conn_kind text;
BEGIN
  SELECT channel_kind INTO conn_kind FROM channel_connections WHERE id = NEW.connection_id;
  IF conn_kind IS NULL THEN
    RAISE EXCEPTION 'channel_endpoint connection_id=% not found', NEW.connection_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.channel_kind <> conn_kind THEN
    RAISE EXCEPTION 'channel_endpoint.channel_kind=% does not match channel_connections.channel_kind=%',
      NEW.channel_kind, conn_kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER channel_endpoint_kind_check
  BEFORE INSERT OR UPDATE ON channel_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION channel_endpoint_kind_matches();

--> statement-breakpoint
-- ============================================================================
-- 4. Partial unique index: conversation_turns messageId dedup
-- Per DATA_MODEL.md §9 comment "de-dup webhook replay".
-- Voice turns have NULL messageId, so this partial index does not constrain them.
-- ============================================================================
CREATE UNIQUE INDEX conversation_turns_message_dedup_idx
  ON conversation_turns (conversation_id, message_id)
  WHERE message_id IS NOT NULL;

--> statement-breakpoint
-- ============================================================================
-- 5. Partial indexes: workspace-scoped lookups for "live" rows
-- Per DATA_MODEL.md §9:704 (endedAt IS NULL) and §9:881-882 (terminatedAt IS NULL, status='ready')
-- ============================================================================
DROP INDEX IF EXISTS conversations_workspace_ended_idx;
--> statement-breakpoint
CREATE INDEX conversations_workspace_ended_idx
  ON conversations (workspace_id, ended_at)
  WHERE ended_at IS NULL;

--> statement-breakpoint
DROP INDEX IF EXISTS runtime_deployments_workspace_terminated_idx;
--> statement-breakpoint
CREATE INDEX runtime_deployments_workspace_terminated_idx
  ON runtime_deployments (workspace_id, terminated_at)
  WHERE terminated_at IS NULL;

--> statement-breakpoint
DROP INDEX IF EXISTS runtime_deployments_heartbeat_idx;
--> statement-breakpoint
CREATE INDEX runtime_deployments_heartbeat_idx
  ON runtime_deployments (last_heartbeat_at)
  WHERE status = 'ready';

--> statement-breakpoint
-- ============================================================================
-- 6. Compound primary keys for tables without a surrogate id
-- ============================================================================
ALTER TABLE messaging_threads ADD PRIMARY KEY (workspace_id, thread_key);
--> statement-breakpoint
ALTER TABLE conversation_extracted_fields ADD PRIMARY KEY (conversation_id, label);
