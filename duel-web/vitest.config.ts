import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs (`npm run e2e`), not unit tests.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
