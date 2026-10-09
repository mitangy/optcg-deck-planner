/** Public engine facade: match creation, intent validation/application and legal-intent listing. */
import { abilitiesFor, REGISTRY_HASH } from "../cards/abilities.js";
import { ensureDefsForPlayers, getCardDef, normalizeCardDefId } from "../cards/definitions.js";
import { createSeededRng, type Rng } from "../rng.js";
import { MATCH_STATE_VERSION, RULES_PROTOCOL_VERSION, RULES_VERSION } from "../state/snapshot.js";
import type { ApplyContext, ApplyResult, AttackTarget, CardInstance, CreateMatchConfig, Intent, MatchState, PendingChoice, PlayerDeckConfig, PlayerState, Seat } from "../types.js";
import { addModifier } from "./modifiers.js";
import { beginTurn, applyTriggerOrder, declareAttack, declareBlock, endTurn, resolveLifeTrigger, settle } from "./procedure.js";
import { attackTargetAllowed, cannotAttackMatching, canPayCosts, costOf, counterOf, ctxFor, filterMatches, hasKeyword, hasRestriction, isNegated, playCostOf, playerRestricted, powerOf, restrictionValue } from "./queries.js";
import { abilityGateOpen, defaultAnswer, dispatchEvent, finishPlay, newBatch, resolveEffectChoice, startAbility, type Sim } from "./runtime.js";
import { activeDon, alloc, fieldCards, locate, makeCard, makeDon, otherSeat, putCard, takeCard } from "./state.js";

function fail(state: MatchState, code: string, message: string): ApplyResult {
  return { ok: false, state, events: [], error: { code, message } };
}

/** "Under the rules of this game, your DON!! deck consists of N cards." */
function donDeckSize(leaderId: string): number {
  for (const ability of abilitiesFor(leaderId)) for (const s of ability.statics ?? []) if (s.s === "deck_rule" && /^don_deck:\d+$/.test(s.rule)) return Number(s.rule.split(":")[1]);
  return 10;
}

