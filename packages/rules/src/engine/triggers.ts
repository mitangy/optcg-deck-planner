/**
 * Trigger dispatch: event batches, once-per-turn gates, trigger queueing and ability start.
 */
import { abilitiesFor, abilityById } from "../cards/abilities.js";
import type { Ability, GameEventKind, Trigger } from "../effects/types.js";
import type { BindingValue, CardInstance, InstanceId, MatchState, ResolutionFrame, Seat } from "../types.js";
import { type EvalCtx, ctxFor, evalCond, filterMatches, isNegated } from "./queries.js";
import { alloc, fieldCards, isOnField, locate } from "./zones.js";
import { actingSource, type Sim, turnLog } from "./sim.js";
import { B, getBinding } from "../effects/bindings.js";

// ---------------------------------------------------------------------------
// Trigger dispatch
// ---------------------------------------------------------------------------

export function newBatch(state: MatchState): void {
  state.triggerBatch += 1;
}

function usedThisTurn(card: CardInstance | undefined, ability: Ability, state: MatchState): boolean {
  return Boolean(ability.oncePerTurn && card?.usedAbilities?.[ability.id] === state.turnNumber);
}

export function markUsed(state: MatchState, sourceId: InstanceId, ability: Ability): void {
  if (!ability.oncePerTurn) return;
  const card = locate(state, sourceId)?.card;
  if (!card) return;
  card.usedAbilities = { ...(card.usedAbilities ?? {}), [ability.id]: state.turnNumber };
}

/**
 * Undo `markUsed` for a frame whose ability was declined before anything
 * happened (optional cost not paid, "you may" answered no, or the cost could
 * not be paid). Such an ability was never activated, so a [Once Per Turn]
 * ability must be offered again in a later window of the same turn.
 */
export function releaseDeclinedOncePerTurn(state: MatchState, frame: ResolutionFrame): void {
  if (frame.program !== "ability" && frame.program !== "replacement") return;
  if (getBinding(frame, B.delay) !== undefined) return;
  if (!frame.bindings[B.declined] || frame.bindings[B.acted]) return;
  const ability = abilityById(frame.abilityId)?.ability;
  if (!ability?.oncePerTurn) return;
  const card = locate(state, frame.sourceInstanceId)?.card;
  if (!card?.usedAbilities || card.usedAbilities[ability.id] !== state.turnNumber) return;
  const { [ability.id]: _released, ...rest } = card.usedAbilities;
  card.usedAbilities = rest;
}

/** Conditions checked only when a queued trigger is about to resolve (`Ability.resolveConditions`). */
export function resolveGateOpen(state: MatchState, seat: Seat, source: { id: InstanceId; defId: string }, ability: Ability, eventCardId?: InstanceId): boolean {
  const ctx: EvalCtx = { seat, sourceId: source.id, sourceDefId: source.defId, vars: {}, ...(eventCardId ? { eventCardId } : {}) };
  return (ability.resolveConditions ?? []).every((c) => evalCond(state, ctx, c));
}

/** Header gates: [DON!! xN], [Your Turn]/[Opponent's Turn] and similar, plus once-per-turn. */
export function abilityGateOpen(state: MatchState, seat: Seat, source: { id: InstanceId; defId: string; card?: CardInstance }, ability: Ability, eventCardId?: InstanceId): boolean {
  const card = source.card ?? locate(state, source.id)?.card;
  if (ability.don && (card?.attachedDonIds.length ?? 0) < ability.don) return false;
  if (usedThisTurn(card, ability, state)) return false;
  const ctx: EvalCtx = { seat, sourceId: source.id, sourceDefId: source.defId, vars: {}, ...(eventCardId ? { eventCardId } : {}) };
  return (ability.conditions ?? []).every((c) => evalCond(state, ctx, c));
}

/** Queue every ability of `source` for `window` whose gates are open. */
export function queueWindow(state: MatchState, window: Trigger, seat: Seat, source: { id: InstanceId; defId: string }, opts: { eventCardId?: InstanceId; card?: CardInstance } = {}): void {
  const loc = locate(state, source.id);
  const card = opts.card ?? loc?.card;
  if (card && isOnField(loc) && isNegated(state, card)) return;
  for (const ability of abilitiesFor(source.defId)) {
    if (ability.trigger !== window) continue;
    if (!abilityGateOpen(state, seat, { ...source, ...(card ? { card } : {}) }, ability, opts.eventCardId)) continue;
    state.triggerQueue.push({ id: alloc(state, "trig"), seat, sourceInstanceId: source.id, sourceDefId: source.defId, abilityId: ability.id, window, batch: state.triggerBatch, ...(opts.eventCardId ? { eventCardId: opts.eventCardId } : {}) });
  }
}

