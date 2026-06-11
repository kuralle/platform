-- W1: allow embed widget endpoints on channel_endpoints.

ALTER TABLE channel_endpoints DROP CONSTRAINT channel_endpoints_channel_kind_check;
ALTER TABLE channel_endpoints ADD CONSTRAINT channel_endpoints_channel_kind_check
  CHECK (channel_kind IN ('voice','whatsapp','messenger','instagram','web_chat','sms','widget'));
