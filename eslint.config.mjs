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
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/web/src/hooks/api/**/*.{ts,tsx}",
      "apps/web/src/providers/api-provider.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);