function buildPlayer(state: MatchState, seat: Seat, cfg: PlayerDeckConfig, rng: Rng): PlayerState {
  const leaderDef = getCardDef(cfg.leaderId);
  if (leaderDef.type !== "leader" || leaderDef.life == null) throw new Error(`Invalid leader ${cfg.leaderId}`);
  const player: PlayerState = {
    leader: { id: alloc(state, "leader"), defId: leaderDef.id, rested: false, attachedDonIds: [] },
    characters: [],
    stage: null,
    hand: [],
    deck: [],
    trash: [],
    life: [],
    zoneInstanceIds: { deck: [], trash: [], life: [] },
    faceUpLife: [],
    resolving: [],
    donDeck: Array.from({ length: donDeckSize(leaderDef.id) }, () => makeDon(state)),
    costArea: [],
    attachedDons: [],
    mulliganDone: false,
    turnsStarted: 0,
  };
  player.donTotal = player.donDeck.length;
  const dealt = cfg.deck.map((defId) => ({ defId: getCardDef(defId).id, id: alloc(state, "card") }));
  const shuffled = rng.shuffle(dealt);
  // Ids allocated in decklist order would leak copy counts, and in draw order would leak the shuffle (#369):
  // hand them out by an independent permutation.
  // The permutation comes from its own stream derived from the seed, so the deck order, the draws and every later
  // roll of the match rng are the same as without the flag.
  if (state.privateChoicesV2) {
    const idRng = createSeededRng((state.rng.seed ^ 0x5bd1e995 ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0);
    const ids = idRng.shuffle(dealt.map((c) => c.id));
    shuffled.forEach((c, i) => { c.id = ids[i]!; });
  }
  player.deck = shuffled.map((c) => c.defId);
  player.zoneInstanceIds.deck = shuffled.map((c) => c.id);
  // "At the start of the game, play up to 1 {Trait} type Stage card from your deck."
  // One eligible Stage plays itself; two or more different ones ask the player
  // (the opening hand is drawn once they choose).
  for (const ability of abilitiesFor(leaderDef.id)) for (const st of ability.statics ?? []) {
    if (st.s !== "deck_rule" || !st.rule.startsWith("start_stage:") || player.stage) continue;
    const trait = st.rule.slice("start_stage:".length);
    const eligible = [...new Set(player.deck.filter((id) => { const def = getCardDef(id); return def.type === "stage" && (def.traits ?? []).includes(trait); }))];
    if (eligible.length === 0) continue;
    // The prompt appears for a single eligible Stage too, so the opponent cannot tell 1 from 2+ (#369).
    if (eligible.length === 1 && !state.privateChoicesV2) { playStartStage(player, eligible[0]!); continue; }
    const bindings: Record<string, string> = { __startStage: "1" };
    const options = eligible.map((defId, i) => { bindings[`stage${i}`] = defId; return { id: `stage${i}`, defId, zone: "deck" as const, ownerSeat: seat, eligible: true }; });
    state.pendingChoices.push({
      id: alloc(state, "choice"), seat, kind: "effect", cardDefId: leaderDef.id, optional: false,
      prompt: `Choose a {${trait}} type Stage card to play from your deck at the start of the game.`,
      request: { type: "select", min: 1, max: 1, options }, privateToSeat: seat, bindings,
    });
    return player;
  }
  drawOpeningHand(player);
  return player;
}

function playStartStage(player: PlayerState, defId: string): void {
  const idx = player.deck.indexOf(defId);
  player.stage = makeCard(player.deck.splice(idx, 1)[0]!, player.zoneInstanceIds.deck.splice(idx, 1)[0]!);
}

function drawOpeningHand(player: PlayerState): void {
  for (let i = 0; i < 5 && player.deck.length; i += 1) player.hand.push(makeCard(player.deck.shift()!, player.zoneInstanceIds.deck.shift()!));
}

/** Answer to the start-of-game Stage prompt: play it, shuffle the deck, then draw the opening hand. */
function resolveStartStage(sim: Sim, choice: PendingChoice, selectedOptionIds: string[]): ApplyError {
  const request = choice.request;
  if (request?.type !== "select") return err("INVALID_CHOICE", "Choice has no options");
  if (selectedOptionIds.length !== 1 || !request.options.some((o) => o.id === selectedOptionIds[0])) return err("INVALID_CHOICE", "Choose exactly 1 Stage card");
  const p = sim.state.players[choice.seat];
  playStartStage(p, choice.bindings![selectedOptionIds[0]!]!);
  const shuffled = sim.rng.shuffle(p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! })));
  p.deck = shuffled.map((c) => c.defId);
  p.zoneInstanceIds.deck = shuffled.map((c) => c.id);
  drawOpeningHand(p);
  sim.state.pendingChoices = sim.state.pendingChoices.filter((c) => c.id !== choice.id);
  sim.events.push({ type: "pending_choice_resolved", seat: choice.seat, kind: choice.kind, cardDefId: choice.cardDefId, accepted: true, privateToSeat: choice.seat });
  return null;
}


export function createMatch(config: CreateMatchConfig): MatchState {
  const players = config.players.map((p) => ({ leaderId: normalizeCardDefId(p.leaderId), deck: p.deck.map((id) => normalizeCardDefId(id)) })) as CreateMatchConfig["players"];
  ensureDefsForPlayers(players);
  const rng = createSeededRng(config.seed);
  const firstSeat: Seat = config.firstSeat ?? 0;
  const state: MatchState = {
    stateVersion: MATCH_STATE_VERSION,
    rulesVersion: RULES_VERSION,
    protocolVersion: RULES_PROTOCOL_VERSION,
    registryHash: REGISTRY_HASH,
    rng: { seed: config.seed >>> 0, cursor: 0 },
    players: [] as unknown as MatchState["players"],
    activeSeat: firstSeat,
    firstSeat,
    phase: "mulligan",
    turnNumber: 0,
    battle: null,
    pendingChoices: [],
    resolutionFrames: [],
    triggerQueue: [],
    modifiers: [],
    steps: [],
    extraTurns: [],
    delayed: [],
    winner: null,
    winReason: null,
    nextId: 1,
    triggerBatch: 0,
    lastEvents: [],
    ...(config.lifeCheckEveryHit === false ? {} : { lifeCheckEveryHit: true }),
    ...(config.privateChoicesV2 === false ? {} : { privateChoicesV2: true }),
  };
  state.players = [buildPlayer(state, 0, players[0], rng), buildPlayer(state, 1, players[1], rng)];
  state.rng = rng.snapshot();
  return state;
}

