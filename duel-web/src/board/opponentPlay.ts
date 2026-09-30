import type { BattleLogEntry, LogTone } from "./battleLog";

export type OpponentPlay = {
  entryId: string;
  defId: string;
  turn: number;
  /** Past-tense phrase for the preview caption ("played", "countered", …). */
  verb: string;
};

/** Log tones that mean "this player used a card" (attacks, KOs, draws… are not plays). */
const VERB_BY_TONE: Partial<Record<LogTone, string>> = {
  play: "played",
  counter: "countered",
  trigger: "triggered",
  effect: "activated",
};

/**
 * Newest log entry where the opponent used a card, for the idle preview panel.
 * `effect` lines also cover cards bounced back to hand, so only "activates its
 * effect" lines count there.
 */
export function latestOpponentPlay(
  entries: readonly BattleLogEntry[],
  oppSeat: 0 | 1,
): OpponentPlay | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    const verb = VERB_BY_TONE[e.tone];
    if (!verb) continue;
    if (e.tone === "effect" && !e.text.endsWith("activates its effect")) continue;
    const seg = e.segments.find((s) => s.kind === "card");
    if (seg?.kind !== "card" || seg.ownerSeat !== oppSeat) continue;
    return { entryId: e.id, defId: seg.defId, turn: e.turn, verb };
  }
  return null;
}

export function opponentPlayCaption(play: Pick<OpponentPlay, "verb" | "turn">): string {
  return `Opponent ${play.verb} \u00b7 Turn ${play.turn}`;
}
