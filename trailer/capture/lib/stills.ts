/**
 * Still-image sessions for the help infographics: the same local stack and in-browser fake API as the clips,
 * but nothing is recorded; a script walks the app to a state and `page.screenshot`s it at 2x or 3x.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Locator, Page } from "playwright";
import { MIKO } from "./data";
import { World } from "./fakeApi";
import { TRAILER_DIR } from "./env";
import { newWindow } from "./take";
import { MIKO_STATS, friendsOfMiko } from "./world";
import { sleep } from "./util";

/** Where the compositions in trailer/video read their screenshots from (gitignored). */
export const SHOT_DIR = join(TRAILER_DIR, "video/public/infographics/shots");

/** Desktop pages are 1440x900 CSS px at 2x, phones 390x844 at 3x; each needs an Xvfb screen big enough for the window. */
export const DESKTOP = { width: 1440, height: 900, scale: 2, display: process.env.TRAILER_STILL_DISPLAY ?? ":94" } as const;
/** A smaller desktop window: the fanned hand and its buttons sit closer together, so a tight crop shows both. */
export const COMPACT = { width: 1040, height: 700, scale: 2, display: process.env.TRAILER_STILL_DISPLAY ?? ":94" } as const;
export const PHONE = { width: 390, height: 844, scale: 3, display: process.env.TRAILER_STILL_PHONE_DISPLAY ?? ":93", touch: true } as const;

/** Where each shot's marked controls were, in CSS px of that shot: the compositions put their rings there. */
export const BOXES_FILE = join(TRAILER_DIR, "video/src/infographics/boxes.json");

export type Still = {
  page: Page;
  errors: string[];
  /** Viewport screenshot; `marks` records the boxes (CSS px) of the named controls next to it (boxes.json). */
  shot(name: string, marks?: Record<string, Locator>): Promise<void>;
  close(): Promise<void>;
};

export type StillOpts = {
  kind: "desktop" | "compact" | "phone";
  settings?: Record<string, unknown>;
  gameSeed?: number;
  signedIn?: boolean;
  /** Extra fake-API handlers (return true when the call was answered). */
  extra?: (route: import("playwright").Route, path: string, method: string) => Promise<boolean> | boolean;
};

export async function openStill(o: StillOpts): Promise<Still> {
  mkdirSync(SHOT_DIR, { recursive: true });
  const errors: string[] = [];
  const spec = o.kind === "phone" ? PHONE : o.kind === "compact" ? COMPACT : DESKTOP;
  const { win } = await newWindow(
    {
      window: { x: 0, y: 0, ...spec },
      cursor: o.kind === "phone" ? "touch" : "arrow",
      gameSeed: o.gameSeed ?? 11,
      seed: { settings: { handLayout: "fan", ...(o.settings ?? {}) } },
      fake: { me: o.signedIn === false ? null : { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko(), extra: o.extra },
    },
    new World(),
    errors,
  );
  // The pointer overlay is for video; stills point with rings instead.
  await win.ctx.addInitScript(() => {
    const css = document.createElement("style");
    css.textContent = "#__trailer-cursor,.__trailer-ripple{display:none!important}";
    const add = () => document.documentElement.append(css);
    if (document.documentElement) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  });
  const page = win.page;
  return {
    page,
    errors,
    async shot(name, marks) {
      await sleep(250);
      const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const [k, loc] of Object.entries(marks ?? {})) {
        const b = await loc.first().boundingBox({ timeout: 3000 }).catch(() => null);
        if (!b) throw new Error(`shot ${name}: nothing to mark for "${k}"`);
        boxes[k] = { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
      }
      await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) });
      const all = existsSync(BOXES_FILE) ? (JSON.parse(readFileSync(BOXES_FILE, "utf8")) as object) : {};
      writeFileSync(BOXES_FILE, JSON.stringify({ ...all, [name]: boxes }, null, 1) + "\n");
      console.log(`  shot ${name}`);
    },
    close: () => win.close(),
  };
}
