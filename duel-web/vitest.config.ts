import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same aliases as vite.config.ts: deck stats and legal pages shared with the planner (packages/).
    alias: [
      { find: /^@optcg\/deck-analytics/, replacement: fileURLToPath(new URL("../packages/deck-analytics/src", import.meta.url)) },
      { find: /^@optcg\/site-legal/, replacement: fileURLToPath(new URL("../packages/site-legal/src", import.meta.url)) },
    ],
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs (`npm run e2e`), not unit tests.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
