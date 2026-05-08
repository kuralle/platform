import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": path.join(dir, "src/test-shim-cloudflare-workers.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    pool: "forks",
  },
});
