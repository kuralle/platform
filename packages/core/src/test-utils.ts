import { Pool } from "pg";
import type { PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

export type { PoolClient };
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
  "batch_recipients",
  "batches",
  "usage_events",
  "workspace_compliance_posture",
  "monthly_receipts",
  "member",
] as const;

/** Introduced in migration 0015 — may be absent until `db:migrate` runs on the test DB. */
const OPTIONAL_DOMAIN_TABLES = ["widget_configs", "onboarding_states"] as const;

async function truncateTableIfExists(client: PoolClient, table: string): Promise<void> {
  try {
    await client.query(`TRUNCATE TABLE ${table} CASCADE`);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "42P01") return;
    throw e;
  }
}

export async function createTestDb(): Promise<{ db: TestDb; client: PoolClient }> {
  const client = await pool.connect();
  const db = drizzle(client, { schema });
  return { db, client };
}

export async function releaseTestDb(client: PoolClient): Promise<void> {
  client.release();
}

export async function resetSchema(client: PoolClient, workspaceId: string): Promise<void> {
  // TRUNCATE is intentionally raw SQL — Drizzle has no first-class equivalent
  // and we need CASCADE to clear FK-linked rows in one statement.
  await client.query(`TRUNCATE TABLE ${DOMAIN_TABLES.join(", ")} CASCADE`);
  for (const t of OPTIONAL_DOMAIN_TABLES) {
    await truncateTableIfExists(client, t);
  }

  // Org fixture insert via the typed Drizzle builder. Tests that need a
  // bespoke workspace shape can call `seedWorkspace(db, { ... })` directly.
  const db = drizzle(client, { schema });
  await db
    .insert(schema.organization)
    .values({
      id: workspaceId,
      name: `Test Workspace ${workspaceId}`,
      slug: `test-${workspaceId}`,
      environment: "sandbox",
      region: "us-east-1",
      complianceMode: "none",
      isPersonal: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

/**
 * Insert a workspace org row via the typed Drizzle builder. Tests that
 * previously called `client.query("INSERT INTO organization ...")` should
 * use this helper instead.
 */
export async function seedWorkspace(
  db: TestDb,
  opts: {
    id: string;
    name?: string;
    slug?: string;
    environment?: "sandbox" | "production";
    region?: string;
    complianceMode?: "none" | "hipaa" | "ferpa";
    isPersonal?: boolean;
  },
): Promise<void> {
  await db
    .insert(schema.organization)
    .values({
      id: opts.id,
      name: opts.name ?? `Test Workspace ${opts.id}`,
      slug: opts.slug ?? `test-${opts.id}`,
      environment: opts.environment ?? "sandbox",
      region: opts.region ?? "us-east-1",
      complianceMode: opts.complianceMode ?? "none",
      isPersonal: opts.isPersonal ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export async function seedWorkspaceMember(
  db: TestDb,
  opts: {
    workspaceId: string;
    userId: string;
    email: string;
    role?: "viewer" | "member" | "admin" | "owner";
  },
): Promise<void> {
  await db
    .insert(schema.user)
    .values({
      id: opts.userId,
      name: "Test User",
      email: opts.email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(schema.member)
    .values({
      id: `m_${opts.userId}_${opts.workspaceId}`,
      organizationId: opts.workspaceId,
      userId: opts.userId,
      role: opts.role ?? "owner",
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}
