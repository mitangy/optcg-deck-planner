/** Pure rules for the Log Pose matchup brief on the board (the component is MatchBrief.tsx). */

/**
 * Whether this player is offered a brief. All of: the server said the room is unranked (an older server
 * says nothing, which is "don't know" and so no), a player's seat, a ticket, Log Pose on for the account,
 * and the setting on.
 */
export function briefShown(o: {
  ranked: boolean | null | undefined;
  role: "player" | "spectator";
  brief: unknown;
  logPoseEnabled: boolean | null;
  setting: boolean;
}): boolean {
  return o.ranked === false && o.role === "player" && Boolean(o.brief) && o.logPoseEnabled === true && o.setting;
}

/**
 * What the card does once it knows whether a brief is saved: show it, offer to write one (the tap),
 * or write one now (the "Write briefs automatically" setting, or the player just asked).
 */
export function briefStart(o: { cached: boolean; auto: boolean; requested: boolean }): "show" | "offer" | "generate" {
  if (o.cached) return "show";
  return o.auto || o.requested ? "generate" : "offer";
}

export type BriefOpen = { open: boolean; autoClosed: boolean };

/** The card folds away once, when the game first leaves the mulligan; after that it opens only when tapped. */
export function briefOpenAfter(prev: BriefOpen, phase: string | null | undefined): BriefOpen {
  if (!phase || phase === "mulligan" || prev.autoClosed) return prev;
  return { open: false, autoClosed: true };
}

/** sessionStorage key for "this room's brief has already opened by itself" (the room, so a rematch or reload doesn't pop it again). */
export function briefSeenKey(roomMatchId: string): string {
  return `optcg-duel:brief-seen:${roomMatchId}`;
}
