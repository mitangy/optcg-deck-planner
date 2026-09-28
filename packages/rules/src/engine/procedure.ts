/**
 * Turn and battle procedure. `settle` advances the game until a player must
 * act: pending choices first, then running ability frames, queued triggers
 * (turn player first, controller orders simultaneous ones), then procedure steps.
 */
import { abilitiesFor, abilityById } from "../cards/abilities.js";
import { getCardDef } from "../cards/definitions.js";
import type { MatchState, PendingChoice, Seat } from "../types.js";
import { expireBattle, expireEndOfTurn, expireStartOfTurn } from "./modifiers.js";
import { hasKeyword, hasRestriction, powerOf, protectedFromBattleKoBy, restrictionValue } from "./queries.js";
import { addModifier } from "./modifiers.js";
import {
  abilityGateOpen, dispatchEvent, findReplacement, newBatch, performKo, pushReplacementFrame, queueWindow, runFrames, startAbility, takeLifeToHand, type Sim,
} from "./runtime.js";
import { alloc, fieldCards, isOnField, locate, otherSeat, placeDonFromDeck, putCard, takeCard } from "./state.js";

export function gameOver(sim: Sim, winner: Seat, reason: NonNullable<MatchState["winReason"]>): void {
  const { state } = sim;
  if (state.winner !== null) return;
  state.winner = winner;
  state.winReason = reason;
  state.phase = "game_over";
  sim.events.push({ type: "game_over", winner, reason });
}

function clearForGameOver(state: MatchState): void {
  state.pendingChoices = [];
  state.resolutionFrames = [];
  state.triggerQueue = [];
  state.steps = [];
  state.phase = "game_over";
}

/** Leader "Under the rules of this game …" rule, by rule string. */
export function leaderRule(state: MatchState, seat: Seat, rule: string): boolean {
  return abilitiesFor(state.players[seat].leader.defId).some((a) => (a.statics ?? []).some((st) => st.s === "deck_rule" && st.rule === rule));
}

/** Rule processing: a player with no cards in their deck loses. */
function checkRules(sim: Sim): void {
  const { state } = sim;
  if (state.phase === "mulligan" || state.winner !== null) return;
  // "You do not lose when your deck has 0 cards. You lose at the end of the turn …"
  const empty = ([0, 1] as Seat[]).filter((s) => state.players[s].deck.length === 0 && !leaderRule(state, s, "deck_out_end_of_turn"));
  // "When your deck is reduced to 0, you win the game instead of losing, according to the rules."
  const winsOnDeckOut = (s: Seat) => leaderRule(state, s, "deck_out_win");
  if (empty.length === 1 && winsOnDeckOut(empty[0]!)) { gameOver(sim, empty[0]!, "card_effect"); return; }
  if (empty.length === 1) gameOver(sim, otherSeat(empty[0]!), "deck_out");
  else if (empty.length === 2) gameOver(sim, otherSeat(state.activeSeat), "deck_out");
}

export function settle(sim: Sim): void {
  const { state } = sim;
  for (let guard = 0; guard < 10000; guard += 1) {
    checkRules(sim);
    if (state.winner !== null) { clearForGameOver(state); return; }
    if (state.pendingChoices.length > 0) return;
    if (state.resolutionFrames.length > 0) { runFrames(sim); continue; }
    if (state.triggerQueue.length > 0) { if (startNextTrigger(sim)) continue; return; }
    if (state.steps.length > 0) { advanceStep(sim); continue; }
    // A battle card left the field while players held priority: the battle ends.
    if (state.battle && (state.phase === "block" || state.phase === "counter") && !battleCards(state)) { state.steps.push({ kind: "end_battle" }); continue; }
    return;
  }
  throw new Error("Game procedure did not settle");
}

