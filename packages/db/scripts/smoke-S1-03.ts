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
    console.log("S1-03 smoke — channels + conversations + runtime sidecars\n");

    // 0. Cleanup any leftovers
    const testPrefix = "test-s1-03";
    await client.query(`DELETE FROM conversation_tool_calls WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM conversation_turns WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM conversation_evals WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM conversation_extracted_fields WHERE conversation_id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM session_checkpoints WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM runtime_sessions WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM voice_calls WHERE conversation_id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM messaging_threads WHERE workspace_id = '${testPrefix}-org'`);
    await client.query(`DELETE FROM conversations WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM routing_rules WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM channel_endpoints WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM channel_connections WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM runtime_deployments WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM agent_eval_criteria WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM agent_versions WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM agents WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM organization WHERE id = '${testPrefix}-org'`);

    // 1. INSERT organization
    const orgRes = await client.query(
      `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at)
       VALUES ('${testPrefix}-org', 'S1-03 Smoke Org', 's1-03-smoke', 'production', 'us-east-1', 'none', now())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    check("INSERT organization", orgRes.rowCount! > 0);
    const orgId = orgRes.rows[0].id;

    // 2. INSERT agent + agent_version (pre-req for FK refs)
    const agRes = await client.query(
      `INSERT INTO agents (id, workspace_id, status)
       VALUES ('${testPrefix}-agent', $1, 'draft')
       RETURNING id`,
      [orgId],
    );
    check("INSERT agents", agRes.rowCount! > 0);

    const avRes = await client.query(
      `INSERT INTO agent_versions (id, agent_id, version_number, version_kind, snapshot)
       VALUES ('${testPrefix}-av1', '${testPrefix}-agent', 1, 'manual_save', '{}'::jsonb)
       RETURNING id`,
    );
    check("INSERT agent_versions", avRes.rowCount! > 0);
    const avId = avRes.rows[0].id;

    // 3. INSERT channel_connections (kind='voice')
    const connRes = await client.query(
      `INSERT INTO channel_connections (id, workspace_id, channel_kind, provider, display_name, status, config)
       VALUES ('${testPrefix}-conn', $1, 'voice', 'twilio-native', 'Test Voice', 'connected', '{}'::jsonb)
       RETURNING id`,
      [orgId],
    );
    check("INSERT channel_connections (voice)", connRes.rowCount! > 0);
    const connId = connRes.rows[0].id;

    // 4. INSERT channel_endpoints with matching kind='voice' — should succeed
    const epRes = await client.query(
      `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier, attached_agent_id)
       VALUES ('${testPrefix}-ep1', $1, $2, 'voice', '+15551234567', '${testPrefix}-agent')
       RETURNING id`,
      [orgId, connId],
    );
    check("INSERT channel_endpoints (voice, matches connection)", epRes.rowCount! > 0);

    // 5. INSERT channel_endpoints with mismatched kind='whatsapp' against voice connection
    // MUST raise from polymorphic CHECK trigger
    let triggerFired = false;
    let triggerMsg = "";
    try {
      await client.query(
        `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier, attached_agent_id)
         VALUES ('${testPrefix}-ep-bad', $1, $2, 'whatsapp', '+15559876543', '${testPrefix}-agent')`,
        [orgId, connId],
      );
    } catch (e: unknown) {
      triggerFired = true;
      triggerMsg = e instanceof Error ? e.message : String(e);
    }
    check("Polymorphic CHECK trigger fires (mismatched channelKind)", triggerFired);
    check(
      "  error contains 'does not match'",
      triggerMsg.includes("does not match"),
      triggerMsg,
    );

    // 6. INSERT runtime_deployments
    const depRes = await client.query(
      `INSERT INTO runtime_deployments (id, workspace_id, kind, status, region, platform, compliance_mode, isolation_kind)
       VALUES ('${testPrefix}-dep', $1, 'voice_dedicated', 'ready', 'us-east-1', 'cloudflare', 'none', 'per-conversation')
       RETURNING id`,
      [orgId],
    );
    check("INSERT runtime_deployments", depRes.rowCount! > 0);
    const depId = depRes.rows[0].id;

    // 7. INSERT conversation referencing deployment
    const cvRes = await client.query(
      `INSERT INTO conversations (id, workspace_id, agent_id, agent_version_id, channel_kind, channel_endpoint_id, thread_key, deployment_id)
       VALUES ('${testPrefix}-cv', $1, '${testPrefix}-agent', $2, 'voice', '${testPrefix}-ep1', 'voice:test-call-sid', $3)
       RETURNING id`,
      [orgId, avId, depId],
    );
    check("INSERT conversation (with deployment FK)", cvRes.rowCount! > 0);
    const cvId = cvRes.rows[0].id;

    // 8. INSERT two conversation_turns with same non-NULL messageId → second must fail
    const turn1Res = await client.query(
      `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, message_id, timestamp_sec)
       VALUES ('${testPrefix}-turn1', $1, 1, 'caller', 'Hello?', 'wamid.XYZ123', 0)`,
      [cvId],
    );
    check("INSERT conversation_turn 1 (messageId='wamid.XYZ123')", turn1Res.rowCount! > 0);

    let dedupFired = false;
    let dedupMsg = "";
    try {
      await client.query(
        `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, message_id, timestamp_sec)
         VALUES ('${testPrefix}-turn-dup', $1, 2, 'caller', 'Duplicate?', 'wamid.XYZ123', 5000)`,
        [cvId],
      );
    } catch (e: unknown) {
      dedupFired = true;
      dedupMsg = e instanceof Error ? e.message : String(e);
    }
    check("MessageId dedup index rejects duplicate (conversation_id, message_id)", dedupFired);
    check(
      "  error contains 'conversation_turns_message_dedup_idx' or 'duplicate key'",
      dedupMsg.includes("conversation_turns_message_dedup_idx") ||
        dedupMsg.includes("duplicate key"),
      dedupMsg,
    );

    // 9. Two voice turns with NULL messageId on same conversation — must succeed (not constrained by partial index)
    const turnVoice1 = await client.query(
      `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, timestamp_sec)
       VALUES ('${testPrefix}-turn-voice-1', $1, 3, 'agent', 'How can I help?', 1000)`,
      [cvId],
    );
    check("INSERT voice turn 1 (NULL messageId)", turnVoice1.rowCount! > 0);

    const turnVoice2 = await client.query(
      `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, timestamp_sec)
       VALUES ('${testPrefix}-turn-voice-2', $1, 4, 'caller', 'I need HVAC service.', 2000)`,
      [cvId],
    );
    check("INSERT voice turn 2 (NULL messageId) succeeds - partial index doesn't constrain NULL", turnVoice2.rowCount! > 0);

    // 10. INSERT runtime_session
    const sessRes = await client.query(
      `INSERT INTO runtime_sessions (id, conversation_id, agent_id, agent_version_id, deployment_id, working_memory)
       VALUES ('${testPrefix}-sess', $1, '${testPrefix}-agent', $2, $3, '{}'::jsonb)
       RETURNING id`,
      [cvId, avId, depId],
    );
    check("INSERT runtime_session (UNIQUE conversationId)", sessRes.rowCount! > 0);
    const sessId = sessRes.rows[0].id;

    // 11. INSERT two session_checkpoints
    const cp1Res = await client.query(
      `INSERT INTO session_checkpoints (id, session_id, trigger, state)
       VALUES ('${testPrefix}-cp1', $1, 'tool-result', '{}'::jsonb)`,
      [sessId],
    );
    check("INSERT session_checkpoint 1", cp1Res.rowCount! > 0);

    const cp2Res = await client.query(
      `INSERT INTO session_checkpoints (id, session_id, trigger, state)
       VALUES ('${testPrefix}-cp2', $1, 'flow-transition', '{}'::jsonb)`,
      [sessId],
    );
    check("INSERT session_checkpoint 2", cp2Res.rowCount! > 0);

    // AC 5: verify CHECK prevents channel_connections with bogus channelKind
    let bogusKindFired = false;
    let bogusKindMsg = "";
    try {
      await client.query(
        `INSERT INTO channel_connections (id, workspace_id, channel_kind, provider, display_name, status, config)
         VALUES ('${testPrefix}-conn-bad', $1, 'bogus', 'twilio-native', 'Bad', 'connected', '{}'::jsonb)`,
        [orgId],
      );
    } catch (e: unknown) {
      bogusKindFired = true;
      bogusKindMsg = e instanceof Error ? e.message : String(e);
    }
    check("channel_kind CHECK rejects 'bogus'", bogusKindFired);
    check(
      "  error contains 'channel_connections_channel_kind_check'",
      bogusKindMsg.includes("channel_connections_channel_kind_check"),
      bogusKindMsg,
    );

    // AC 5 continued: verify CHECK prevents channel_endpoints without agent or rules
    let noAttachmentFired = false;
    let noAttachmentMsg = "";
    try {
      await client.query(
        `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier)
         VALUES ('${testPrefix}-ep-no-attach', $1, $2, 'voice', '+15550009999')`,
        [orgId, connId],
      );
    } catch (e: unknown) {
      noAttachmentFired = true;
      noAttachmentMsg = e instanceof Error ? e.message : String(e);
    }
    check("channel_endpoints attachment CHECK rejects NULL agent AND NULL rules", noAttachmentFired);
    check(
      "  error contains 'channel_endpoints_attachment_check'",
      noAttachmentMsg.includes("channel_endpoints_attachment_check"),
      noAttachmentMsg,
    );

    // 12. UNIQUE constraints (gate-S1-03 Apply-now item 6)
    // 12a. channel_endpoints UNIQUE (channel_kind, identifier)
    let epDupFired = false;
    try {
      await client.query(
        `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier, attached_agent_id)
         VALUES ('${testPrefix}-ep-dup', $1, '${testPrefix}-conn', 'voice', '+15551234567', '${testPrefix}-agent')`,
        [orgId],
      );
    } catch {
      epDupFired = true;
    }
    check(
      "UNIQUE (channel_kind, identifier) on channel_endpoints blocks dup",
      epDupFired,
    );

    // 12b. conversations UNIQUE (workspace_id, thread_key, started_at)
    // Pull started_at as text (microsecond-stable round-trip) and reuse via SET
    // — passing Date objects loses sub-millisecond precision in the pg driver.
    let cvDupFired = false;
    let cvDupMsg = "";
    try {
      await client.query(
        `INSERT INTO conversations (id, workspace_id, agent_id, agent_version_id, channel_kind, channel_endpoint_id, thread_key, deployment_id, started_at)
         SELECT '${testPrefix}-cv-dup', $1, '${testPrefix}-agent', $2, 'voice', '${testPrefix}-ep1', 'voice:test-call-sid', $3, started_at
         FROM conversations WHERE id = '${testPrefix}-cv'`,
        [orgId, avId, depId],
      );
    } catch (e) {
      cvDupFired = true;
      cvDupMsg = e instanceof Error ? e.message : String(e);
    }
    check(
      "UNIQUE (workspace_id, thread_key, started_at) on conversations blocks dup",
      cvDupFired,
      cvDupMsg,
    );

    // 12c. conversation_turns UNIQUE (conversation_id, ordinal)
    let turnOrdDupFired = false;
    try {
      await client.query(
        `INSERT INTO conversation_turns (id, conversation_id, ordinal, speaker, text, timestamp_sec)
         VALUES ('${testPrefix}-turn-dup-ord', $1, 1, 'agent', 'dup', 0)`,
        [cvId],
      );
    } catch {
      turnOrdDupFired = true;
    }
    check(
      "UNIQUE (conversation_id, ordinal) on conversation_turns blocks dup",
      turnOrdDupFired,
    );

    // 12d. runtime_sessions.conversation_id UNIQUE
    let sessDupFired = false;
    try {
      await client.query(
        `INSERT INTO runtime_sessions (id, conversation_id, agent_id, agent_version_id, deployment_id, working_memory)
         VALUES ('${testPrefix}-sess-dup', $1, '${testPrefix}-agent', $2, $3, '{}'::jsonb)`,
        [cvId, avId, depId],
      );
    } catch {
      sessDupFired = true;
    }
    check(
      "UNIQUE conversation_id on runtime_sessions blocks dup",
      sessDupFired,
    );

    // 13. Mutual-FK creation order: channel_endpoint exists, then routing_rule references it,
    // then UPDATE endpoint with routingRulesId — succeeds (proving the late FK round-trips).
    const epRouteRes = await client.query(
      `INSERT INTO channel_endpoints (id, workspace_id, connection_id, channel_kind, identifier, attached_agent_id)
       VALUES ('${testPrefix}-ep-route', $1, '${testPrefix}-conn', 'voice', '+15559999000', '${testPrefix}-agent')
       RETURNING id`,
      [orgId],
    );
    check("INSERT endpoint (no routing_rules_id yet)", epRouteRes.rowCount! > 0);

    const ruleRes = await client.query(
      `INSERT INTO routing_rules (id, channel_endpoint_id, rule_kind, agent_id)
       VALUES ('${testPrefix}-rule', '${testPrefix}-ep-route', 'default', '${testPrefix}-agent')
       RETURNING id`,
    );
    check("INSERT routing_rules (references endpoint)", ruleRes.rowCount! > 0);

    const updRes = await client.query(
      `UPDATE channel_endpoints SET routing_rules_id = '${testPrefix}-rule' WHERE id = '${testPrefix}-ep-route'`,
    );
    check(
      "UPDATE channel_endpoint with routing_rules_id (mutual-FK round-trip)",
      (updRes.rowCount ?? 0) > 0,
    );

    // 14. Cleanup
    await client.query(
      `UPDATE channel_endpoints SET routing_rules_id = NULL WHERE id LIKE '${testPrefix}-%'`,
    );
    await client.query(`DELETE FROM routing_rules WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM session_checkpoints WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM runtime_sessions WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM conversation_turns WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM conversations WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM channel_endpoints WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM channel_connections WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM runtime_deployments WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM agent_versions WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM agents WHERE id LIKE '${testPrefix}-%'`);
    await client.query(`DELETE FROM organization WHERE id = '${testPrefix}-org'`);
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

main().catch((e: unknown) => {
  console.error("FATAL:", e);
  process.exit(1);
});
