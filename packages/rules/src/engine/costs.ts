/**
 * Cost payability and hidden-information checks.
 */
import type { Cost, Selector } from "../effects/types.js";
import type { MatchState } from "../types.js";
import { activeDon, donOnField, otherSeat } from "./state.js";
import type { EvalCtx } from "./evalCtx.js";
import { locateCard } from "./statics.js";
import { hasRestriction } from "./stats.js";
import { candidates, onField } from "./selectors.js";

// ---------------------------------------------------------------------------
// Cost payability
// ---------------------------------------------------------------------------

/**
 * The groups of Life cards (indices, 0 = top) a face-up/down turn may flip, each group being one legal choice.
 * Default / "top": the top `count` cards, all of which must currently be the opposite way. "top_or_bottom":
 * the top `count` or the bottom `count`. "any": any single card that is currently the opposite way (#492).
 */
export function lifeFaceGroups(faceUpLife: boolean[], count: number, toFaceUp: boolean, position: "top" | "top_or_bottom" | "any" = "top"): number[][] {
  const n = faceUpLife.length;
  if (n < count) return [];
  const ok = (indices: number[]) => indices.every((i) => faceUpLife[i] !== toFaceUp);
  const top = Array.from({ length: count }, (_, i) => i);
  if (position === "top") return ok(top) ? [top] : [];
  if (position === "top_or_bottom") {
    const bottom = Array.from({ length: count }, (_, i) => n - count + i);
    const groups = [top, bottom].filter(ok);
    return groups.length === 2 && top.some((i) => bottom.includes(i)) ? [groups[0]!] : groups;
  }
  const flippable = faceUpLife.map((up, i) => (up !== toFaceUp ? i : -1)).filter((i) => i >= 0);
  if (flippable.length < count) return [];
  return count === 1 ? flippable.map((i) => [i]) : [flippable.slice(0, count)];
}

export function canPayCost(state: MatchState, ctx: EvalCtx, cost: Cost): boolean {
  const p = state.players[ctx.seat];
  const src = locateCard(state, ctx.sourceId);
  switch (cost.k) {
    case "rest_don": return activeDon(p).length >= cost.count;
    case "return_don": return donOnField(p) >= cost.count;
    case "trash_hand": case "reveal_hand": case "hand_to_deck_bottom":
      return candidates(state, ctx, { player: "you", zone: "hand", ...(cost.filter ? { filter: cost.filter } : {}) }).filter((l) => l.id !== ctx.sourceId).length >= cost.count;
    case "rest_self": return src?.card != null && onField(src) && !src.card.rested && !hasRestriction(state, src.seat, src.card, "cannot_be_rested");
    case "trash_self": case "self_to_hand": case "self_to_deck_bottom": return src != null && (src.zone === "character" || src.zone === "stage");
    // DON!! in the cost area ("rest 1 of your cards") has no card; it counts when it is active.
    case "rest_cards": return candidates(state, ctx, cost.selector).filter((l) => (l.card ? !l.card.rested : l.zone === "don" && state.players[l.seat].costArea[l.index]?.rested === false)).length >= cost.count;
    case "trash_cards": case "return_cards_to_hand": case "cards_to_deck_bottom": return candidates(state, ctx, cost.selector).length >= cost.count;
    case "trash_to_deck_bottom": return candidates(state, ctx, { player: "you", zone: "trash", ...(cost.filter ? { filter: cost.filter } : {}) }).length >= cost.count;
    case "life_to_hand": case "trash_life": return p.life.length >= cost.count;
    case "return_active_don": return activeDon(p).length >= cost.count;
    case "ko_cards": return candidates(state, ctx, cost.selector).filter((l) => l.card && !hasRestriction(state, l.seat, l.card, "cannot_be_ko") && !hasRestriction(state, l.seat, l.card, "cannot_be_ko_by_effect")).length >= cost.count;
    case "give_don": return activeDon(p).length >= cost.count && candidates(state, ctx, cost.selector).length > 0;
    case "play_from_hand": return candidates(state, ctx, { player: "you", zone: "hand", filter: { ...(cost.filter ?? {}), excludeSelf: true } }).length >= cost.count;
    case "hand_to_deck_top": return p.hand.filter((c) => c.id !== ctx.sourceId).length >= cost.count;
    case "trash_to_deck_shuffle": return p.trash.length >= cost.count;
    case "life_face_down": return lifeFaceGroups(p.faceUpLife, cost.count, false, cost.position).length > 0;
    case "life_face_up": return lifeFaceGroups(p.faceUpLife, cost.count, true, cost.position).length > 0;
    case "mill": return p.deck.length >= cost.count;
    case "power": return cost.target !== "active_leader" || !p.leader.rested;
    case "give_opponent_don": { const o = state.players[otherSeat(ctx.seat)]; return o.costArea.filter((d) => d.rested).length >= cost.count && o.characters.length > 0; }
    case "place_self_in_life": return src != null && src.zone !== "life";
    case "return_don_any": return p.costArea.length >= 1;
    case "either": return cost.options.some((option) => option.every((c) => canPayCost(state, ctx, c)));
    case "unattach_don": return p.attachedDons.length >= cost.count;
  }
}

const HIDDEN_ZONES: ReadonlySet<string> = new Set(["hand", "deck", "life", "hand_or_trash", "deck_top"]);

/** True when the selector (or a union member) draws from a zone whose contents the opponent cannot see. */
export function selectorReadsHiddenZone(selector: Selector): boolean {
  return HIDDEN_ZONES.has(selector.zone) || (selector.also ?? []).some(selectorReadsHiddenZone);
}

/**
 * True when whether the cost can be paid depends on hidden cards (#369): a hand/deck/Life selection narrowed by a
 * filter. Counts alone (hand size, Life count, rested DON!!, field cards, trash) are public, so those costs
 * keep the old "unpayable means silently declined" behavior.
 */
export function costDependsOnHiddenInfo(cost: Cost): boolean {
  switch (cost.k) {
    case "trash_hand": case "reveal_hand": case "hand_to_deck_bottom": case "play_from_hand":
      return cost.filter != null && Object.keys(cost.filter).length > 0;
    case "rest_cards": case "trash_cards": case "return_cards_to_hand": case "cards_to_deck_bottom": case "ko_cards": case "give_don":
      return selectorReadsHiddenZone(cost.selector) && (cost.selector.filter != null || (cost.selector.also ?? []).some((s) => s.filter != null));
    case "either": return cost.options.some((option) => option.some(costDependsOnHiddenInfo));
    default: return false;
  }
}

export function canPayCosts(state: MatchState, ctx: EvalCtx, costs: readonly Cost[]): boolean {
  return costs.every((c) => canPayCost(state, ctx, c));
}
