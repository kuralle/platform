-- GL-11: dead-letter table for turn-event projector messages that exhaust retries.

CREATE TABLE "turn_events_dlq" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"shard_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"error_message" text NOT NULL,
	"error_stack" text,
	"attempts" integer NOT NULL,
	"last_failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dlq_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "turn_events_dlq_unresolved_idx" ON "turn_events_dlq" USING btree ("dlq_at") WHERE "turn_events_dlq"."resolved" = false;
