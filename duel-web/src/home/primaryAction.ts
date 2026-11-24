import type { LastMode } from "./lastMode";

export type PrimaryAction = {
  mode: LastMode;
  act: "start" | "sheet";
  title: string;
  subline: string;
  /** True when `mode` is the one the player last used (the button says "Last played"). */
  remembered: boolean;
};

const TITLE: Record<LastMode, string> = {
  queue: "Play Ranked",
  bot: "Play vs Bot",
  hotseat: "Practice",
  create: "Private room",
};

const DESCRIPTION: Record<LastMode, string> = {
  queue: "15 min per player",
  bot: "Casual, vs computer",
  hotseat: "Both sides on this device",
  create: "Play a friend",
};

export function primaryAction(remembered: LastMode | null, signedIn: boolean): PrimaryAction {
  const usable = remembered !== null && (remembered !== "queue" || signedIn);
  const mode: LastMode = usable ? remembered : signedIn ? "queue" : "bot";
  return {
    mode,
    act: usable && mode === "queue" ? "start" : "sheet",
    title: TITLE[mode],
    subline: usable ? "Last played" : DESCRIPTION[mode],
    remembered: usable,
  };
}
