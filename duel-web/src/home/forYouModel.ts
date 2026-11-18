export type ForYouMatch = { id: string; opponent: string; won: boolean; finished?: boolean };

export type ForYouItem =
  | { kind: "review"; to: string; title: string; blurb: string }
  | { kind: "spectate"; title: string; blurb: string };

/** What a signed-in player sees in place of the sales pitch: only things the lobby has already loaded. */
export function forYouItems(input: { lastMatch: ForYouMatch | null; liveMatches: number | null }): ForYouItem[] {
  const items: ForYouItem[] = [];
  const { lastMatch, liveMatches } = input;
  if (lastMatch) {
    const result = lastMatch.finished === false ? "Cut off" : lastMatch.won ? "Won" : "Lost";
    items.push({
      kind: "review",
      to: `/history/${encodeURIComponent(lastMatch.id)}`,
      title: "Review your last game",
      blurb: `${result} vs ${lastMatch.opponent}`,
    });
  }
  if (liveMatches !== null && liveMatches > 0) {
    items.push({
      kind: "spectate",
      title: "Spectate",
      blurb: liveMatches === 1 ? "1 match live now" : `${liveMatches} matches live now`,
    });
  }
  return items;
}
