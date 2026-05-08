-- S3-04: idempotency unique index for conversation_turns inbound replay dedup.
-- Per DATA_MODEL.md §9 — webhook deliveries can replay; the projector relies
-- on this partial unique index to make `INSERT ... ON CONFLICT DO NOTHING`
-- a no-op on the second arrival of the same Meta message_id.
--
-- Partial predicate (`WHERE message_id IS NOT NULL`) lets non-Meta-sourced
-- turns (voice, web_chat) leave message_id NULL without colliding.

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS conversation_turns_conversation_message_id_uidx
  ON conversation_turns (conversation_id, message_id)
  WHERE message_id IS NOT NULL;
