import type { BattleLogEntry } from "../match/battleLog";
import { cardUseOf } from "../motion/opponentPlay";

export type BattleLogFilter = "all" | "plays";

export const BATTLE_LOG_FILTER_KEY = "duel.battleLogFilter";

export function filterBattleLog(entries: readonly BattleLogEntry[], filter: BattleLogFilter): readonly BattleLogEntry[] {
  return filter === "plays" ? entries.filter((e) => cardUseOf(e) != null) : entries;
}

export function loadBattleLogFilter(): BattleLogFilter {
  try {
    return localStorage.getItem(BATTLE_LOG_FILTER_KEY) === "plays" ? "plays" : "all";
  } catch {
    return "all";
  }
}

export function saveBattleLogFilter(filter: BattleLogFilter): void {
  try {
    localStorage.setItem(BATTLE_LOG_FILTER_KEY, filter);
  } catch {
    // Private mode or blocked storage: the choice just lasts until the panel closes.
  }
}
