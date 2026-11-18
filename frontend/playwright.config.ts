import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_WEB_PORT ?? 5180);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: process.env.CI ? 2 : undefined,
  snapshotPathTemplate: "{testDir}/{testFileName}-snapshots/{arg}-{projectName}-{platform}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.002, threshold: 0.1 },
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: "desktop-1200", use: { viewport: { width: 1200, height: 900 } } },
    { name: "phone-375", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    env: { VITE_API_URL: "/api", VITE_GIT_SHA: "e2e0000" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
