import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Workerd-side SLO config — exercises the REAL `MessagingDO` (extending
 * `@ariaflowagents/cf-agent` `AriaFlowAgent`) inside a Cloudflare Workers
 * runtime. Cannot run in Node because cf-agent uses `cloudflare:workers`
 * imports that require workerd. Uses `@cloudflare/vitest-pool-workers` per the
 * CF docs ("Test APIs · Workers Vitest integration").
 *
 * Wrangler config points at `./wrangler.jsonc` so DO bindings + queue
 * producers + vars are wired exactly as in production. SQLite-backed DOs
 * require `new_sqlite_classes` in `wrangler.jsonc` migrations (cf-agent's
 * AriaFlowAgent uses SQLite via `this.sql` from `@cloudflare/ai-chat`).
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
    }),
  ],
  test: {
    include: ["src/__tests__/slo-do-*.test.ts"],
    testTimeout: 60_000,
  },
});
