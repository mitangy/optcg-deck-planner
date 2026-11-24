import type { ChoiceOptionView, PendingChoiceView } from "../../net/protocol";

export function toggleSelection(selected: readonly string[], id: string, max: number): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (max === 1) return [id];
  return selected.length >= max ? [...selected] : [...selected, id];
}

export function nameTakenIds(
  options: readonly ChoiceOptionView[],
  selected: readonly string[],
  distinctNames: boolean | undefined,
  nameOf: (option: ChoiceOptionView) => string | null,
): Set<string> {
  if (!distinctNames) return new Set();
  const picked = new Set(options.filter((o) => selected.includes(o.id)).map(nameOf).filter((n): n is string => n != null));
  return new Set(options.filter((o) => !selected.includes(o.id) && picked.has(nameOf(o) ?? "")).map((o) => o.id));
}

export function resolvesOnPick(oneTap: boolean, min: number, max: number): boolean {
  return oneTap && min === 1 && max === 1;
}

export function answersAtPick(oneTap: boolean, min: number, max: number, count: number): boolean {
  return oneTap && min === max && min >= 1 && count === max;
}

export function pickCaption(min: number, max: number, selectedCount: number): string {
  const range = min === max ? `${max}` : min === 0 ? `up to ${max}` : `${min}–${max}`;
  return max > 1 ? `Choose ${range} · selected ${selectedCount}` : `Choose ${range}`;
}

export type BoardSpot = string;

export type BoardCardInfo = { seat: number; name: string; attachedDonCount?: number };

const DON_ON = "DON!! on ";

function spotFor(option: ChoiceOptionView, cards: ReadonlyMap<string, BoardCardInfo>, mySeat: number): BoardSpot | null {
  if (option.zone !== "don") return option.instanceId && cards.has(option.instanceId) ? `card:${option.instanceId}` : null;
  if (option.ownerSeat == null) return null;
  const label = option.label ?? "";
  if (label.startsWith(DON_ON)) {
    // The server names the card a DON!! sits under. Two cards of that name with DON!! under them can't be told apart: keep the pop-up.
    const name = label.slice(DON_ON.length);
    const hosts = [...cards].filter(([, c]) => c.seat === option.ownerSeat && c.name === name && (c.attachedDonCount ?? 0) > 0);
    return hosts.length === 1 ? `host:${hosts[0]![0]}` : null;
  }
  if (label === "Active DON!!" || label === "Rested DON!!") {
    return `don:${option.ownerSeat === mySeat ? "you" : "opp"}:${option.rested ? "rested" : "active"}`;
  }
  return null;
}

export function boardPickSpots(
  options: readonly ChoiceOptionView[],
  cards: ReadonlyMap<string, BoardCardInfo>,
  mySeat: number,
): Map<string, BoardSpot> | null {
  const pickable = options.filter((o) => o.eligible);
  if (!pickable.length) return null;
  const spots = new Map<string, BoardSpot>();
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

export function isHandPick(choice: PendingChoiceView | undefined, mySeat: number | null): boolean {
  const request = choice?.request;
  if (mySeat == null || choice?.seat !== mySeat || request?.type !== "select") return false;
  const pickable = request.options.filter((o) => o.eligible);
  return pickable.length > 0 && pickable.every((o) => isOwnHandCard(o, mySeat));
}

export type BoardPick = { selected: string[]; chips: Record<string, string> };

// A card with several DON!! under it counts up one per tap; once none is left unpicked or the limit is reached a tap drops all its picks, so the card can always be un-picked.
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
  const heldHere = here.filter((id) => pick.selected.includes(id));
  if (chipId == null && heldHere.length && (!free || pick.selected.length >= max)) return dropPicks(pick, heldHere);
  if (!free) return pick;
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

// The second tap never un-picks.
export function doublePick(
  selected: readonly string[],
  id: string,
  min: number,
  max: number,
): { selected: string[]; answer: boolean } {
  const next = selected.includes(id) ? [...selected] : toggleSelection(selected, id, max);
  return { selected: next, answer: next.includes(id) && next.length >= min && next.length <= max };
}

// The second tap never drops what the spot holds.
export function doubleTapBoardSpot(
  pick: BoardPick,
  spots: ReadonlyMap<string, BoardSpot>,
  spot: BoardSpot,
  min: number,
  max: number,
  chipId?: string,
): { pick: BoardPick; answer: boolean } {
  const tapped = tapBoardSpot(pick, spots, spot, max, chipId);
  const added = tapped.selected.some((id) => !pick.selected.includes(id));
  const next = added ? tapped : pick;
  const holds = [...spots].some(([id, s]) => s === spot && next.selected.includes(id));
  return { pick: next, answer: holds && next.selected.length >= min && next.selected.length <= max };
}

// iOS doesn't reliably fire `dblclick`.
export function createDoubleTap(windowMs: number, now: () => number = Date.now) {
  let last: { key: string; at: number } | null = null;
  return {
    isDouble(key: string): boolean {
      const at = now();
      const double = last != null && last.key === key && at - last.at <= windowMs;
      last = double ? null : { key, at };
      return double;
    },
  };
}
