/**
 * Player choice resolution for pending effect choices.
 */
import { getCardDef } from "../cards/definitions.js";
import type { LookPick, Placement } from "../effects/types.js";
import type { ChoiceRequest, MatchState, PendingChoice, ResolutionFrame, Seat } from "../types.js";
import { costOf, evalValue, playerRestricted, powerOf } from "./queries.js";
import { isOnField, locate, putCard, takeCard } from "./state.js";
import type { Sim } from "./sim.js";
import { beginPlay } from "./zoneActions.js";
import { frameCtx } from "./vm.js";

// ---------------------------------------------------------------------------
// Choice resolution
// ---------------------------------------------------------------------------

export interface ChoiceAnswer {
  accept: boolean;
  selectedOptionIds?: string[];
  orderedOptionIds?: string[];
  topOptionIds?: string[];
}

/** Validate and apply an answer to the front effect choice. Returns an error string on rejection (no mutation). */
export function resolveEffectChoice(sim: Sim, choice: PendingChoice, answer: ChoiceAnswer): string | null {
  const { state } = sim;
  const frame = state.resolutionFrames.find((f) => f.id === choice.resolutionFrameId);
  if (!frame || frame.bindings._await !== choice.id) return "Ability continuation is missing";
  const request = choice.request;
  const b = choice.bindings ?? {};
  if (!request) return "Choice has no request";
  let apply: (() => void) | null = null;
  switch (request.type) {
    case "confirm": {
      if (!answer.accept && !choice.optional) return "This choice cannot be declined";
      if (answer.accept && choice.unpayable) return "You cannot pay this cost";
      apply = () => { frame.bindings[b.__bind!] = answer.accept; if (!answer.accept && choice.seat === frame.seat) frame.bindings.__declined = true; frame.operationIndex += 1; };
      break;
    }
    case "mode": {
      const picked = answer.selectedOptionIds ?? [];
      if (picked.length !== 1 || !request.options.some((o) => o.id === picked[0])) return "Choose exactly one option";
      if (request.options.find((o) => o.id === picked[0])?.eligible === false) return "That option is not available";
      const index = request.options.findIndex((o) => o.id === picked[0]);
      apply = () => { frame.bindings[b.__bind!] = index; if (!b.__repeat) frame.operationIndex += 1; };
      break;
    }
    case "select": {
      const picked = answer.accept ? answer.selectedOptionIds ?? [] : [];
      if (new Set(picked).size !== picked.length) return "Duplicate selection";
      if (picked.some((id) => !request.options.some((o) => o.id === id && o.eligible))) return "Selected option is invalid";
      if (picked.length < request.min || picked.length > request.max) return `Choose between ${request.min} and ${request.max} cards`;
      const ids = picked.map((id) => b[id]!);
      const donExists = (id: string) => state.players.some((p) => p.costArea.some((d) => d.id === id) || p.attachedDons.some((d) => d.id === id));
      for (const id of ids) if (!locate(state, id) && !donExists(id)) return "A selected card is no longer available";
      const meta = typeof frame.bindings._selectMeta === "string" ? JSON.parse(frame.bindings._selectMeta) as { totalCostAtMost: unknown; totalPowerAtMost: unknown; distinctNames: boolean } : null;
      if (meta?.totalCostAtMost != null) {
        const ctx = frameCtx(frame);
        const limit = evalValue(state, ctx, meta.totalCostAtMost as number);
        const total = ids.reduce((n, id) => { const loc = locate(state, id)!; return n + (loc.card && isOnField(loc) ? costOf(state, loc.seat, loc.card) : getCardDef(loc.defId).cost); }, 0);
        if (total > limit) return `Total cost must be ${limit} or less`;
      }
      if (meta?.totalPowerAtMost != null) {
        const ctx = frameCtx(frame);
        const limit = evalValue(state, ctx, meta.totalPowerAtMost as number);
        const total = ids.reduce((n, id) => { const loc = locate(state, id)!; return n + (loc.card && isOnField(loc) ? powerOf(state, loc.seat, loc.card) : getCardDef(loc.defId).power ?? 0); }, 0);
        if (total > limit) return `Total power must be ${limit} or less`;
      }
      if (meta?.distinctNames) {
        const names = ids.map((id) => getCardDef(locate(state, id)!.defId).name);
        if (new Set(names).size !== names.length) return "Choose cards with different names";
      }
      apply = () => { frame.bindings[b.__bind!] = ids; delete frame.bindings._selectMeta; frame.operationIndex += 1; };
      break;
    }
    case "look": {
      const err = validateLook(state, request, answer);
      if (err) return err;
      apply = () => applyLook(sim, frame, choice, answer);
      break;
    }
    case "order": {
      const ids = request.options.map((o) => o.id);
      const ordered = answer.orderedOptionIds ?? ids;
      if (ordered.length !== ids.length || new Set(ordered).size !== ids.length || ordered.some((id) => !ids.includes(id))) return "Order must include every option exactly once";
      const top = answer.topOptionIds ?? (request.allowTopOrBottom ? ordered : []);
      if (!request.allowTopOrBottom && (answer.topOptionIds ?? []).length) return "This effect does not allow bottom placement";
      if (top.some((id) => !ids.includes(id))) return "Invalid top placement";
      // "Top or bottom" moves the cards together: all on top or all on the bottom.
      if (top.length !== 0 && new Set(top).size !== ids.length) return "Place every card on the same side";
      apply = () => {
        const meta = JSON.parse(b.__lifeOrder!) as { seat: Seat; count: number; topOrBottom: boolean };
        const p = state.players[meta.seat];
        const entries = ordered.map((optionId) => {
          const id = b[optionId]!;
          const index = p.zoneInstanceIds.life.indexOf(id);
          const faceUp = Boolean(p.faceUpLife[index]);
          return { entry: takeCard(state, { seat: meta.seat, zone: "life", index, id, defId: p.life[index]! }), faceUp, top: !meta.topOrBottom || top.includes(optionId) };
        });
        const tops = entries.filter((e) => e.top).reverse();
        for (const e of tops) putCard(state, meta.seat, "life", e.entry, { position: "top", faceUp: e.faceUp });
        for (const e of entries.filter((x) => !x.top)) putCard(state, meta.seat, "life", e.entry, { position: "bottom", faceUp: e.faceUp });
        frame.operationIndex += 1;
      };
      break;
    }
  }
  state.pendingChoices = state.pendingChoices.filter((c) => c.id !== choice.id);
  delete frame.bindings._await;
  apply();
  sim.events.push({ type: "pending_choice_resolved", seat: choice.seat, kind: choice.kind, cardDefId: choice.cardDefId, accepted: answer.accept, ...(choice.privateToSeat != null ? { privateToSeat: choice.privateToSeat } : {}) });
  return null;
}

