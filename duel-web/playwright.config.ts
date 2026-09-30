/**
 * Click-through tests: the real duel-web UI against a real local game server.
 *
 *   npm run e2e                 # starts both servers, runs every spec
 *   npm run e2e -- --project=phone-375
 *
 * The FastAPI backend is faked per test (see e2e/fixtures.ts), so no Python,
 * Postgres or network access is needed.
 */
import { defineConfig } from "@playwright/test";

const GAME_TOKEN_SECRET = "e2e-secret";

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  // One game server; matches are independent rooms, so specs can still run in parallel.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: "desktop-1280", use: { viewport: { width: 1280, height: 720 } } },
    { name: "phone-375", use: { viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
  webServer: [
    {
      command: "npx tsx src/index.ts",
      cwd: "../game-server",
      url: "http://127.0.0.1:2567/health",
      env: { GAME_TOKEN_SECRET, PORT: "2567", LOG_LEVEL: "error" },
      // It retries presence pushes to the (absent) API forever; failures show in the UI anyway.
      stderr: "ignore",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npx vite --port 5174 --strictPort --host 127.0.0.1",
      url: "http://127.0.0.1:5174",
      env: { VITE_API_URL: "http://127.0.0.1:8765", VITE_GAME_SERVER_URL: "http://127.0.0.1:2567" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
