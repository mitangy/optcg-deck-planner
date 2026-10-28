/** Ports, paths and constants shared by every capture script. run.sh exports the same variables. */
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const TRAILER_DIR = resolve(here, "../..");
export const REPO_DIR = resolve(TRAILER_DIR, "..");
export const CLIPS_DIR = resolve(TRAILER_DIR, "clips");
export const STILLS_DIR = resolve(CLIPS_DIR, "stills");
export const RAW_DIR = resolve(TRAILER_DIR, "clips/.raw");
export const ASSET_DIR = resolve(TRAILER_DIR, "capture/assets");
export const E2E_DATA = resolve(REPO_DIR, "duel-web/e2e/data");

/** Own ports, so a capture never fights `npm run e2e` (5174 / 2567 / 8765 / 8766). */
export const WEB_PORT = process.env.TRAILER_WEB_PORT ?? "5274";
export const GAME_PORT = process.env.TRAILER_GAME_PORT ?? "2667";
export const PLANNER_PORT = process.env.TRAILER_PLANNER_PORT ?? "5275";
export const PLANNER_ORIGIN = `http://127.0.0.1:${PLANNER_PORT}`;
export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
export const GAME_SERVER = `http://127.0.0.1:${GAME_PORT}`;
/** Nothing listens here: every call to it is answered in the browser (page.route). Must equal VITE_API_URL. */
export const FAKE_API = process.env.TRAILER_FAKE_API ?? "http://127.0.0.1:8865";
/** Same idea for Log Pose's chat service. */
export const FAKE_ANALYST = "http://127.0.0.1:8866";
export const GAME_TOKEN_SECRET = process.env.TRAILER_TOKEN_SECRET ?? "trailer-secret";

export const DISPLAY = process.env.TRAILER_DISPLAY ?? ":97";
export const CHROMIUM =
  process.env.PW_CHROMIUM_PATH ||
  process.env.TRAILER_CHROMIUM ||
  "/opt/pw-browsers/chromium";

export const FPS = Number(process.env.TRAILER_FPS ?? 30);
/** x11grab rate; the delivery file is always FPS. Grabbing faster than we deliver gives the downsample a fresher frame to pick. */
export const CAPTURE_FPS = Number(process.env.TRAILER_CAPTURE_FPS ?? 30);
export const SCREEN = { width: 1920, height: 1080 } as const;

/** The short commit the dev bundle reports, so the footer's version check can say "Up to date". */
export function gitSha(): string {
  try {
    return process.env.VITE_GIT_SHA?.trim().slice(0, 7) || execSync("git rev-parse --short HEAD", { cwd: REPO_DIR, encoding: "utf8" }).trim();
  } catch {
    return "abcdef0";
  }
}
