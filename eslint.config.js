// Root ESLint flat config for every TypeScript workspace (frontend, duel-web,
// packages/*, game-server, analyst). Ratchet policy (refactor 1.3): a rule that
// still fires somewhere is a warning, so `npm run lint` stays green; a rule with
// zero hits is an error, so it cannot regress. When a warning count reaches zero,
// move the rule into the error list. No formatter runs from here.
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

// Rules that still fire somewhere (counts at the time of writing). Warn only;
// shrink this list, never grow it. Everything else in the recommended sets is
// an error.
const WARN_UNTIL_FIXED = {
  "@typescript-eslint/no-unused-vars": "warn", // 78
  "@typescript-eslint/no-explicit-any": "warn", // 28
  "@typescript-eslint/no-unused-expressions": "warn", // 10
  "no-useless-assignment": "warn", // 29
  "preserve-caught-error": "warn", // 10
  "no-empty-pattern": "warn", // 14
  "no-fallthrough": "warn", // 12
  "no-useless-escape": "warn", // 6
  "no-irregular-whitespace": "warn", // 4
  "prefer-const": "warn", // 3
  "no-control-regex": "warn", // 2
  "no-misleading-character-class": "warn", // 2
  "react-hooks/rules-of-hooks": "warn", // 5
  "react-hooks/exhaustive-deps": "warn", // 24
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
