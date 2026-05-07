CREATE EXTENSION IF NOT EXISTS vector;

--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024),
	"token_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"folder" text,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"storage_key" text,
	"content_text" text,
	"size_bytes" integer NOT NULL,
	"status" text DEFAULT 'indexing' NOT NULL,
	"rag_indexed" boolean DEFAULT false,
	"embedding_model" text,
	"auto_sync" boolean DEFAULT false,
	"last_synced_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tool_catalog_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"mcp_server_url" text NOT NULL,
	"auth_mode" text DEFAULT 'none',
	"credentials_secret_id" text,
	"status" text DEFAULT 'connected',
	"last_synced_at" timestamp,
	"toolset_ids" text[] DEFAULT '{}',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"display_name" text,
	"description" text,
	"kind" text NOT NULL,
	"catalog_provider_id" text,
	"external_tool_key" text,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"config" jsonb NOT NULL,
	"status" text DEFAULT 'active',
	"last_validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "voices" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"external_id" text,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"language" text NOT NULL,
	"style" text,
	"is_cloned" boolean DEFAULT false,
	"preview_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_document_id_kb_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_catalog_providers" ADD CONSTRAINT "tool_catalog_providers_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_catalog_provider_id_tool_catalog_providers_id_fk" FOREIGN KEY ("catalog_provider_id") REFERENCES "public"."tool_catalog_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voices" ADD CONSTRAINT "voices_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kb_chunks_document_ordinal_idx" ON "kb_chunks" USING btree ("document_id","ordinal");--> statement-breakpoint
CREATE INDEX "kb_documents_workspace_folder_idx" ON "kb_documents" USING btree ("workspace_id","folder");--> statement-breakpoint
CREATE INDEX "kb_documents_workspace_status_idx" ON "kb_documents" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "tool_catalog_providers_workspace_kind_idx" ON "tool_catalog_providers" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "tools_workspace_name_uidx" ON "tools" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "tools_workspace_kind_idx" ON "tools" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE INDEX "tools_workspace_status_idx" ON "tools" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "tools_catalog_provider_external_idx" ON "tools" USING btree ("catalog_provider_id","external_tool_key");--> statement-breakpoint
CREATE INDEX "voices_workspace_id_idx" ON "voices" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "voices_provider_external_idx" ON "voices" USING btree ("provider","external_id");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx
  ON kb_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

--> statement-breakpoint
INSERT INTO voices (id, workspace_id, external_id, provider, name, language, style, is_cloned, preview_url, created_at)
VALUES
  ('v_aurora',  NULL, 'v_aurora',  'elevenlabs', 'Aurora',  'en-US', NULL, false, NULL, now()),
  ('v_rio',     NULL, 'v_rio',     'cartesia',   'Rio',     'es-MX', NULL, false, NULL, now()),
  ('v_hawthorn',NULL, 'v_hawthorn','openai',      'Hawthorn','en-GB', NULL, false, NULL, now()),
  ('v_lyra',    NULL, 'v_lyra',    'elevenlabs',  'Lyra',    'en-US', NULL, false, NULL, now()),
  ('v_castor',  NULL, 'v_castor',  'deepgram',    'Castor',  'en-AU', NULL, false, NULL, now());