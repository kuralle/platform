import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workerd-side SLO config — exercises the REAL `MessagingDO` (extending
 * `@kuralle-agents/cf-agent` `KuralleAgent`) inside a Cloudflare Workers
 * runtime. Cannot run in Node because cf-agent uses `cloudflare:workers`
 * imports that require workerd. Uses `@cloudflare/vitest-pool-workers` per the
 * CF docs ("Test APIs · Workers Vitest integration").
 *
 * Wrangler config points at `./wrangler.jsonc` so DO bindings + queue
 * producers + vars are wired exactly as in production. SQLite-backed DOs
 * require `new_sqlite_classes` in `wrangler.jsonc` migrations (cf-agent's
 * KuralleAgent uses SQLite via `this.sql` from `@cloudflare/ai-chat`).
 */
export default defineConfig({
  // pg's CJS graph cannot load in the workerd pool; tests run the designed
  // neon fallback (wrangler.test.jsonc has no HYPERDRIVE binding), so pg is
  // replaced with a loud stub that only needs to parse.
  resolve: { alias: { pg: new URL("./src/__tests__/pg-stub.ts", import.meta.url).pathname } },
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.test.jsonc",
      },
    }),
  ],
  test: {
    include: [
      "src/__tests__/slo-do-*.test.ts",
      "src/__tests__/launch-gate.e2e.test.ts",
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // One shared Postgres + one queue-consumer pipeline: parallel test files
    // cross-pollute the DLQ/turn tables. Serial execution keeps per-test
    // assertions (e.g. the gate's DLQ-empty check) sound.
    fileParallelism: false,
  },
});
