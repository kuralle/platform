import { defineConfig } from "vitest/config";

/**
 * Default server test config. SLO tests are gated to their own configs
 * (`vitest.slo.config.ts` for Node-side, `vitest.slo.do.config.ts` for
 * workerd-side via @cloudflare/vitest-pool-workers) so the default `test`
 * script doesn't pick them up — they have separate scripts (`test:slo`,
 * `test:slo:do`).
 *
 * The exclude on `slo-*.test.ts` matters because slo-do-*.test.ts imports
 * `cloudflare:workers` which only resolves under the workerd-backed pool.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    pool: "forks",
    exclude: ["**/node_modules/**", "**/dist/**", "**/slo-*.test.ts"],
  },
});
