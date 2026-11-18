import { useSyncExternalStore } from "react";
import { asDonArtId } from "./board/don/donArt";
import { OPP_HAND_SPOTS, type OppHandSpot } from "./board/panels/panelLayout";
import { clampPopupSize } from "./board/preview/popupSize";
import { PROMPT_DOCKS, type PromptDock } from "./board/prompts/promptDock";
import { COLOR_MODES, DEFAULT_THEME, THEME_IDS, type ColorMode, type ThemeId } from "./theme";

export type EndTurnConfirm = "always" | "actions" | "never";

export type ResponseStops = "always" | "auto" | "smart";

export type ScreenOrientationPref = "auto" | "portrait" | "landscape";

export type AnimationSpeed = "normal" | "fast" | "off";

export type HandLayout = "fan" | "grid";

export type HandLayoutPref = "auto" | HandLayout;

export type TextSize = "small" | "medium" | "large" | "xlarge";
export type LifeFan = "down" | "up";

export type SideColumns = "both" | "right" | "left";

export type DuelSettings = {
  useDevKey: boolean;
  devUserKey: string;
  playmatDim: number;
  playmatOpacity: number;
  theme: ThemeId;
  colorMode: ColorMode;
  donArt: number | null;

  endTurnConfirm: EndTurnConfirm;
  responseStops: ResponseStops;
  screenOrientation: ScreenOrientationPref;
  sortHandByCost: boolean;
  handLayout: HandLayoutPref;
  handFanPos: string;
  spectatorNearFanPos: string;
  spectatorFarFanPos: string;
  promptPos: string;
  previewPopupPos: string;
  previewPopupPinned: boolean;
  popupSize: number;
  previewPopupSize: number;
  promptDock: PromptDock;
  keepHandOpen: boolean;
  panelLayout: string;
  sideColumns: SideColumns;
  panelSizes: string;
  panelSizesBig: string;
  panelSizesPhone: string;
  layoutGrips: boolean;
  oneTapActions: boolean;
  dimUnplayable: boolean;
  shortcutTags: boolean;
  handCounters: boolean;
  cantAttackWarning: boolean;
  battleArrow: boolean;
  attackGlow: boolean;
  compactOwnBoard: boolean;
  previewBigCard: boolean;
  previewPopup: boolean;
  donUpright: boolean;
  totalPower: boolean;
  oppHandSpot: OppHandSpot;
  textSize: TextSize;
  lifeFan: LifeFan;
  tiltedBoard: boolean;
  bigBoard: boolean;
  bigBoardChosen: boolean;
  actionsBeside: boolean;
  showChat: boolean;
  showCardPreview: boolean;
  turnSplash: boolean;
  gameHints: boolean;
  reduceMotion: boolean;
  animationSpeed: AnimationSpeed;
  cardSpotlight: boolean;
  turnAlert: boolean;
  turnSound: boolean;
  spectatorSound: boolean;
  quietWatchTabs: boolean;

  matchBrief: boolean;
  matchBriefAuto: boolean;
  logPoseCopilot: boolean;

  showOthersArt: boolean;

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
  donArt: null,
  endTurnConfirm: "actions",
  responseStops: "always",
  screenOrientation: "auto",
  sortHandByCost: false,
  handLayout: "auto",
  handFanPos: "",
  spectatorNearFanPos: "",
  spectatorFarFanPos: "",
  promptPos: "",
  previewPopupPos: "",
  previewPopupPinned: false,
  popupSize: 100,
  previewPopupSize: 100,
  promptDock: "",
  keepHandOpen: false,
  panelLayout: "",
  sideColumns: "right",
  panelSizes: "",
  panelSizesBig: "",
  panelSizesPhone: "",
  layoutGrips: true,
  oneTapActions: false,
  dimUnplayable: true,
  shortcutTags: true,
  handCounters: true,
  cantAttackWarning: true,
  battleArrow: true,
  attackGlow: true,
  compactOwnBoard: false,
  previewBigCard: false,
  previewPopup: true,
  donUpright: false,
  totalPower: false,
  oppHandSpot: "",
  textSize: "medium",
  lifeFan: "down",
  tiltedBoard: false,
  bigBoard: true,
  bigBoardChosen: false,
  actionsBeside: true,
  showChat: true,
  showCardPreview: true,
  turnSplash: true,
  gameHints: false,
  reduceMotion: false,
  animationSpeed: "normal",
  cardSpotlight: true,
  turnAlert: true,
  turnSound: false,
  spectatorSound: true,
  quietWatchTabs: true,
  matchBrief: true,
  matchBriefAuto: false,
  logPoseCopilot: false,
  showOthersArt: true,
  deckStats: true,
};

const END_TURN_CONFIRM: readonly EndTurnConfirm[] = ["always", "actions", "never"];
const RESPONSE_STOPS: readonly ResponseStops[] = ["always", "auto", "smart"];
const SCREEN_ORIENTATIONS: readonly ScreenOrientationPref[] = ["auto", "portrait", "landscape"];
const ANIMATION_SPEEDS: readonly AnimationSpeed[] = ["normal", "fast", "off"];
export const HAND_LAYOUTS: readonly HandLayoutPref[] = ["auto", "fan", "grid"];

export function resolveHandLayout(pref: HandLayoutPref, tallDesktop: boolean): HandLayout {
  if (pref === "auto") return tallDesktop ? "grid" : "fan";
  return pref;
}
const LEGACY_RIGHT_FAN_POS = "0.88,1";
export const TEXT_SIZES: readonly TextSize[] = ["small", "medium", "large", "xlarge"];
export const LIFE_FANS: readonly LifeFan[] = ["down", "up"];
export const SIDE_COLUMNS: readonly SideColumns[] = ["both", "right", "left"];
const CHANGE_EVENT = "optcg-duel:settings-change";

