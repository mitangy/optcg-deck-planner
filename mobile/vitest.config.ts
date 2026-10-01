import { defineConfig } from "vitest/config";

export default defineConfig({
  // Board components render server-side through react-native-web in tests.
  resolve: { alias: { "react-native": "react-native-web" } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