function validateLook(state: MatchState, request: Extract<ChoiceRequest, { type: "look" }>, answer: ChoiceAnswer): string | null {
  void state;
  const picked = answer.selectedOptionIds ?? [];
  if (new Set(picked).size !== picked.length) return "Duplicate selection";
  if (picked.length > request.maxSelect || picked.length < request.minSelect) return `Choose up to ${request.maxSelect} card(s)`;
  if (picked.some((id) => !request.options.some((o) => o.id === id))) return "Selected option is invalid";
  if (!assignGroups(picked, request.groups)) return "Selected cards do not satisfy the effect's requirements";
  const remaining = request.options.filter((o) => !picked.includes(o.id)).map((o) => o.id);
  const needsOrder = request.rest === "deck_bottom" || request.rest === "deck_top" || request.rest === "top_or_bottom";
  if (needsOrder) {
    const ordered = answer.orderedOptionIds ?? remaining;
    if (ordered.length !== remaining.length || new Set(ordered).size !== ordered.length || ordered.some((id) => !remaining.includes(id))) return "Remainder order must include every unselected card exactly once";
    if ((answer.topOptionIds ?? []).some((id) => !remaining.includes(id))) return "Top placements must be unselected cards";
    if (request.rest !== "top_or_bottom" && (answer.topOptionIds ?? []).length) return "This effect places the rest in one location";
    // "Top or bottom" moves the rest together: all on top or all on the bottom.
    const tops = answer.topOptionIds ?? [];
    if (tops.length !== 0 && new Set(tops).size !== remaining.length) return "Place every card on the same side";
  }
  return null;
}

