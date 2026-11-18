import type { LastMode } from "./lastMode";

export type PrimaryAction =
  | { act: "choose"; mode: null; subline: string }
  | { act: "start"; mode: "queue"; subline: string }
  | { act: "sheet"; mode: Exclude<LastMode, "queue">; subline: string };

const SUBLINE: Record<LastMode, string> = {
  queue: "Ranked · 15 min per player",
  hotseat: "Practice",
  bot: "Play vs Bot",
  create: "Private room",
  spectate: "Spectate",
};

export function primaryAction(mode: LastMode | null): PrimaryAction {
  if (mode === null) return { act: "choose", mode: null, subline: "Choose a mode" };
  if (mode === "queue") return { act: "start", mode, subline: SUBLINE[mode] };
  return { act: "sheet", mode, subline: SUBLINE[mode] };
}

const TILE_ORDER: readonly LastMode[] = ["queue", "hotseat", "bot", "create", "spectate"];

export function modeTiles(lastMode: LastMode | null): LastMode[] {
  return TILE_ORDER.filter((m) => m !== lastMode);
}
