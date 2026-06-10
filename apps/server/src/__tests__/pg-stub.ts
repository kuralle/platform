/**
 * Test-only stand-in for `pg` (see vitest.slo.do.config.ts alias). The workerd
 * test pool cannot load pg's CJS graph; tests run the neon-serverless fallback
 * (no HYPERDRIVE binding in wrangler.test.jsonc), so pg only needs to parse.
 * Constructing it in a test means a test wired Hyperdrive without real pg —
 * fail loudly.
 */
export class Pool {
  constructor() {
    throw new Error("pg stub: Hyperdrive path must not be exercised in workerd tests");
  }
}
export default { Pool };
