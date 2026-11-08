import { defineConfig } from "vitest/config";

// The SSE parser, chat client, session and markdown parser are React-free and tested in node. The few
// components with tests (Sources.tsx on the shared Popover, OwnerTabs.tsx on the shared Tabs) render in jsdom
// (`// @vitest-environment jsdom` per file); @optcg/ui resolves through the workspace link.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