function startNextTrigger(sim: Sim): boolean {
  const { state } = sim;
  const batch = Math.min(...state.triggerQueue.map((t) => t.batch));
  const inBatch = state.triggerQueue.filter((t) => t.batch === batch);
  const seat = inBatch.some((t) => t.seat === state.activeSeat) ? state.activeSeat : otherSeat(state.activeSeat);
  const mine = inBatch.filter((t) => t.seat === seat);
  if (mine.length > 1 && mine.some((t) => !t.ordered)) {
    const unordered: PendingChoice[] = mine.map((t) => ({ id: t.id, seat, kind: "effect", cardDefId: t.sourceDefId, sourceInstanceId: t.sourceInstanceId, optional: false, prompt: `${getCardDef(t.sourceDefId).name}: ${abilityById(t.abilityId)?.ability.text ?? t.abilityId}` }));
    const choice: PendingChoice = { id: alloc(state, "choice"), seat, kind: "order_effects", cardDefId: mine[0]!.sourceDefId, optional: false, prompt: "Choose the order to resolve your simultaneous effects.", unorderedChoices: unordered };
    state.pendingChoices.push(choice);
    sim.events.push({ type: "pending_choice_added", seat, kind: "order_effects", cardDefId: choice.cardDefId, optional: false, prompt: choice.prompt });
    return false;
  }
  const next = mine[0]!;
  state.triggerQueue = state.triggerQueue.filter((t) => t.id !== next.id);
  const entry = abilityById(next.abilityId);
  if (!entry) return true;
  if (next.delayIndex != null) {
    state.resolutionFrames.push({ id: alloc(state, "frame"), seat: next.seat, sourceInstanceId: next.sourceInstanceId, sourceDefId: next.sourceDefId, abilityId: next.abilityId, window: "end_of_turn", operationIndex: 0, bindings: { ...(next.vars ?? {}), _delay: next.delayIndex }, program: "ability" });
    return true;
  }
  const loc = locate(state, next.sourceInstanceId);
  // Once-per-turn may have been consumed by an earlier copy of the same trigger.
  if (entry.ability.oncePerTurn && loc?.card?.usedAbilities?.[entry.ability.id] === state.turnNumber) return true;
  startAbility(sim, next.seat, { id: next.sourceInstanceId, defId: next.sourceDefId }, entry.ability, next.window, next.eventCardId ? { _event: next.eventCardId } : {});
  return true;
}

/** Apply an `order_pending_effects` answer. */
export function applyTriggerOrder(sim: Sim, choice: PendingChoice, orderedIds: string[]): string | null {
  const { state } = sim;
  const ids = (choice.unorderedChoices ?? []).map((c) => c.id);
  if (orderedIds.length !== ids.length || new Set(orderedIds).size !== ids.length || orderedIds.some((id) => !ids.includes(id))) return "orderedIds must be a permutation of the pending effects";
  const ordered = orderedIds.map((id) => state.triggerQueue.find((t) => t.id === id)!).filter(Boolean);
  const rest = state.triggerQueue.filter((t) => !ids.includes(t.id));
  const firstIndex = state.triggerQueue.findIndex((t) => ids.includes(t.id));
  const before = state.triggerQueue.slice(0, firstIndex).filter((t) => !ids.includes(t.id));
  const after = rest.filter((t) => !before.includes(t));
  state.triggerQueue = [...before, ...ordered.map((t) => ({ ...t, ordered: true })), ...after];
  state.pendingChoices = state.pendingChoices.filter((c) => c.id !== choice.id);
  sim.events.push({ type: "pending_choice_resolved", seat: choice.seat, kind: "order_effects", cardDefId: choice.cardDefId, accepted: true });
  return null;
}

// ---------------------------------------------------------------------------
// Turn structure
// ---------------------------------------------------------------------------

