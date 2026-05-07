import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(__dirname, "../../../apps/server/.env"),
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    const msg = `  ✗ ${label}${detail ? ` — ${detail}` : ""}`;
    errors.push(msg);
    console.log(msg);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("S1-02 smoke — agents two-row split + projections\n");

    // 0. Cleanup any leftovers
    await client.query(`DELETE FROM agents WHERE id LIKE 'test-%'`);
    await client.query(`DELETE FROM tools WHERE id LIKE 'test-s1-02-%'`);
    await client.query(`DELETE FROM kb_documents WHERE id LIKE 'test-s1-02-%'`);
    await client.query(`DELETE FROM organization WHERE id = 'test-s1-02-org'`);

    // 1. INSERT one organization
    const orgRes = await client.query(
      `INSERT INTO organization (id, name, slug, created_at, updated_at)
       VALUES ('test-s1-02-org', 'S1-02 Smoke Org', 's1-02-smoke-org', now(), now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    check("INSERT organization", orgRes.rowCount! > 0);
    const orgId = orgRes.rows[0].id;

    // 2. INSERT one agents row (NULL activeVersionId)
    const agentRes = await client.query(
      `INSERT INTO agents (id, workspace_id, status)
       VALUES ('test-s1-02-agent', $1, 'draft')
       RETURNING id, active_version_id`,
      [orgId]
    );
    check("INSERT agents (NULL activeVersionId)", agentRes.rowCount! > 0);
    check("  activeVersionId IS NULL", agentRes.rows[0].active_version_id === null);

    // 3. INSERT one agent_versions row
    const av1Res = await client.query(
      `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot)
       VALUES ('test-s1-02-av1', 'test-s1-02-agent', 1, 'manual_save', '{"name":"test"}'::jsonb)
       RETURNING id`
    );
    check("INSERT agent_versions (v1)", av1Res.rowCount! > 0);
    const av1Id = av1Res.rows[0].id;

    // 4. UPDATE agents.activeVersionId to point at the new version (should succeed)
    const updateAgentRes = await client.query(
      `UPDATE agents SET active_version_id = $1, updated_at = now() WHERE id = 'test-s1-02-agent'`
      , [av1Id]
    );
    check("UPDATE agents.activeVersionId → av1", updateAgentRes.rowCount! > 0);

    // 5. INSERT another agent_versions row
    const av2Res = await client.query(
      `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot)
       VALUES ('test-s1-02-av2', 'test-s1-02-agent', 2, 'publish', '{"name":"v2"}'::jsonb)
       RETURNING id`
    );
    check("INSERT agent_versions (v2)", av2Res.rowCount! > 0);
    const av2Id = av2Res.rows[0].id;

    // 6. UPDATE agent_versions — MUST raise append-only trigger
    let triggerFired = false;
    let triggerMsg = "";
    try {
      await client.query(
        `UPDATE agent_versions SET change_summary = 'oops' WHERE id = $1`,
        [av2Id]
      );
    } catch (e) {
      triggerFired = true;
      triggerMsg = e instanceof Error ? e.message : String(e);
    }
    check("UPDATE agent_versions raises trigger", triggerFired);
    check("  error contains 'append-only'", triggerMsg.includes("append-only"), triggerMsg);

    // 6b. UNIQUE (agentId, versionNumber) blocks duplicate version_number
    let uniqueFired = false;
    let uniqueMsg = "";
    try {
      await client.query(
        `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot)
         VALUES ('test-s1-02-av-dup', 'test-s1-02-agent', 1, 'manual_save', '{}'::jsonb)`,
      );
    } catch (e) {
      uniqueFired = true;
      uniqueMsg = e instanceof Error ? e.message : String(e);
    }
    check(
      "UNIQUE (agent_id, version_number) blocks dup version_number=1",
      uniqueFired,
    );
    check(
      "  error contains 'agent_versions_agent_version_uidx' or 'duplicate key'",
      uniqueMsg.includes("agent_versions_agent_version_uidx") ||
        uniqueMsg.includes("duplicate key"),
      uniqueMsg,
    );

    // 7. Create temporary FK-target rows
    await client.query(
      `INSERT INTO tools (id, name, kind, config, workspace_id)
       VALUES ('test-s1-02-tool', 'smoke-tool', 'system', '{}'::jsonb, $1)`,
      [orgId]
    );
    await client.query(
      `INSERT INTO kb_documents (id, workspace_id, name, source, size_bytes)
       VALUES ('test-s1-02-doc', $1, 'smoke-doc', 'text', 0)`,
      [orgId]
    );

    // 8. INSERT into each projection table
    const toolRes = await client.query(
      `INSERT INTO agent_tool_attachments (agent_version_id, tool_id, source)
       VALUES ($1, 'test-s1-02-tool', 'native')`,
      [av1Id]
    );
    check("INSERT agent_tool_attachments", toolRes.rowCount! > 0);

    const kbRes = await client.query(
      `INSERT INTO agent_kb_attachments (agent_version_id, document_id)
       VALUES ($1, 'test-s1-02-doc')`,
      [av1Id]
    );
    check("INSERT agent_kb_attachments", kbRes.rowCount! > 0);

    const grRes = await client.query(
      `INSERT INTO agent_guardrails (id, agent_version_id, name, direction, evaluation_model, prompt, ordinal)
       VALUES ('test-gr1', $1, 'PII block', 'output', 'gpt-4o', 'Find PII', 1)`,
      [av1Id]
    );
    check("INSERT agent_guardrails", grRes.rowCount! > 0);

    const ecRes = await client.query(
      `INSERT INTO agent_eval_criteria (id, agent_version_id, name, kind, rubric, ordinal)
       VALUES ('test-ec1', $1, 'accuracy', 'data', 'Is accurate?', 1)`,
      [av1Id]
    );
    check("INSERT agent_eval_criteria", ecRes.rowCount! > 0);

    const nodeRes = await client.query(
      `INSERT INTO workflow_nodes_projection (agent_version_id, node_id, kind, title)
       VALUES ($1, 'n1', 'dispatch', 'Dispatch')`,
      [av1Id]
    );
    check("INSERT workflow_nodes_projection", nodeRes.rowCount! > 0);

    const edgeRes = await client.query(
      `INSERT INTO workflow_edges_projection (id, agent_version_id, source_node_id, target_node_id, condition_type)
       VALUES ('test-edge1', $1, 'n1', 'n2', 'llm')`,
      [av1Id]
    );
    check("INSERT workflow_edges_projection", edgeRes.rowCount! > 0);

    // 9. Cleanup
    await client.query(`DELETE FROM agents WHERE id LIKE 'test-%'`);
    await client.query(`DELETE FROM tools WHERE id LIKE 'test-s1-02-%'`);
    await client.query(`DELETE FROM kb_documents WHERE id LIKE 'test-s1-02-%'`);
    await client.query(`DELETE FROM organization WHERE id = 'test-s1-02-org'`);
    console.log("\n  (cleanup done)");

  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFAILURES:");
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
