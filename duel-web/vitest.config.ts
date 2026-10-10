import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same aliases as vite.config.ts: deck stats, legal pages and the Log Pose chat shared with the planner (packages/).
    alias: [
      { find: /^@optcg\/deck-analytics/, replacement: fileURLToPath(new URL("../packages/deck-analytics/src", import.meta.url)) },
      { find: /^@optcg\/site-legal/, replacement: fileURLToPath(new URL("../packages/site-legal/src", import.meta.url)) },
      { find: /^@optcg\/patch-notes/, replacement: fileURLToPath(new URL("../packages/patch-notes/src", import.meta.url)) },
      { find: /^@optcg\/analyst-client/, replacement: fileURLToPath(new URL("../packages/analyst-client/src", import.meta.url)) },
    ],
    dedupe: ["react", "react-dom"],
  },
  // Package sources (no tsconfig of their own) use the same automatic JSX runtime as this app.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs (`npm run e2e`), not unit tests.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
