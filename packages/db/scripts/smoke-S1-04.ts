import { Client } from "pg";

const CONN = "postgres://kuralle:kuralle@localhost:5432/kuralle_dev";

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
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    console.log("S1-04 smoke — cross-cutting tables (audit partitioned, secrets, webhooks, billing, compliance, batches)\n");

    const prefix = "test-s1-04";

    // Cleanup any leftovers (NULL FKs before deleting referenced rows)
    await client.query(`DELETE FROM batch_recipients WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM batches WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM monthly_receipts WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM usage_events WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM billing_subscriptions WHERE workspace_id = '${prefix}-org'`);
    await client.query(`DELETE FROM guardrail_events WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM compliance_evaluations WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM workspace_compliance_posture WHERE workspace_id = '${prefix}-org'`);
    await client.query(`DELETE FROM webhook_deliveries WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM webhooks WHERE id LIKE '${prefix}-%'`);
    await client.query(
      `UPDATE channel_connections SET credentials_secret_id = NULL WHERE credentials_secret_id LIKE '${prefix}-%'`,
    );
    await client.query(
      `UPDATE tool_catalog_providers SET credentials_secret_id = NULL WHERE credentials_secret_id LIKE '${prefix}-%'`,
    );
    await client.query(`DELETE FROM tool_catalog_providers WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM secrets WHERE id LIKE '${prefix}-%'`);
    await client.query(
      `DELETE FROM conversation_turns WHERE id LIKE '${prefix}-%'`,
    );
    await client.query(
      `DELETE FROM conversations WHERE id LIKE '${prefix}-%'`,
    );
    await client.query(
      `DELETE FROM agent_guardrails WHERE id LIKE '${prefix}-%'`,
    );
    await client.query(
      `DELETE FROM agent_versions WHERE id LIKE '${prefix}-%'`,
    );
    await client.query(`DELETE FROM agents WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM channel_endpoints WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM channel_connections WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM organization WHERE id = '${prefix}-org'`);

    // ── 1. INSERT organization ──
    const orgRes = await client.query(
      `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at)
       VALUES ('${prefix}-org', 'S1-04 Smoke Org', 's1-04-smoke', 'production', 'us-east-1', 'none', now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    check("INSERT organization", (orgRes.rowCount ?? 0) > 0);
    const orgId = orgRes.rows[0].id;

    // ── 2. INSERT agent + agent_version (prereqs) ──
    await client.query(
      `INSERT INTO agents (id, workspace_id, status)
       VALUES ('${prefix}-agent', $1, 'draft')`,
      [orgId],
    );
    const avRes = await client.query(
      `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot)
       VALUES ('${prefix}-av1', '${prefix}-agent', 1, 'manual_save', '{}'::jsonb)
       RETURNING id`,
    );
    check("INSERT agent + version", (avRes.rowCount ?? 0) > 0);

    // ── 3. INSERT agent_guardrail (prereq for guardrail_events FK) ──
    const grRes = await client.query(
      `INSERT INTO agent_guardrails (id, agent_version_id, name, direction, evaluation_model, prompt, ordinal)
       VALUES ('${prefix}-gr1', '${prefix}-av1', 'smoke-guardrail', 'both', 'gpt-4', 'test prompt', 1)
       RETURNING id`,
    );
    check("INSERT agent_guardrails", (grRes.rowCount ?? 0) > 0);

    // ── 4. INSERT channel_connection + channel_endpoint (prereqs) ──
    await client.query(
      `INSERT INTO channel_connections (id, workspace_id, channel_kind, provider, display_name, status, config)
       VALUES ('${prefix}-conn', $1, 'voice', 'twilio', 'Smoke Conn', 'connected', '{}'::jsonb)`,
      [orgId],
    );
    const epRes = await client.query(
      `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier, attached_agent_id)
       VALUES ('${prefix}-ep', $1, '${prefix}-conn', 'voice', '+10000000000', '${prefix}-agent')
       RETURNING id`,
      [orgId],
    );
    check("INSERT channel_endpoint", (epRes.rowCount ?? 0) > 0);

    // ── 5. INSERT conversation + conversation_turn (prereqs) ──
    const convRes = await client.query(
      `INSERT INTO conversations (id, workspace_id, channel_kind, thread_key, started_at)
       VALUES ('${prefix}-conv', $1, 'voice', 'smoke-thread-1', now())
       RETURNING id`,
      [orgId],
    );
    check("INSERT conversation", (convRes.rowCount ?? 0) > 0);

    const turnRes = await client.query(
      `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, timestamp_sec)
       VALUES ('${prefix}-turn', '${prefix}-conv', 1, 'caller', 'hello', 1000)
       RETURNING id`,
    );
    check("INSERT conversation_turn", (turnRes.rowCount ?? 0) > 0);

    // ── 6. INSERT secrets ──
    const secRes = await client.query(
      `INSERT INTO secrets (id, workspace_id, name, ciphertext, kms_key_id, scope, agent_id, created_by_user_id)
       VALUES ('${prefix}-sec1', $1, 'smoke-secret', '\\xdeadbeef'::bytea, 'arn:aws:kms:us-east-1:123456:key/abc', 'workspace',
               NULL, NULL)
       RETURNING id`,
      [orgId],
    );
    check("INSERT secrets", (secRes.rowCount ?? 0) > 0);
    const secId = secRes.rows[0].id;

    // ── 7. INSERT webhooks ──
    const whRes = await client.query(
      `INSERT INTO webhooks (id, workspace_id, url, events, signing_secret)
       VALUES ('${prefix}-wh1', $1, 'https://example.com/hook', ARRAY['conversation.completed'], 'whsec_smoke')
       RETURNING id`,
      [orgId],
    );
    check("INSERT webhooks", (whRes.rowCount ?? 0) > 0);

    // ── 8. INSERT webhook_deliveries ──
    const wdRes = await client.query(
      `INSERT INTO webhook_deliveries (id, webhook_id, delivery_kind)
       VALUES ('${prefix}-wd1', '${prefix}-wh1', 'conversation_completed')
       RETURNING id`,
    );
    check("INSERT webhook_deliveries", (wdRes.rowCount ?? 0) > 0);

    // ── 9. Partition routing: insert into audit_log_events, verify in 2026_05 ──
    const aeRes = await client.query(
      `INSERT INTO audit_log_events (id, workspace_id, event, actor_kind, created_at)
       VALUES ('${prefix}-ae1', $1, 'agent.published', 'system', now())
       RETURNING id`,
      [orgId],
    );
    check("INSERT audit_log_events (parent)", (aeRes.rowCount ?? 0) > 0);

    const partRes = await client.query(
      `SELECT count(*) AS cnt FROM audit_log_events_2026_05 WHERE id = '${prefix}-ae1'`,
    );
    const cnt = parseInt(partRes.rows[0].cnt, 10);
    check("partition routing → 2026_05", cnt === 1, `got ${cnt}`);

    // ── 10. Late FK round-trip: channel_connections.credentials_secret_id ──
    await client.query(
      `UPDATE channel_connections SET credentials_secret_id = $1 WHERE id = '${prefix}-conn'`,
      [secId],
    );
    const ccFkRes = await client.query(
      `SELECT credentials_secret_id FROM channel_connections WHERE id = '${prefix}-conn'`,
    );
    check(
      "late FK channel_connections → secrets",
      ccFkRes.rows[0].credentials_secret_id === secId,
    );

    // Late FK round-trip: tool_catalog_providers.credentials_secret_id
    await client.query(
      `INSERT INTO tool_catalog_providers (id, workspace_id, kind, display_name, mcp_server_url, credentials_secret_id)
       VALUES ('${prefix}-tcp', $1, 'mcp-custom', 'Smoke Provider', 'https://mcp.example.com', $2)`,
      [orgId, secId],
    );
    const tcpFkRes = await client.query(
      `SELECT credentials_secret_id FROM tool_catalog_providers WHERE id = '${prefix}-tcp'`,
    );
    check(
      "late FK tool_catalog_providers → secrets",
      tcpFkRes.rows[0].credentials_secret_id === secId,
    );

    // ── 11. pg_constraint check for late FKs ──
    const pgcRes = await client.query(
      `SELECT count(*) AS cnt FROM pg_constraint
       WHERE conname IN ('channel_connections_credentials_secret_id_secrets_id_fk',
                         'tool_catalog_providers_credentials_secret_id_secrets_id_fk')`,
    );
    check("pg_constraint late FKs exist", parseInt(pgcRes.rows[0].cnt, 10) === 2);

    // ── 12. monthly_receipts UNIQUE (workspaceId, month) ──
    await client.query(
      `INSERT INTO monthly_receipts (id, workspace_id, month, recovered_revenue_usd, cost_usd, roi_multiplier, per_agent)
       VALUES ('${prefix}-mr1', $1, '2026-05', 100, 50, 2.0, '{}'::jsonb)`,
      [orgId],
    );
    let dupErr: unknown = null;
    try {
      await client.query(
        `INSERT INTO monthly_receipts (id, workspace_id, month, recovered_revenue_usd, cost_usd, roi_multiplier, per_agent)
         VALUES ('${prefix}-mr2', $1, '2026-05', 200, 100, 2.0, '{}'::jsonb)`,
        [orgId],
      );
    } catch (err: unknown) {
      dupErr = err;
    }
    check(
      "monthly_receipts UNIQUE (workspace_id, month) violation",
      dupErr instanceof Error &&
        dupErr.message.includes("monthly_receipts_workspace_month_uidx"),
    );

    // ── 13. usage_events.kind CHECK ──
    let ueErr: unknown = null;
    try {
      await client.query(
        `INSERT INTO usage_events (id, workspace_id, kind, quantity)
         VALUES ('${prefix}-ue1', $1, 'bogus_kind', 1)`,
        [orgId],
      );
    } catch (err: unknown) {
      ueErr = err;
    }
    check(
      "usage_events.kind CHECK (bogus → error)",
      ueErr instanceof Error &&
        ueErr.message.includes("usage_events_kind_check"),
    );

    // Valid usage_events insert
    const ueOk = await client.query(
      `INSERT INTO usage_events (id, workspace_id, kind, quantity)
       VALUES ('${prefix}-ue2', $1, 'llm_input_tokens', 1000)
       RETURNING id`,
      [orgId],
    );
    check("usage_events valid insert", (ueOk.rowCount ?? 0) > 0);

    // ── 14. compliance_evaluations.regulation CHECK ──
    let ceErr: unknown = null;
    try {
      await client.query(
        `INSERT INTO compliance_evaluations (id, workspace_id, regulation)
         VALUES ('${prefix}-ce1', $1, 'bogus_reg')`,
        [orgId],
      );
    } catch (err: unknown) {
      ceErr = err;
    }
    check(
      "compliance_evaluations.regulation CHECK (bogus → error)",
      ceErr instanceof Error &&
        ceErr.message.includes("compliance_evaluations_regulation_check"),
    );

    // Valid compliance_evaluations insert
    const ceOk = await client.query(
      `INSERT INTO compliance_evaluations (id, workspace_id, regulation, passed)
       VALUES ('${prefix}-ce2', $1, 'hipaa', true)
       RETURNING id`,
      [orgId],
    );
    check("compliance_evaluations valid insert", (ceOk.rowCount ?? 0) > 0);

    // ── 15. workspace_compliance_posture ──
    const wcpRes = await client.query(
      `INSERT INTO workspace_compliance_posture (workspace_id, hipaa, ferpa, tcpa, eu_ai_act)
       VALUES ($1, 'active', 'inactive', 'inactive', 'inactive')
       RETURNING workspace_id`,
      [orgId],
    );
    check("INSERT workspace_compliance_posture", (wcpRes.rowCount ?? 0) > 0);

    // ── 16. guardrail_events ──
    const geRes = await client.query(
      `INSERT INTO guardrail_events (id, conversation_id, turn_id, guardrail_id, action)
       VALUES ('${prefix}-ge1', '${prefix}-conv', '${prefix}-turn', '${prefix}-gr1', 'blocked')
       RETURNING id`,
    );
    check("INSERT guardrail_events", (geRes.rowCount ?? 0) > 0);

    // ── 17. billing_subscriptions ──
    const bsRes = await client.query(
      `INSERT INTO billing_subscriptions (workspace_id, plan, status)
       VALUES ($1, 'free', 'active')
       RETURNING workspace_id`,
      [orgId],
    );
    check("INSERT billing_subscriptions", (bsRes.rowCount ?? 0) > 0);

    // ── 18. batches + batch_recipients ──
    const baRes = await client.query(
      `INSERT INTO batches (id, workspace_id, name, channel_kind, vertical, status, total_recipients)
       VALUES ('${prefix}-b1', $1, 'Smoke Batch', 'voice', 'home-services', 'draft', 10)
       RETURNING id`,
      [orgId],
    );
    check("INSERT batches", (baRes.rowCount ?? 0) > 0);

    const brRes = await client.query(
      `INSERT INTO batch_recipients (id, batch_id, identifier, status)
       VALUES ('${prefix}-br1', '${prefix}-b1', '+10000000001', 'pending')
       RETURNING id`,
    );
    check("INSERT batch_recipients", (brRes.rowCount ?? 0) > 0);

    // Create a second org for workspace_compliance_posture CHECK test (workspace_id is PK)
    const org2Res = await client.query(
      `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at)
       VALUES ('${prefix}-org2', 'S1-04 Smoke Org 2', 's1-04-smoke2', 'production', 'us-east-1', 'none', now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    check("INSERT org2 for CHECK tests", (org2Res.rowCount ?? 0) > 0);
    const orgId2 = org2Res.rows[0].id;

    // ── 19. secrets UNIQUE (workspaceId, agentId, name) — use agent-scoped for the duplicate test ──
    await client.query(
      `INSERT INTO secrets (id, workspace_id, name, ciphertext, kms_key_id, scope, agent_id)
       VALUES ('${prefix}-sec-agent', $1, 'agent-secret', '\\xbeef'::bytea, 'arn:kms', 'agent', '${prefix}-agent')`,
      [orgId],
    );
    let secDupErr: unknown = null;
    try {
      await client.query(
        `INSERT INTO secrets (id, workspace_id, name, ciphertext, kms_key_id, scope, agent_id)
         VALUES ('${prefix}-sec-agent2', $1, 'agent-secret', '\\xdead'::bytea, 'arn:kms', 'agent', '${prefix}-agent')`,
        [orgId],
      );
    } catch (err: unknown) {
      secDupErr = err;
    }
    check(
      "secrets UNIQUE (workspace_id, agent_id, name) violation",
      secDupErr instanceof Error &&
        secDupErr.message.includes("secrets_workspace_agent_name_uidx"),
    );

    // ── 20. Enum CHECK constraints (additional coverage) ──
    const enumTests: Array<{
      label: string;
      sql: string;
      constraintName: string;
      params: unknown[];
    }> = [
      {
        label: "secrets.scope CHECK",
        sql: `INSERT INTO secrets (id, workspace_id, name, ciphertext, kms_key_id, scope)
              VALUES ('${prefix}-sec-bogus', $1, 'bogus-scope', '\\x00'::bytea, 'k', 'bogus')`,
        constraintName: "secrets_scope_check",
        params: [orgId],
      },
      {
        label: "webhook_deliveries.delivery_kind CHECK",
        sql: `INSERT INTO webhook_deliveries (id, webhook_id, delivery_kind)
              VALUES ('${prefix}-wd-bogus', '${prefix}-wh1', 'bogus_kind')`,
        constraintName: "webhook_deliveries_delivery_kind_check",
        params: [] as unknown[],
      },
      {
        label: "workspace_compliance_posture.hipaa CHECK",
        sql: `INSERT INTO workspace_compliance_posture (workspace_id, hipaa, ferpa, tcpa, eu_ai_act)
              VALUES ($1, 'bogus', 'inactive', 'inactive', 'inactive')`,
        constraintName: "workspace_compliance_posture_hipaa_check",
        params: [orgId2],
      },
      {
        label: "guardrail_events.action CHECK",
        sql: `INSERT INTO guardrail_events (id, conversation_id, action)
              VALUES ('${prefix}-ge-bogus', '${prefix}-conv', 'bogus')`,
        constraintName: "guardrail_events_action_check",
        params: [] as unknown[],
      },
      {
        label: "billing_subscriptions.plan CHECK",
        sql: `INSERT INTO billing_subscriptions (workspace_id, plan, status)
              VALUES ($1, 'bogus', 'active')`,
        constraintName: "billing_subscriptions_plan_check",
        params: [orgId2],
      },
      {
        label: "billing_subscriptions.status CHECK",
        sql: `INSERT INTO billing_subscriptions (workspace_id, plan, status)
              VALUES ($1, 'free', 'bogus')`,
        constraintName: "billing_subscriptions_status_check",
        params: [orgId2],
      },
      {
        label: "batches.channel_kind CHECK",
        sql: `INSERT INTO batches (id, workspace_id, name, channel_kind, vertical, status, total_recipients)
              VALUES ('${prefix}-b-bogus', $1, 'bogus', 'boguschan', 'home-services', 'draft', 1)`,
        constraintName: "batches_channel_kind_check",
        params: [orgId],
      },
      {
        label: "batches.vertical CHECK",
        sql: `INSERT INTO batches (id, workspace_id, name, channel_kind, vertical, status, total_recipients)
              VALUES ('${prefix}-b-bogus2', $1, 'bogus2', 'voice', 'bogus', 'draft', 1)`,
        constraintName: "batches_vertical_check",
        params: [orgId],
      },
      {
        label: "batches.status CHECK",
        sql: `INSERT INTO batches (id, workspace_id, name, channel_kind, vertical, status, total_recipients)
              VALUES ('${prefix}-b-bogus3', $1, 'bogus3', 'voice', 'home-services', 'bogus', 1)`,
        constraintName: "batches_status_check",
        params: [orgId],
      },
      {
        label: "batch_recipients.status CHECK",
        sql: `INSERT INTO batch_recipients (id, batch_id, identifier, status)
              VALUES ('${prefix}-br-bogus', '${prefix}-b1', '+x', 'bogus')`,
        constraintName: "batch_recipients_status_check",
        params: [] as unknown[],
      },
    ];

    for (const t of enumTests) {
      let enumErr: unknown = null;
      try {
        await client.query(t.sql, t.params);
      } catch (err: unknown) {
        enumErr = err;
      }
      check(
        t.label,
        enumErr instanceof Error && enumErr.message.includes(t.constraintName),
      );
    }

    // ── 21. Soft-delete column absence check (none of S1-04 tables get deletedAt) ──
    const colCheck = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('secrets','webhooks','webhook_deliveries','audit_log_events',
           'workspace_compliance_posture','compliance_evaluations','guardrail_events',
           'billing_subscriptions','usage_events','monthly_receipts','batches','batch_recipients')
         AND column_name = 'deleted_at'`,
    );
    check(
      "no S1-04 tables have deleted_at column",
      colCheck.rows.length === 0,
      `found ${colCheck.rows.length} tables with deleted_at`,
    );

    // ── Cleanup (NULL FKs before deleting referenced rows) ──
    await client.query(`DELETE FROM batch_recipients WHERE batch_id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM batches WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM monthly_receipts WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM usage_events WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM billing_subscriptions WHERE workspace_id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM guardrail_events WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM compliance_evaluations WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM workspace_compliance_posture WHERE workspace_id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM webhook_deliveries WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM webhooks WHERE id LIKE '${prefix}-%'`);
    await client.query(
      `UPDATE channel_connections SET credentials_secret_id = NULL WHERE credentials_secret_id LIKE '${prefix}-%'`,
    );
    await client.query(
      `UPDATE tool_catalog_providers SET credentials_secret_id = NULL WHERE credentials_secret_id LIKE '${prefix}-%'`,
    );
    await client.query(`DELETE FROM tool_catalog_providers WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM secrets WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM conversation_turns WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM conversations WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM agent_guardrails WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM channel_endpoints WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM channel_connections WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM agent_versions WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM agents WHERE id LIKE '${prefix}-%'`);
    await client.query(`DELETE FROM organization WHERE id LIKE '${prefix}-%'`);
    console.log("\n  (cleanup done)");
  } finally {
    await client.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFAILURES:");
    for (const e of errors) console.error(e);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error("FATAL:", e);
  process.exit(1);
});
