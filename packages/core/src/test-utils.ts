import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@kuralle/db/schema";

export const TEST_DB_URL =
  process.env.DATABASE_URL ?? "postgres://kuralle:kuralle@localhost:5432/kuralle_dev";

const pool = new Pool({ connectionString: TEST_DB_URL, max: 4 });

export type TestDb = NodePgDatabase<typeof schema>;

const DOMAIN_TABLES = [
  "workflow_edges_projection",
  "workflow_nodes_projection",
  "agent_eval_criteria",
  "agent_guardrails",
  "agent_kb_attachments",
  "agent_tool_attachments",
  "conversation_tool_calls",
  "conversation_extracted_fields",
  "conversation_evals",
  "conversation_turns",
  "messaging_threads",
  "voice_calls",
  "conversations",
  "routing_rules",
  "channel_endpoints",
  "channel_connections",
  "agent_versions",
  "agents",
  "tools",
  "kb_chunks",
  "kb_documents",
  "tool_catalog_providers",
] as const;

export async function createTestDb(): Promise<{ db: TestDb; client: PoolClient }> {
  const client = await pool.connect();
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function releaseTestDb(client: PoolClient): Promise<void> {
  client.release();
}

export async function resetSchema(client: PoolClient, workspaceId: string): Promise<void> {
  await client.query(`TRUNCATE TABLE ${DOMAIN_TABLES.join(", ")} CASCADE`);

  await client.query(
    `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, is_personal, created_at, updated_at)
     VALUES ($1, 'Test Workspace', 'test-workspace', 'sandbox', 'us-east-1', 'none', false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [workspaceId],
  );
}

export async function closePool(): Promise<void> {
  await pool.end();
}
