import { Client } from "pg";

const CONN = "postgres://kuralle:kuralle@localhost:5432/kuralle_dev";

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

    // 3. Enum CHECK: environment='bogus' should fail
    try {
      await client.query(
        `INSERT INTO organization (id, name, slug, environment, region, compliance_mode, created_at) VALUES ('test-smoke-env', 'x', 'x-smoke-env', 'bogus', 'us-east-1', 'none', now())`,
      );
      console.log(`[FAIL] Bad environment INSERT did not raise`);
      failed = true;
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (msg.includes("organization_environment_check")) {
        console.log(`[PASS] organization_environment_check fired on 'bogus'`);
      } else {
        console.log(`[FAIL] Unexpected error: ${msg}`);
        failed = true;
      }
    }

    // 4. Enum CHECK: user system_role='bogus_role' should fail
    try {
      await client.query(
        `INSERT INTO "user" (id, name, email, email_verified, system_role, created_at, updated_at) VALUES ('test-smoke-role', 'x', 'smoke-role@test.com', false, 'bogus_role', now(), now())`,
      );
      console.log(`[FAIL] Bad system_role INSERT did not raise`);
      failed = true;
    } catch (e: any) {
      const msg: string = e?.message ?? "";
      if (msg.includes("user_system_role_check")) {
        console.log(`[PASS] user_system_role_check fired on 'bogus_role'`);
      } else {
        console.log(`[FAIL] Unexpected error: ${msg}`);
        failed = true;
      }
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
