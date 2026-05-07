import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../apps/server/.env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const DATABASE_URL = process.env.DATABASE_URL!;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

let seedEmail = `smoke-${randomUUID().slice(0, 8)}@kuralle-test.local`;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--seed-email" && i + 1 < args.length) {
    seedEmail = args[i + 1]!;
    i++;
  }
}

const name = "Smoke Test User";
const password = `Smoke${randomUUID().slice(0, 10)}!`;

function log(...parts: unknown[]) {
  process.stdout.write(`[smoke] ${parts.join(" ")}\n`);
}

function fail(reason: string): never {
  log(`FAIL: ${reason}`);
  process.exit(1);
}

async function main() {
  log(`seedEmail=${seedEmail} name="${name}"`);

  const pg = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const schema = await import("@kuralle/db/schema/auth");
  const { createKuralleBetterAuth } = await import("./create-kuralle-auth");

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });

  const auth = createKuralleBetterAuth(db, {
    corsOrigin: process.env.CORS_ORIGIN!,
    betterAuthSecret: process.env.BETTER_AUTH_SECRET!,
    betterAuthUrl: BETTER_AUTH_URL,
  });

  log("Signing up…");
  const signUpResult = await auth.api.signUpEmail({
    body: { email: seedEmail, password, name },
    headers: new Headers({ "Content-Type": "application/json" }),
  } as never);

  let userId: string | null = null;
  if (signUpResult instanceof Response) {
    const status = signUpResult.status;
    const text = await signUpResult.text().catch(() => "");
    log(`Sign-up status=${status} body=${text.slice(0, 200)}`);
    if (status >= 400) fail(`sign-up returned ${status}: ${text}`);
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      userId = (json?.user as Record<string, unknown>)?.id as string ?? null;
    } catch {
      log("Could not parse JSON response");
    }
  }

  if (!userId) {
    const userByEmail = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [seedEmail]);
    userId = userByEmail.rows[0]?.id ?? null;
  }
  if (!userId) fail("Could not extract userId from sign-up result or DB");
  log(`userId=${userId}`);

  const userRows = await pool.query(`SELECT * FROM "user" WHERE email = $1`, [seedEmail]);
  if (userRows.rows.length !== 1) fail(`Expected 1 user row, got ${userRows.rows.length}`);
  const userRow = userRows.rows[0];
  log(`✓ user: id=${userRow.id} email=${userRow.email} name=${userRow.name}`);

  const orgRows = await pool.query(
    `SELECT * FROM "organization" WHERE "created_by_user_id" = $1 AND "is_personal" = true`,
    [userRow.id],
  );
  if (orgRows.rows.length !== 1) fail(`Expected 1 personal org, got ${orgRows.rows.length}`);
  const orgRow = orgRows.rows[0];
  log(`✓ org: id=${orgRow.id} name="${orgRow.name}" isPersonal=${orgRow.is_personal}`);
  if (orgRow.created_by_user_id !== userRow.id) fail("org userId mismatch");

  const memberRows = await pool.query(
    `SELECT * FROM "member" WHERE "user_id" = $1 AND "organization_id" = $2 AND "role" = 'owner'`,
    [userRow.id, orgRow.id],
  );
  if (memberRows.rows.length !== 1) fail(`Expected 1 member, got ${memberRows.rows.length}`);
  const memberRow = memberRows.rows[0];
  log(`✓ member: id=${memberRow.id} role=${memberRow.role}`);

  const sessionRows = await pool.query(
    `SELECT * FROM "session" WHERE "user_id" = $1 ORDER BY "created_at" DESC LIMIT 1`,
    [userRow.id],
  );
  if (sessionRows.rows.length !== 1) fail(`Expected 1 session, got ${sessionRows.rows.length}`);
  const sessionRow = sessionRows.rows[0];
  log(`✓ session: activeOrganizationId=${sessionRow.active_organization_id}`);

  if (sessionRow.active_organization_id !== orgRow.id) {
    fail(`session.activeOrganizationId ${sessionRow.active_organization_id} != org.id ${orgRow.id}`);
  }

  const output = [
    "=== S0-03 Sign-Up Smoke Test Results ===",
    `timestamp: ${new Date().toISOString()}`,
    `seedEmail: ${seedEmail}`,
    "",
    "--- user ---",
    ...Object.entries(userRow).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "--- organization ---",
    ...Object.entries(orgRow).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "--- member ---",
    ...Object.entries(memberRow).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "--- session ---",
    `  id: ${sessionRow.id}`,
    `  activeOrganizationId: ${sessionRow.active_organization_id}`,
    "",
    "ALL FOUR ROWS VERIFIED ✓",
  ].join("\n");

  const fs = await import("node:fs");
  const path = await import("node:path");
  const artifactsDir = path.join(__dirname, "../../../sprints/sprint-0/artifacts");
  fs.writeFileSync(path.join(artifactsDir, "S0-03-rows.txt"), output + "\n");

  log("✓ ALL FOUR ROWS VERIFIED");
  log("Artifact written to S0-03-rows.txt");
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  log("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
