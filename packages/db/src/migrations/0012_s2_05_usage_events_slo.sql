-- S2-05 fix-pass / AMENDMENT-005: usage_events extends to carry SLO violations.
--
-- Two changes, both forward-compatible with existing billing rows:
--   1. Add nullable `payload jsonb` column for non-billing event kinds.
--   2. Extend the `usage_events_kind_check` CHECK enum tuple with 'slo_violation'.
--
-- Closes [S2-05] gate findings F1 (test mutates schema) and F2 (AC#2 contract
-- divergence). After this migration the SLO test no longer needs to drop/re-add
-- the CHECK constraint at runtime.

-- Idempotent: column add tolerates re-runs against a partially-applied state
-- (column + constraint may already exist if 0010 partially applied).
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_kind_check;

ALTER TABLE usage_events ADD CONSTRAINT usage_events_kind_check
  CHECK (kind = ANY (ARRAY[
    'llm_input_tokens'::text,
    'llm_output_tokens'::text,
    'tts_seconds'::text,
    'stt_seconds'::text,
    'minutes'::text,
    'tool_call'::text,
    'rag_query'::text,
    'seat'::text,
    'container_seconds'::text,
    'do_seconds'::text,
    'queue_messages'::text,
    'slo_violation'::text
  ]));
