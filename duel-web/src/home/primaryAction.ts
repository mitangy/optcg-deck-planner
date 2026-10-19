import type { LastMode } from "./lastMode";

export type PrimaryAction =
  /** No last mode: the chooser. */
  | { act: "choose"; mode: null; subline: string }
  /** Ranked: start the queue now. */
  | { act: "start"; mode: "queue"; subline: string }
  /** Everything else: the setup sheet at that mode. */
  | { act: "sheet"; mode: Exclude<LastMode, "queue">; subline: string };

const SUBLINE: Record<LastMode, string> = {
  queue: "Ranked · 15 min per player",
  hotseat: "Practice",
  create: "Private room",
  spectate: "Spectate",
};

/** What the big Play button, or a mode tile, does for a mode. */
export function primaryAction(mode: LastMode | null): PrimaryAction {
  if (mode === null) return { act: "choose", mode: null, subline: "Choose a mode" };
  if (mode === "queue") return { act: "start", mode, subline: SUBLINE[mode] };
  return { act: "sheet", mode, subline: SUBLINE[mode] };
}

const TILE_ORDER: readonly LastMode[] = ["queue", "hotseat", "create", "spectate"];

/** The tiles under Play: every mode but the one Play already repeats. */
export function modeTiles(lastMode: LastMode | null): LastMode[] {
  return TILE_ORDER.filter((m) => m !== lastMode);
}
