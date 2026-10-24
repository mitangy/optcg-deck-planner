import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The SSE parser, chat client, session and markdown parser are React-free and tested in node. The few
// components with tests (Sources.tsx on the shared Popover, OwnerTabs.tsx on the shared Tabs) render in jsdom
// (`// @vitest-environment jsdom` per file); both apps map @optcg/ui the same way.
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
