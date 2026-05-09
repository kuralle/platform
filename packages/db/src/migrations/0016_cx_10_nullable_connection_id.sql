-- CX-10: Allow channel_endpoints to exist before a connection is provisioned.
-- Onboarding inserts an endpoint row with only the user's phone identifier;
-- the connection_id is linked later when the M5 wizard provisions Twilio/Meta.

ALTER TABLE channel_endpoints ALTER COLUMN connection_id DROP NOT NULL;

--> statement-breakpoint
-- Relax attachment CHECK: unprovisioned endpoints (connection_id IS NULL) are
-- exempt — they're phone-number placeholders from onboarding.  Once a
-- connection is linked the original rule still applies.
ALTER TABLE channel_endpoints DROP CONSTRAINT channel_endpoints_attachment_check;
ALTER TABLE channel_endpoints ADD CONSTRAINT channel_endpoints_attachment_check
  CHECK (connection_id IS NULL OR attached_agent_id IS NOT NULL OR routing_rules_id IS NOT NULL);

--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_channel_endpoint_kind_match() RETURNS TRIGGER AS $$
DECLARE conn_kind text;
BEGIN
  IF NEW.connection_id IS NULL THEN
    RETURN NEW;
  END IF;
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
