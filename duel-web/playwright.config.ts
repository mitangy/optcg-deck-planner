import { defineConfig } from "@playwright/test";

const GAME_TOKEN_SECRET = "e2e-secret";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "5174";
const GAME_PORT = process.env.E2E_GAME_PORT ?? "2567";
process.env.E2E_PAGE_ORIGIN ??= `http://127.0.0.1:${WEB_PORT}`;
process.env.E2E_GAME_SERVER ??= `http://127.0.0.1:${GAME_PORT}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["json", { outputFile: "playwright-report-json/results.json" }]]
    : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
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
      url: `http://127.0.0.1:${GAME_PORT}/health`,
      env: { GAME_TOKEN_SECRET, PORT: GAME_PORT, LOG_LEVEL: "error", CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT},http://localhost:${WEB_PORT}` },
      stderr: "ignore",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { VITE_API_URL: "http://127.0.0.1:8765", VITE_GAME_SERVER_URL: `http://127.0.0.1:${GAME_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
