-- S3-01: idempotent rename of channel_endpoints polymorphic CHECK trigger.
-- The trigger was originally shipped in 0008_s1_03_meta.sql as
-- `channel_endpoint_kind_matches()` + `channel_endpoint_kind_check`.
-- This migration converges to the canonical names:
--   function: enforce_channel_endpoint_kind_match()
--   trigger:  channel_endpoints_kind_match
--
-- The semantics are unchanged: a BEFORE INSERT OR UPDATE on channel_endpoints
-- raises an exception when NEW.channel_kind does not equal the parent
-- channel_connections.channel_kind for the same connection_id.

--> statement-breakpoint
DROP TRIGGER IF EXISTS channel_endpoint_kind_check ON channel_endpoints;
--> statement-breakpoint
DROP FUNCTION IF EXISTS channel_endpoint_kind_matches();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_channel_endpoint_kind_match() RETURNS TRIGGER AS $$
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
CREATE TRIGGER channel_endpoints_kind_match
  BEFORE INSERT OR UPDATE ON channel_endpoints
  FOR EACH ROW
  EXECUTE FUNCTION enforce_channel_endpoint_kind_match();
