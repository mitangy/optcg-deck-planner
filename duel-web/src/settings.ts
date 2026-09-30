/**
 * Player-tweakable connection / identity settings, persisted in localStorage so
 * they can live on the Settings page instead of cluttering the lobby.
 *
 * Only overrides are stored: an empty `serverUrl` means "use the build default"
 * so a deploy that changes VITE_GAME_SERVER_URL is not shadowed by a stale value.
 */
import { useSyncExternalStore } from "react";
import { getGameServerUrl } from "./config";

/** When "End turn" asks for a second tap. */
export type EndTurnConfirm = "always" | "actions" | "never";

/**
 * Whether block / counter steps stop for you: `always`, `auto` (pass when you
 * have no blocker / no counter card), or `smart` (auto, plus pass the counter
 * step when all your Counter cards together cannot save the defender).
 */
export type ResponseStops = "always" | "auto" | "smart";

/** Screen rotation while a match is open: follow the phone, or lock where the browser allows. */
export type ScreenOrientationPref = "auto" | "portrait" | "landscape";

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

  // —— Gameplay ——
  /** Second tap before ending the turn: always, only while you can still act, or never. */
  endTurnConfirm: EndTurnConfirm;
  /** Stop for block and counter steps, or pass for you when there is nothing to decide. */
  responseStops: ResponseStops;
  /** Lock the screen orientation during a match (Android full screen / installed only). */
  screenOrientation: ScreenOrientationPref;
  /** Start every match with the hand sorted by cost. */
  sortHandByCost: boolean;
  /** Wide layout: keep the hand dock open instead of tucking it away. */
  keepHandOpen: boolean;
  /** "Your turn" / "Opponent's turn" banner over the board. */
  turnSplash: boolean;
  /** Tone down board animations even when the OS has no reduced-motion preference. */
  reduceMotion: boolean;
  /** Vibrate (where supported) and flag the browser tab when the game needs you. */
  turnAlert: boolean;
  /** Short chime when the game needs you. */
  turnSound: boolean;
};

const KEY = "optcg-duel:settings";

const DEFAULTS: DuelSettings = {
  serverUrl: "",
  joinSecret: "",
  useDevKey: false,
  devUserKey: "web-dev",
  playmatDim: 0.35,
  endTurnConfirm: "always",
  responseStops: "always",
  screenOrientation: "auto",
  sortHandByCost: false,
  keepHandOpen: false,
  turnSplash: true,
  reduceMotion: false,
  turnAlert: true,
  turnSound: false,
};

const END_TURN_CONFIRM: readonly EndTurnConfirm[] = ["always", "actions", "never"];
const RESPONSE_STOPS: readonly ResponseStops[] = ["always", "auto", "smart"];
const SCREEN_ORIENTATIONS: readonly ScreenOrientationPref[] = ["auto", "portrait", "landscape"];
const CHANGE_EVENT = "optcg-duel:settings-change";

/** Stored values from older builds or hand edits fall back to defaults field by field. */
function sanitize(parsed: Partial<DuelSettings> & { autoPassDefense?: unknown }): DuelSettings {
  const { autoPassDefense, ...rest } = parsed;
  const next = { ...DEFAULTS, ...rest };
  if (!END_TURN_CONFIRM.includes(next.endTurnConfirm)) next.endTurnConfirm = DEFAULTS.endTurnConfirm;
  // Older builds stored a boolean auto-pass: true is today's `auto`, anything else `always`.
  if (rest.responseStops === undefined && autoPassDefense === true) next.responseStops = "auto";
  if (!RESPONSE_STOPS.includes(next.responseStops)) next.responseStops = DEFAULTS.responseStops;
  if (!SCREEN_ORIENTATIONS.includes(next.screenOrientation)) {
    next.screenOrientation = DEFAULTS.screenOrientation;
  }
  for (const k of Object.keys(DEFAULTS) as (keyof DuelSettings)[]) {
    if (typeof next[k] !== typeof DEFAULTS[k]) (next as Record<string, unknown>)[k] = DEFAULTS[k];
  }
  return next;
}

export function loadSettings(): DuelSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<DuelSettings>;
    return sanitize(parsed && typeof parsed === "object" ? parsed : {});
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
  cached = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Merge a patch into the stored settings (used by the in-match settings sheet). */
export function updateSettings(patch: Partial<DuelSettings>): DuelSettings {
  const next = { ...snapshot(), ...patch };
  saveSettings(next);
  return next;
}

let cached: DuelSettings | null = null;

function snapshot(): DuelSettings {
  if (!cached) cached = loadSettings();
  return cached;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = null;
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current settings for non-React callers (haptics, audio cues). */
export function currentSettings(): DuelSettings {
  return snapshot();
}

/** Live settings: re-renders when they change on this page or in another tab. */
export function useDuelSettings(): DuelSettings {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Effective game server URL (override or build default). */
export function effectiveServerUrl(s: DuelSettings = loadSettings()): string {
  return s.serverUrl.trim() || getGameServerUrl();
}

/** Dev key auth is only offered in dev builds or when explicitly enabled. */
export function devKeyAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_KEY === "true";
}