export function beginTurn(sim: Sim): void {
  const { state } = sim;
  expireStartOfTurn(state);
  const seat = state.activeSeat;
  const p = state.players[seat];
  p.turnsStarted += 1;
  // Refresh phase.
  const noRefresh = new Set(state.modifiers.filter((m) => m.target.kind === "card" && m.effect.type === "restrict" && m.effect.restriction === "no_refresh" && m.expires.kind === "next_refresh" && m.expires.seat === seat).map((m) => (m.target as { id: string }).id));
  state.modifiers = state.modifiers.filter((m) => !(m.expires.kind === "next_refresh" && m.expires.seat === seat));
  for (const card of fieldCards(p)) {
    if (!noRefresh.has(card.id) && !hasRestriction(state, seat, card, "no_refresh")) card.rested = false;
    card.attachedDonIds = [];
  }
  for (const c of p.characters) c.summoningSick = false;
  for (const d of p.attachedDons) { d.attachedTo = null; d.rested = false; p.costArea.push(d); }
  p.attachedDons = [];
  for (const d of p.costArea) { if (d.noRefresh) { d.noRefresh = false; continue; } d.rested = false; }
  sim.events.push({ type: "phase_changed", phase: "refresh", activeSeat: seat });
  // Draw phase (first player skips on their first turn).
  const skipDraw = seat === state.firstSeat && p.turnsStarted === 1;
  if (!skipDraw) {
    if (!p.deck.length && !leaderRule(state, seat, "deck_out_end_of_turn")) { gameOver(sim, otherSeat(seat), "deck_out"); return; }
    if (p.deck.length) {
    const defId = p.deck.shift()!;
    const id = p.zoneInstanceIds.deck.shift()!;
    p.hand.push({ id, defId, rested: false, attachedDonIds: [] });
    sim.events.push({ type: "drew", seat, count: 1 });
    }
  }
  sim.events.push({ type: "phase_changed", phase: "draw", activeSeat: seat });
  const donN = seat === state.firstSeat && p.turnsStarted === 1 ? 1 : 2;
  const hadDon = p.costArea.length + p.attachedDons.length > 0;
  const placed = placeDonFromDeck(p, donN, false);
  // "If you have any DON!! cards on your field, 1 DON!! card placed during your DON!! Phase is given to your Leader."
  if (placed > 0 && hadDon && leaderRule(state, seat, "don_phase_give_leader")) {
    const don = p.costArea.pop()!;
    don.attachedTo = p.leader.id;
    p.leader.attachedDonIds.push(don.id);
    p.attachedDons.push(don);
  }
  sim.events.push({ type: "don_placed", seat, count: placed });
  sim.events.push({ type: "phase_changed", phase: "don", activeSeat: seat });
  state.phase = "main";
  sim.events.push({ type: "phase_changed", phase: "main", activeSeat: seat });
  newBatch(state);
  for (const card of fieldCards(p)) queueWindow(state, "start_of_your_turn", seat, card);
  // Delayed effects "at the start of your opponent's next Main Phase".
  for (const d of state.delayed.filter((x) => x.when === "opponent_main" && x.seat !== seat && x.turn < state.turnNumber)) {
    state.triggerQueue.push({ id: alloc(state, "trig"), seat: d.seat, sourceInstanceId: d.sourceInstanceId, sourceDefId: d.sourceDefId, abilityId: d.abilityId, window: "delayed", batch: state.triggerBatch, delayIndex: d.index, ...(d.vars ? { vars: d.vars } : {}) });
  }
  state.delayed = state.delayed.filter((x) => !(x.when === "opponent_main" && x.seat !== seat && x.turn < state.turnNumber));
}

