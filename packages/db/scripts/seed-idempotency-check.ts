import { Pool } from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../apps/server/.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
});

const TABLES = [
  { table: "organization", where: `id = 'ws_calderon'` },
  { table: "agents", where: `workspace_id = 'ws_calderon'` },
  { table: "agent_versions", where: `id IN ('av_calderon_dispatcher_v1','av_calderon_intake_v1','av_calderon_titleix_v1')` },
  { table: "channel_connections", where: `id = 'ch_calderon_voice'` },
  { table: "channel_endpoints", where: `id = 'ce_calderon_e164_main'` },
  { table: "conversations", where: `id LIKE 'cv_calderon_%'` },
  { table: "conversation_turns", where: `id LIKE 'cvt_%'` },
  { table: "kb_documents", where: `id = 'kb_calderon_pricing_q4'` },
  { table: "webhooks", where: `id = 'wh_calderon_main'` },
] as const;

async function getCounts(): Promise<Map<string, number>> {
  const client = await pool.connect();
  const counts = new Map<string, number>();
  try {
    for (const { table, where } of TABLES) {
      const res = await client.query(
        `SELECT count(*) as c FROM ${table} WHERE ${where}`,
      );
      counts.set(table, Number(res.rows[0].c));
    }
  } finally {
    client.release();
  }
  return counts;
}

function printCounts(label: string, counts: Map<string, number>) {
  console.log(`\n=== ${label} ===`);
  for (const { table } of TABLES) {
    console.log(`  ${table}: ${counts.get(table) ?? "???"}`);
  }
}

async function main() {
  // Run seed once
  console.log("[check] Running seed (first pass)…");
  execSync("bun " + path.resolve(__dirname, "seed-calderon.ts"), {
    stdio: "inherit",
    env: process.env,
  });

  const counts1 = await getCounts();
  printCounts("After first run", counts1);

  // Run seed again
  console.log("\n[check] Running seed (second pass)…");
  execSync("bun " + path.resolve(__dirname, "seed-calderon.ts"), {
    stdio: "inherit",
    env: process.env,
  });

  const counts2 = await getCounts();
  printCounts("After second run", counts2);

  // Compare
  let pass = true;
  console.log("\n=== Comparison ===");
  for (const { table } of TABLES) {
    const a = counts1.get(table) ?? -1;
    const b = counts2.get(table) ?? -1;
    const ok = a === b;
    console.log(`  ${table}: ${a} vs ${b} — ${ok ? "MATCH" : "MISMATCH"}`);
    if (!ok) pass = false;
  }

  if (pass) {
    console.log("\nPASS — idempotency verified");
  } else {
    console.error("\nFAIL — row counts differ between runs");
  }

  await pool.end();
  process.exit(pass ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
