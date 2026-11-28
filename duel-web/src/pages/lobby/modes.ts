export type PlayMode = "casual" | "hotseat" | "bot" | "create" | "join" | "queue" | "spectate";

/** Under "More" on the home page. Play vs Bot lives only here: the old big button and tile were the same thing twice. */
export const MORE_MODES: Array<{ mode: "queue" | "bot" | "hotseat" | "spectate"; title: string; short: string }> = [
  { mode: "queue", title: "Ranked", short: "Bounty on the line · 15 min each" },
  { mode: "bot", title: "Play vs Bot", short: "Easy, Normal or Hard" },
  { mode: "hotseat", title: "Practice", short: "Both sides on this device" },
  { mode: "spectate", title: "Spectate", short: "Watch a room" },
];

export const MODE_COPY: Record<PlayMode, { title: string; confirm: string }> = {
  casual: { title: "Play now", confirm: "Find a game" },
  hotseat: { title: "Practice", confirm: "Start practice" },
  bot: { title: "Play vs Bot", confirm: "Start game" },
  create: { title: "Private room", confirm: "Create room" },
  join: { title: "Private room", confirm: "Join room" },
  queue: { title: "Ranked", confirm: "Find match" },
  spectate: { title: "Spectate", confirm: "Watch" },
};

export function modeTitle(mode: PlayMode | null): string {
  return mode ? MODE_COPY[mode].title : "Play";
}

export function confirmLabel(mode: PlayMode | null): string {
  return mode ? MODE_COPY[mode].confirm : MODE_COPY.spectate.confirm;
}
