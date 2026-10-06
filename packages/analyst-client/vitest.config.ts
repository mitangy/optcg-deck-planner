import { defineConfig } from "vitest/config";

// Only the React-free modules (SSE parser, chat client, session, markdown parser) are tested here;
// the components are rendered from duel-web's suite, which has React installed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
