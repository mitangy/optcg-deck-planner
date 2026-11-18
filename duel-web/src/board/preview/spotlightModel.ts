import type { BattleLogEntry, CardSpotlight } from "../match/battleLog";
import type { MotionPlan } from "../motion/motionSpeed";
import { entriesSince } from "../motion/revealCues";

export type SpotlightCard = CardSpotlight & { entryId: string };

export type SpotlightGroup = { ownerSeat: 0 | 1; cards: SpotlightCard[]; more: number };

export type SpotlightBatch = { id: string; groups: SpotlightGroup[] };

export const SPOTLIGHT_MAX_CARDS = 3;

export function newSpotlightBatch(
  prevLastId: string | null | undefined,
  entries: readonly BattleLogEntry[],
): SpotlightBatch | null {
  const cards: SpotlightCard[] = [];
  for (const e of entriesSince(prevLastId, entries)) {
    if (e.spotlight) cards.push({ ...e.spotlight, entryId: e.id });
  }
  if (cards.length === 0) return null;
  const groups: SpotlightGroup[] = [];
  for (const seat of [0, 1] as const) {
    const mine = cards.filter((c) => c.ownerSeat === seat);
    if (mine.length === 0) continue;
    groups.push({
      ownerSeat: seat,
      cards: mine.slice(0, SPOTLIGHT_MAX_CARDS),
      more: Math.max(0, mine.length - SPOTLIGHT_MAX_CARDS),
    });
  }
  return { id: cards[0]!.entryId, groups };
}

export const SPOTLIGHT_MS = { enter: 200, hold: 900, exit: 340, fade: 140 } as const;

export type SpotlightTiming = {
  enter: number;
  hold: number;
  exit: number;
  travel: boolean;
};

// With more batches waiting the hold is halved again so the spotlight catches up with play.
export function spotlightTiming(plan: MotionPlan, waiting: number): SpotlightTiming | null {
  if (plan.mode === "off") return null;
  const catchUp = waiting > 0 ? 0.5 : 1;
  if (plan.mode === "fade") {
    return {
      enter: SPOTLIGHT_MS.fade,
      hold: Math.round(SPOTLIGHT_MS.hold * catchUp),
      exit: SPOTLIGHT_MS.fade,
      travel: false,
    };
  }
  const s = plan.scale;
  return {
    enter: Math.round(SPOTLIGHT_MS.enter * s),
    hold: Math.round(SPOTLIGHT_MS.hold * s * catchUp),
    exit: Math.round(SPOTLIGHT_MS.exit * s),
    travel: true,
  };
}
