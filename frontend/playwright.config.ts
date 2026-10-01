/**
 * Click-through tests: the real planner SPA in Chromium, with the FastAPI
 * backend faked in the browser (see e2e/fixtures.ts).
 *
 *   npm run e2e                       # starts Vite on :5180, runs every spec
 *   npm run e2e -- --project=phone-375
 *   npm run e2e:visual                # only the @visual pixel snapshots
 *
 * Pixel baselines (e2e/visual.spec.ts-snapshots/) are per platform and font
 * stack. The committed linux ones came from the Chromium in the agent sandbox,
 * not the pinned Playwright Docker image (no Docker daemon there), so the first
 * CI run may need a one-time re-bless: Actions > "Update planner snapshots" >
 * download the artifact > commit the PNGs.
 */
import { defineConfig } from "@playwright/test";

const PORT = 5180;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: process.env.CI ? 2 : undefined,
  // Per-platform baselines. 0.2% of pixels: tight enough to catch a flipped toggle or resized panel, loose enough for antialiasing.
  snapshotPathTemplate: "{testDir}/{testFileName}-snapshots/{arg}-{projectName}-{platform}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixelRatio: 0.002, threshold: 0.1 },
  },
  // A retried pass shows as "flaky" in the list reporter, never silent.
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
    // API calls are same-origin `/api/**` and answered by page.route.
    // The build tag in the top bar is pinned so pixel snapshots don't change with every commit.
    env: { VITE_API_URL: "/api", VITE_GIT_SHA: "e2e0000" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
