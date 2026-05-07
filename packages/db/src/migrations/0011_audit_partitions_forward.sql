-- S1-fix per codex r2 Apply-now item 1: extend audit_log_events partitions
-- through 2027-06 so writes don't hard-fail past 2026-07-31.
--
-- Original S1-04 created May/Jun/Jul 2026 partitions. Adding 12 more months
-- (Aug 2026 → Jun 2027 inclusive — 11 partitions; together with the existing
-- May-Jul 2026 set, this gives ~14 months of write capacity from the project
-- clock 2026-05-07).
--
-- Ops debt: the partition-rollover automation is NOT shipped in this sprint.
-- Backlog item BL-S1-AUDIT-ROLLOVER tracks adding either:
--   (a) a monthly cron job that creates the next-month partition, OR
--   (b) a hand-authored migration cadence at the start of every quarter.
-- Until that lands, this migration buys runway through 2027-06; an alarm
-- should be wired so we re-extend before then.

CREATE TABLE audit_log_events_2026_08 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2026_09 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2026_10 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2026_11 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2026_12 PARTITION OF audit_log_events
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2027_01 PARTITION OF audit_log_events
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2027_02 PARTITION OF audit_log_events
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2027_03 PARTITION OF audit_log_events
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2027_04 PARTITION OF audit_log_events
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2027_05 PARTITION OF audit_log_events
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
--> statement-breakpoint
CREATE TABLE audit_log_events_2027_06 PARTITION OF audit_log_events
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
