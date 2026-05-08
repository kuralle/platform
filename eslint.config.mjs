import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      ".turbo/**",
      "**/.wrangler/**",
      "packages/env/env.d.ts",
      "scripts/sink-spike/**",
      "apps/web/src/components/configure/agent-editor-shell.tsx",
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
    // Hook-wrapper rule (S0-05 + codex r2 reinforcement): no @kuralle/api-client
    // and no @/providers/api-provider imports outside hooks/api/ (the allow-list
    // immediately below scopes the rule out of those files).
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
            // explicit allow-list below.
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
    // S2-04 fix-pass F06: forbidden-mock-import rule. Project docs claimed
    // this rule existed since S0-05; the gate found it missing. Production
    // screens in apps/web/src/** must not import from @/mocks. Tests,
    // mock-source files, and dev-only utilities are exempt via the override
    // below. The `ignores` array scopes the rule out of screens NOT yet wired
    // to real hooks in S2; each is wired in its own sprint and dropped from
    // this list as it lands. When the array empties, delete the rule's
    // override block.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    ignores: [
      "apps/web/src/test/**/*.{ts,tsx}",
      "apps/web/src/__tests__/**/*.{ts,tsx}",
      "apps/web/src/mocks/**/*.{ts,tsx}",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/*.spec.{ts,tsx}",
      // Deferred: not yet wired to real hooks (will land in S3+).
      "apps/web/src/components/modals/attach-document-modal.tsx",
      "apps/web/src/routes/_app.agents.$agentId.knowledge.tsx",
      "apps/web/src/routes/_app.batches.index.tsx",
      "apps/web/src/routes/_app.conversations.$id.live.tsx",
      "apps/web/src/routes/_app.knowledge.$docId.tsx",
      "apps/web/src/routes/_app.revenue.receipt.$month.tsx",
      "apps/web/src/routes/_app.workspace.compliance.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/mocks", "@/mocks/*"],
              message:
                "Production screens must not import from @/mocks. Use a hook from apps/web/src/hooks/api/ instead. Mock fixtures are allowed only in test files and dev-only utilities.",
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
    // (S2-fix verified zero router files match this pattern; the prior
    // per-file `ignores` array is gone — the rule fires on all router files.)
    files: ["packages/api/src/routers/**/*.{ts,tsx}"],
    // Tests need drizzle/schema for fixture seeding + DB-state assertions.
    // Production router code does NOT — it goes through repos in @kuralle/core.
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
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
