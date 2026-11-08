/** Which play mode the user is configuring inside the Play sheet. */
export type PlayMode = "hotseat" | "bot" | "create" | "join" | "queue" | "spectate";

export const MODE_CARDS: Array<{
  mode: PlayMode;
  title: string;
  blurb: string;
  /** Under the title on the home tiles. */
  short: string;
  glyph: string;
}> = [
  {
    mode: "hotseat",
    title: "Practice",
    blurb: "Play both sides on this device.",
    short: "Both sides",
    glyph: "☸︎",
  },
  {
    mode: "bot",
    title: "Play vs Bot",
    blurb: "Play the computer. Casual, never ranked.",
    short: "Vs computer",
    glyph: "⚙︎",
  },
  {
    mode: "queue",
    title: "Ranked",
    blurb: "Match a random opponent. 15 minutes per player.",
    short: "15 min each",
    glyph: "⚓︎",
  },
  {
    mode: "create",
    title: "Private room",
    blurb: "Create a room or join a friend's by id.",
    short: "Play a friend",
    glyph: "✉︎",
  },
  {
    mode: "spectate",
    title: "Spectate",
    blurb: "Watch a room in progress.",
    short: "Watch a room",
    glyph: "◎︎",
  },
];

/** The sheet's heading and its confirm button for each mode. Create and Join share the "Private room" sheet. */
export const MODE_COPY: Record<PlayMode, { title: string; confirm: string }> = {
  hotseat: { title: "Practice", confirm: "Start practice" },
  bot: { title: "Play vs Bot", confirm: "Start game" },
  create: { title: "Private room", confirm: "Create room" },
  join: { title: "Private room", confirm: "Join room" },
  queue: { title: "Ranked", confirm: "Find match" },
  spectate: { title: "Spectate", confirm: "Watch" },
};

/** The sheet heading; "Play" while it is still at the mode chooser. */
export function modeTitle(mode: PlayMode | null): string {
  return mode ? MODE_COPY[mode].title : "Play";
}

export function confirmLabel(mode: PlayMode | null): string {
  return mode ? MODE_COPY[mode].confirm : MODE_COPY.spectate.confirm;
}
