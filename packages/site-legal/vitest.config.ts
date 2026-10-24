import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The feedback dialog imports the shared Headless UI Dialog; both apps map @optcg/ui the same way.
  resolve: {
    alias: [{ find: /^@optcg\/ui/, replacement: fileURLToPath(new URL("../ui/src", import.meta.url)) }],
    dedupe: ["react", "react-dom", "@headlessui/react"],
  },
  // Component tests render React in jsdom (`// @vitest-environment jsdom` per file); the rest run in node.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
