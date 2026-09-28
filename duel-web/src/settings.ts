/**
 * Player-tweakable connection / identity settings, persisted in localStorage so
 * they can live on the Settings page instead of cluttering the lobby.
 *
 * Only overrides are stored: an empty `serverUrl` means "use the build default"
 * so a deploy that changes VITE_GAME_SERVER_URL is not shadowed by a stale value.
 */
import { getGameServerUrl } from "./config";

export type DuelSettings = {
  /** Game server URL override ("" = build default). */
  serverUrl: string;
  /** Optional DEV_JOIN_SECRET sent on join. */
  joinSecret: string;
  /** Mint tokens with a dev user key instead of the guest id (dev builds only). */
  useDevKey: boolean;
  devUserKey: string;
  /** Darkening over custom playmat art (0–0.8) so cards stay legible. */
  playmatDim: number;
};

const KEY = "optcg-duel:settings";

const DEFAULTS: DuelSettings = {
  serverUrl: "",
  joinSecret: "",
  useDevKey: false,
  devUserKey: "web-dev",
  playmatDim: 0.35,
};

export function loadSettings(): DuelSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<DuelSettings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: DuelSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage disabled — settings just won't persist.
  }
}

/** Effective game server URL (override or build default). */
export function effectiveServerUrl(s: DuelSettings = loadSettings()): string {
  return s.serverUrl.trim() || getGameServerUrl();
}

/** Dev key auth is only offered in dev builds or when explicitly enabled. */
export function devKeyAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_KEY === "true";
}