function setLife(player: PlayerState): void {
  const n = getCardDef(player.leader.defId).life ?? 0;
  for (let i = 0; i < n && player.deck.length; i += 1) {
    player.life.push(player.deck.shift()!);
    player.zoneInstanceIds.life.push(player.zoneInstanceIds.deck.shift()!);
    player.faceUpLife.push(false);
  }
}

function idle(state: MatchState): boolean {
  return state.pendingChoices.length === 0 && state.resolutionFrames.length === 0 && state.triggerQueue.length === 0 && state.steps.length === 0;
}

function defenderSeat(state: MatchState): Seat | null {
  return state.battle ? otherSeat(state.battle.attackerSeat) : null;
}

function currentDefender(state: MatchState): CardInstance | null {
  const b = state.battle;
  if (!b) return null;
  const d = state.players[otherSeat(b.attackerSeat)];
  const t = b.target;
  return t.kind === "leader" ? d.leader : d.characters.find((c) => c.id === t.instanceId) ?? null;
}

function mainAbility(defId: string, trigger: "main" | "counter") {
  return abilitiesFor(defId).find((a) => a.trigger === trigger);
}

function activatableAbilities(state: MatchState, seat: Seat, card: CardInstance) {
  if (isNegated(state, card)) return [];
  return abilitiesFor(card.defId).filter((a) => a.trigger === "activate_main" && abilityGateOpen(state, seat, card, a) && canPayCosts(state, ctxFor(seat, card), a.costs ?? []));
}

function canAttackWith(state: MatchState, seat: Seat, card: CardInstance, target: "leader" | "character"): boolean {
  const p = state.players[seat];
  // Attacking rests the attacker, so a Character that "cannot be rested" cannot attack (official Q&A).
  if (card.rested || hasRestriction(state, seat, card, "cannot_attack") || hasRestriction(state, seat, card, "cannot_be_rested")) return false;
  const tax = restrictionValue(state, seat, card, "attack_requires_discard");
  if (typeof tax === "number" && p.hand.length < tax) return false;
  if (target === "leader" && (hasRestriction(state, seat, card, "cannot_attack_leader") || playerRestricted(state, seat, "cannot_attack_leader") || !attackTargetAllowed(state, seat, state.players[otherSeat(seat)].leader))) return false;
  if (card.id === p.leader.id) return true;
  if (!card.summoningSick) return true;
  if (hasKeyword(state, seat, card, "rush")) return true;
  return target === "character" && hasKeyword(state, seat, card, "rush_character");
}

function attackableCharacter(state: MatchState, seat: Seat, attacker: CardInstance, target: CardInstance): boolean {
  if (!(target.rested || hasRestriction(state, seat, attacker, "can_attack_active")) || !attackTargetAllowed(state, seat, target)) return false;
  // "Cannot attack your opponent's Characters with a base cost of 7 or less."
  return !cannotAttackMatching(state, seat, attacker, target);
}

function canBlockWith(state: MatchState, seat: Seat, blocker: CardInstance): boolean {
  const b = state.battle;
  if (!b || blocker.rested || !hasKeyword(state, seat, blocker, "blocker")) return false;
  if (hasRestriction(state, seat, blocker, "cannot_block")) return false;
  // [Blocker] rests the blocker, so a Character that "cannot be rested" cannot activate it (official Q&A).
  if (hasRestriction(state, seat, blocker, "cannot_be_rested")) return false;
  if (b.blockerId) return false;
  if (b.target.kind === "character" && b.target.instanceId === blocker.id) return false;
  const attacker = locate(state, b.attackerId)?.card;
  if (!attacker) return false;
  if (hasKeyword(state, b.attackerSeat, attacker, "unblockable") || hasRestriction(state, b.attackerSeat, attacker, "cannot_activate_blocker")) return false;
  const powerLimit = restrictionValue(state, b.attackerSeat, attacker, "cannot_be_blocked_by_power_or_less");
  if (typeof powerLimit === "number" && powerOf(state, seat, blocker) <= powerLimit) return false;
  const powerFloor = restrictionValue(state, b.attackerSeat, attacker, "cannot_be_blocked_by_power_or_more");
  if (typeof powerFloor === "number" && powerOf(state, seat, blocker) >= powerFloor) return false;
  const costLimit = restrictionValue(state, b.attackerSeat, attacker, "cannot_be_blocked_by_cost_or_less");
  if (typeof costLimit === "number" && costOf(state, seat, blocker) <= costLimit) return false;
  return true;
}

