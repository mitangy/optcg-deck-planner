/**
 * Player-tweakable settings, persisted in localStorage so they can live on the
 * Settings page instead of cluttering the lobby. The game server and join secret
 * come from the build (VITE_GAME_SERVER_URL / VITE_DEV_JOIN_SECRET).
 */
import { useSyncExternalStore } from "react";
import { COLOR_MODES, DEFAULT_THEME, THEME_IDS, type ColorMode, type ThemeId } from "./theme";

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

/** Card motion: full speed, twice as quick, or none. Reduced motion still wins over Normal / Fast. */
export type AnimationSpeed = "normal" | "fast" | "off";

/**
 * Your hand: fanned like cards held in one hand (desktop: anywhere on the
 * screen, see `handFanPos`), or the flat grid (a side panel on desktop) /
 * scrolling row with no fan.
 */
export type HandLayout = "fan" | "grid";

/** Text size across the app, on top of the automatic scaling with the window. */
export type TextSize = "small" | "medium" | "large" | "xlarge";

export type DuelSettings = {
  /** Mint tokens with a dev user key instead of the guest id (dev builds only). */
  useDevKey: boolean;
  devUserKey: string;
  /** Darkening over custom playmat art (0–0.8) so cards stay legible. */
  playmatDim: number;
  /** Playmat art opacity (0.2–1); lower fades the art toward the plain mat. */
  playmatOpacity: number;
  /** Colour theme (a One Piece crew or place); see theme.ts. */
  theme: ThemeId;
  /** Dark or light menus and panels, or follow the device. */
  colorMode: ColorMode;

  // —— Gameplay ——
  /** Second tap before ending the turn: always, only while you can still act, or never. */
  endTurnConfirm: EndTurnConfirm;
  /** Stop for block and counter steps, or pass for you when there is nothing to decide. */
  responseStops: ResponseStops;
  /** Lock the screen orientation during a match (Android full screen / installed only). */
  screenOrientation: ScreenOrientationPref;
  /** Start every match with the hand sorted by cost. */
  sortHandByCost: boolean;
  /** Fanned hand or the flat grid. */
  handLayout: HandLayout;
  /** Desktop: where the fanned hand sits ("x,y" share of the window); "" = bottom centre. */
  handFanPos: string;
  /** Desktop: the fanned hand (or corner dock) stays raised instead of tucking away. */
  keepHandOpen: boolean;
  /**
   * Desktop: which side column each panel (card preview, battle log, hand
   * grid, chat ...) sits in and in what order; "" is the default layout.
   * See board/panelLayout.ts.
   */
  panelLayout: string;
  /** Desktop: show the grips that drag side panels and the fanned hand around. */
  layoutGrips: boolean;
  /**
   * One tap plays a Counter card, declares a Blocker, attaches selected DON!!
   * or picks a single target, instead of selecting it and then confirming.
   */
  oneTapActions: boolean;
  /** Show the opponent's hand as a fan of card backs in the top-right corner of the board. */
  oppHandTopRight: boolean;
  /** Text size (power numbers, card text, buttons), scaled further by the window size. */
  textSize: TextSize;
  /** Desktop: tilt the board away from you, seen from your seat. */
  tiltedBoard: boolean;
  /** Searches and effect ordering float their cards over the board instead of a pop-up box. */
  floatingCards: boolean;
  /** "Your turn" / "Opponent's turn" banner over the board. */
  turnSplash: boolean;
  /** Tone down board animations even when the OS has no reduced-motion preference. */
  reduceMotion: boolean;
  /** Speed of card motion (draw, play, KO, DON!! ...). */
  animationSpeed: AnimationSpeed;
  /** Vibrate (where supported) and flag the browser tab when the game needs you. */
  turnAlert: boolean;
  /** Short chime when the game needs you. */
  turnSound: boolean;

  // —— Deck editor ——
  /** Deck stats, draw odds and build hints (shared with the planner) in the deck editor. */
  deckStats: boolean;
};

const KEY = "optcg-duel:settings";

const DEFAULTS: DuelSettings = {
  useDevKey: false,
  devUserKey: "web-dev",
  playmatDim: 0.35,
  playmatOpacity: 1,
  theme: DEFAULT_THEME,
  colorMode: "dark",
  endTurnConfirm: "always",
  responseStops: "always",
  screenOrientation: "auto",
  sortHandByCost: false,
  handLayout: "fan",
  handFanPos: "",
  keepHandOpen: false,
  panelLayout: "",
  layoutGrips: true,
  oneTapActions: false,
  oppHandTopRight: false,
  textSize: "medium",
  tiltedBoard: false,
  floatingCards: true,
  turnSplash: true,
  reduceMotion: false,
  animationSpeed: "normal",
  turnAlert: true,
  turnSound: false,
  deckStats: true,
};

