import { createProductEvents, sessionAnonId, type ProductEventName, type ProductEventProps, type ProductEventsOptions } from "@optcg/api-client";
import { getApiBaseUrl } from "../config";

export function createDuelEvents(over: Partial<ProductEventsOptions> = {}) {
  return createProductEvents({ app: "duel", endpoint: () => `${getApiBaseUrl()}/events`, anonId: sessionAnonId, ...over });
}

const events = createDuelEvents();

type Emit = (name: ProductEventName, props?: ProductEventProps) => void;

/** A visit counts once a day however often the page opens; the server drops repeats too. */
const ONCE_A_DAY: ReadonlySet<ProductEventName> = new Set(["landing", "home_view"]);

export function firstToday(name: ProductEventName): boolean {
  const key = `optcg.ev.${name}.${new Date().toISOString().slice(0, 10)}`;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage blocked: send it, the server dedupes.
  }
  return true;
}

export const track: Emit = (name, props) => {
  if (ONCE_A_DAY.has(name) && !firstToday(name)) return;
  events.track(name, props);
};
export const startProductEvents = (): (() => void) => events.start();

/** Layout and position settings change on every drag; they say nothing about what a player prefers. */
const NOISY_SETTING = /(Pos|Size|Sizes)$|^panelSizes|Pos[A-Z]/;

export function trackSettingChanged(patch: object, current: object, emit: Emit = track): void {
  const now = current as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    // Free-text and bookkeeping fields are not settings a player toggled.
    if (key === "devUserKey" || key === "bigBoardChosen" || NOISY_SETTING.test(key) || now[key] === value) continue;
    emit("setting_changed", { key });
  }
}

/**
 * game_start and game_done, once per match. The launcher stashes the mode before the room exists; the first view of
 * a new match id claims it, so a reload, a reconnect or a rematch is not counted as a new launch.
 */
export function createGameEvents(emit: Emit = track) {
  let stashed: string | undefined;
  const modes = new Map<string, string>();
  const done = new Set<string>();
  return {
    stash(mode: string): void {
      stashed = mode;
    },
    started(matchId: string, leader: string | null | undefined, fallbackMode: string): void {
      if (modes.has(matchId)) return;
      const mode = stashed ?? fallbackMode;
      stashed = undefined;
      modes.set(matchId, mode);
      emit("game_start", { mode, ...(leader ? { leader } : {}) });
    },
    finished(matchId: string, fallbackMode: string): void {
      if (done.has(matchId)) return;
      done.add(matchId);
      emit("game_done", { mode: modes.get(matchId) ?? fallbackMode });
    },
  };
}

export const gameEvents = createGameEvents();
