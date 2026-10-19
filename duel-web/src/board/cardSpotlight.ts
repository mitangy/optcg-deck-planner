/**
 * Card spotlight: each card played or trashed (K.O., counter, discard, mill,
 * Life trashed ...), and your own Draw Phase card, is shown big over its owner's half of the board for a
 * moment, then shrinks into the spot it went to (a drawn card: your hand). Pure planning here; the
 * layer that draws it is CardSpotlight.tsx.
 *
 * Driven by the battle log (`BattleLogEntry.spotlight`), so it names the same
 * cards the log does and never shows a card hidden from this viewer.
 */
import type { BattleLogEntry, CardSpotlight } from "./battleLog";
import type { MotionPlan } from "./motionSpeed";
import { entriesSince } from "./revealCues";

export type SpotlightCard = CardSpotlight & { entryId: string };

/** One owner's cards from one log update, shown side by side over that owner's half. */
export type SpotlightGroup = { ownerSeat: 0 | 1; cards: SpotlightCard[]; more: number };

/** Everything one log update played or trashed; both owners' groups show at once. */
export type SpotlightBatch = { id: string; groups: SpotlightGroup[] };

/** Cards shown per owner at once; a bigger burst (a mill of 5) adds "+N more". */
export const SPOTLIGHT_MAX_CARDS = 3;

/**
 * The spotlight batch for the log entries added since `prevLastId` (none on
 * mount, resync or undo, see `entriesSince`), or null when nothing new was
 * played or trashed.
 */
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

/** Base timings in ms at Normal speed. */
export const SPOTLIGHT_MS = { enter: 200, hold: 900, exit: 340, fade: 140 } as const;

export type SpotlightTiming = {
  enter: number;
  hold: number;
  exit: number;
  /** Fly into the card's new spot on the way out; false = fade in place (reduced motion). */
  travel: boolean;
};

/**
 * How long a batch stays up. Animations Off shows nothing; reduced motion
 * fades in and out without moving; Fast halves everything. With more batches
 * waiting the hold is halved again so the spotlight catches up with play.
 */
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