function characterPlayable(state: MatchState, seat: Seat, card: CardInstance): boolean {
  const def = getCardDef(card.defId);
  if (def.type === "character" && playerRestricted(state, seat, "cannot_play_characters", card)) return false;
  if (playerRestricted(state, seat, "cannot_play_cards_from_hand", card)) return false;
  if (def.type === "event") {
    if (playerRestricted(state, seat, "cannot_play_events")) return false;
    const ability = mainAbility(def.id, "main");
    if (!ability || !abilityGateOpen(state, seat, card, ability)) return false;
  }
  return activeDon(state.players[seat]).length >= playCostOf(state, seat, card);
}

export function applyIntent(state: MatchState, intent: Intent, ctx: ApplyContext): ApplyResult {
  if (state.phase === "game_over" || state.winner !== null) return fail(state, "GAME_OVER", "Match finished");
  const next = structuredClone(state) as MatchState;
  const rng = createSeededRng(next.rng);
  const sim: Sim = { state: next, events: [], rng };
  const error = applyInner(sim, intent, ctx.seat);
  if (error) return fail(state, error.code, error.message);
  settle(sim);
  next.rng = rng.snapshot();
  next.lastEvents = sim.events;
  return { ok: true, state: next, events: sim.events };
}

type ApplyError = { code: string; message: string } | null;
const err = (code: string, message: string): ApplyError => ({ code, message });

