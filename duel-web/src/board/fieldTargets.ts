import type { ChoiceOptionView, PendingChoiceView } from "../net/protocol";

/** Toggle one id in a pick list that holds at most `max` ids (a single pick swaps). */
export function toggleSelection(selected: readonly string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (max === 1) return [id];
  return selected.length >= max ? [...selected] : [...selected, id];
}

/** One-tap: exactly one pick is wanted, so choosing it answers at once. */
export function resolvesOnPick(oneTap: boolean, min: number, max: number): boolean {
  return oneTap && min === 1 && max === 1;
}

/** "Choose 1" / "Choose up to 2" / "Choose 1–3", plus how many are picked when more than one can be. */
export function pickCaption(min: number, max: number, selectedCount: number): string {
  const range = min === max ? `${max}` : min === 0 ? `up to ${max}` : `${min}–${max}`;
  return max > 1 ? `Choose ${range} · selected ${selectedCount}` : `Choose ${range}`;
}

/**
 * Where a pickable option sits on the board:
 * - `card:<id>`: a Leader / Character / Stage tile;
 * - `don:<you|opp>:<active|rested>`: a DON!! in a cost area (cost-area DON!!
 *   of one state are interchangeable, so any chip of that state stands for it);
 * - `host:<id>`: a DON!! attached to that Leader / Character (tap the card);
 * - `hand:<id>`: a card in your own hand (tap it in the hand).
 */
export type BoardSpot = string;

/** What the board shows for a field card: whose it is, its name, DON!! under it. */
export type BoardCardInfo = { seat: number; name: string; attachedDonCount?: number };

const DON_ON = "DON!! on ";

function spotFor(option: ChoiceOptionView, cards: ReadonlyMap<string, BoardCardInfo>, mySeat: number): BoardSpot | null {
  if (option.zone !== "don") return option.instanceId && cards.has(option.instanceId) ? `card:${option.instanceId}` : null;
  if (option.ownerSeat == null) return null;
  const label = option.label ?? "";
  if (label.startsWith(DON_ON)) {
    // Attached DON!!: the server names the card it sits under. Two cards of
    // that name with DON!! under them can't be told apart: keep the pop-up.
    const name = label.slice(DON_ON.length);
    const hosts = [...cards].filter(([, c]) => c.seat === option.ownerSeat && c.name === name && (c.attachedDonCount ?? 0) > 0);
    return hosts.length === 1 ? `host:${hosts[0]![0]}` : null;
  }
  if (label === "Active DON!!" || label === "Rested DON!!") {
    return `don:${option.ownerSeat === mySeat ? "you" : "opp"}:${option.rested ? "rested" : "active"}`;
  }
  return null;
}

/**
 * Board spot of every pickable option when all of them can be tapped on the
 * board (field cards, cost-area DON!!, DON!! under a field card), else null
 * and the pop-up grid is used. Ineligible options are left out: they can't
 * be picked.
 */
export function boardPickSpots(
  options: readonly ChoiceOptionView[],
  cards: ReadonlyMap<string, BoardCardInfo>,
  mySeat: number,
): Map<string, BoardSpot> | null {
  const pickable = options.filter((o) => o.eligible);
  if (!pickable.length) return null;
  const spots = new Map<string, BoardSpot>();
  // Only your own hand cards (e.g. "trash any number of cards from your hand"): tap them in the hand.
  if (pickable.every((o) => isOwnHandCard(o, mySeat))) {
    for (const option of pickable) spots.set(option.id, `hand:${option.instanceId}`);
    return spots;
  }
  for (const option of pickable) {
    const spot = spotFor(option, cards, mySeat);
    if (!spot) return null;
    spots.set(option.id, spot);
  }
  return spots;
}

function isOwnHandCard(option: ChoiceOptionView, mySeat: number): boolean {
  return option.zone === "hand" && option.ownerSeat === mySeat && !!option.instanceId;
}

/** The front choice is mine and is answered by tapping cards in my hand: keep the hand in view. */
export function isHandPick(choice: PendingChoiceView | undefined, mySeat: number | null): boolean {
  const request = choice?.request;
  if (mySeat == null || choice?.seat !== mySeat || request?.type !== "select") return false;
  const pickable = request.options.filter((o) => o.eligible);
  return pickable.length > 0 && pickable.every((o) => isOwnHandCard(o, mySeat));
}

/** Picks so far, plus which cost-area DON!! chip stands for each DON!! pick. */
export type BoardPick = { selected: string[]; chips: Record<string, string> };

/**
 * A tap on a board spot (on a cost-area chip when `chipId` is given). Tapping
 * a picked chip or card drops it; otherwise the next unpicked option there is
 * added (a single pick swaps). A card with several DON!! under it counts up
 * one per tap, and once all are picked the next tap drops them.
 */
export function tapBoardSpot(
  pick: BoardPick,
  spots: ReadonlyMap<string, BoardSpot>,
  spot: BoardSpot,
  max: number,
  chipId?: string,
): BoardPick {
  const here = [...spots].filter(([, s]) => s === spot).map(([id]) => id);
  if (chipId != null) {
    const held = Object.keys(pick.chips).find((id) => pick.chips[id] === chipId && pick.selected.includes(id));
    if (held) return dropPicks(pick, [held]);
  }
  const free = here.find((id) => !pick.selected.includes(id));
  if (!free) return chipId != null ? pick : dropPicks(pick, here);
  const chips = chipId != null ? { [free]: chipId } : {};
  if (max === 1) return { selected: [free], chips };
  if (pick.selected.length >= max) return pick;
  return { selected: [...pick.selected, free], chips: { ...pick.chips, ...chips } };
}

function dropPicks(pick: BoardPick, ids: readonly string[]): BoardPick {
  const chips = { ...pick.chips };
  for (const id of ids) delete chips[id];
  return { selected: pick.selected.filter((id) => !ids.includes(id)), chips };
}
