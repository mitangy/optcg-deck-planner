import { defineConfig } from "vitest/config";

export default defineConfig({
  // Package sources (no tsconfig of their own) use the same automatic JSX runtime as this app.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs (`npm run e2e`), not unit tests. scripts/ tests cover the e2e shard planner.
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    setupFiles: ["src/cards/testSetup.ts"],
  },
});