function sanitize(
  parsed: Partial<DuelSettings> & {
    autoPassDefense?: unknown;
    oppHandTopRight?: unknown;
    serverUrl?: unknown;
    joinSecret?: unknown;
    floatingCards?: unknown;
    showRecentPlays?: unknown;
  },
): DuelSettings {
  const {
    autoPassDefense,
    oppHandTopRight,
    serverUrl: _serverUrl,
    joinSecret: _joinSecret,
    floatingCards: _floatingCards,
    showRecentPlays: _showRecentPlays,
    ...rest
  } = parsed;
  const next = { ...DEFAULTS, ...rest };
  if (rest.bigBoardChosen !== true) next.bigBoard = DEFAULTS.bigBoard;
  if (!END_TURN_CONFIRM.includes(next.endTurnConfirm)) next.endTurnConfirm = DEFAULTS.endTurnConfirm;
  if (rest.responseStops === undefined) next.responseStops = deviceDefaults().responseStops;
  if (rest.responseStops === undefined && autoPassDefense === true) next.responseStops = "auto";
  if (!RESPONSE_STOPS.includes(next.responseStops)) next.responseStops = DEFAULTS.responseStops;
  if (!SCREEN_ORIENTATIONS.includes(next.screenOrientation)) {
    next.screenOrientation = DEFAULTS.screenOrientation;
  }
  if (!ANIMATION_SPEEDS.includes(next.animationSpeed)) next.animationSpeed = DEFAULTS.animationSpeed;
  const storedLayout = next.handLayout as string;
  if (storedLayout === "fanRight" && rest.handFanPos === undefined) next.handFanPos = LEGACY_RIGHT_FAN_POS;
  if (storedLayout === "fanRight" || storedLayout === "fanCenter") next.handLayout = "fan";
  if (!HAND_LAYOUTS.includes(next.handLayout)) next.handLayout = DEFAULTS.handLayout;
  if (!TEXT_SIZES.includes(next.textSize)) next.textSize = DEFAULTS.textSize;
  if (!LIFE_FANS.includes(next.lifeFan)) next.lifeFan = DEFAULTS.lifeFan;
  if (!PROMPT_DOCKS.includes(next.promptDock)) next.promptDock = DEFAULTS.promptDock;
  if (!OPP_HAND_SPOTS.includes(next.oppHandSpot)) next.oppHandSpot = DEFAULTS.oppHandSpot;
  if (oppHandTopRight === true && !next.oppHandSpot) next.oppHandSpot = "right";
  if (!THEME_IDS.includes(next.theme)) next.theme = DEFAULTS.theme;
  if (!COLOR_MODES.includes(next.colorMode)) next.colorMode = DEFAULTS.colorMode;
  if (!SIDE_COLUMNS.includes(next.sideColumns)) next.sideColumns = DEFAULTS.sideColumns;
  next.popupSize = clampPopupSize(next.popupSize);
  next.previewPopupSize = clampPopupSize(next.previewPopupSize);
  next.donArt = asDonArtId(next.donArt);
  for (const k of Object.keys(DEFAULTS) as (keyof DuelSettings)[]) {
    if (k === "donArt") continue;
    if (typeof next[k] !== typeof DEFAULTS[k]) (next as Record<string, unknown>)[k] = DEFAULTS[k];
  }
  return next;
}

const DEVICE_ONLY_KEYS: readonly (keyof DuelSettings)[] = [
  "panelSizesPhone",
  "useDevKey",
  "previewPopupPos",
  "previewPopupPinned",
  "popupSize",
  "previewPopupSize",
  "devUserKey",
  "promptPos",
];

export function syncedSettings(s: DuelSettings): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const k of Object.keys(DEFAULTS) as (keyof DuelSettings)[]) {
    if (DEVICE_ONLY_KEYS.includes(k)) continue;
    out[k] = k === "donArt" ? (s.donArt ?? 0) : (s[k] as string | number | boolean);
  }
  return out;
}

export function mergeRemoteSettings(local: DuelSettings, remote: Record<string, unknown>): DuelSettings {
  const legacyFan = (remote.handLayout === "fanRight" || remote.handLayout === "fanCenter") && remote.handFanPos === undefined;
  const { handFanPos: _localFanPos, ...localRest } = local;
  const base: Partial<DuelSettings> = legacyFan ? localRest : local;
  const next = sanitize({ ...base, ...(remote as Partial<DuelSettings>) });
  for (const k of DEVICE_ONLY_KEYS) (next as Record<string, unknown>)[k] = local[k];
  return next;
}

export function applyRemoteSettings(remote: Record<string, unknown>): void {
  saveSettings(mergeRemoteSettings(snapshot(), remote), { remote: true });
}

export function onLocalSettingsChange(listener: (s: DuelSettings) => void): () => void {
  localListeners.add(listener);
  return () => localListeners.delete(listener);
}

const localListeners = new Set<(s: DuelSettings) => void>();

export function isPhoneScreen(): boolean {
  try {
    return typeof matchMedia === "function" && matchMedia("(pointer: coarse) and (max-width: 900px)").matches;
  } catch {
    return false;
  }
}

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

export function updateSettings(patch: Partial<DuelSettings>): DuelSettings {
  const next = { ...snapshot(), ...patch };
  if ("bigBoard" in patch) next.bigBoardChosen = true;
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

export function currentSettings(): DuelSettings {
  return snapshot();
}

export function useDuelSettings(): DuelSettings {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function devKeyAllowed(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_DEV_KEY === "true";
}
