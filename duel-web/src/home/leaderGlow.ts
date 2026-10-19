/** Space-separated RGB of a leader's first colour, for the glow behind its card on the lobby. */
const GLOW: Record<string, string> = {
  red: "214 69 62",
  green: "63 160 104",
  blue: "58 134 214",
  purple: "150 98 200",
  black: "132 146 160",
  yellow: "232 190 64",
};

export function leaderGlow(colors: readonly string[]): string | undefined {
  return GLOW[(colors[0] ?? "").toLowerCase()];
}
