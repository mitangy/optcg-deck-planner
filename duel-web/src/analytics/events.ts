import { createProductEvents, type ProductEventName, type ProductEventProps, type ProductEventsOptions } from "@optcg/api-client";
import { readStored, writeStored } from "@optcg/ui/storage";
import { getApiBaseUrl } from "../config";

const ANON_KEY = "optcg.anonId.v1";
const ANON_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/** A random id this browser made up for funnel counts: not tied to an account, email or device. */
export function getAnonId(): string | null {
  const existing = readStored(ANON_KEY);
  if (existing && ANON_RE.test(existing)) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return writeStored(ANON_KEY, next) ? next : null;
}

export function createDuelEvents(over: Partial<ProductEventsOptions> = {}) {
  return createProductEvents({ app: "duel", endpoint: () => `${getApiBaseUrl()}/events`, anonId: getAnonId, ...over });
}

const events = createDuelEvents();

export const track = (name: ProductEventName, props?: ProductEventProps): void => events.track(name, props);
export const startProductEvents = (): (() => void) => events.start();

let gameMode: string | undefined;

/** The mode of the game being played, so `game_done` can say which kind it was without the board knowing. */
export function trackGameStart(mode: string, leader?: string | null): void {
  gameMode = mode;
  const props = { mode, ...(leader ? { leader } : {}) };
  track("deck_picked", props);
  track("game_start", props);
}

export function trackGameDone(fallbackMode?: string): void {
  const mode = gameMode ?? fallbackMode;
  track("game_done", mode ? { mode } : undefined);
}

export function trackSettingChanged(patch: object, current: object, emit: typeof track = track): void {
  const now = current as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    // Free-text and bookkeeping fields are not settings a player toggled.
    if (key === "devUserKey" || key === "bigBoardChosen" || now[key] === value) continue;
    emit("setting_changed", { key });
  }
}
