import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Project-level overrides: keep CI green and avoid noisy rules
  {
    rules: {
      // Too strict for UI code patterns; we use effects for state resets intentionally.
      "react-hooks/set-state-in-effect": "off",
      // Too noisy / false positives for this codebase.
      "react-hooks/immutability": "off",
      // Allow pragmatic typing in UI + third-party integrations.
      "@typescript-eslint/no-explicit-any": "warn",
      // Copy/content pages frequently contain quotes/apostrophes.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
