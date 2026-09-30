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

export type CardUse = { defId: string; ownerSeat: 0 | 1; verb: string };

/**
 * The card a log entry shows being used (played, countered, triggered,
 * activated), or null for anything else. `effect` lines also cover cards
 * bounced back to hand, so only "activates its effect" lines count there.
 */
export function cardUseOf(e: BattleLogEntry): CardUse | null {
  const verb = VERB_BY_TONE[e.tone];
  if (!verb) return null;
  if (e.tone === "effect" && !e.text.endsWith("activates its effect")) return null;
  const seg = e.segments.find((s) => s.kind === "card");
  if (seg?.kind !== "card" || seg.ownerSeat == null) return null;
  return { defId: seg.defId, ownerSeat: seg.ownerSeat, verb };
}

/** Newest log entry where the opponent used a card, for the idle preview panel. */
export function latestOpponentPlay(
  entries: readonly BattleLogEntry[],
  oppSeat: 0 | 1,
): OpponentPlay | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    const use = cardUseOf(e);
    if (!use || use.ownerSeat !== oppSeat) continue;
    return { entryId: e.id, defId: use.defId, turn: e.turn, verb: use.verb };
  }
  return null;
}

export function opponentPlayCaption(play: Pick<OpponentPlay, "verb" | "turn">): string {
  return `Opponent ${play.verb} \u00b7 Turn ${play.turn}`;
}
