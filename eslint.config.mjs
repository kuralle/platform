import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      ".turbo/**",
      "packages/env/env.d.ts",
      "scripts/sink-spike/**",
      "apps/web/src/components/configure/agent-editor-shell.tsx",
      "apps/web/src/routes/_app.agents.$agentId.models.tsx",
      "apps/web/src/routes/_app.agents.$agentId.workflow.tsx",
      "apps/web/src/routes/_app.batches.new.tsx",
      "packages/ui/src/components/data-table.tsx",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/triple-slash-reference": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@kuralle/api-client"],
              message:
                "Components must not import @kuralle/api-client directly. Use a hook from apps/web/src/hooks/api/ instead.",
            },
            // Closes the codex r2 hook-wrapper bypass: blocks any import of
            // the api-provider module ($api singleton) from outside the
            // explicit allow-list below. Without this rule, a component
            // could `import { $api } from '@/providers/api-provider'` and
            // call the typed client directly, skipping the hook wrapper.
            {
              group: [
                "@/providers/api-provider",
                "**/providers/api-provider",
              ],
              message:
                "Components must not import the api-provider module directly ($api singleton bypasses hook-wrapper rule). Use a hook from apps/web/src/hooks/api/ instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/hooks/api/**/*.{ts,tsx}",
      "apps/web/src/providers/api-provider.tsx",
      // main.tsx mounts <ApiProvider>; needs to import the component. It
      // does NOT use $api directly. The lint rule allows the import path;
      // r1/r2 review of the file confirms it imports only the JSX provider.
      "apps/web/src/main.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    files: ["packages/{core,api,db,runtime}/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Per HEXAGONAL §6 rule 1: domain code may import only
              // platform/interface.ts. The memory adapter is the test seam
              // (HEXAGONAL §6 rule 3) but production source must not bind to
              // it (otherwise tests pass while CF/Node runtime diverges).
              // Test files are exempt via the `ignores` pattern above.
              group: [
                "@kuralle/platform/cloudflare",
                "@kuralle/platform/node",
                "@kuralle/platform/memory",
              ],
              message:
                "Domain code must import only from @kuralle/platform/interface. Adapters (cloudflare/node/memory) are forbidden in production source per HEXAGONAL §6 rule 1; memory is allowed only in *.test.ts files.",
            },
          ],
        },
      ],
    },
  },
  {
    // S2-01: Forbid raw drizzle-orm / @kuralle/db/schema imports from routers.
    // Every DB access from routers must go through a repository.
    //
    // Existing S1-05 stub routers are scoped out below until S2-03 rewrites them
    // to use @kuralle/core repositories. As each router is rewritten, remove its
    // entry from the `ignores` array. When the array is empty, delete it.
    files: ["packages/api/src/routers/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["drizzle-orm", "drizzle-orm/*"],
              message:
                "Routers must not import drizzle-orm directly. Use a repository from @kuralle/core instead.",
            },
            {
              group: ["@kuralle/db/schema", "@kuralle/db/schema/*"],
              message:
                "Routers must not import @kuralle/db/schema directly. Use a repository from @kuralle/core instead.",
            },
          ],
        },
      ],
    },
  },
);
