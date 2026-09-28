/**
 * Ability runtime: trigger dispatch, the resumable instruction VM, leaf
 * actions, replacement effects and player choices. All state lives in
 * `MatchState` (frames, queue, modifiers, pending choices) as plain JSON.
 */
import { abilitiesFor, abilityById, programFor, replacementProgramFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import { compileDelayed, type Instr, type Program } from "../effects/compile.js";
import type { Ability, Effect, GameEventKind, LookPick, Placement, ReplacementEvent, Target, Trigger } from "../effects/types.js";
import type { Rng } from "../rng.js";
import type { BindingValue, CardInstance, ChoiceOption, ChoiceRequest, GameEvent, InstanceId, MatchState, PendingChoice, QueuedTrigger, ResolutionFrame, Seat } from "../types.js";
import { addModifier, expiryFor } from "./modifiers.js";
import {
  canPayCosts, candidates, costOf, ctxFor, evalCond, evalValue, filterMatches, hasRestriction, isNegated, playerRestricted, powerOf, selectorMatches, type EvalCtx,
} from "./queries.js";
import {
  activeDon, alloc, attachDon, drawCards, fieldCards, isOnField, locate, otherSeat, placeDonFromDeck, putCard, putOnField, returnDonToDeck, takeCard, type Located,
} from "./state.js";

export interface Sim {
  state: MatchState;
  events: GameEvent[];
  rng: Rng;
}

const MAX_CHARACTERS = 5;

function nameOf(defId: string): string {
  try { return getCardDef(defId).name; } catch { return defId; }
}

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

/** Header gates: [DON!! xN], [Your Turn]/[Opponent's Turn] and similar, plus once-per-turn. */
export function abilityGateOpen(state: MatchState, seat: Seat, source: { id: InstanceId; defId: string; card?: CardInstance }, ability: Ability, eventCardId?: InstanceId): boolean {
  const card = source.card ?? locate(state, source.id)?.card;
  if (ability.don && (card?.attachedDonIds.length ?? 0) < ability.don) return false;
  if (usedThisTurn(card, ability, state)) return false;
  const ctx: EvalCtx = { seat, sourceId: source.id, sourceDefId: source.defId, vars: {}, ...(eventCardId ? { eventCardId } : {}) };
  return (ability.conditions ?? []).every((c) => evalCond(state, ctx, c));
}

/** Queue every ability of `source` for `window` whose gates are open. */
export function queueWindow(state: MatchState, window: Trigger, seat: Seat, source: { id: InstanceId; defId: string }, opts: { eventCardId?: InstanceId; ignoreNegation?: boolean } = {}): void {
  const loc = locate(state, source.id);
  const card = loc?.card;
  if (card && isOnField(loc) && !opts.ignoreNegation && isNegated(state, card)) return;
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
}

/** Dispatch an internal rules event to "When …" abilities on the field. */
export function dispatchEvent(state: MatchState, kind: GameEventKind, info: EventInfo): void {
  for (const seat of [0, 1] as Seat[]) {
    for (const card of fieldCards(state.players[seat])) {
      if (isNegated(state, card)) continue;
      for (const ability of abilitiesFor(card.defId)) {
        const et = ability.eventTrigger;
        if (ability.trigger !== "on_event" || !et || et.event !== kind) continue;
        if (kind === "self_ko") continue;
        if (kind === "self_rested" || kind === "self_attacked" || kind === "attack_damage") { if (info.card?.id !== card.id) continue; }
        else {
          const rel = info.seat === seat ? "you" : "opponent";
          if (et.player !== "any" && et.player !== rel) continue;
        }
        if (et.byOpponentEffect && (info.byEffectOf == null || info.byEffectOf === info.seat)) continue;
        if (et.filter && info.card) {
          const loc = locate(state, info.card.id);
          const ctx = ctxFor(seat, card);
          if (!loc || !filterMatches(state, ctx, et.filter, loc)) continue;
        }
        if (!abilityGateOpen(state, seat, { id: card.id, defId: card.defId, card }, ability, info.card?.id)) continue;
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

// ---------------------------------------------------------------------------
// Zone actions shared by effects and procedure
// ---------------------------------------------------------------------------

export interface RemovalCause {
  /** Seat whose effect caused the removal; undefined for battle / rules. */
  byEffectOf?: Seat;
  battle?: boolean;
}

/** K.O. a Character (no replacement check). Queues On K.O. and "when K.O.'d" triggers. */
export function performKo(sim: Sim, loc: Located, cause: RemovalCause): void {
  const { state } = sim;
  const entry = takeCard(state, loc);
  putCard(state, loc.seat, "trash", entry);
  sim.events.push({ type: "character_ko", seat: loc.seat, defId: entry.defId });
  queueWindow(state, "on_ko", loc.seat, entry, { ignoreNegation: true });
  for (const ability of abilitiesFor(entry.defId)) {
    const et = ability.eventTrigger;
    if (ability.trigger !== "on_event" || et?.event !== "self_ko") continue;
    if (et.byOpponentEffect && (cause.byEffectOf == null || cause.byEffectOf === loc.seat)) continue;
    if (et.byEffect && cause.byEffectOf == null) continue;
    if (!abilityGateOpen(state, loc.seat, entry, ability)) continue;
    state.triggerQueue.push({ id: alloc(state, "trig"), seat: loc.seat, sourceInstanceId: entry.id, sourceDefId: entry.defId, abilityId: ability.id, window: "on_event", batch: state.triggerBatch });
  }
  dispatchEvent(state, "character_ko", { seat: loc.seat, card: entry, ...(cause.byEffectOf != null ? { byEffectOf: cause.byEffectOf } : {}) });
}

/**
 * Play a card onto its owner's field without paying its cost. A 6th Character
 * first asks its owner to trash one Character; the card waits in `resolving`.
 */
export function beginPlay(sim: Sim, seat: Seat, entry: { id: InstanceId; defId: string }, rested: boolean, costPaid = 0): void {
  const { state } = sim;
  const def = getCardDef(entry.defId);
  if (def.type === "character" && state.players[seat].characters.length >= MAX_CHARACTERS) {
    putCard(state, seat, "resolving", entry);
    const frame: ResolutionFrame = { id: alloc(state, "frame"), seat, sourceInstanceId: entry.id, sourceDefId: entry.defId, abilityId: "__trash_for_space", window: "rule", operationIndex: 0, bindings: { _rested: rested, _costPaid: costPaid }, program: "trash_for_space" };
    state.resolutionFrames.push(frame);
    return;
  }
  finishPlay(sim, seat, entry, rested, costPaid);
}

export function finishPlay(sim: Sim, seat: Seat, entry: { id: InstanceId; defId: string }, rested: boolean, costPaid: number): void {
  const { state } = sim;
  const card = putOnField(state, seat, entry, { rested }, sim.events);
  sim.events.push({ type: "card_played", seat, defId: entry.defId, instanceId: card.id, costPaid });
  queueWindow(state, "on_play", seat, card);
  dispatchEvent(state, "character_played", { seat, card: entry });
}

function moveToZone(sim: Sim, loc: Located, zone: "hand" | "deck" | "trash" | "life", opts: { position?: "top" | "bottom"; faceUp?: boolean } = {}): void {
  const { state } = sim;
  const entry = takeCard(state, loc);
  putCard(state, loc.seat, zone, entry, opts);
  const hidden = zone === "deck" || (zone === "life" && !opts.faceUp) || (zone === "hand" && (loc.zone === "deck" || loc.zone === "life"));
  sim.events.push({ type: "card_moved", seat: loc.seat, defId: hidden ? "HIDDEN" : entry.defId, from: loc.zone, to: zone, ...(hidden ? { hidden: true } : {}) });
  if (loc.zone === "life") dispatchEvent(state, "life_removed", { seat: loc.seat, card: entry });
  if (loc.zone === "hand" && zone === "trash") dispatchEvent(state, "card_trashed_from_hand", { seat: loc.seat, card: entry });
}

export function takeLifeToHand(sim: Sim, seat: Seat, fromBottom = false): boolean {
  const p = sim.state.players[seat];
  if (!p.life.length) return false;
  const index = fromBottom ? p.life.length - 1 : 0;
  moveToZone(sim, { seat, zone: "life", index, id: p.zoneInstanceIds.life[index]!, defId: p.life[index]! }, "hand");
  dispatchEvent(sim.state, "life_to_hand", { seat });
  return true;
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

function pushChoice(sim: Sim, frame: ResolutionFrame, choice: Omit<PendingChoice, "id" | "resolutionFrameId" | "cardDefId" | "sourceInstanceId">): PendingChoice {
  const { state } = sim;
  const full: PendingChoice = { id: alloc(state, "choice"), resolutionFrameId: frame.id, cardDefId: frame.sourceDefId, sourceInstanceId: frame.sourceInstanceId, ...choice };
  state.pendingChoices.push(full);
  frame.bindings._await = full.id;
  sim.events.push({ type: "pending_choice_added", seat: full.seat, kind: full.kind, cardDefId: full.cardDefId, sourceInstanceId: full.sourceInstanceId, optional: full.optional, prompt: full.prompt, ...(full.privateToSeat != null ? { privateToSeat: full.privateToSeat } : {}), ...(full.hideCardDefFromOthers ? { hideCardDefFromOthers: true } : {}) });
  return full;
}

function optionFor(state: MatchState, loc: Located, id: string): ChoiceOption {
  const public_ = isOnField(loc) || loc.zone === "trash" || (loc.zone === "life" && state.players[loc.seat].faceUpLife[loc.index]);
  return {
    id,
    defId: loc.defId,
    zone: loc.zone,
    ownerSeat: loc.seat,
    ...(public_ && isOnField(loc) ? { instanceId: loc.id } : {}),
    eligible: true,
    ...(loc.card && isOnField(loc) ? { rested: loc.card.rested } : {}),
  };
}

function frameCtx(frame: ResolutionFrame): EvalCtx {
  return { seat: frame.seat, sourceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, vars: frame.bindings, ...(typeof frame.bindings._event === "string" ? { eventCardId: frame.bindings._event } : {}) };
}

function promptPrefix(frame: ResolutionFrame): string {
  return nameOf(frame.sourceDefId);
}

// ---------------------------------------------------------------------------
// VM
// ---------------------------------------------------------------------------

const TRASH_FOR_SPACE: Program = {
  abilityId: "__trash_for_space",
  instrs: [
    { op: "select", bind: "_space", selector: { player: "you", zone: "character" }, min: 1, max: 1, chooser: "you", purpose: "trash to make room" },
    { op: "act", effect: { do: "to_trash", target: { ref: "var", name: "_space" } } },
  ],
};

const delayedPrograms = new Map<string, Program>();
function programOf(frame: ResolutionFrame): Program {
  if (frame.program === "trash_for_space") return TRASH_FOR_SPACE;
  if (typeof frame.bindings._delay === "number") {
    const key = `${frame.abilityId}#${frame.bindings._delay}`;
    let program = delayedPrograms.get(key);
    if (!program) { program = compileDelayed(abilityById(frame.abilityId)!.ability, frame.bindings._delay); delayedPrograms.set(key, program); }
    return program;
  }
  if (frame.program === "replacement") {
    const base = replacementProgramFor(frame.abilityId);
    const optional = abilityById(frame.abilityId)?.ability.replacement?.optional;
    if (!optional) return base;
    const shift = 2;
    const shifted = base.instrs.map((instr) => shiftJumps(instr, shift));
    return { abilityId: base.abilityId, instrs: [{ op: "confirm", bind: "_did", prompt: "use this replacement effect" }, { op: "jumpIfFalse", name: "_did", to: shifted.length + shift }, ...shifted] };
  }
  return programFor(frame.abilityId);
}

function shiftJumps(instr: Instr, by: number): Instr {
  if (instr.op === "jump" || instr.op === "jumpIfNot" || instr.op === "jumpIfFalse" || instr.op === "jumpIfModeNot") return { ...instr, to: instr.to + by };
  return instr;
}

type ExecResult = "next" | "jumped" | "wait" | "interrupt";

/** Run frames until the stack is empty or a choice is pending. */
export function runFrames(sim: Sim): void {
  const { state } = sim;
  let guard = 0;
  while (state.resolutionFrames.length > 0) {
    if (state.winner !== null) { state.resolutionFrames = []; state.pendingChoices = []; return; }
    if (++guard > 5000) throw new Error("Ability resolution did not terminate");
    const frame = state.resolutionFrames[state.resolutionFrames.length - 1]!;
    if (typeof frame.bindings._await === "string") return;
    const program = programOf(frame);
    if (frame.operationIndex >= program.instrs.length) { completeFrame(sim, frame); continue; }
    const instr = program.instrs[frame.operationIndex]!;
    const result = exec(sim, frame, instr);
    if (result === "next") frame.operationIndex += 1;
    else if (result === "wait") return;
  }
}

function completeFrame(sim: Sim, frame: ResolutionFrame): void {
  const { state } = sim;
  state.resolutionFrames = state.resolutionFrames.filter((f) => f.id !== frame.id);
  if (frame.program === "trash_for_space") {
    const p = state.players[frame.seat];
    const index = p.resolving.findIndex((c) => c.id === frame.sourceInstanceId);
    if (index >= 0) {
      const [card] = p.resolving.splice(index, 1);
      finishPlay(sim, frame.seat, card!, Boolean(frame.bindings._rested), Number(frame.bindings._costPaid ?? 0));
    }
    return;
  }
  if (frame.program === "replacement") {
    const replaced = frame.bindings._did !== false;
    const parentId = frame.bindings._parent;
    const target = frame.bindings._target;
    const parent = state.resolutionFrames.find((f) => f.id === parentId);
    if (parent && typeof target === "string") parent.bindings[`_repl:${target}`] = replaced;
    else if (typeof target === "string") {
      const step = state.steps[0];
      if (step && step.kind === "battle_ko" && step.targetId === target) (step as { replaced?: boolean }).replaced = replaced;
    }
    return;
  }
  // Event / Trigger cards leave resolution for the trash once their effect ends.
  const stillRunning = state.resolutionFrames.some((f) => f.sourceInstanceId === frame.sourceInstanceId);
  if (!stillRunning) {
    const loc = locate(state, frame.sourceInstanceId);
    if (loc?.zone === "resolving") {
      const entry = takeCard(state, loc);
      putCard(state, loc.seat, "trash", entry);
    }
  }
  newBatch(state);
}

function exec(sim: Sim, frame: ResolutionFrame, instr: Instr): ExecResult {
  const { state } = sim;
  const ctx = frameCtx(frame);
  switch (instr.op) {
    case "jump": frame.operationIndex = instr.to; return "jumped";
    case "jumpIfNot": if (!evalCond(state, ctx, instr.cond)) { frame.operationIndex = instr.to; return "jumped"; } return "next";
    case "jumpIfFalse": { const v = frame.bindings[instr.name]; if (!v || (Array.isArray(v) && v.length === 0)) { frame.operationIndex = instr.to; return "jumped"; } return "next"; }
    case "jumpIfModeNot": if (frame.bindings[instr.name] !== instr.index) { frame.operationIndex = instr.to; return "jumped"; } return "next";
    case "confirm": {
      if (instr.costs && !canPayCosts(state, ctx, instr.costs)) { frame.bindings[instr.bind] = false; return "next"; }
      const ability = abilityById(frame.abilityId)?.ability;
      const detail = frame.program === "replacement" ? `use ${nameOf(frame.sourceDefId)}'s effect instead?` : instr.costs ? `pay the cost to activate: ${ability?.text ?? ""}` : `${instr.prompt}? ${ability?.text ?? ""}`;
      pushChoice(sim, frame, { seat: instr.chooser === "opponent" ? otherSeat(frame.seat) : frame.seat, kind: "effect", optional: true, prompt: `${promptPrefix(frame)} — ${detail}`.trim(), request: { type: "confirm" }, bindings: { __bind: instr.bind } });
      return "wait";
    }
    case "mode": {
      const chooser = instr.chooser === "you" ? frame.seat : otherSeat(frame.seat);
      const options: ChoiceOption[] = instr.labels.map((label, index) => ({ id: `m${index}`, label, eligible: true }));
      pushChoice(sim, frame, { seat: chooser, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — choose one.`, request: { type: "mode", options }, bindings: { __bind: instr.bind } });
      return "wait";
    }
    case "select": return execSelect(sim, frame, instr);
    case "delay":
      state.delayed.push({ id: alloc(state, "delay"), seat: frame.seat, sourceInstanceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, abilityId: frame.abilityId, index: instr.index, turn: state.turnNumber, when: instr.when });
      return "next";
    case "look": return execLook(sim, frame, instr);
    case "act": return execAct(sim, frame, instr.effect);
  }
}

function execSelect(sim: Sim, frame: ResolutionFrame, instr: Extract<Instr, { op: "select" }>): ExecResult {
  const { state } = sim;
  const ctx = frameCtx(frame);
  const chooser = instr.chooser === "you" ? frame.seat : otherSeat(frame.seat);
  const list = candidates(state, ctx, instr.selector);
  const valueCount = instr.countValue != null ? Math.max(0, evalValue(state, ctx, instr.countValue)) : null;
  const max = Math.min(valueCount ?? instr.max, list.length);
  const min = Math.min(valueCount ?? instr.min, max);
  if (max === 0) { frame.bindings[instr.bind] = []; return "next"; }
  if (instr.random) {
    frame.bindings[instr.bind] = sim.rng.shuffle(list.map((l) => l.id)).slice(0, max);
    return "next";
  }
  // Forced: every candidate must be chosen and no constraint could reject it.
  if (min === list.length && instr.totalCostAtMost == null && instr.totalPowerAtMost == null) {
    frame.bindings[instr.bind] = list.map((l) => l.id);
    return "next";
  }
  const bindings: Record<string, string> = { __bind: instr.bind };
  const options = list.map((loc, index) => {
    const id = `o${index}`;
    bindings[id] = loc.id;
    return optionFor(state, loc, id);
  });
  const hidden = list.some((l) => l.zone === "hand" || l.zone === "deck" || l.zone === "life");
  const limit = min === max ? `${max}` : min === 0 ? `up to ${max}` : `${min}–${max}`;
  const prompt = `${promptPrefix(frame)} — choose ${limit} card${max === 1 ? "" : "s"} to ${instr.purpose}.`;
  pushChoice(sim, frame, {
    seat: chooser, kind: "effect", optional: false, prompt, request: { type: "select", min, max, options }, bindings,
    ...(hidden ? { privateToSeat: chooser, optionCount: options.length } : {}),
  });
  frame.bindings._selectMeta = JSON.stringify({ totalCostAtMost: instr.totalCostAtMost ?? null, totalPowerAtMost: instr.totalPowerAtMost ?? null, distinctNames: instr.distinctNames ?? false });
  return "wait";
}

function execLook(sim: Sim, frame: ResolutionFrame, instr: Extract<Instr, { op: "look" }>): ExecResult {
  const { state } = sim;
  const ctx = frameCtx(frame);
  const seat = instr.player === "you" ? frame.seat : otherSeat(frame.seat);
  const p = state.players[seat];
  const count = Math.min(evalValue(state, ctx, instr.count), p.deck.length);
  if (count <= 0) return "next";
  const bindings: Record<string, string> = {};
  const options: ChoiceOption[] = [];
  const groups = instr.picks.map((pick, gi) => ({ label: pickLabel(pick), max: pick.max, eligibleIds: [] as string[], gi }));
  for (let i = 0; i < count; i += 1) {
    const id = `o${i}`;
    const loc: Located = { seat, zone: "deck", index: i, id: p.zoneInstanceIds.deck[i]!, defId: p.deck[i]! };
    bindings[id] = loc.id;
    let eligible = false;
    instr.picks.forEach((pick, gi) => {
      if (!pick.filter || filterMatches(state, ctx, pick.filter, loc)) { groups[gi]!.eligibleIds.push(id); eligible = true; }
    });
    options.push({ id, defId: loc.defId, zone: "deck", ownerSeat: seat, eligible });
  }
  const maxSelect = instr.picks.reduce((n, pick) => n + pick.max, 0);
  const minSelect = instr.picks.reduce((n, pick) => n + pick.min, 0);
  const rest: Placement | "look_only" = instr.picks.length === 0 && instr.rest === "deck_top" ? "look_only" : instr.rest;
  const request: ChoiceRequest = { type: "look", options, minSelect, maxSelect, groups: groups.map(({ label, max, eligibleIds }) => ({ label, max, eligibleIds })), rest, restLabel: restLabel(rest) };
  const prompt = `${promptPrefix(frame)} — look at the top ${count} card${count === 1 ? "" : "s"}${maxSelect ? `, choose up to ${maxSelect}` : ""}${rest === "look_only" ? "" : `, then ${restLabel(rest)}`}.`;
  pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt, request, bindings: { ...bindings, __look: JSON.stringify({ seat, count, picks: instr.picks, rest, reveal: instr.reveal }) }, privateToSeat: frame.seat, optionCount: count });
  return "wait";
}

function pickLabel(pick: LookPick): string {
  const dest: Record<LookPick["dest"], string> = { hand: "add to hand", life_top: "add to the top of Life", life_bottom: "add to the bottom of Life", play: "play", play_rested: "play rested", trash: "trash", deck_top: "place on top of deck", deck_bottom: "place on bottom of deck" };
  return `Up to ${pick.max}: ${dest[pick.dest]}`;
}

function restLabel(rest: Placement | "look_only"): string {
  switch (rest) {
    case "deck_bottom": return "place the rest at the bottom of the deck in any order";
    case "deck_top": return "place the rest at the top of the deck in any order";
    case "top_or_bottom": return "place each remaining card at the top or bottom of the deck";
    case "trash": return "trash the rest";
    case "hand": return "add the rest to your hand";
    case "shuffle": return "shuffle the rest into the deck";
    case "look_only": return "return them in the same order";
  }
}

function resolveTargets(state: MatchState, frame: ResolutionFrame, target: Target): Located[] {
  const ctx = frameCtx(frame);
  switch (target.ref) {
    case "self": { const loc = locate(state, frame.sourceInstanceId); return loc ? [loc] : []; }
    case "leader": { const p = state.players[target.player === "you" ? frame.seat : otherSeat(frame.seat)]; return [{ seat: target.player === "you" ? frame.seat : otherSeat(frame.seat), zone: "leader", index: 0, id: p.leader.id, defId: p.leader.defId, card: p.leader }]; }
    case "var": {
      const v = frame.bindings[target.name];
      const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
      return ids.map((id) => locate(state, id) ?? locateDon(state, id)).filter((l): l is Located => l != null);
    }
    case "all": return candidates(state, ctx, target.selector);
    case "battle": {
      const b = state.battle;
      if (!b) return [];
      const attacker = locate(state, b.attackerId);
      const defenderId = b.target.kind === "leader" ? state.players[otherSeat(b.attackerSeat)].leader.id : b.target.instanceId;
      const defender = locate(state, defenderId);
      const pick = (loc: Located | null) => (loc ? [loc] : []);
      if (target.role === "attacker") return pick(attacker);
      if (target.role === "defender") return pick(defender);
      const own = attacker?.seat === frame.seat ? attacker : defender;
      const opp = attacker?.seat === frame.seat ? defender : attacker;
      return pick(target.role === "own_battler" ? own : opp);
    }
    case "event_card": { const id = frame.bindings._event; const loc = typeof id === "string" ? locate(state, id) : null; return loc ? [loc] : []; }
    case "choose": return [];
  }
}

function removalBlocked(state: MatchState, loc: Located, byEffectOf: Seat, kind: "ko" | "return" | "remove" | "rest"): boolean {
  if (!loc.card || !isOnField(loc)) return false;
  const opp = byEffectOf !== loc.seat;
  if (kind === "rest") return opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_rested_by_opponent_effect");
  if (kind === "ko" && (hasRestriction(state, loc.seat, loc.card, "cannot_be_ko") || hasRestriction(state, loc.seat, loc.card, "cannot_be_ko_by_effect"))) return true;
  if (kind === "ko" && opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_ko_by_opponent_effect")) return true;
  if (kind === "return" && opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_returned_by_opponent_effect")) return true;
  if (opp && hasRestriction(state, loc.seat, loc.card, "cannot_be_removed_by_opponent_effect")) return true;
  return false;
}

/** Replacement abilities that can apply to `loc` for any of `events`. */
export function findReplacement(state: MatchState, loc: Located, events: ReplacementEvent[], byOpponent: boolean): { seat: Seat; card: CardInstance; ability: Ability } | null {
  const seat = loc.seat;
  for (const card of fieldCards(state.players[seat])) {
    if (isNegated(state, card)) continue;
    for (const ability of abilitiesFor(card.defId)) {
      const r = ability.replacement;
      if (ability.trigger !== "replacement" || !r || !events.includes(r.event)) continue;
      if (r.byOpponent && !byOpponent) continue;
      if (r.event === "removed_by_opponent_effect" && !byOpponent) continue;
      if (r.target === "self" ? card.id !== loc.id : !selectorMatches(state, ctxFor(seat, card), r.target, loc)) continue;
      if (!abilityGateOpen(state, seat, { id: card.id, defId: card.defId, card }, ability)) continue;
      if (r.instead.do === "pay" && !canPayCosts(state, ctxFor(seat, card), r.instead.costs)) continue;
      return { seat, card, ability };
    }
  }
  return null;
}

export function pushReplacementFrame(sim: Sim, hit: { seat: Seat; card: CardInstance; ability: Ability }, targetId: InstanceId, parentId?: string): void {
  const { state } = sim;
  markUsed(state, hit.card.id, hit.ability);
  state.resolutionFrames.push({ id: alloc(state, "frame"), seat: hit.seat, sourceInstanceId: hit.card.id, sourceDefId: hit.card.defId, abilityId: hit.ability.id, window: "replacement", operationIndex: 0, bindings: { _target: targetId, _last: [targetId], ...(parentId ? { _parent: parentId } : {}) }, program: "replacement" });
}

/** Apply a removal to each target in order; may pause for replacement prompts. */
function forEachTarget(sim: Sim, frame: ResolutionFrame, targets: Located[], kind: "ko" | "return" | "remove" | null, apply: (loc: Located) => void, done?: () => void): ExecResult {
  const { state } = sim;
  if (!Array.isArray(frame.bindings._actTargets)) frame.bindings._affected = [];
  const record = (loc: Located) => { const list = Array.isArray(frame.bindings._affected) ? frame.bindings._affected : []; frame.bindings._affected = [...list, loc.id]; };
  if (!Array.isArray(frame.bindings._actTargets)) frame.bindings._actTargets = targets.map((t) => t.id);
  const ids = frame.bindings._actTargets as string[];
  let index = typeof frame.bindings._actIndex === "number" ? frame.bindings._actIndex : 0;
  for (; index < ids.length; index += 1) {
    const loc = locate(state, ids[index]!);
    if (!loc) continue;
    if (kind && isOnField(loc) && loc.zone !== "leader") {
      if (removalBlocked(state, loc, frame.seat, kind)) continue;
      const replKey = `_repl:${loc.id}`;
      const byOpponent = frame.seat !== loc.seat;
      if (frame.bindings[replKey] === undefined) {
        const events: ReplacementEvent[] = kind === "ko" ? ["ko", "ko_by_effect", ...(byOpponent ? ["removed_by_opponent_effect" as const] : [])] : byOpponent ? ["removed_by_opponent_effect"] : [];
        const hit = events.length ? findReplacement(state, loc, events, byOpponent) : null;
        if (hit) {
          frame.bindings._actIndex = index;
          pushReplacementFrame(sim, hit, loc.id, frame.id);
          return "interrupt";
        }
      } else if (frame.bindings[replKey] === true) {
        continue;
      }
    }
    apply(loc);
    record(loc);
  }
  for (const key of Object.keys(frame.bindings)) if (key === "_actTargets" || key === "_actIndex" || key.startsWith("_repl:")) delete frame.bindings[key];
  done?.();
  return "next";
}

function seatOf(frame: ResolutionFrame, rel: "you" | "opponent" | undefined): Seat {
  return rel === "opponent" ? otherSeat(frame.seat) : frame.seat;
}

function durationLabel(duration: string): "turn" | "battle" | "other" {
  return duration === "turn" ? "turn" : duration === "battle" ? "battle" : "other";
}

function execAct(sim: Sim, frame: ResolutionFrame, effect: Effect): ExecResult {
  const { state } = sim;
  const ctx = frameCtx(frame);
  const targetsOf = (target: Target) => resolveTargets(state, frame, target);
  switch (effect.do) {
    case "nothing": return "next";
    case "draw": {
      const seat = seatOf(frame, effect.player);
      if (playerRestricted(state, seat, "cannot_draw_by_effect")) return "next";
      drawCards(state, seat, evalValue(state, ctx, effect.count), sim.events);
      return "next";
    }
    case "ko": {
      const targets = targetsOf(effect.target).filter((l) => l.zone === "character" || l.zone === "stage");
      return forEachTarget(sim, frame, targets, "ko", (loc) => performKo(sim, loc, { byEffectOf: frame.seat }));
    }
    case "rest": {
      for (const loc of targetsOf(effect.target)) {
        if ((loc.zone as string) === "don") { const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id); if (d) d.rested = true; continue; }
        if (!loc.card || !isOnField(loc) || removalBlocked(state, loc, frame.seat, "rest")) continue;
        if (!loc.card.rested) { loc.card.rested = true; dispatchEvent(state, "self_rested", { seat: loc.seat, card: loc }); }
      }
      return "next";
    }
    case "activate": {
      for (const loc of targetsOf(effect.target)) {
        if ((loc.zone as string) === "don") { const d = state.players[loc.seat].costArea.find((x) => x.id === loc.id); if (d) d.rested = false; continue; }
        if (loc.card && isOnField(loc)) loc.card.rested = false;
      }
      return "next";
    }
    case "to_hand": {
      const targets = targetsOf(effect.target);
      return forEachTarget(sim, frame, targets, "return", (loc) => {
        if (loc.zone === "leader" || loc.zone === "hand") return;
        if (isOnField(loc)) {
          dispatchEvent(state, "character_removed_by_effect", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
          dispatchEvent(state, "character_returned", { seat: loc.seat, card: loc, byEffectOf: frame.seat });
        }
        moveToZone(sim, loc, "hand");
        if (loc.zone !== "deck" && loc.zone !== "life") sim.events.push({ type: "card_revealed", seat: loc.seat, defId: loc.defId });
      });
    }
    case "to_deck": {
      if (effect.position === "top_or_bottom" && frame.bindings._end === undefined) {
        if (targetsOf(effect.target).length === 0) return "next";
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — place at the top or bottom of the deck?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_end", __repeat: "1" } });
        return "wait";
      }
      const position: "top" | "bottom" = effect.position === "top_or_bottom" ? (frame.bindings._end === 0 ? "top" : "bottom") : effect.position;
      const targets = targetsOf(effect.target);
      return forEachTarget(sim, frame, targets, "remove", (loc) => {
        if (loc.zone === "leader") return;
        moveToZone(sim, loc, "deck", { position });
      }, () => { delete frame.bindings._end; });
    }
    case "to_trash": {
      const targets = targetsOf(effect.target);
      return forEachTarget(sim, frame, targets, frame.program === "trash_for_space" ? null : "remove", (loc) => {
        if (loc.zone === "leader" || loc.zone === "trash") return;
        if (frame.program === "trash_for_space") sim.events.push({ type: "character_trashed_for_space", seat: loc.seat, defId: loc.defId });
        moveToZone(sim, loc, "trash");
      });
    }
    case "to_life": {
      if (effect.position === "top_or_bottom" && frame.bindings._end === undefined) {
        if (targetsOf(effect.target).length === 0) return "next";
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — place at the top or bottom of the Life cards?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_end", __repeat: "1" } });
        return "wait";
      }
      const lifePosition: "top" | "bottom" = effect.position === "top_or_bottom" ? (frame.bindings._end === 0 ? "top" : "bottom") : effect.position;
      delete frame.bindings._end;
      for (const loc of targetsOf(effect.target)) {
        if (loc.zone === "leader" || loc.zone === "life") continue;
        const entry = takeCard(state, loc);
        putCard(state, loc.seat, "life", entry, { position: lifePosition, faceUp: effect.faceUp });
        sim.events.push({ type: "life_added", seat: loc.seat, defId: entry.defId, source: loc.zone === "hand" ? "hand" : loc.zone === "trash" ? "trash" : loc.zone === "deck" ? "deck_top" : "field", ...(effect.faceUp ? { faceUp: true } : {}) });
      }
      return "next";
    }
    case "play": {
      frame.bindings._affected = [];
      for (const loc of targetsOf(effect.target)) {
        if (isOnField(loc)) continue;
        const def = getCardDef(loc.defId);
        if (def.type !== "character" && def.type !== "stage") continue;
        if (def.type === "character" && playerRestricted(state, loc.seat, "cannot_play_characters", loc)) continue;
        const entry = takeCard(state, loc);
        beginPlay(sim, loc.seat, entry, Boolean(effect.rested));
        frame.bindings._affected = [...(Array.isArray(frame.bindings._affected) ? frame.bindings._affected : []), entry.id];
      }
      return "next";
    }
    case "power": case "cost": case "base_power": {
      const amount = evalValue(state, ctx, effect.do === "base_power" ? effect.value : effect.amount);
      for (const loc of targetsOf(effect.target)) {
        if (!loc.card || !isOnField(loc)) continue;
        const expires = expiryFor(state, frame.seat, effect.duration);
        addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, effect.do === "power" ? { type: "power", amount } : effect.do === "cost" ? { type: "cost", amount } : { type: "base_power", value: amount }, expires);
        if (effect.do === "power") sim.events.push({ type: "power_buff_applied", seat: loc.seat, targetDefId: loc.defId, amount, duration: durationLabel(effect.duration) });
      }
      return "next";
    }
    case "set_power": {
      const value = evalValue(state, ctx, effect.value);
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "set_power", value }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "set_cost": {
      const value = evalValue(state, ctx, effect.value);
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "set_cost", value }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "damage": {
      state.steps.unshift({ kind: "effect_damage", seat: seatOf(frame, effect.player), remaining: effect.count });
      return "next";
    }
    case "activate_event": {
      const loc = targetsOf(effect.target).find((l) => (l.zone === "hand" || l.zone === "trash") && getCardDef(l.defId).type === "event");
      if (!loc) return "next";
      const main = abilitiesFor(loc.defId).find((a) => a.trigger === "main");
      const entry = takeCard(state, loc);
      putCard(state, loc.seat, "resolving", entry);
      dispatchEvent(state, "event_activated", { seat: loc.seat, card: entry });
      frame.operationIndex += 1;
      if (!main) { const again = locate(state, entry.id)!; putCard(state, loc.seat, "trash", takeCard(state, again)); return "jumped"; }
      startAbility(sim, loc.seat, entry, main, "main");
      return "interrupt";
    }
    case "keyword": {
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "keyword", keyword: effect.keyword }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "restrict": {
      for (const loc of targetsOf(effect.target)) {
        if (!loc.card || !isOnField(loc)) continue;
        const expires = effect.restriction === "no_refresh" ? { kind: "next_refresh" as const, seat: loc.seat } : expiryFor(state, frame.seat, effect.duration);
        addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "restrict", restriction: effect.restriction, ...(effect.value != null ? { value: effect.value } : {}), ...(effect.attribute ? { attribute: effect.attribute } : {}) }, expires);
      }
      return "next";
    }
    case "player_restrict": {
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: seatOf(frame, effect.player) }, { type: "player_restrict", restriction: effect.restriction, ...(effect.filter ? { filter: effect.filter } : {}) }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "negate": {
      for (const loc of targetsOf(effect.target)) if (loc.card && isOnField(loc)) addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "card", id: loc.id }, { type: "negate" }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "add_don": {
      const seat = seatOf(frame, effect.player);
      const placed = placeDonFromDeck(state.players[seat], evalValue(state, ctx, effect.count), effect.rested);
      if (placed) sim.events.push({ type: "don_placed", seat, count: placed });
      return "next";
    }
    case "give_don": {
      const donSeat = seatOf(frame, effect.player);
      for (const loc of targetsOf(effect.target)) {
        if (!loc.card || !(loc.zone === "leader" || loc.zone === "character") || loc.seat !== donSeat) continue;
        for (let i = 0; i < effect.count; i += 1) {
          const don = attachDon(state, donSeat, loc.card, effect.donState);
          if (!don) break;
          sim.events.push({ type: "don_given", seat: donSeat, donId: don.id, targetId: loc.id, targetDefId: loc.defId, newPower: powerOf(state, loc.seat, loc.card) });
          dispatchEvent(state, "don_given", { seat: loc.seat, card: loc });
        }
      }
      return "next";
    }
    case "set_don_active": {
      const p = state.players[frame.seat];
      if (playerRestricted(state, frame.seat, "cannot_set_don_active")) return "next";
      if (getCardDef(frame.sourceDefId).type === "character" && playerRestricted(state, frame.seat, "cannot_set_don_active_by_character_effects")) return "next";
      let n = effect.count;
      for (const d of p.costArea) if (n > 0 && d.rested) { d.rested = false; n -= 1; }
      return "next";
    }
    case "rest_don": {
      const p = state.players[seatOf(frame, effect.player)];
      let n = effect.count;
      for (const d of activeDon(p)) if (n-- > 0) d.rested = true;
      return "next";
    }
    case "return_don": {
      const seat = seatOf(frame, effect.player);
      const returned = returnDonToDeck(state, seat, effect.count, Boolean(effect.activeOnly));
      if (returned) dispatchEvent(state, "don_returned", { seat });
      return "next";
    }
    case "deck_to_life": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      for (let i = 0; i < effect.count && p.deck.length; i += 1) {
        const entry = takeCard(state, { seat, zone: "deck", index: 0, id: p.zoneInstanceIds.deck[0]!, defId: p.deck[0]! });
        putCard(state, seat, "life", entry, { position: "top", faceUp: Boolean(effect.faceUp) });
        sim.events.push({ type: "life_added", seat, defId: entry.defId, source: "deck_top", ...(effect.faceUp ? { faceUp: true } : {}) });
      }
      return "next";
    }
    case "life_to_hand": {
      const seat = seatOf(frame, effect.player);
      if (effect.position === "top_or_bottom" && state.players[seat].life.length > 1 && frame.bindings._lifeEnd === undefined) {
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — take from the top or bottom of Life?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_lifeEnd", __repeat: "1" } });
        return "wait";
      }
      const bottom = frame.bindings._lifeEnd === 1 || effect.position === "bottom";
      delete frame.bindings._lifeEnd;
      if (seat === frame.seat && playerRestricted(state, seat, "cannot_add_life_to_hand_by_effect")) return "next";
      for (let i = 0; i < effect.count; i += 1) if (!takeLifeToHand(sim, seat, bottom)) break;
      return "next";
    }
    case "trash_life": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      if (effect.position === "top_or_bottom" && p.life.length > 1 && frame.bindings._lifeEnd === undefined) {
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — trash from the top or bottom of Life?`, request: { type: "mode", options: [{ id: "m0", label: "Top", eligible: true }, { id: "m1", label: "Bottom", eligible: true }] }, bindings: { __bind: "_lifeEnd", __repeat: "1" } });
        return "wait";
      }
      const fromBottom = frame.bindings._lifeEnd === 1;
      delete frame.bindings._lifeEnd;
      const n = evalValue(state, ctx, effect.count);
      for (let i = 0; i < n && p.life.length; i += 1) {
        const index = fromBottom ? p.life.length - 1 : 0;
        moveToZone(sim, { seat, zone: "life", index, id: p.zoneInstanceIds.life[index]!, defId: p.life[index]! }, "trash");
      }
      return "next";
    }
    case "life_face": {
      const p = state.players[seatOf(frame, effect.player)];
      let n = effect.count;
      for (let i = 0; i < p.life.length && n > 0; i += 1) if (p.faceUpLife[i] !== effect.faceUp) { p.faceUpLife[i] = effect.faceUp; n -= 1; }
      return "next";
    }
    case "mill": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      const n = evalValue(state, ctx, effect.count);
      for (let i = 0; i < n && p.deck.length; i += 1) moveToZone(sim, { seat, zone: "deck", index: 0, id: p.zoneInstanceIds.deck[0]!, defId: p.deck[0]! }, "trash");
      return "next";
    }
    case "shuffle": {
      const p = state.players[seatOf(frame, effect.player)];
      const cards = sim.rng.shuffle(p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! })));
      p.deck = cards.map((c) => c.defId);
      p.zoneInstanceIds.deck = cards.map((c) => c.id);
      return "next";
    }
    case "win": {
      state.winner = frame.seat;
      state.winReason = "card_effect";
      state.phase = "game_over";
      sim.events.push({ type: "game_over", winner: frame.seat, reason: "card_effect" });
      return "next";
    }
    case "extra_turn": state.extraTurns.push(frame.seat); return "next";
    case "invoke": {
      const ability = abilitiesFor(frame.sourceDefId).find((a) => a.trigger === effect.window);
      if (!ability) return "next";
      frame.operationIndex += 1;
      state.resolutionFrames.push({ id: alloc(state, "frame"), seat: frame.seat, sourceInstanceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, abilityId: ability.id, window: effect.window, operationIndex: 0, bindings: {}, program: "ability" });
      return "interrupt";
    }
    case "play_cost_reduction": {
      addModifier(state, frame.seat, frame.sourceInstanceId, { kind: "player", seat: frame.seat }, { type: "play_cost", filter: effect.filter, amount: effect.amount, ...(effect.next ? { once: true } : {}) }, expiryFor(state, frame.seat, effect.duration));
      return "next";
    }
    case "redirect_attack": {
      const b = state.battle;
      const loc = targetsOf(effect.target)[0];
      if (b && loc && loc.seat !== b.attackerSeat && (loc.zone === "leader" || loc.zone === "character")) b.target = loc.zone === "leader" ? { kind: "leader" } : { kind: "character", instanceId: loc.id };
      return "next";
    }
    case "reveal_top": {
      const seat = seatOf(frame, effect.player);
      const p = state.players[seat];
      const zone = effect.zone ?? "deck";
      if (p[zone].length) { frame.bindings[effect.bind] = [p.zoneInstanceIds[zone][0]!]; sim.events.push({ type: "card_revealed", seat, defId: p[zone][0]! }); }
      else frame.bindings[effect.bind] = [];
      return "next";
    }
    case "reveal": {
      for (const loc of targetsOf(effect.target)) sim.events.push({ type: "card_revealed", seat: loc.seat, defId: loc.defId });
      return "next";
    }
    case "look_life": {
      if (effect.player === "any" && frame.bindings._lifeSeat === undefined) {
        pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — look at whose Life cards?`, request: { type: "mode", options: [{ id: "m0", label: "Your Life", eligible: true }, { id: "m1", label: "Opponent's Life", eligible: true }] }, bindings: { __bind: "_lifeSeat", __repeat: "1" } });
        return "wait";
      }
      const seat = effect.player === "any" ? (frame.bindings._lifeSeat === 1 ? otherSeat(frame.seat) : frame.seat) : seatOf(frame, effect.player);
      delete frame.bindings._lifeSeat;
      const p = state.players[seat];
      const count = Math.min(effect.count, p.life.length);
      if (count === 0) return "next";
      const bindings: Record<string, string> = { __lifeOrder: JSON.stringify({ seat, count, topOrBottom: effect.rest === "top_or_bottom" }) };
      const options: ChoiceOption[] = [];
      for (let i = 0; i < count; i += 1) { bindings[`o${i}`] = p.zoneInstanceIds.life[i]!; options.push({ id: `o${i}`, defId: p.life[i]!, zone: "life", ownerSeat: seat, eligible: true }); }
      pushChoice(sim, frame, { seat: frame.seat, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — ${effect.rest === "top_or_bottom" ? "place each card at the top or bottom of the Life cards" : "reorder the Life cards (first = top)"}.`, request: { type: "order", options, destination: "life", allowTopOrBottom: effect.rest === "top_or_bottom" }, bindings, privateToSeat: frame.seat, optionCount: count });
      return "wait";
    }
    case "script": throw new Error(`Script ${effect.scriptId} is not registered`);
    default:
      throw new Error(`Effect ${(effect as Effect).do} has no leaf executor`);
  }
}

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
      apply = () => { frame.bindings[b.__bind!] = answer.accept; frame.operationIndex += 1; };
      break;
    }
    case "mode": {
      const picked = answer.selectedOptionIds ?? [];
      if (picked.length !== 1 || !request.options.some((o) => o.id === picked[0])) return "Choose exactly one option";
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
    if (meta.reveal || pick.dest !== "hand") sim.events.push({ type: "card_revealed", seat: meta.seat, defId: entry.defId, matchedTrait: true });
    switch (pick.dest) {
      case "hand": putCard(state, meta.seat, "hand", entry); break;
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
    case "mode": return { accept: true, selectedOptionIds: [r.options[0]!.id] };
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

export type { QueuedTrigger };

/** A DON!! card in a cost area as a pseudo-location (zone "don"). */
function locateDon(state: MatchState, id: string): Located | null {
  for (const seat of [0, 1] as Seat[]) {
    const index = state.players[seat].costArea.findIndex((d) => d.id === id);
    if (index >= 0) return { seat, zone: "don" as Located["zone"], index, id, defId: "DON" };
  }
  return null;
}
