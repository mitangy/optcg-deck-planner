import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Most modules are React-free and tested in node (SSE parser, chat client, session, markdown parser).
// The few components with tests render in jsdom (`// @vitest-environment jsdom` per file); they import
// the shared Headless UI tabs, and both apps map @optcg/ui the same way.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@optcg\/ui/, replacement: fileURLToPath(new URL("../ui/src", import.meta.url)) }],
    dedupe: ["react", "react-dom", "@headlessui/react"],
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
