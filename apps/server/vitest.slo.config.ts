import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    pool: "forks",
    include: ["src/__tests__/slo-*.test.ts"],
    testTimeout: 60_000,
  },
});