export interface EventInfo {
  /** Seat that owns the affected card (or the acting player). */
  seat: Seat;
  card?: { id: InstanceId; defId: string };
  byEffectOf?: Seat;
  /** Quantity carried by the event (DON!! returned, cards drawn). */
  count?: number;
  /** Zone a played card came from. */
  fromZone?: string;
}

/**
 * Dispatch an internal rules event to "When …" abilities on the field. One occurrence can carry several kinds
 * (a K.O. by an effect is both `character_ko` and `character_removed_by_effect`): each ability is queued at most once,
 * when any of the kinds matches it under its own gates.
 */
export function dispatchEvent(state: MatchState, event: GameEventKind | readonly GameEventKind[], info: EventInfo): void {
  const kinds: readonly GameEventKind[] = typeof event === "string" ? [event] : event;
  const source = actingSource();
  if (info.byEffectOf == null && source && !kinds.includes("character_ko")) info = { ...info, byEffectOf: source.seat };
  if (kinds.includes("event_activated") && info.card) turnLog(state, info.seat).events.push(info.card.defId);
  if (kinds.includes("character_ko") && info.card) turnLog(state, info.seat).koed.push(info.card.defId);
  if (kinds.includes("card_trashed_from_hand") && info.byEffectOf != null) turnLog(state, info.seat).handTrashed += 1;
  for (const seat of [0, 1] as Seat[]) {
    for (const card of fieldCards(state.players[seat])) {
      if (isNegated(state, card)) continue;
      for (const ability of abilitiesFor(card.defId)) {
        const et = ability.eventTrigger;
        if (ability.trigger !== "on_event" || !et) continue;
        const matches = (kind: GameEventKind): boolean => {
          if (et.event !== kind && !et.alsoEvents?.includes(kind) && !et.anyCauseEvents?.includes(kind)) return false;
          if (kind === "self_ko") return false;
          // Events listed only in `anyCauseEvents` ignore the by-effect flags below.
          const anyCause = et.event !== kind && !et.alsoEvents?.includes(kind);
          if (kind === "self_rested" || kind === "self_attacked" || kind === "attack_damage" || kind === "battle_ended_vs_character") { if (info.card?.id !== card.id) return false; }
          else {
            const rel = info.seat === seat ? "you" : "opponent";
            if (et.player !== "any" && et.player !== rel) return false;
          }
          if (!anyCause && et.byOpponentEffect && (info.byEffectOf == null || info.byEffectOf === info.seat)) return false;
          if (!anyCause && et.byEffect && info.byEffectOf == null) return false;
          if (!anyCause && et.byYourEffect && info.byEffectOf !== seat) return false;
          if (et.minCount != null && (info.count ?? 1) < et.minCount) return false;
          if (et.fromZone && info.fromZone !== et.fromZone) return false;
          const ctx = ctxFor(seat, card);
          const loc = info.card ? locate(state, info.card.id) : null;
          const cardMatch = et.filter ? (info.card ? loc != null && filterMatches(state, ctx, et.filter, loc) : true) : true;
          const srcLoc = source ? locate(state, source.id) : null;
          const srcMatch = et.sourceFilter ? srcLoc != null && filterMatches(state, ctx, et.sourceFilter, srcLoc) : true;
          return et.either ? (et.filter != null && info.card != null && cardMatch) || (et.sourceFilter != null && srcMatch) : cardMatch && srcMatch;
        };
        if (!kinds.some(matches)) continue;
        if (!abilityGateOpen(state, seat, { id: card.id, defId: card.defId, card }, ability, info.card?.id)) continue;
        // A Once Per Turn ability queues once per batch, even when several events in it match (#600).
        if (ability.oncePerTurn && state.triggerQueue.some((t) => t.sourceInstanceId === card.id && t.abilityId === ability.id && t.batch === state.triggerBatch)) continue;
        state.triggerQueue.push({ id: alloc(state, "trig"), seat, sourceInstanceId: card.id, sourceDefId: card.defId, abilityId: ability.id, window: "on_event", batch: state.triggerBatch, ...(info.card ? { eventCardId: info.card.id } : {}) });
      }
    }
  }
}

/** Start resolving an ability immediately (activation, events, accepted Triggers). */
export function startAbility(sim: Sim, seat: Seat, source: { id: InstanceId; defId: string }, ability: Ability, window: string, extra: Record<string, BindingValue> = {}): void {
  const { state } = sim;
  markUsed(state, source.id, ability);
  const frame: ResolutionFrame = { id: alloc(state, "frame"), seat, sourceInstanceId: source.id, sourceDefId: source.defId, abilityId: ability.id, window, operationIndex: 0, bindings: { ...extra }, program: "ability" };
  state.resolutionFrames.push(frame);
  sim.events.push({ type: "ability_activated", seat, defId: source.defId, abilityId: ability.id, text: ability.text });
}
