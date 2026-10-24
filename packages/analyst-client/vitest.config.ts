import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The SSE parser, chat client, session and markdown parser are React-free and tested in node. Sources.tsx
// imports the shared Headless UI Popover; both apps map @optcg/ui the same way, so a component test can render it here.
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
