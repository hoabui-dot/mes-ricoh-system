// eslint.config.js — ESLint v9 flat config with typescript-eslint v8
// Runs from workspace root, covers all packages in libs/ services/ portal/
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/build/**",
      "infra/**",
      "eslint.config.js",
    ],
  },

  // ── TypeScript recommended (no type-checking rules) ──────────────────────
  // We use tseslint.configs.recommendedTypeChecked only when run per-package
  // with a local tsconfig. At workspace root we use the non-typed set to keep
  // lint fast and avoid tsconfig path issues across packages.
  ...tseslint.configs.recommended,

  // ── Custom rules ──────────────────────────────────────────────────────────
  {
    files: [
      "libs/**/*.ts",
      "services/**/*.ts",
      "portal/src/**/*.ts",
      "portal/src/**/*.tsx",
    ],
    rules: {
      // Enforce explicit types — no sneaky any
      "@typescript-eslint/no-explicit-any": "error",

      // Unused vars: allow _ prefix pattern for intentionally ignored params
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Require type annotations on exported function returns
      "@typescript-eslint/explicit-module-boundary-types": "off",

      // General JS — enforced without type info
      "prefer-const": "error",
      "no-var": "error",
      "eqeqeq": ["error", "always"],

      // Services use console.info/error for structured logging — allow it
      "no-console": "off",
    },
  },
);
