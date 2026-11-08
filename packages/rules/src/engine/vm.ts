/**
 * The resumable instruction VM: frames, instruction execution, select/look prompts.
 */
import { abilitiesFor, abilityById, programFor, replacementProgramFor } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import { type Instr, type Program, compileDelayed } from "../effects/compile.js";
import type { LookPick, Placement } from "../effects/types.js";
import type { BindingValue, ChoiceOption, ChoiceRequest, MatchState, PendingChoice, ResolutionFrame, Seat } from "../types.js";
import { forOpponent } from "./perspective.js";
import { type EvalCtx, canPayCost, canPayCosts, candidates, costDependsOnHiddenInfo, evalCond, evalValue, filterMatches, playerRestricted, selectorReadsHiddenZone } from "./queries.js";
import { type Located, alloc, isOnField, locate, otherSeat, putCard, takeCard } from "./zones.js";
import { type Sim, nameOf } from "./sim.js";
import { newBatch, releaseDeclinedOncePerTurn } from "./triggers.js";
import { finishPlay } from "./zoneActions.js";
import { coverBatch } from "./replacement.js";
import { execAct } from "./ops.js";
import { donOptionInfo } from "./donLocation.js";
import { B, CB, V, getBinding, replKey } from "../effects/bindings.js";

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export function pushChoice(sim: Sim, frame: ResolutionFrame, choice: Omit<PendingChoice, "id" | "resolutionFrameId" | "cardDefId" | "sourceInstanceId">): PendingChoice {
  const { state } = sim;
  const full: PendingChoice = { id: alloc(state, "choice"), resolutionFrameId: frame.id, cardDefId: frame.sourceDefId, sourceInstanceId: frame.sourceInstanceId, ...choice };
  state.pendingChoices.push(full);
  frame.bindings[B.await] = full.id;
  sim.events.push({ type: "pending_choice_added", seat: full.seat, kind: full.kind, cardDefId: full.cardDefId, sourceInstanceId: full.sourceInstanceId, optional: full.optional, prompt: full.prompt, ...(full.privateToSeat != null ? { privateToSeat: full.privateToSeat } : {}), ...(full.hideCardDefFromOthers ? { hideCardDefFromOthers: true } : {}) });
  return full;
}

function optionFor(state: MatchState, loc: Located, id: string, chooser?: Seat): ChoiceOption {
  if (loc.zone === "don") {
    const info = donOptionInfo(state, loc);
    return { id, defId: "DON", zone: "don", ownerSeat: loc.seat, eligible: true, label: info.label, rested: info.rested };
  }
  const public_ = isOnField(loc) || loc.zone === "trash" || (loc.zone === "life" && state.players[loc.seat].faceUpLife[loc.index]);
  // The chooser may not see face-down Life cards or the opponent's hand.
  const hidden = (loc.zone === "life" && !state.players[loc.seat].faceUpLife[loc.index]) || (loc.zone === "hand" && chooser != null && loc.seat !== chooser);
  return {
    id,
    defId: hidden ? "HIDDEN" : loc.defId,
    zone: loc.zone,
    ownerSeat: loc.seat,
    // Field cards, and the chooser's own hand cards so the client can pick them in the hand.
    ...((public_ && isOnField(loc)) || (loc.zone === "hand" && chooser === loc.seat) ? { instanceId: loc.id } : {}),
    eligible: true,
    ...(loc.card && isOnField(loc) ? { rested: loc.card.rested } : {}),
  };
}

export function frameCtx(frame: ResolutionFrame): EvalCtx {
  return { seat: frame.seat, sourceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, vars: frame.bindings, ...(getBinding(frame, B.event) !== undefined ? { eventCardId: getBinding(frame, B.event)! } : {}) };
}

export function promptPrefix(frame: ResolutionFrame): string {
  return nameOf(frame.sourceDefId);
}

// ---------------------------------------------------------------------------
// VM
// ---------------------------------------------------------------------------

