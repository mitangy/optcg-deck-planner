export type PlayMode = "hotseat" | "bot" | "create" | "join" | "queue" | "spectate";

export const MODE_CARDS: Array<{ mode: Exclude<PlayMode, "join">; title: string; short: string }> = [
  { mode: "queue", title: "Ranked", short: "15 min each" },
  { mode: "bot", title: "Play vs Bot", short: "Vs computer" },
  { mode: "hotseat", title: "Practice", short: "Both sides" },
  { mode: "create", title: "Private room", short: "Play a friend" },
  { mode: "spectate", title: "Spectate", short: "Watch a room" },
];

export const MODE_COPY: Record<PlayMode, { title: string; confirm: string }> = {
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
