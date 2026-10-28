/**
 * A real, headed Chromium window with no browser chrome, placed exactly on the Xvfb screen so ffmpeg's
 * x11grab sees nothing but the page. (Playwright's recordVideo is low bitrate; screen grabbing is not.)
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHROMIUM, DISPLAY } from "./env";

/** Height of Chrome for Testing's "only for automated testing" infobar; it is pushed off the top of the screen. */
const INFOBAR = 56;
/** The window frame draws a 1px line along its top edge; hidden the same way. */
const FRAME = 1;

export type WindowSpec = {
  /** Where the page's top-left corner sits on the screen. */
  x: number;
  y: number;
  /** Page size in CSS pixels. */
  width: number;
  height: number;
  /** Device pixel ratio: 2 makes a phone clip crisp (the screen must then be 2x as big as the page). */
  scale?: number;
  /** Phone: emulate a touch screen so `(pointer: coarse)` layouts apply. */
  touch?: boolean;
  display?: string;
  url?: string;
};

export type Win = {
  ctx: BrowserContext;
  page: Page;
  close(): Promise<void>;
};

export async function openWindow(spec: WindowSpec): Promise<Win> {
  const scale = spec.scale ?? 1;
  const dir = mkdtempSync(join(tmpdir(), "trailer-profile-"));
  const startUrl = spec.url ?? "data:text/html,<body style=background:%230b1720>";
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: CHROMIUM,
    headless: false,
    env: { ...process.env, DISPLAY: spec.display ?? DISPLAY } as Record<string, string>,
    viewport: null,
    hasTouch: spec.touch ?? false,
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--kiosk",
      `--app=${startUrl}`,
      `--window-position=${spec.x},${spec.y - INFOBAR - FRAME}`,
      `--window-size=${spec.width},${spec.height + INFOBAR}`,
      `--force-device-scale-factor=${scale}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--test-type",
      "--hide-scrollbars",
      "--disable-features=Translate,MediaRouter,OptimizationHints",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--autoplay-policy=no-user-gesture-required",
      "--lang=en-US",
      ...(process.env.TRAILER_FLAGS ? process.env.TRAILER_FLAGS.split(" ") : []),
      "--password-store=basic",
      "--use-mock-keychain",
    ],
  });
  // tsx compiles with keepNames: functions sent to the page expect this helper to exist there.
  await ctx.addInitScript("window.__name = window.__name || function (f) { return f; };");
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.evaluate("window.__name = window.__name || function (f) { return f; };");
  // The window settles a moment after launch (the first reads can still include the infobar).
  let inner: number[] = [0, 0];
  for (let i = 0, stable = 0; i < 60 && stable < 4; i++) {
    inner = await page.evaluate(() => [innerWidth, innerHeight]);
    stable = inner[0] === spec.width && inner[1] === spec.height ? stable + 1 : 0;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (inner[0] !== spec.width || inner[1] !== spec.height) {
    throw new Error(`window is ${inner.join("x")}, wanted ${spec.width}x${spec.height} (infobar height changed?)`);
  }
  return {
    ctx,
    page,
    async close() {
      await ctx.close().catch(() => undefined);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