const TRASH_FOR_SPACE: Program = {
  abilityId: "__trash_for_space",
  instrs: [
    { op: "select", bind: V.space, selector: { player: "you", zone: "character" }, min: 1, max: 1, chooser: "you", purpose: "trash to make room" },
    { op: "act", effect: { do: "to_trash", target: { ref: "var", name: V.space } } },
  ],
};

const ATTACK_TAX: Program = {
  abilityId: "__attack_tax",
  instrs: [
    { op: "select", bind: V.tax, selector: { player: "you", zone: "hand" }, min: 99, max: 99, chooser: "you", purpose: "trash to attack", countValue: { count: { of: "var", name: V.taxCount } } },
    { op: "act", effect: { do: "to_trash", target: { ref: "var", name: V.tax } } },
  ],
};

const delayedPrograms = new Map<string, Program>();
function programOf(frame: ResolutionFrame): Program {
  if (frame.program === "trash_for_space") return TRASH_FOR_SPACE;
  if (frame.program === "attack_tax") return ATTACK_TAX;
  const delay = getBinding(frame, B.delay);
  if (delay !== undefined) {
    const key = `${frame.abilityId}#${delay}`;
    let program = delayedPrograms.get(key);
    if (!program) { program = compileDelayed(abilityById(frame.abilityId)!.ability, delay); delayedPrograms.set(key, program); }
    return program;
  }
  if (frame.program === "replacement") {
    const base = replacementProgramFor(frame.abilityId);
    const optional = abilityById(frame.abilityId)?.ability.replacement?.optional;
    if (!optional) return base;
    const shift = 2;
    const shifted = base.instrs.map((instr) => shiftJumps(instr, shift));
    return { abilityId: base.abilityId, instrs: [{ op: "confirm", bind: V.did, prompt: "use this replacement effect" }, { op: "jumpIfFalse", name: V.did, to: shifted.length + shift }, ...shifted] };
  }
  return programFor(frame.abilityId);
}

function shiftJumps(instr: Instr, by: number): Instr {
  if (instr.op === "jump" || instr.op === "jumpIfNot" || instr.op === "jumpIfFalse" || instr.op === "jumpIfModeNot") return { ...instr, to: instr.to + by };
  return instr;
}

export type ExecResult = "next" | "jumped" | "wait" | "interrupt";

