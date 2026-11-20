/** The OPTCGSim deck code for a deck: the Leader first, then one `NxID` line per distinct main-deck card, sorted by id. */
export function deckListText(deck: { leaderId: string; cards: string[] }): string {
  const counts = new Map<string, number>();
  for (const id of deck.cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const lines = [`1x${deck.leaderId}`];
  for (const id of [...counts.keys()].sort()) lines.push(`${counts.get(id)}x${id}`);
  return lines.join("\n");
}