export function endTurn(sim: Sim): void {
  const { state } = sim;
  state.phase = "end";
  sim.events.push({ type: "phase_changed", phase: "end", activeSeat: state.activeSeat });
  newBatch(state);
  const seat = state.activeSeat;
  for (const card of fieldCards(state.players[seat])) queueWindow(state, "end_of_your_turn", seat, card);
  for (const card of fieldCards(state.players[otherSeat(seat)])) queueWindow(state, "end_of_opponent_turn", otherSeat(seat), card);
  for (const d of state.delayed.filter((x) => x.turn === state.turnNumber && (x.when ?? "end_of_turn") === "end_of_turn")) {
    state.triggerQueue.push({ id: alloc(state, "trig"), seat: d.seat, sourceInstanceId: d.sourceInstanceId, sourceDefId: d.sourceDefId, abilityId: d.abilityId, window: "end_of_turn", batch: state.triggerBatch, delayIndex: d.index, ...(d.vars ? { vars: d.vars } : {}) });
  }
  state.delayed = state.delayed.filter((x) => x.turn > state.turnNumber || x.when === "end_of_battle" || x.when === "opponent_main");
  state.steps.push({ kind: "end_phase" });
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export function declareAttack(sim: Sim, attackerId: string, target: MatchState["battle"] extends infer B ? B extends { target: infer T } ? T : never : never): void {
  const { state } = sim;
  const seat = state.activeSeat;
  const p = state.players[seat];
  const attacker = [p.leader, ...p.characters].find((c) => c.id === attackerId)!;
  attacker.rested = true;
  dispatchEvent(state, "self_rested", { seat, card: attacker });
  const oppSeat = otherSeat(seat);
  const opp = state.players[oppSeat];
  const defender = target.kind === "leader" ? opp.leader : opp.characters.find((c) => c.id === target.instanceId)!;
  state.battle = { attackerSeat: seat, attackerId, target, originalTargetId: defender.id, defenderPowerBonus: 0, attackerPowerBonus: 0 };
  state.phase = "block";
  sim.events.push({ type: "attack_declared", seat, attackerId, target, attackerPower: powerOf(state, seat, attacker), defenderPower: powerOf(state, oppSeat, defender) });
  newBatch(state);
  queueWindow(state, "when_attacking", seat, attacker);
  for (const card of fieldCards(opp)) queueWindow(state, "on_opp_attack", oppSeat, card);
  dispatchEvent(state, "attack_declared", { seat, card: attacker });
  dispatchEvent(state, "self_attacked", { seat: oppSeat, card: defender });
  if (target.kind === "leader") dispatchEvent(state, "leader_attacked", { seat: oppSeat, card: defender });
  state.steps.push({ kind: "after_attack_triggers" });
  // "… cannot attack unless your opponent trashes N cards from their hand whenever they attack."
  const tax = restrictionValue(state, seat, attacker, "attack_requires_discard");
  if (typeof tax === "number" && tax > 0) state.resolutionFrames.push({ id: alloc(state, "frame"), seat, sourceInstanceId: attacker.id, sourceDefId: attacker.defId, abilityId: "__attack_tax", window: "rule", operationIndex: 0, bindings: { _taxCount: tax }, program: "attack_tax" });
}

export function declareBlock(sim: Sim, blockerId: string): void {
  const { state } = sim;
  const b = state.battle!;
  const defSeat = otherSeat(b.attackerSeat);
  const blocker = state.players[defSeat].characters.find((c) => c.id === blockerId)!;
  blocker.rested = true;
  b.target = { kind: "character", instanceId: blocker.id };
  b.blockerId = blocker.id;
  sim.events.push({ type: "blocked", seat: defSeat, blockerId });
  dispatchEvent(state, "blocker_activated", { seat: defSeat, card: blocker });
  newBatch(state);
  queueWindow(state, "on_block", defSeat, blocker);
  dispatchEvent(state, "self_rested", { seat: defSeat, card: blocker });
  state.steps.push({ kind: "after_block_triggers" });
}

function battleCards(state: MatchState) {
  const b = state.battle;
  if (!b) return null;
  const attackerLoc = locate(state, b.attackerId);
  const defSeat = otherSeat(b.attackerSeat);
  const defenderId = b.target.kind === "leader" ? state.players[defSeat].leader.id : b.target.instanceId;
  const defenderLoc = locate(state, defenderId);
  if (!attackerLoc?.card || !isOnField(attackerLoc) || attackerLoc.seat !== b.attackerSeat) return null;
  if (!defenderLoc?.card || !isOnField(defenderLoc) || defenderLoc.seat !== defSeat) return null;
  return { b, attacker: attackerLoc.card, defender: defenderLoc.card, defSeat, defenderLoc };
}

function advanceStep(sim: Sim): void {
  const { state } = sim;
  const step = state.steps[0]!;
  switch (step.kind) {
    case "start_turn_triggers": state.steps.shift(); return;
    case "after_attack_triggers": {
      state.steps.shift();
      if (!battleCards(state)) { state.steps.unshift({ kind: "end_battle" }); return; }
      state.phase = "block";
      return;
    }
    case "after_block_triggers": {
      state.steps.shift();
      if (!battleCards(state)) { state.steps.unshift({ kind: "end_battle" }); return; }
      state.phase = "counter";
      return;
    }
    case "damage": {
      state.steps.shift();
      state.phase = "damage";
      const cards = battleCards(state);
      if (!cards) { state.steps.unshift({ kind: "end_battle" }); return; }
      const { b, attacker, defender, defSeat } = cards;
      const atk = powerOf(state, b.attackerSeat, attacker);
      const def = powerOf(state, defSeat, defender);
      const won = atk >= def;
      sim.events.push({ type: "battle_resolved", attackerWon: won, attackerPower: atk, defenderPower: def });
      if (!won) { state.steps.unshift({ kind: "end_battle" }); return; }
      if (b.target.kind === "character") {
        const next: MatchState["steps"] = [];
        if (!hasRestriction(state, defSeat, defender, "cannot_be_ko_in_battle") && !hasRestriction(state, defSeat, defender, "cannot_be_ko") && !protectedFromBattleKoBy(state, defSeat, defender, attacker.defId)) next.push({ kind: "battle_ko", targetSeat: defSeat, targetId: defender.id });
        next.push({ kind: "end_battle" });
        state.steps.unshift(...next);
        return;
      }
      b.damageRemaining = hasKeyword(state, b.attackerSeat, attacker, "double_attack") ? 2 : 1;
      state.steps.unshift({ kind: "life_damage" }, { kind: "end_battle" });
      return;
    }
    case "life_damage": {
      const b = state.battle;
      if (!b || !b.damageRemaining) { state.steps.shift(); return; }
      const defSeat = otherSeat(b.attackerSeat);
      const d = state.players[defSeat];
      if (d.life.length === 0) { gameOver(sim, b.attackerSeat, "leader_battle_at_zero_life"); return; }
      b.damageRemaining -= 1;
      const attacker = locate(state, b.attackerId)?.card;
      const lifeId = d.zoneInstanceIds.life[0]!;
      const lifeDef = d.life[0]!;
      dispatchEvent(state, "leader_damaged", { seat: defSeat });
      if (attacker) dispatchEvent(state, "attack_damage", { seat: b.attackerSeat, card: attacker });
      if (attacker && hasKeyword(state, b.attackerSeat, attacker, "banish")) {
        const entry = takeCard(state, { seat: defSeat, zone: "life", index: 0, id: lifeId, defId: lifeDef });
        putCard(state, defSeat, "trash", entry);
        sim.events.push({ type: "life_taken", seat: defSeat, defId: lifeDef, toHand: false });
        dispatchEvent(state, "life_removed", { seat: defSeat, card: entry });
        return;
      }
      const trigger = abilitiesFor(lifeDef).find((a) => a.trigger === "trigger");
      if (trigger) {
        const choice: PendingChoice = { id: alloc(state, "choice"), seat: defSeat, kind: "life_trigger", cardDefId: lifeDef, sourceInstanceId: lifeId, optional: true, prompt: `${getCardDef(lifeDef).name} — activate this card's [Trigger]? ${trigger.text}`, request: { type: "confirm" }, privateToSeat: defSeat, hideCardDefFromOthers: true, bindings: { lifeId, abilityId: trigger.id } };
        state.pendingChoices.push(choice);
        sim.events.push({ type: "life_taken", seat: defSeat, defId: lifeDef, toHand: false });
        sim.events.push({ type: "trigger_available", seat: defSeat, defId: lifeDef });
        sim.events.push({ type: "pending_choice_added", seat: defSeat, kind: "life_trigger", cardDefId: lifeDef, optional: true, prompt: choice.prompt, privateToSeat: defSeat, hideCardDefFromOthers: true });
        return;
      }
      takeLifeToHand(sim, defSeat, false, true);
      sim.events.push({ type: "life_taken", seat: defSeat, defId: lifeDef, toHand: true });
      return;
    }
    case "battle_ko": {
      const loc = locate(state, step.targetId);
      if (!loc || loc.zone !== "character") { state.steps.shift(); return; }
      if (step.replaced === undefined) {
        const hit = findReplacement(state, loc, ["ko", "ko_in_battle", "removed"], true);
        if (hit) { step.replaced = false; pushReplacementFrame(sim, hit, loc.id); return; }
      } else if (step.replaced) { state.steps.shift(); return; }
      state.steps.shift();
      newBatch(state);
      performKo(sim, loc, { battle: true });
      const attacker = state.battle ? locate(state, state.battle.attackerId) : null;
      if (attacker?.card) dispatchEvent(state, "battle_ko_opponent", { seat: attacker.seat, card: attacker });
      return;
    }
    case "end_battle": {
      state.steps.shift();
      const eb = state.battle;
      if (eb && !eb.endDispatched) {
        eb.endDispatched = true;
        const attackerLoc = locate(state, eb.attackerId);
        const defenderId = eb.target.kind === "leader" ? state.players[otherSeat(eb.attackerSeat)].leader.id : eb.target.instanceId;
        const defenderLoc = locate(state, defenderId);
        newBatch(state);
        let queued = false;
        const mark = (loc: typeof attackerLoc, vsCharacter: boolean) => {
          if (!loc?.card || !isOnField(loc) || !vsCharacter) return;
          addModifier(state, loc.seat, loc.id, { kind: "card", id: loc.id }, { type: "flag", flag: "battled_character" }, { kind: "end_of_turn", turn: state.turnNumber });
          const before = state.triggerQueue.length;
          dispatchEvent(state, "battle_ended_vs_character", { seat: loc.seat, card: loc });
          if (state.triggerQueue.length > before) queued = true;
        };
        mark(attackerLoc, eb.target.kind === "character");
        mark(defenderLoc, getCardDef(attackerLoc?.defId ?? state.players[eb.attackerSeat].leader.defId).type === "character");
        if (queued) { state.steps.unshift({ kind: "end_battle" }); return; }
      }
      const battleDelays = state.delayed.filter((x) => x.when === "end_of_battle");
      if (battleDelays.length) {
        state.delayed = state.delayed.filter((x) => x.when !== "end_of_battle");
        newBatch(state);
        for (const d of battleDelays) state.triggerQueue.push({ id: alloc(state, "trig"), seat: d.seat, sourceInstanceId: d.sourceInstanceId, sourceDefId: d.sourceDefId, abilityId: d.abilityId, window: "end_of_battle", batch: state.triggerBatch, delayIndex: d.index, ...(d.vars ? { vars: d.vars } : {}) });
        state.steps.unshift({ kind: "end_battle" });
        return;
      }
      expireBattle(state);
      state.battle = null;
      if (state.phase !== "game_over") state.phase = "main";
      newBatch(state);
      return;
    }
    case "effect_damage": {
      if (step.remaining <= 0) { state.steps.shift(); return; }
      const d = state.players[step.seat];
      if (d.life.length === 0) { gameOver(sim, otherSeat(step.seat), "leader_battle_at_zero_life"); return; }
      step.remaining -= 1;
      const lifeId = d.zoneInstanceIds.life[0]!;
      const lifeDef = d.life[0]!;
      dispatchEvent(state, "leader_damaged", { seat: step.seat });
      const trigger = abilitiesFor(lifeDef).find((a) => a.trigger === "trigger");
      if (trigger) {
        const choice: PendingChoice = { id: alloc(state, "choice"), seat: step.seat, kind: "life_trigger", cardDefId: lifeDef, sourceInstanceId: lifeId, optional: true, prompt: `${getCardDef(lifeDef).name} — activate this card's [Trigger]? ${trigger.text}`, request: { type: "confirm" }, privateToSeat: step.seat, hideCardDefFromOthers: true, bindings: { lifeId, abilityId: trigger.id } };
        state.pendingChoices.push(choice);
        sim.events.push({ type: "life_taken", seat: step.seat, defId: lifeDef, toHand: false });
        sim.events.push({ type: "pending_choice_added", seat: step.seat, kind: "life_trigger", cardDefId: lifeDef, optional: true, prompt: choice.prompt, privateToSeat: step.seat, hideCardDefFromOthers: true });
        return;
      }
      takeLifeToHand(sim, step.seat, false, true);
      sim.events.push({ type: "life_taken", seat: step.seat, defId: lifeDef, toHand: true });
      return;
    }
    case "end_phase": {
      state.steps.shift();
      for (const s of [state.activeSeat, otherSeat(state.activeSeat)] as Seat[]) {
        if (state.players[s].deck.length === 0 && leaderRule(state, s, "deck_out_end_of_turn")) { gameOver(sim, otherSeat(s), "deck_out"); return; }
      }
      expireEndOfTurn(state);
      const extra = state.extraTurns.indexOf(state.activeSeat);
      if (extra >= 0) state.extraTurns.splice(extra, 1);
      else state.activeSeat = otherSeat(state.activeSeat);
      state.turnNumber += 1;
      beginTurn(sim);
      return;
    }
  }
}

/** Resolve the front Life Trigger prompt. */
export function resolveLifeTrigger(sim: Sim, choice: PendingChoice, accept: boolean): string | null {
  const { state } = sim;
  const seat = choice.seat;
  const lifeId = choice.bindings?.lifeId;
  const abilityId = choice.bindings?.abilityId;
  const loc = lifeId ? locate(state, lifeId) : null;
  state.pendingChoices = state.pendingChoices.filter((c) => c.id !== choice.id);
  sim.events.push({ type: "pending_choice_resolved", seat, kind: "life_trigger", cardDefId: choice.cardDefId, accepted: accept, privateToSeat: seat, hideCardDefFromOthers: true });
  sim.events.push({ type: "trigger_resolved", seat, accepted: accept });
  if (!loc || loc.zone !== "life") return null;
  if (!accept) {
    takeLifeToHand(sim, seat, loc.index !== 0, true);
    return null;
  }
  const entry = takeCard(state, loc);
  putCard(state, seat, "resolving", entry);
  sim.events.push({ type: "card_revealed", seat, defId: entry.defId });
  dispatchEvent(state, "life_removed", { seat, card: entry });
  dispatchEvent(state, "trigger_activated", { seat, card: entry });
  const ability = abilityId ? abilityById(abilityId)?.ability : undefined;
  if (ability && abilityGateOpen(state, seat, entry, ability)) startAbility(sim, seat, entry, ability, "trigger");
  else { takeCard(state, locate(state, entry.id)!); putCard(state, seat, "trash", entry); }
  return null;
}

export { alloc };