/** Run frames until the stack is empty or a choice is pending. */
export function runFrames(sim: Sim): void {
  const { state } = sim;
  let guard = 0;
  while (state.resolutionFrames.length > 0) {
    if (state.winner !== null) { state.resolutionFrames = []; state.pendingChoices = []; return; }
    if (++guard > 5000) throw new Error("Ability resolution did not terminate");
    const frame = state.resolutionFrames[state.resolutionFrames.length - 1]!;
    if (getBinding(frame, B.await) !== undefined) return;
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
  releaseDeclinedOncePerTurn(state, frame);
  if (frame.program === "trash_for_space") {
    const p = state.players[frame.seat];
    const index = p.resolving.findIndex((c) => c.id === frame.sourceInstanceId);
    if (index >= 0) {
      const [card] = p.resolving.splice(index, 1);
      finishPlay(sim, frame.seat, card!, Boolean(frame.bindings[B.rested]), Number(frame.bindings[B.costPaid] ?? 0), String(frame.bindings[B.fromZone] ?? "hand"));
    }
    return;
  }
  if (frame.program === "replacement") {
    const replaced = frame.bindings[V.did] !== false;
    const parentId = frame.bindings[B.parent];
    const target = frame.bindings[B.target];
    const parent = state.resolutionFrames.find((f) => f.id === parentId);
    if (parent && typeof target === "string") {
      parent.bindings[replKey(target)] = replaced;
      if (replaced) coverBatch(state, frame, parent);
    }
    else if (typeof target === "string") {
      const step = state.steps[0];
      if (step && step.kind === "battle_ko" && step.targetId === target) (step as { replaced?: boolean }).replaced = replaced;
      else if (step && (step.kind === "life_damage" || step.kind === "effect_damage")) step.replaced = replaced;
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
      // Costs that depend on hidden cards (#369) are always asked: skipping the prompt would tell the opponent the
      // player cannot pay. An unpayable one is marked privately so only declining is legal.
      // The opponent pays their own costs: payable means payable from their zones, in full (#515).
      let unpayable = false;
      const payCtx: EvalCtx = instr.chooser === "opponent" ? { ...ctx, seat: otherSeat(frame.seat) } : ctx;
      if (instr.costs && !canPayCosts(state, payCtx, instr.costs)) {
        const hiddenCosts = state.privateChoicesV2 && instr.chooser !== "opponent" ? instr.costs.filter(costDependsOnHiddenInfo) : [];
        if (hiddenCosts.length === 0 || !instr.costs.every((c) => hiddenCosts.includes(c) || canPayCost(state, payCtx, c))) { frame.bindings[instr.bind] = false; frame.bindings[B.declined] = true; return "next"; }
        unpayable = true;
      }
      const ability = abilityById(frame.abilityId)?.ability;
      const detail = frame.program === "replacement" ? `use ${nameOf(frame.sourceDefId)}'s effect instead?` : instr.costs && (instr.prompt === "pay the cost" || instr.prompt === "use this effect") ? `pay the cost to activate: ${ability?.text ?? ""}` : `${instr.prompt}? ${ability?.text ?? ""}`;
      pushChoice(sim, frame, { seat: instr.chooser === "opponent" ? otherSeat(frame.seat) : frame.seat, kind: "effect", optional: true, prompt: `${promptPrefix(frame)} — ${detail}`.trim(), request: { type: "confirm" }, bindings: { [CB.bind]: instr.bind }, ...(unpayable ? { unpayable: true } : {}) });
      return "wait";
    }
    case "mode": {
      const chooser = instr.chooser === "you" ? frame.seat : otherSeat(frame.seat);
      // Labels are written from the controller's view; reword them when the opponent chooses.
      const options: ChoiceOption[] = instr.labels.map((label, index) => ({ id: `m${index}`, label: chooser === frame.seat ? label : forOpponent(label), eligible: !instr.costOptions || (instr.costOptions[index] ?? []).every((c) => canPayCost(state, ctx, c)) }));
      pushChoice(sim, frame, { seat: chooser, kind: "effect", optional: false, prompt: `${promptPrefix(frame)} — ${instr.prompt ?? "choose one"}.`, request: { type: "mode", options }, bindings: { [CB.bind]: instr.bind } });
      return "wait";
    }
    case "select": return execSelect(sim, frame, instr);
    case "delay":
      {
        const vars: Record<string, BindingValue> = {};
        for (const [k, v] of Object.entries(frame.bindings)) if (!k.startsWith("__") && k !== B.await && k !== B.delay && k !== B.selectMeta) vars[k] = v;
        // "At the end of this turn, trash this Character": if it leaves the field first it is a new card, so the effect lapses (#656).
        const src = locate(state, frame.sourceInstanceId);
        const selfBound = (src?.zone === "character" || src?.zone === "stage") && JSON.stringify(compileDelayed(abilityById(frame.abilityId)!.ability, instr.index).instrs).includes('"ref":"self"');
        state.delayed.push({ id: alloc(state, "delay"), seat: frame.seat, sourceInstanceId: frame.sourceInstanceId, sourceDefId: frame.sourceDefId, abilityId: frame.abilityId, index: instr.index, turn: state.turnNumber, when: instr.when, vars, ...(selfBound ? { selfBound: true } : {}) });
      }
      return "next";
    case "look": return execLook(sim, frame, instr);
    case "act": frame.bindings[B.acted] = true; return execAct(sim, frame, instr.effect);
  }
}

/** Whether a card chosen to be played by an effect can enter the field now (play locks such as OP13-118 Luffy). */
function playableByEffect(state: MatchState, loc: Located): boolean {
  if (isOnField(loc)) return true;
  const def = getCardDef(loc.defId);
  if (def.type === "character" && playerRestricted(state, loc.seat, "cannot_play_characters", loc)) return false;
  return !abilitiesFor(loc.defId).some((a) => (a.statics ?? []).some((st) => st.s === "deck_rule" && st.rule === "not_playable_by_effect"));
}

function execSelect(sim: Sim, frame: ResolutionFrame, instr: Extract<Instr, { op: "select" }>): ExecResult {
  const { state } = sim;
  const ctx = frameCtx(frame);
  const chooser = instr.chooser === "you" ? frame.seat : otherSeat(frame.seat);
  const list = candidates(state, ctx, instr.selector).filter((l) => !instr.forPlay || playableByEffect(state, l));
  const valueCount = instr.countValue != null ? Math.max(0, evalValue(state, ctx, instr.countValue)) : null;
  const max = Math.min(valueCount ?? instr.max, list.length);
  const min = Math.min(valueCount ?? instr.min, max);
  // A select from a hidden zone is always asked (#369): skipping an empty one, or auto-binding a forced one, would
  // show the opponent how many cards (or whether any) matched.
  const askHidden = state.privateChoicesV2 === true && !instr.random && selectorReadsHiddenZone(instr.selector);
  if (max === 0 && !(askHidden && (valueCount ?? instr.max) > 0)) { frame.bindings[instr.bind] = []; return "next"; }
  if (instr.random) {
    frame.bindings[instr.bind] = sim.rng.shuffle(list.map((l) => l.id)).slice(0, max);
    return "next";
  }
  // Forced: every candidate must be chosen and no constraint could reject it.
  if (!askHidden && min === list.length && instr.totalCostAtMost == null && instr.totalPowerAtMost == null) {
    frame.bindings[instr.bind] = list.map((l) => l.id);
    return "next";
  }
  const bindings: Record<string, string> = { [CB.bind]: instr.bind };
  const options = list.map((loc, index) => {
    const id = `o${index}`;
    bindings[id] = loc.id;
    return optionFor(state, loc, id, chooser);
  });
  const hidden = askHidden || list.some((l) => l.zone === "hand" || l.zone === "deck" || l.zone === "life");
  const limit = min === max ? `${max}` : min === 0 ? `up to ${max}` : `${min}–${max}`;
  const prompt = max === 0
    ? `${promptPrefix(frame)} — No card to ${instr.purpose}${instr.purpose.endsWith(".") ? "" : "."} Confirm to continue.`
    : `${promptPrefix(frame)} — choose ${limit} card${max === 1 ? "" : "s"} to ${instr.purpose}${instr.purpose.endsWith(".") ? "" : "."}`;
  pushChoice(sim, frame, {
    seat: chooser, kind: "effect", optional: false, prompt, request: { type: "select", min, max, options, ...(instr.distinctNames ? { distinctNames: true as const } : {}), ...(instr.totalCostAtMost != null ? { totalCostAtMost: evalValue(state, ctx, instr.totalCostAtMost) } : {}), ...(instr.totalPowerAtMost != null ? { totalPowerAtMost: evalValue(state, ctx, instr.totalPowerAtMost) } : {}) }, bindings,
    ...(hidden ? { privateToSeat: chooser, optionCount: options.length } : {}),
  });
  frame.bindings[B.selectMeta] = JSON.stringify({ totalCostAtMost: instr.totalCostAtMost ?? null, totalPowerAtMost: instr.totalPowerAtMost ?? null, distinctNames: instr.distinctNames ?? false });
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
    case "top_or_bottom": return "place the rest all at the top or all at the bottom of the deck";
    case "trash": return "trash the rest";
    case "hand": return "add the rest to your hand";
    case "shuffle": return "shuffle the rest into the deck";
    case "look_only": return "return them in the same order";
  }
}
