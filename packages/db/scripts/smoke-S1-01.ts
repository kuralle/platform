import { Client } from "pg";

const CONN = "postgres://kuralle:kuralle@localhost:5432/kuralle_dev";

type EnumCheckCase = {
  label: string;
  insertSql: string;
  expectedConstraint: string;
};

async function expectCheckViolation(
  client: Client,
  c: EnumCheckCase,
): Promise<boolean> {
  try {
    await client.query(c.insertSql);
    console.log(`[FAIL] ${c.label}: bad INSERT did not raise`);
    return false;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes(c.expectedConstraint)) {
      console.log(
        `[PASS] ${c.label}: ${c.expectedConstraint} fired`,
      );
      return true;
    }
    console.log(`[FAIL] ${c.label}: unexpected error: ${msg}`);
    return false;
  }
}

async function smoke() {
  const client = new Client({ connectionString: CONN });
  await client.connect();

  let failed = false;

  try {
    // 1. Voices seed: workspaceId IS NULL count >= 4
    const voices = await client.query(
      `SELECT count(*) as c FROM voices WHERE workspace_id IS NULL`,
    );
    const voiceCount = Number(voices.rows[0].c);
    console.log(`[PASS] Voices stock catalogue count: ${voiceCount}`);
    if (voiceCount < 4) {
      console.log(`[FAIL] Expected >= 4 stock voices, got ${voiceCount}`);
      failed = true;
    }

    // 2. ivfflat index exists
    const idx = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'kb_chunks_embedding_idx'`,
    );
    const idxCount = idx.rows.length;
    console.log(`[PASS] kb_chunks_embedding_idx rows: ${idxCount}`);
    if (idxCount !== 1) {
      console.log(`[FAIL] Expected 1 ivfflat index row, got ${idxCount}`);
      failed = true;
    }

    // 2b. kb_documents soft-delete partial index exists (S1-01-fix)
    const partial = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'kb_documents_workspace_deleted_idx'`,
    );
    const partialCount = partial.rows.length;
    console.log(
      `[PASS] kb_documents_workspace_deleted_idx rows: ${partialCount}`,
    );
    if (partialCount !== 1) {
      console.log(`[FAIL] Expected 1 partial index row, got ${partialCount}`);
      failed = true;
    }

    // 3. All 4 S0 enum CHECKs fire (BL-S0-02)
    const s0Cases: EnumCheckCase[] = [
      {
        label: "organization.environment='bogus'",
        insertSql: `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at) VALUES ('test-smoke-env', 'x', 'x-smoke-env', 'bogus', 'us-east-1', 'none', now())`,
        expectedConstraint: "organization_environment_check",
      },
      {
        label: "organization.region='bogus_region'",
        insertSql: `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at) VALUES ('test-smoke-region', 'x', 'x-smoke-region', 'production', 'bogus_region', 'none', now())`,
        expectedConstraint: "organization_region_check",
      },
      {
        label: "organization.compliance_mode='bogus_mode'",
        insertSql: `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at) VALUES ('test-smoke-mode', 'x', 'x-smoke-mode', 'production', 'us-east-1', 'bogus_mode', now())`,
        expectedConstraint: "organization_compliance_mode_check",
      },
      {
        label: "user.system_role='bogus_role'",
        insertSql: `INSERT INTO "user" (id, name, email, email_verified, system_role, created_at, updated_at) VALUES ('test-smoke-role', 'x', 'smoke-role@test.com', false, 'bogus_role', now(), now())`,
        expectedConstraint: "user_system_role_check",
      },
    ];

    for (const c of s0Cases) {
      const ok = await expectCheckViolation(client, c);
      if (!ok) failed = true;
    }

    // 4. New (S1-01-fix) enum CHECKs on tools/kb/voices/tcp fire
    // Need a valid workspace for FK
    await client.query(
      `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at) VALUES ('test-smoke-ws', 'WS', 'ws-smoke', 'production', 'us-east-1', 'none', now()) ON CONFLICT DO NOTHING`,
    );

    const s101Cases: EnumCheckCase[] = [
      {
        label: "kb_documents.source='bogus'",
        insertSql: `INSERT INTO kb_documents (id, workspace_id, name, source, size_bytes, status, created_at) VALUES ('test-kb-src', 'test-smoke-ws', 'd', 'bogus', 0, 'ready', now())`,
        expectedConstraint: "kb_documents_source_check",
      },
      {
        label: "kb_documents.status='bogus'",
        insertSql: `INSERT INTO kb_documents (id, workspace_id, name, source, size_bytes, status, created_at) VALUES ('test-kb-st', 'test-smoke-ws', 'd', 'file', 0, 'bogus', now())`,
        expectedConstraint: "kb_documents_status_check",
      },
      {
        label: "tools.kind='bogus'",
        insertSql: `INSERT INTO tools (id, workspace_id, name, kind, config, status, created_at) VALUES ('test-tool-k', 'test-smoke-ws', 't', 'bogus', '{}'::jsonb, 'active', now())`,
        expectedConstraint: "tools_kind_check",
      },
      {
        label: "tools.status='bogus'",
        insertSql: `INSERT INTO tools (id, workspace_id, name, kind, config, status, created_at) VALUES ('test-tool-s', 'test-smoke-ws', 't', 'webhook', '{}'::jsonb, 'bogus', now())`,
        expectedConstraint: "tools_status_check",
      },
      {
        label: "tool_catalog_providers.kind='bogus'",
        insertSql: `INSERT INTO tool_catalog_providers (id, workspace_id, kind, display_name, mcp_server_url, auth_mode, status, created_at) VALUES ('test-tcp-k', 'test-smoke-ws', 'bogus', 'd', 'http://x', 'none', 'connected', now())`,
        expectedConstraint: "tool_catalog_providers_kind_check",
      },
      {
        label: "tool_catalog_providers.auth_mode='bogus'",
        insertSql: `INSERT INTO tool_catalog_providers (id, workspace_id, kind, display_name, mcp_server_url, auth_mode, status, created_at) VALUES ('test-tcp-a', 'test-smoke-ws', 'composio', 'd', 'http://x', 'bogus', 'connected', now())`,
        expectedConstraint: "tool_catalog_providers_auth_mode_check",
      },
      {
        label: "tool_catalog_providers.status='bogus'",
        insertSql: `INSERT INTO tool_catalog_providers (id, workspace_id, kind, display_name, mcp_server_url, auth_mode, status, created_at) VALUES ('test-tcp-s', 'test-smoke-ws', 'composio', 'd', 'http://x', 'none', 'bogus', now())`,
        expectedConstraint: "tool_catalog_providers_status_check",
      },
      {
        label: "voices.provider='bogus'",
        insertSql: `INSERT INTO voices (id, external_id, provider, name, language, created_at) VALUES ('test-voice-p', 'test', 'bogus', 'V', 'en-US', now())`,
        expectedConstraint: "voices_provider_check",
      },
    ];

    for (const c of s101Cases) {
      const ok = await expectCheckViolation(client, c);
      if (!ok) failed = true;
    }

    // 5. Verify valid INSERT works
    await client.query(
      `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at) VALUES ('test-smoke-valid', 'Valid Org', 'valid-smoke', 'production', 'us-east-1', 'none', now()) ON CONFLICT DO NOTHING`,
    );
    console.log(`[PASS] Valid organization INSERT succeeded`);

    // Cleanup
    await client.query(`DELETE FROM organization WHERE id LIKE 'test-smoke-%'`);
    console.log(`[PASS] Cleanup complete`);
  } finally {
    await client.end();
  }

  if (failed) {
    console.log(`\nSMOKE RESULT: RED`);
    process.exit(1);
  }
  console.log(`\nSMOKE RESULT: GREEN`);
  process.exit(0);
}

smoke().catch((e) => {
  console.error("Smoke runner crashed:", e);
  process.exit(1);
});
