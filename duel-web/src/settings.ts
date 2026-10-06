/**
 * Player-tweakable settings, persisted in localStorage so they can live on the
 * Settings page instead of cluttering the lobby. The game server and join secret
 * come from the build (VITE_GAME_SERVER_URL / VITE_DEV_JOIN_SECRET).
 */
import { useSyncExternalStore } from "react";
import { OPP_HAND_SPOTS, type OppHandSpot } from "./board/panelLayout";
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

/**
 * The saved hand layout setting. `auto` (the default, for players who never
 * picked one) is the Grid on tall desktop windows, where the right rail has
 * room for it and the fan would cover the DON!! row, and the fan elsewhere.
 */
export type HandLayoutPref = "auto" | HandLayout;

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
  /** Fanned hand, the flat grid, or automatic (see `HandLayoutPref`). */
  handLayout: HandLayoutPref;
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
  /** Fade hand cards you can't play this main phase (no legal play, not enough active DON!!). */
  dimUnplayable: boolean;
  /** Desktop: the key tabs ("Space", A/E/P/D, 1-9) on the action buttons. */
  shortcutTags: boolean;
  /** The +1000 / +2000 Counter badge on your hand cards. */
  handCounters: boolean;
  /** Red outline, shake and note when you try to attack with a card that can't. */
  cantAttackWarning: boolean;
  /** The "cannon shot" arc from the attacker to its target during a battle. */
  battleArrow: boolean;
  /** DON!! given to a rested Leader or Character stays upright under it instead of turning sideways with it. */
  donUpright: boolean;
  /**
   * Desktop: the opponent's hand pinned above the playmat ("left", "centre" or
   * "right") instead of in its side panel; "" keeps it in the panel. Phones
   * only tell "right" apart (the "Opponent hand, top right" switch): its row
   * moves to the right of the opponent's half.
   */
  oppHandSpot: OppHandSpot;
  /** Text size (power numbers, card text, buttons), scaled further by the window size. */
  textSize: TextSize;
  /** Desktop: tilt the board away from you, seen from your seat. */
  tiltedBoard: boolean;
  /** "Your turn" / "Opponent's turn" banner over the board. */
  turnSplash: boolean;
  /** Tone down board animations even when the OS has no reduced-motion preference. */
  reduceMotion: boolean;
  /** Speed of card motion (draw, play, KO, DON!! ...). */
  animationSpeed: AnimationSpeed;
  /** Show each played or trashed card big over its owner's half for a moment. */
  cardSpotlight: boolean;
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
  endTurnConfirm: "actions",
  responseStops: "always",
  screenOrientation: "auto",
  sortHandByCost: false,
  handLayout: "auto",
  handFanPos: "",
  keepHandOpen: false,
  panelLayout: "",
  layoutGrips: true,
  oneTapActions: false,
  dimUnplayable: true,
  shortcutTags: true,
  handCounters: true,
  cantAttackWarning: true,
  battleArrow: true,
  donUpright: false,
  oppHandSpot: "",
  textSize: "medium",
  tiltedBoard: false,
  turnSplash: true,
  reduceMotion: false,
  animationSpeed: "normal",
  cardSpotlight: true,
  turnAlert: true,
  turnSound: false,
  deckStats: true,
};

const END_TURN_CONFIRM: readonly EndTurnConfirm[] = ["always", "actions", "never"];
const RESPONSE_STOPS: readonly ResponseStops[] = ["always", "auto", "smart"];
const SCREEN_ORIENTATIONS: readonly ScreenOrientationPref[] = ["auto", "portrait", "landscape"];
const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ["normal", "fast", "off"];
export const HAND_LAYOUTS: readonly HandLayoutPref[] = ["auto", "fan", "grid"];

/** The layout to draw: `auto` is the Grid only on a tall desktop window (see `HandLayoutPref`). */
export function resolveHandLayout(pref: HandLayoutPref, tallDesktop: boolean): HandLayout {
  if (pref === "auto") return tallDesktop ? "grid" : "fan";
  return pref;
}
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
    oppHandTopRight?: unknown;
    serverUrl?: unknown;
    joinSecret?: unknown;
    floatingCards?: unknown;
  },
): DuelSettings {
  // serverUrl / joinSecret were dropped with the Connection panel; the build sets both.
  // floatingCards was dropped too: searches always float now (#288).
  const {
    autoPassDefense,
    oppHandTopRight,
    serverUrl: _serverUrl,
    joinSecret: _joinSecret,
    floatingCards: _floatingCards,
    ...rest
  } = parsed;
  const next = { ...DEFAULTS, ...rest };
  if (!END_TURN_CONFIRM.includes(next.endTurnConfirm)) next.endTurnConfirm = DEFAULTS.endTurnConfirm;
  // Older builds stored a boolean auto-pass: true is today's `auto`, anything else `always`.
  if (rest.responseStops === undefined) next.responseStops = deviceDefaults().responseStops;
  if (rest.responseStops === undefined && autoPassDefense === true) next.responseStops = "auto";
  if (!RESPONSE_STOPS.includes(next.responseStops)) next.responseStops = DEFAULTS.responseStops;
  if (!SCREEN_ORIENTATIONS.includes(next.screenOrientation)) {
    next.screenOrientation = DEFAULTS.screenOrientation;
  }
  if (!ANIMATION_SPEEDS.includes(next.animationSpeed)) next.animationSpeed = DEFAULTS.animationSpeed;
  const storedLayout = next.handLayout as string;
  if (storedLayout === "fanRight" && rest.handFanPos === undefined) next.handFanPos = LEGACY_RIGHT_FAN_POS;
  // Those two were chosen fans: they stay fans, not the automatic layout.
  if (storedLayout === "fanRight" || storedLayout === "fanCenter") next.handLayout = "fan";
  if (!HAND_LAYOUTS.includes(next.handLayout)) next.handLayout = DEFAULTS.handLayout;
  if (!TEXT_SIZES.includes(next.textSize)) next.textSize = DEFAULTS.textSize;
  if (!OPP_HAND_SPOTS.includes(next.oppHandSpot)) next.oppHandSpot = DEFAULTS.oppHandSpot;
  // Builds before #295 had a separate "Opponent hand, top right" switch; on is
  // the hand pinned top right, unless a spot was picked since.
  if (oppHandTopRight === true && !next.oppHandSpot) next.oppHandSpot = "right";
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
  // An account last saved before #261 has an old fan and no fan spot: this device's
  // spot must not hide that fan's own spot from the migration in sanitize.
  const legacyFan = (remote.handLayout === "fanRight" || remote.handLayout === "fanCenter") && remote.handFanPos === undefined;
  const { handFanPos: _localFanPos, ...localRest } = local;
  const base: Partial<DuelSettings> = legacyFan ? localRest : local;
  const next = sanitize({ ...base, ...(remote as Partial<DuelSettings>) });
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

/** A phone-sized touch screen (a landscape phone is under 900px wide too). */
export function isPhoneScreen(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (max-width: 900px)").matches;
  } catch {
    return false;
  }
}

/** Defaults that depend on the device: phones skip the block step when there is no blocker. */
function deviceDefaults(): DuelSettings {
  return { ...DEFAULTS, responseStops: isPhoneScreen() ? "auto" : DEFAULTS.responseStops };
}

export function loadSettings(): DuelSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return deviceDefaults();
    const parsed = JSON.parse(raw) as Partial<DuelSettings>;
    return sanitize(parsed && typeof parsed === "object" ? parsed : {});
  } catch {
    return deviceDefaults();
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
