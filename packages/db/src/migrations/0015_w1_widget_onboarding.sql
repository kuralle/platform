-- W1: embed widget config + onboarding wizard state per workspace (organization).

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS widget_configs (
  workspace_id text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  modality text NOT NULL DEFAULT 'both',
  theme jsonb,
  strings jsonb,
  vars jsonb,
  feedback_enabled boolean DEFAULT false,
  terms_url text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS onboarding_states (
  workspace_id text PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  current_step text NOT NULL DEFAULT 'vertical',
  completed_at timestamp,
  vertical text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp
);