function applyInner(sim: Sim, intent: Intent, seat: Seat): ApplyError {
  const state = sim.state;
  const p = state.players[seat];

  if (intent.type === "mulligan") {
    if (state.phase !== "mulligan") return err("WRONG_PHASE", "Mulligan is only allowed before the first turn");
    if (p.mulliganDone) return err("ALREADY", "Mulligan already chosen");
    if (state.pendingChoices.length > 0) return err("PENDING", "Choose your starting Stage first");
    if (intent.doMulligan) {
      const cards = [...p.hand.map((c) => ({ defId: c.defId, id: c.id })), ...p.deck.map((defId, i) => ({ defId, id: p.zoneInstanceIds.deck[i]! }))];
      const shuffled = sim.rng.shuffle(cards);
      p.hand = [];
      p.deck = shuffled.map((c) => c.defId);
      p.zoneInstanceIds.deck = shuffled.map((c) => c.id);
      for (let i = 0; i < 5 && p.deck.length; i += 1) p.hand.push(makeCard(p.deck.shift()!, p.zoneInstanceIds.deck.shift()!));
    }
    p.mulliganDone = true;
    sim.events.push({ type: "mulligan_resolved", seat, didMulligan: intent.doMulligan });
    if (state.players[0].mulliganDone && state.players[1].mulliganDone) {
      setLife(state.players[0]);
      setLife(state.players[1]);
      state.activeSeat = state.firstSeat;
      state.turnNumber = 1;
      beginTurn(sim);
    }
    return null;
  }

  if (intent.type === "resolve_pending_choice" || intent.type === "order_pending_effects") {
    const front = state.pendingChoices[0];
    if (!front) return err("NO_CHOICE", "No pending choice");
    if (front.seat !== seat) return err("NOT_YOUR_CHOICE", "Waiting for the other player");
    if (intent.type === "order_pending_effects") {
      if (front.kind !== "order_effects") return err("WRONG_CHOICE", "The front choice is not an ordering prompt");
      const e = applyTriggerOrder(sim, front, intent.orderedIds);
      return e ? err("INVALID_ORDER", e) : null;
    }
    if (front.kind === "order_effects") return err("WRONG_CHOICE", "Use order_pending_effects");
    if (front.bindings?.__startStage) return resolveStartStage(sim, front, intent.selectedOptionIds ?? []);
    if (front.kind === "life_trigger") { const e = resolveLifeTrigger(sim, front, intent.accept); return e ? err("INVALID_CHOICE", e) : null; }
    const e = resolveEffectChoice(sim, front, { accept: intent.accept, ...(intent.selectedOptionIds ? { selectedOptionIds: intent.selectedOptionIds } : {}), ...(intent.orderedOptionIds ? { orderedOptionIds: intent.orderedOptionIds } : {}), ...(intent.topOptionIds ? { topOptionIds: intent.topOptionIds } : {}) });
    return e ? err("INVALID_CHOICE", e) : null;
  }

  if (!idle(state)) return err("PENDING", "Resolve the pending effect first");

  if (state.phase === "block") {
    if (seat !== defenderSeat(state)) return err("NOT_DEFENDER", "Only the defending player acts during the block step");
    if (intent.type === "pass_block") { state.phase = "counter"; return null; }
    if (intent.type === "declare_block") {
      const blocker = p.characters.find((c) => c.id === intent.blockerId);
      if (!blocker || !canBlockWith(state, seat, blocker)) return err("INVALID_BLOCK", "That Character cannot block");
      declareBlock(sim, blocker.id);
      return null;
    }
    return err("WRONG_PHASE", "Block step: declare a blocker or pass");
  }

  if (state.phase === "counter") {
    if (seat !== defenderSeat(state)) return err("NOT_DEFENDER", "Only the defending player acts during the counter step");
    if (intent.type === "pass_counter") { state.steps.push({ kind: "damage" }); return null; }
    if (intent.type === "counter_from_hand") {
      const card = p.hand[intent.handIndex];
      if (!card) return err("INVALID_CARD", "No card at that hand index");
      const value = counterOf(state, seat, card);
      if (getCardDef(card.defId).type !== "character" || value <= 0) return err("NO_COUNTER", "That card has no Counter");
      const defender = currentDefender(state);
      if (!defender) return err("NO_BATTLE", "No defender");
      const entry = takeCard(state, locate(state, card.id)!);
      putCard(state, seat, "trash", entry);
      addModifier(state, seat, entry.id, { kind: "card", id: defender.id }, { type: "power", amount: value }, { kind: "battle" });
      sim.events.push({ type: "counter_applied", seat, defId: entry.defId, bonus: value });
      return null;
    }
    if (intent.type === "counter_event") {
      const card = p.hand[intent.handIndex];
      if (!card) return err("INVALID_CARD", "No card at that hand index");
      const ability = mainAbility(card.defId, "counter");
      if (getCardDef(card.defId).type !== "event" || !ability) return err("NOT_COUNTER_EVENT", "That card has no supported [Counter] effect");
      if (!abilityGateOpen(state, seat, card, ability)) return err("CONDITION", "The [Counter] effect's conditions are not met");
      const cost = playCostOf(state, seat, card);
      const dons = activeDon(p);
      if (dons.length < cost) return err("INSUFFICIENT_DON", "Not enough active DON!!");
      for (let i = 0; i < cost; i += 1) dons[i]!.rested = true;
      const entry = takeCard(state, locate(state, card.id)!);
      putCard(state, seat, "resolving", entry);
      sim.events.push({ type: "counter_applied", seat, defId: entry.defId, bonus: 0 });
      newBatch(state);
      dispatchEvent(state, "event_activated", { seat, card: entry });
      startAbility(sim, seat, entry, ability, "counter");
      return null;
    }
    return err("WRONG_PHASE", "Counter step: use a Counter or pass");
  }

  if (state.phase !== "main") return err("WRONG_PHASE", `Cannot act during ${state.phase}`);
  if (seat !== state.activeSeat) return err("NOT_YOUR_TURN", "Not your turn");

  switch (intent.type) {
    case "end_turn": endTurn(sim); return null;
    case "give_don": {
      const idx = p.costArea.findIndex((d) => d.id === intent.donId && !d.rested);
      if (idx < 0) return err("INVALID_DON", "DON!! must be active in your cost area");
      const target = [p.leader, ...p.characters].find((c) => c.id === intent.targetId);
      if (!target) return err("INVALID_TARGET", "Give DON!! to your Leader or a Character");
      const [don] = p.costArea.splice(idx, 1);
      don!.attachedTo = target.id;
      target.attachedDonIds.push(don!.id);
      p.attachedDons.push(don!);
      sim.events.push({ type: "don_given", seat, donId: don!.id, targetId: target.id, targetDefId: target.defId, newPower: powerOf(state, seat, target) });
      dispatchEvent(state, "don_given", { seat, card: target });
      return null;
    }
    case "play_card": {
      const card = p.hand[intent.handIndex];
      if (!card) return err("INVALID_CARD", "No card at that hand index");
      const def = getCardDef(card.defId);
      if (def.type === "leader") return err("INVALID_CARD", "Leaders cannot be played");
      if (def.type === "event" && !mainAbility(def.id, "main")) return err("NOT_MAIN_EVENT", "This Event has no supported [Main] effect");
      if (!characterPlayable(state, seat, card)) return err("CANNOT_PLAY", "Cannot play this card now (cost, restriction or condition)");
      const cost = playCostOf(state, seat, card);
      if (def.type === "character" && p.characters.length >= 5) {
        const trashIdx = p.characters.findIndex((c) => c.id === intent.trashCharacterId);
        if (trashIdx < 0) return err("FIELD_FULL", "Choose a Character to trash (trashCharacterId)");
      }
      const dons = activeDon(p);
      for (let i = 0; i < cost; i += 1) dons[i]!.rested = true;
      // Consume one-shot cost reductions that applied to this play.
      const cardLoc = locate(state, card.id)!;
      state.modifiers = state.modifiers.filter((m) => !(m.target.kind === "player" && m.target.seat === seat && m.effect.type === "play_cost" && m.effect.once && filterMatches(state, ctxFor(seat, card), m.effect.filter, cardLoc)));
      if (def.type === "character" && p.characters.length >= 5) {
        const trashIdx = p.characters.findIndex((c) => c.id === intent.trashCharacterId);
        const victim = p.characters[trashIdx]!;
        const entry = takeCard(state, locate(state, victim.id)!);
        putCard(state, seat, "trash", entry);
        sim.events.push({ type: "character_trashed_for_space", seat, defId: entry.defId });
      }
      const entry = takeCard(state, locate(state, card.id)!);
      newBatch(state);
      if (def.type === "event") {
        putCard(state, seat, "resolving", entry);
        sim.events.push({ type: "card_played", seat, defId: entry.defId, instanceId: entry.id, costPaid: cost });
        dispatchEvent(state, "event_activated", { seat, card: entry });
        startAbility(sim, seat, entry, mainAbility(def.id, "main")!, "main");
        return null;
      }
      finishPlay(sim, seat, entry, false, cost);
      return null;
    }
    case "activate_ability": {
      const source = fieldCards(p).find((c) => c.id === intent.sourceId);
      if (!source) return err("INVALID_SOURCE", "Ability source is not on your field");
      const ability = abilitiesFor(source.defId).find((a) => a.id === intent.abilityId);
      if (!ability || ability.trigger !== "activate_main") return err("INVALID_ABILITY", "Unknown Activate: Main ability");
      if (!activatableAbilities(state, seat, source).includes(ability)) return err("CANNOT_ACTIVATE", "Ability cannot be activated now (cost, condition or once-per-turn)");
      newBatch(state);
      startAbility(sim, seat, source, ability, "activate_main");
      return null;
    }
    case "declare_attack": {
      if (p.turnsStarted < 2) return err("FIRST_TURN", "You cannot attack on your first turn");
      const attacker = [p.leader, ...p.characters].find((c) => c.id === intent.attackerId);
      if (!attacker) return err("INVALID_ATTACKER", "Attacker must be your Leader or Character");
      const targetKind = intent.target.kind;
      if (!canAttackWith(state, seat, attacker, targetKind)) return err("CANNOT_ATTACK", "That card cannot attack that target now");
      const opp = state.players[otherSeat(seat)];
      if (intent.target.kind === "character") {
        const targetId = intent.target.instanceId;
        const target = opp.characters.find((c) => c.id === targetId);
        if (!target || !attackableCharacter(state, seat, attacker, target)) return err("INVALID_TARGET", "Attack a rested opposing Character or the Leader");
      }
      declareAttack(sim, attacker.id, intent.target as AttackTarget);
      return null;
    }
    default:
      return err("WRONG_PHASE", `${intent.type} is not allowed during the main phase`);
  }
}

