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
/** Real player art (e.g. Miko's own playmat) stays OUTSIDE the repo: never commit player uploads. */
export const HYPE_ASSET_DIR = process.env.HYPE_ASSETS ?? "/mnt/project-files/ads/hype/assets";
export const PLAYMAT_FILE = resolve(HYPE_ASSET_DIR, "playmat-miko.jpg");
export const BACKS_DIR = resolve(ASSET_DIR, "card-backs");
export const E2E_DATA = resolve(REPO_DIR, "duel-web/e2e/data");

export const WEB_PORT = process.env.TRAILER_WEB_PORT ?? "5274";
export const GAME_PORT = process.env.TRAILER_GAME_PORT ?? "2667";
export const PLANNER_PORT = process.env.TRAILER_PLANNER_PORT ?? "5275";
export const PLANNER_ORIGIN = `http://127.0.0.1:${PLANNER_PORT}`;
export const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
export const GAME_SERVER = `http://127.0.0.1:${GAME_PORT}`;
export const FAKE_API = process.env.TRAILER_FAKE_API ?? "http://127.0.0.1:8865";
export const FAKE_ANALYST = "http://127.0.0.1:8866";
export const GAME_TOKEN_SECRET = process.env.TRAILER_TOKEN_SECRET ?? "trailer-secret";

export const DISPLAY = process.env.TRAILER_DISPLAY ?? ":97";
export const CHROMIUM =
  process.env.PW_CHROMIUM_PATH ||
  process.env.TRAILER_CHROMIUM ||
  "/opt/pw-browsers/chromium";

export const FPS = Number(process.env.TRAILER_FPS ?? 30);
export const CAPTURE_FPS = Number(process.env.TRAILER_CAPTURE_FPS ?? 30);
export const SCREEN = { width: 1920, height: 1080 } as const;

export function gitSha(): string {
  try {
    return process.env.VITE_GIT_SHA?.trim().slice(0, 7) || execSync("git rev-parse --short HEAD", { cwd: REPO_DIR, encoding: "utf8" }).trim();
  } catch {
    return "abcdef0";
  }
}
