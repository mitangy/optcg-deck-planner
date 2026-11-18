// An older server says nothing, which is "don't know" and so no.
export function briefShown(o: {
  ranked: boolean | null | undefined;
  role: "player" | "spectator";
  brief: unknown;
  logPoseEnabled: boolean | null;
  setting: boolean;
}): boolean {
  return o.ranked === false && o.role === "player" && Boolean(o.brief) && o.logPoseEnabled === true && o.setting;
}

export function briefStart(o: { cached: boolean; auto: boolean; requested: boolean }): "show" | "offer" | "generate" {
  if (o.cached) return "show";
  return o.auto || o.requested ? "generate" : "offer";
}

// A panel the player opened, or started using, stays.
export function briefFoldsAway(s: { auto: boolean; touched: boolean }, phase: string | null | undefined): boolean {
  return Boolean(phase) && phase !== "mulligan" && s.auto && !s.touched;
}

// Keyed by room, so a rematch or reload doesn't pop it again.
export function briefSeenKey(roomMatchId: string): string {
  return `optcg-duel:brief-seen:${roomMatchId}`;
}

export function matchLogPoseEntry(o: { briefShown: boolean; copilotShown: boolean }): "none" | "button" {
  return o.briefShown || o.copilotShown ? "button" : "none";
}