/** Can each picked option be assigned to a distinct slot of a group that accepts it? */
function assignGroups(picked: string[], groups: { max: number; eligibleIds: string[] }[]): boolean {
  const capacity = groups.map((g) => g.max);
  const assign = (i: number): boolean => {
    if (i === picked.length) return true;
    for (let g = 0; g < groups.length; g += 1) {
      if (capacity[g]! > 0 && groups[g]!.eligibleIds.includes(picked[i]!)) {
        capacity[g]! -= 1;
        if (assign(i + 1)) return true;
        capacity[g]! += 1;
      }
    }
    return false;
  };
  return assign(0);
}

function groupAssignment(picked: string[], groups: { max: number; eligibleIds: string[] }[]): number[] {
  const capacity = groups.map((g) => g.max);
  const out: number[] = [];
  const assign = (i: number): boolean => {
    if (i === picked.length) return true;
    for (let g = 0; g < groups.length; g += 1) {
      if (capacity[g]! > 0 && groups[g]!.eligibleIds.includes(picked[i]!)) {
        capacity[g]! -= 1; out[i] = g;
        if (assign(i + 1)) return true;
        capacity[g]! += 1;
      }
    }
    return false;
  };
  assign(0);
  return out;
}

function applyLook(sim: Sim, frame: ResolutionFrame, choice: PendingChoice, answer: ChoiceAnswer): void {
  const { state } = sim;
  const request = choice.request as Extract<ChoiceRequest, { type: "look" }>;
  const b = choice.bindings!;
  const meta = JSON.parse(b.__look!) as { seat: Seat; count: number; picks: LookPick[]; rest: Placement | "look_only"; reveal: boolean };
  const p = state.players[meta.seat];
  const picked = answer.selectedOptionIds ?? [];
  const groupOf = groupAssignment(picked, request.groups);
  const idFor = (optionId: string) => b[optionId]!;
  // Pull the looked-at cards off the deck, keeping identities.
  const entries = new Map<string, { id: string; defId: string }>();
  for (const option of request.options) {
    const id = idFor(option.id);
    const index = p.zoneInstanceIds.deck.indexOf(id);
    if (index < 0) continue;
    entries.set(option.id, takeCard(state, { seat: meta.seat, zone: "deck", index, id, defId: p.deck[index]! }));
  }
  const bound: Record<number, string[]> = {};
  picked.forEach((optionId, i) => {
    const entry = entries.get(optionId);
    if (!entry) return;
    const pick = meta.picks[groupOf[i]!]!;
    if (pick.bind) (bound[groupOf[i]!] ??= []).push(entry.id);
    // Announce the card only when the effect reveals it or it lands somewhere public.
    // Face-down Life and deck placements from a private look stay hidden.
    const publicDest = pick.dest === "play" || pick.dest === "play_rested" || pick.dest === "trash" || ((pick.dest === "life_top" || pick.dest === "life_bottom") && Boolean(pick.faceUp));
    if (meta.reveal || publicDest) sim.events.push({ type: "card_revealed", seat: meta.seat, defId: entry.defId, matchedTrait: true });
    switch (pick.dest) {
      case "hand":
        putCard(state, meta.seat, "hand", entry);
        // Searched card: the owner always learns it; others only when revealed.
        sim.events.push({ type: "card_moved", seat: meta.seat, defId: entry.defId, from: "deck", to: "hand", ...(meta.reveal ? {} : { hidden: true }) });
        break;
      case "life_top": putCard(state, meta.seat, "life", entry, { position: "top", faceUp: Boolean(pick.faceUp) }); sim.events.push({ type: "life_added", seat: meta.seat, defId: entry.defId, source: "deck_top", ...(pick.faceUp ? { faceUp: true } : {}) }); break;
      case "life_bottom": putCard(state, meta.seat, "life", entry, { position: "bottom", faceUp: Boolean(pick.faceUp) }); break;
      case "trash": putCard(state, meta.seat, "trash", entry); break;
      case "deck_top": putCard(state, meta.seat, "deck", entry, { position: "top" }); break;
      case "deck_bottom": putCard(state, meta.seat, "deck", entry, { position: "bottom" }); break;
      case "play": case "play_rested": {
        const def = getCardDef(entry.defId);
        if ((def.type === "character" && !playerRestricted(state, meta.seat, "cannot_play_characters", entry)) || def.type === "stage") beginPlay(sim, meta.seat, entry, pick.dest === "play_rested");
        else putCard(state, meta.seat, "deck", entry, { position: "bottom" });
        break;
      }
    }
  });
  for (const [gi, ids] of Object.entries(bound)) { const pick = meta.picks[Number(gi)]!; if (pick.bind) frame.bindings[pick.bind] = ids; }
  const remaining = request.options.map((o) => o.id).filter((id) => !picked.includes(id));
  const ordered = answer.orderedOptionIds?.length === remaining.length ? answer.orderedOptionIds : remaining;
  const top = new Set(answer.topOptionIds ?? []);
  switch (meta.rest) {
    case "look_only": case "deck_top": {
      const tops = [...ordered].reverse();
      for (const id of tops) { const e = entries.get(id); if (e) putCard(state, meta.seat, "deck", e, { position: "top" }); }
      break;
    }
    case "deck_bottom": for (const id of ordered) { const e = entries.get(id); if (e) putCard(state, meta.seat, "deck", e, { position: "bottom" }); } break;
    case "top_or_bottom": {
      const tops = ordered.filter((id) => top.has(id)).reverse();
      for (const id of tops) { const e = entries.get(id); if (e) putCard(state, meta.seat, "deck", e, { position: "top" }); }
      for (const id of ordered.filter((id) => !top.has(id))) { const e = entries.get(id); if (e) putCard(state, meta.seat, "deck", e, { position: "bottom" }); }
      break;
    }
    case "trash": for (const id of remaining) { const e = entries.get(id); if (e) putCard(state, meta.seat, "trash", e); } break;
    case "hand": for (const id of remaining) { const e = entries.get(id); if (e) putCard(state, meta.seat, "hand", e); } break;
    case "shuffle": {
      for (const id of remaining) { const e = entries.get(id); if (e) putCard(state, meta.seat, "deck", e, { position: "bottom" }); }
      const cards = sim.rng.shuffle(p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! })));
      p.deck = cards.map((c) => c.defId);
      p.zoneInstanceIds.deck = cards.map((c) => c.id);
      break;
    }
  }
  frame.operationIndex += 1;
}

/** Default legal answer for timers/bots: minimum selection, decline when optional. */
export function defaultAnswer(choice: PendingChoice): ChoiceAnswer {
  const r = choice.request;
  if (!r) return { accept: !choice.optional };
  switch (r.type) {
    case "confirm": return { accept: !choice.optional };
    case "mode": return { accept: true, selectedOptionIds: [(r.options.find((o) => o.eligible) ?? r.options[0]!).id] };
    case "select": return { accept: true, selectedOptionIds: r.options.filter((o) => o.eligible).slice(0, r.min).map((o) => o.id) };
    case "order": return { accept: true, orderedOptionIds: r.options.map((o) => o.id) };
    case "look": {
      const selected: string[] = [];
      for (const option of r.options) {
        if (selected.length >= r.minSelect) break;
        if (assignGroups([...selected, option.id], r.groups)) selected.push(option.id);
      }
      return { accept: true, selectedOptionIds: selected, orderedOptionIds: r.options.map((o) => o.id).filter((id) => !selected.includes(id)) };
    }
  }
}
