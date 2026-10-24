import { defineConfig } from "vitest/config";

export default defineConfig({
  // Wrapper tests render React in jsdom (`// @vitest-environment jsdom` per file); the rest run in node.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
