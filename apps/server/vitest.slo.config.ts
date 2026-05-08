import { defineConfig } from "vitest/config";

/**
 * Node-side SLO config — exercises the projector pipeline (queue → projector
 * → DB → conversations.get) using events shaped EXACTLY as the real adapter
 * emits. Excludes `slo-do-*.test.ts` (those run in workerd via
 * vitest.slo.do.config.ts because they import `MessagingDO`, which extends
 * `cloudflare:workers` types and cannot be loaded in Node).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    pool: "forks",
    include: ["src/__tests__/slo-*.test.ts"],
    exclude: ["src/__tests__/slo-do-*.test.ts"],
    testTimeout: 60_000,
  },
});