export function listLegalIntents(state: MatchState, seat: Seat): Intent[] {
  const out: Intent[] = [];
  if (state.phase === "game_over" || state.winner !== null) return out;
  const p = state.players[seat];
  if (state.phase === "mulligan" && state.pendingChoices.length === 0) {
    if (!p.mulliganDone) out.push({ type: "mulligan", doMulligan: false }, { type: "mulligan", doMulligan: true });
    return out;
  }
  const front = state.pendingChoices[0];
  if (front) {
    if (front.seat !== seat) return out;
    if (front.kind === "order_effects") { out.push({ type: "order_pending_effects", orderedIds: (front.unorderedChoices ?? []).map((c) => c.id) }); return out; }
    if (front.kind === "life_trigger") { if (!front.noTrigger) out.push({ type: "resolve_pending_choice", accept: true }); out.push({ type: "resolve_pending_choice", accept: false }); return out; }
    if (front.unpayable) { out.push({ type: "resolve_pending_choice", accept: false }); return out; }
    const answer = defaultAnswer(front);
    out.push({ type: "resolve_pending_choice", ...answer, accept: front.request?.type === "confirm" ? true : answer.accept });
    if (front.optional) out.push({ type: "resolve_pending_choice", accept: false });
    return out;
  }
  if (!idle(state)) return out;
  if (state.phase === "block" && seat === defenderSeat(state)) {
    out.push({ type: "pass_block" });
    for (const c of p.characters) if (canBlockWith(state, seat, c)) out.push({ type: "declare_block", blockerId: c.id });
    return out;
  }
  if (state.phase === "counter" && seat === defenderSeat(state)) {
    out.push({ type: "pass_counter" });
    p.hand.forEach((c, handIndex) => {
      const def = getCardDef(c.defId);
      if (def.type === "character" && counterOf(state, seat, c) > 0) out.push({ type: "counter_from_hand", handIndex });
      const ability = def.type === "event" ? mainAbility(def.id, "counter") : undefined;
      if (ability && abilityGateOpen(state, seat, c, ability) && activeDon(p).length >= playCostOf(state, seat, c)) out.push({ type: "counter_event", handIndex });
    });
    return out;
  }
  if (state.phase !== "main" || seat !== state.activeSeat) return out;
  out.push({ type: "end_turn" });
  for (const don of activeDon(p)) for (const t of [p.leader, ...p.characters]) out.push({ type: "give_don", donId: don.id, targetId: t.id });
  for (const source of fieldCards(p)) for (const ability of activatableAbilities(state, seat, source)) out.push({ type: "activate_ability", sourceId: source.id, abilityId: ability.id });
  p.hand.forEach((c, handIndex) => {
    const def = getCardDef(c.defId);
    if (def.type === "leader" || !characterPlayable(state, seat, c)) return;
    if (def.type === "event" && !mainAbility(def.id, "main")) return;
    if (def.type === "character" && p.characters.length >= 5) for (const ch of p.characters) out.push({ type: "play_card", handIndex, trashCharacterId: ch.id });
    else out.push({ type: "play_card", handIndex });
  });
  if (p.turnsStarted >= 2) {
    const opp = state.players[otherSeat(seat)];
    for (const a of [p.leader, ...p.characters]) {
      if (canAttackWith(state, seat, a, "leader")) out.push({ type: "declare_attack", attackerId: a.id, target: { kind: "leader" } });
      if (canAttackWith(state, seat, a, "character")) for (const ch of opp.characters) if (attackableCharacter(state, seat, a, ch)) out.push({ type: "declare_attack", attackerId: a.id, target: { kind: "character", instanceId: ch.id } });
    }
  }
  return out;
}

export function skipMulligans(state: MatchState, rng: Rng): MatchState {
  let s = state;
  // Start-of-game Stage prompts take the first option.
  while (s.phase === "mulligan" && s.pendingChoices[0]) {
    const front = s.pendingChoices[0];
    const r = applyIntent(s, { type: "resolve_pending_choice", ...defaultAnswer(front), accept: true }, { seat: front.seat, rng });
    if (!r.ok) throw new Error(r.error?.message ?? "start-of-game choice failed");
    s = r.state;
  }
  for (const seat of [0, 1] as Seat[]) {
    const r = applyIntent(s, { type: "mulligan", doMulligan: false }, { seat, rng });
    if (!r.ok) throw new Error(r.error?.message ?? "mulligan failed");
    s = r.state;
  }
  return s;
}