const END_TURN_CONFIRM: readonly EndTurnConfirm[] = ["always", "actions", "never"];
const RESPONSE_STOPS: readonly ResponseStops[] = ["always", "auto", "smart"];
const SCREEN_ORIENTATIONS: readonly ScreenOrientationPref[] = ["auto", "portrait", "landscape"];
const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ["normal", "fast", "off"];
const HAND_LAYOUTS: readonly HandLayout[] = ["fan", "grid"];
/**
 * Builds before #261 had two fans ("fanCenter", "fanRight"); both become the
 * one fan (unknown layout), the right one kept at the bottom right.
 */
const LEGACY_RIGHT_FAN_POS = "0.88,1";
export const TEXT_SIZES: readonly TextSize[] = ["small", "medium", "large", "xlarge"];
const CHANGE_EVENT = "optcg-duel:settings-change";

/** Stored values from older builds or hand edits fall back to defaults field by field. */
function sanitize(
  parsed: Partial<DuelSettings> & {
    autoPassDefense?: unknown;
    serverUrl?: unknown;
    joinSecret?: unknown;
  },
): DuelSettings {
  // serverUrl / joinSecret were dropped with the Connection panel; the build sets both.
  const {
    autoPassDefense,
    serverUrl: _serverUrl,
    joinSecret: _joinSecret,
    ...rest
  } = parsed;
  const next = { ...DEFAULTS, ...rest };
  if (!END_TURN_CONFIRM.includes(next.endTurnConfirm)) next.endTurnConfirm = DEFAULTS.endTurnConfirm;
  // Older builds stored a boolean auto-pass: true is today's `auto`, anything else `always`.
  if (rest.responseStops === undefined && autoPassDefense === true) next.responseStops = "auto";
  if (!RESPONSE_STOPS.includes(next.responseStops)) next.responseStops = DEFAULTS.responseStops;
  if (!SCREEN_ORIENTATIONS.includes(next.screenOrientation)) {
    next.screenOrientation = DEFAULTS.screenOrientation;
  }
  if (!ANIMATION_SPEEDS.includes(next.animationSpeed)) next.animationSpeed = DEFAULTS.animationSpeed;
  const storedLayout = next.handLayout as string;
  if (storedLayout === "fanRight" && rest.handFanPos === undefined) next.handFanPos = LEGACY_RIGHT_FAN_POS;
  if (!HAND_LAYOUTS.includes(next.handLayout)) next.handLayout = DEFAULTS.handLayout;
  if (!TEXT_SIZES.includes(next.textSize)) next.textSize = DEFAULTS.textSize;
  // A theme removed in a later build (or synced from a newer one) falls back to the default.
  if (!THEME_IDS.includes(next.theme)) next.theme = DEFAULTS.theme;
  if (!COLOR_MODES.includes(next.colorMode)) next.colorMode = DEFAULTS.colorMode;
  for (const k of Object.keys(DEFAULTS) as (keyof DuelSettings)[]) {
    if (typeof next[k] !== typeof DEFAULTS[k]) (next as Record<string, unknown>)[k] = DEFAULTS[k];
  }
  return next;
}

/** Dev fields that stay on this device; everything else follows the account. */
const DEVICE_ONLY_KEYS: readonly (keyof DuelSettings)[] = [
  "useDevKey",
  "devUserKey",
];

/** The part of the settings saved to a signed-in player's account. */
export function syncedSettings(s: DuelSettings): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(DEFAULTS) as (keyof DuelSettings)[]) {
    if (!DEVICE_ONLY_KEYS.includes(k)) out[k] = s[k];
  }
  return out;
}

/** Account settings laid over this device's, keeping its device-only fields. */
export function mergeRemoteSettings(local: DuelSettings, remote: Record<string, unknown>): DuelSettings {
  const next = sanitize({ ...local, ...(remote as Partial<DuelSettings>) });
  for (const k of DEVICE_ONLY_KEYS) (next as Record<string, unknown>)[k] = local[k];
  return next;
}

/** Apply settings loaded from the account without echoing them back as a local edit. */
export function applyRemoteSettings(remote: Record<string, unknown>): void {
  saveSettings(mergeRemoteSettings(snapshot(), remote), { remote: true });
}

/** Listen for local edits (not account loads) — used to save them to the account. */
export function onLocalSettingsChange(listener: (s: DuelSettings) => void): () => void {
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

const localListeners = new Set<(s: DuelSettings) => void>();

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

export function saveSettings(next: DuelSettings, opts: { remote?: boolean } = {}): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode / storage disabled — settings just won't persist.
  }
  cached = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  if (!opts.remote) for (const l of localListeners) l(next);
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

/** Dev key auth is only offered in dev builds or when explicitly enabled. */
export function devKeyAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_KEY === "true";
}
