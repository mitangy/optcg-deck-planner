const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

const WARN_UNTIL_FIXED = {
  "@typescript-eslint/no-unused-vars": "warn",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unused-expressions": "warn",
  "no-useless-assignment": "warn",
  "preserve-caught-error": "warn",
  "no-empty-pattern": "warn",
  "no-fallthrough": "warn",
  "no-useless-escape": "warn",
  "no-irregular-whitespace": "warn",
  "prefer-const": "warn",
  "no-control-regex": "warn",
  "no-misleading-character-class": "warn",
  "react-hooks/rules-of-hooks": "warn",
  "react-hooks/exhaustive-deps": "warn",
};

/** @type {import("eslint").Linter.Config[]} */
module.exports = tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/.stryker-tmp/**",
      "**/reports/**",
      "**/*.d.ts",
      "**/generated/**",
      "mobile/**",
      "trailer/**",
      "backend/**",
      "tools/**",
      "docs/**",
    ],
  },
  {
    files: [
      "frontend/**/*.{ts,tsx}",
      "duel-web/**/*.{ts,tsx}",
      "packages/**/*.{ts,tsx}",
      "game-server/**/*.{ts,tsx}",
      "analyst/**/*.{ts,tsx}",
    ],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: "warn" },
    rules: WARN_UNTIL_FIXED,
  },
);
