import fs from "node:fs";
import {
  ensureDefsForPlayers,
  getCardDef,
  getDefsDebugSnapshot,
  normalizeCardDefId,
} from "./cards/definitions.js";
import { createSeededRng, type Rng } from "./rng.js";
import type {
  ApplyContext,
  ApplyResult,
  AttackTarget,
  CardDefId,
  CardInstance,
  CreateMatchConfig,
  DonInstance,
  GameEvent,
  Intent,
  MatchState,
  PlayerDeckConfig,
  PlayerState,
  Seat,
} from "./types.js";

function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

function alloc(state: MatchState, prefix: string): string {
  const id = `${prefix}_${state.nextId}`;
  state.nextId += 1;
  return id;
}

function makeCard(state: MatchState, defId: CardDefId): CardInstance {
  return { id: alloc(state, "card"), defId, rested: false, attachedDonIds: [] };
}

function makeDon(state: MatchState): DonInstance {
  return { id: alloc(state, "don"), rested: false, attachedTo: null };
}

function activeDons(p: PlayerState): DonInstance[] {
  return p.costArea.filter((d) => !d.rested);
}

function payCost(p: PlayerState, cost: number): boolean {
  if (cost <= 0) return true;
  const a = activeDons(p);
  if (a.length < cost) return false;
  for (let i = 0; i < cost; i++) a[i].rested = true;
  return true;
}

function placeDon(p: PlayerState, n: number): number {
  let placed = 0;
  while (placed < n && p.donDeck.length > 0) {
    const d = p.donDeck.shift()!;
    d.rested = false;
    d.attachedTo = null;
    p.costArea.push(d);
    placed += 1;
  }
  return placed;
}

function refresh(p: PlayerState): void {
  p.leader.rested = false;
  for (const c of p.characters) c.rested = false;
  if (p.stage) p.stage.rested = false;
  for (const c of [p.leader, ...p.characters]) c.attachedDonIds = [];
  for (const d of p.attachedDons) {
    d.attachedTo = null;
    d.rested = false;
    p.costArea.push(d);
  }
  p.attachedDons = [];
  for (const d of p.costArea) d.rested = false;
}

function returnDonsRested(p: PlayerState, card: CardInstance): void {
  const ids = [...card.attachedDonIds];
  card.attachedDonIds = [];
  for (const id of ids) {
    const idx = p.attachedDons.findIndex((d) => d.id === id);
    if (idx < 0) continue;
    const [d] = p.attachedDons.splice(idx, 1);
    d.attachedTo = null;
    d.rested = true;
    p.costArea.push(d);
  }
}

function findBoard(p: PlayerState, id: string): CardInstance | null {
  if (p.leader.id === id) return p.leader;
  return p.characters.find((c) => c.id === id) ?? null;
}

function powerOf(
  state: MatchState,
  seat: Seat,
  card: CardInstance,
  asDefender = false,
): number {
  const def = getCardDef(card.defId);
  let p = def.power ?? 0;
  if (state.activeSeat === seat) p += card.attachedDonIds.length * 1000;
  if (card.id === state.players[seat].leader.id) {
    const st = state.players[seat].stage;
    if (st) p += getCardDef(st.defId).stageLeaderPowerBonus ?? 0;
  }
  if (state.battle) {
    if (card.id === state.battle.attackerId) p += state.battle.attackerPowerBonus;
    if (asDefender) p += state.battle.defenderPowerBonus;
  }
  return p;
}

function fail(state: MatchState, code: string, message: string): ApplyResult {
  return { ok: false, state, events: [], error: { code, message } };
}

function buildPlayer(state: MatchState, cfg: PlayerDeckConfig, rng: Rng): PlayerState {
  const leaderDef = getCardDef(cfg.leaderId);
  if (leaderDef.type !== "leader" || leaderDef.life == null) {
    throw new Error(`Invalid leader ${cfg.leaderId}`);
  }
  const player: PlayerState = {
    leader: {
      id: alloc(state, "leader"),
      defId: cfg.leaderId,
      rested: false,
      attachedDonIds: [],
    },
    characters: [],
    stage: null,
    hand: [],
    deck: rng.shuffle(cfg.deck.slice()),
    trash: [],
    life: [],
    donDeck: Array.from({ length: 10 }, () => makeDon(state)),
    costArea: [],
    attachedDons: [],
    mulliganDone: false,
    turnsStarted: 0,
    leaderActivatedThisTurn: false,
  };
  for (let i = 0; i < 5; i++) {
    if (!player.deck.length) break;
    player.hand.push(makeCard(state, player.deck.shift()!));
  }
  return player;
}

function setLife(player: PlayerState): void {
  const n = getCardDef(player.leader.defId).life ?? 0;
  for (let i = 0; i < n; i++) {
    if (!player.deck.length) break;
    player.life.push(player.deck.shift()!);
  }
}

function beginTurn(state: MatchState, events: GameEvent[]): void {
  const seat = state.activeSeat;
  const player = state.players[seat];
  player.turnsStarted += 1;
  player.leaderActivatedThisTurn = false;
  for (const c of player.characters) {
    c.summoningSick = false;
  }
  refresh(player);
  events.push({ type: "phase_changed", phase: "refresh", activeSeat: seat });

  const skipDraw = seat === state.firstSeat && player.turnsStarted === 1;
  if (!skipDraw) {
    if (!player.deck.length) {
      state.winner = otherSeat(seat);
      state.winReason = "deck_out";
      state.phase = "game_over";
      events.push({ type: "game_over", winner: state.winner, reason: "deck_out" });
      return;
    }
    player.hand.push(makeCard(state, player.deck.shift()!));
    events.push({ type: "drew", seat, count: 1 });
  }
  events.push({ type: "phase_changed", phase: "draw", activeSeat: seat });

  const donN = seat === state.firstSeat && player.turnsStarted === 1 ? 1 : 2;
  const placed = placeDon(player, donN);
  events.push({ type: "don_placed", seat, count: placed });
  events.push({ type: "phase_changed", phase: "don", activeSeat: seat });

  state.phase = "main";
  events.push({ type: "phase_changed", phase: "main", activeSeat: seat });
}

function finishMulligans(state: MatchState, events: GameEvent[]): void {
  setLife(state.players[0]);
  setLife(state.players[1]);
  state.activeSeat = state.firstSeat;
  state.turnNumber = 1;
  beginTurn(state, events);
}

function drawN(state: MatchState, seat: Seat, n: number, events: GameEvent[]): boolean {
  const player = state.players[seat];
  for (let i = 0; i < n; i++) {
    if (!player.deck.length) {
      state.winner = otherSeat(seat);
      state.winReason = "deck_out";
      state.phase = "game_over";
      events.push({ type: "game_over", winner: state.winner, reason: "deck_out" });
      return false;
    }
    player.hand.push(makeCard(state, player.deck.shift()!));
  }
  if (n > 0) events.push({ type: "drew", seat, count: n });
  return true;
}

function resolveDamage(state: MatchState, events: GameEvent[]): void {
  const battle = state.battle!;
  const atkSeat = battle.attackerSeat;
  const defSeat = otherSeat(atkSeat);
  const attacker = findBoard(state.players[atkSeat], battle.attackerId);
  if (!attacker) {
    state.battle = null;
    state.phase = "main";
    return;
  }

  let defender: CardInstance;
  if (battle.target.kind === "leader") {
    defender = state.players[defSeat].leader;
  } else {
    const ch = state.players[defSeat].characters.find(
      (c) => c.id === (battle.target as { instanceId: string }).instanceId,
    );
    if (!ch) {
      state.battle = null;
      state.phase = "main";
      return;
    }
    defender = ch;
  }

  const won =
    powerOf(state, atkSeat, attacker) >= powerOf(state, defSeat, defender, true);
  events.push({ type: "battle_resolved", attackerWon: won });
  if (!won) {
    state.battle = null;
    state.phase = "main";
    return;
  }

  if (battle.target.kind === "character") {
    const def = state.players[defSeat];
    const idx = def.characters.findIndex((c) => c.id === defender.id);
    if (idx >= 0) {
      const [ko] = def.characters.splice(idx, 1);
      returnDonsRested(def, ko);
      def.trash.push(ko.defId);
      events.push({ type: "character_ko", seat: defSeat, defId: ko.defId });
    }
    state.battle = null;
    state.phase = "main";
    return;
  }

  const def = state.players[defSeat];
  if (def.life.length === 0) {
    state.winner = atkSeat;
    state.winReason = "leader_battle_at_zero_life";
    state.phase = "game_over";
    state.battle = null;
    events.push({
      type: "game_over",
      winner: atkSeat,
      reason: "leader_battle_at_zero_life",
    });
    return;
  }

  const lifeId = def.life.shift()!;
  const lifeDef = getCardDef(lifeId);
  if ((lifeDef.triggerDraw ?? 0) > 0) {
    state.pendingTrigger = { seat: defSeat, cardDefId: lifeId };
    state.phase = "damage";
    events.push({ type: "life_taken", seat: defSeat, defId: lifeId, toHand: false });
    events.push({ type: "trigger_available", seat: defSeat, defId: lifeId });
    return;
  }
  def.hand.push(makeCard(state, lifeId));
  events.push({ type: "life_taken", seat: defSeat, defId: lifeId, toHand: true });
  state.battle = null;
  state.phase = "main";
}

export function createMatch(config: CreateMatchConfig): MatchState {
  const players = config.players.map((p) => ({
    leaderId: normalizeCardDefId(p.leaderId),
    deck: p.deck.map((id) => normalizeCardDefId(id)),
  })) as CreateMatchConfig["players"];
  // #region agent log
  try {
    fs.appendFileSync(
      "/opt/cursor/logs/debug.log",
      `${JSON.stringify({
        hypothesisId: "B",
        location: "engine.ts:createMatch",
        message: "createMatch before ensureDefs",
        data: {
          leaders: players.map((p) => p.leaderId),
          deckLens: players.map((p) => p.deck.length),
          sampleIds: players.flatMap((p) => [p.leaderId, ...p.deck.slice(0, 3)]),
          snap: getDefsDebugSnapshot(),
        },
        timestamp: Date.now(),
      })}\n`,
    );
  } catch {
    /* ignore */
  }
  // #endregion
  // Constructed lists often include ids beyond the curated ST01/seed stubs.
  // Auto-register vanilla defs so matches can start instead of throwing
  // `Unknown card def: …` mid-create.
  ensureDefsForPlayers(players);

  const rng = createSeededRng(config.seed);
  const firstSeat: Seat = config.firstSeat ?? 0;
  const state: MatchState = {
    players: null as unknown as [PlayerState, PlayerState],
    activeSeat: firstSeat,
    firstSeat,
    phase: "mulligan",
    turnNumber: 0,
    battle: null,
    pendingTrigger: null,
    winner: null,
    winReason: null,
    nextId: 1,
    lastEvents: [],
  };
  state.players = [
    buildPlayer(state, players[0], rng),
    buildPlayer(state, players[1], rng),
  ];
  return state;
}

export function applyIntent(
  state: MatchState,
  intent: Intent,
  ctx: ApplyContext,
): ApplyResult {
  if (state.phase === "game_over" || state.winner !== null) {
    return fail(state, "game_over", "Match is over");
  }

  const next = structuredClone(state) as MatchState;
  const events: GameEvent[] = [];
  const seat = ctx.seat;
  const player = next.players[seat];
  const done = (): ApplyResult => {
    next.lastEvents = events;
    return { ok: true, state: next, events };
  };

  if (intent.type === "mulligan") {
    if (next.phase !== "mulligan") return fail(state, "bad_phase", "Not mulligan");
    if (player.mulliganDone) return fail(state, "already_done", "Already decided");
    if (intent.doMulligan) {
      for (const c of player.hand) player.deck.push(c.defId);
      player.hand = [];
      player.deck = ctx.rng.shuffle(player.deck);
      for (let i = 0; i < 5; i++) {
        if (!player.deck.length) break;
        player.hand.push(makeCard(next, player.deck.shift()!));
      }
    }
    player.mulliganDone = true;
    events.push({ type: "mulligan_resolved", seat, didMulligan: intent.doMulligan });
    if (next.players[0].mulliganDone && next.players[1].mulliganDone) {
      finishMulligans(next, events);
    }
    return done();
  }

  if (intent.type === "resolve_trigger") {
    if (!next.pendingTrigger || next.pendingTrigger.seat !== seat) {
      return fail(state, "no_trigger", "No pending trigger");
    }
    const defId = next.pendingTrigger.cardDefId;
    const def = getCardDef(defId);
    if (intent.accept && (def.triggerDraw ?? 0) > 0) {
      if (!drawN(next, seat, def.triggerDraw!, events)) return done();
    }
    next.players[seat].hand.push(makeCard(next, defId));
    events.push({ type: "trigger_resolved", seat, accepted: intent.accept });
    next.pendingTrigger = null;
    next.battle = null;
    next.phase = "main";
    return done();
  }

  if (intent.type === "pass_block" || intent.type === "declare_block") {
    if (next.phase !== "block") return fail(state, "bad_phase", "Not block step");
    if (!next.battle || seat === next.battle.attackerSeat) {
      return fail(state, "not_defender", "Only defender blocks");
    }
    if (intent.type === "declare_block") {
      const blocker = player.characters.find((c) => c.id === intent.blockerId);
      if (!blocker || blocker.rested) return fail(state, "bad_blocker", "Invalid blocker");
      if (!getCardDef(blocker.defId).blocker) {
        return fail(state, "not_blocker", "No Blocker keyword");
      }
      blocker.rested = true;
      next.battle.target = { kind: "character", instanceId: blocker.id };
      events.push({ type: "blocked", seat, blockerId: blocker.id });
    }
    next.phase = "counter";
    return done();
  }

  if (
    intent.type === "pass_counter" ||
    intent.type === "counter_from_hand" ||
    intent.type === "counter_event"
  ) {
    if (next.phase !== "counter") return fail(state, "bad_phase", "Not counter");
    if (!next.battle || seat === next.battle.attackerSeat) {
      return fail(state, "not_defender", "Only defender counters");
    }
    if (intent.type === "counter_from_hand") {
      const card = player.hand[intent.handIndex];
      if (!card) return fail(state, "bad_hand", "Bad hand index");
      const def = getCardDef(card.defId);
      if (!def.counter || def.counter <= 0) {
        return fail(state, "no_counter", "No counter value");
      }
      player.hand.splice(intent.handIndex, 1);
      player.trash.push(card.defId);
      next.battle.defenderPowerBonus += def.counter;
      events.push({ type: "counter_applied", seat, defId: card.defId, bonus: def.counter });
      return done();
    }
    if (intent.type === "counter_event") {
      const card = player.hand[intent.handIndex];
      if (!card) return fail(state, "bad_hand", "Bad hand index");
      const def = getCardDef(card.defId);
      if (def.type !== "event" || def.eventTiming !== "counter") {
        return fail(state, "not_counter_event", "Not a counter event");
      }
      if (!payCost(player, def.cost)) return fail(state, "cant_pay", "Not enough DON!!");
      player.hand.splice(intent.handIndex, 1);
      player.trash.push(card.defId);
      const bonus = def.counterPowerBonus ?? 0;
      next.battle.defenderPowerBonus += bonus;
      events.push({ type: "counter_applied", seat, defId: card.defId, bonus });
      return done();
    }
    next.phase = "damage";
    resolveDamage(next, events);
    return done();
  }

  if (seat !== next.activeSeat) return fail(state, "not_active", "Not your turn");
  if (next.phase !== "main") return fail(state, "bad_phase", `Not main (${next.phase})`);
  if (next.pendingTrigger) return fail(state, "trigger_pending", "Resolve trigger");

  if (intent.type === "give_don") {
    const idx = player.costArea.findIndex((d) => d.id === intent.donId);
    if (idx < 0) return fail(state, "bad_don", "DON!! not in cost area");
    const don = player.costArea[idx];
    if (don.rested) return fail(state, "don_rested", "DON!! is rested");
    const target = findBoard(player, intent.targetId);
    if (!target) return fail(state, "bad_target", "Invalid give target");
    player.costArea.splice(idx, 1);
    don.attachedTo = target.id;
    target.attachedDonIds.push(don.id);
    player.attachedDons.push(don);
    events.push({ type: "don_given", seat, donId: don.id, targetId: target.id });
    return done();
  }

  if (intent.type === "activate_leader") {
    const leaderDef = getCardDef(player.leader.defId);
    if (!leaderDef.leaderActivateGiveRestedDon) {
      return fail(state, "no_activate", "Leader has no Activate:Main");
    }
    if (player.leaderActivatedThisTurn) {
      return fail(state, "once_per_turn", "Activate:Main already used");
    }
    const donIdx = player.costArea.findIndex((d) => d.rested);
    if (donIdx < 0) return fail(state, "no_rested_don", "Need a rested DON!!");
    const target = findBoard(player, intent.targetId);
    if (!target) return fail(state, "bad_target", "Invalid Activate:Main target");
    const [don] = player.costArea.splice(donIdx, 1);
    don.attachedTo = target.id;
    target.attachedDonIds.push(don.id);
    player.attachedDons.push(don);
    player.leaderActivatedThisTurn = true;
    events.push({ type: "don_given", seat, donId: don.id, targetId: target.id });
    return done();
  }

  if (intent.type === "play_card") {
    const card = player.hand[intent.handIndex];
    if (!card) return fail(state, "bad_hand", "Bad hand index");
    const def = getCardDef(card.defId);
    if (def.type === "event" && def.eventTiming === "counter") {
      return fail(state, "counter_only", "Counter event not playable in Main");
    }
    if (!payCost(player, def.cost)) return fail(state, "cant_pay", "Not enough DON!!");
    player.hand.splice(intent.handIndex, 1);

    if (def.type === "character") {
      if (player.characters.length >= 5) {
        if (!intent.trashCharacterId) {
          return fail(state, "board_full", "Need trashCharacterId for 6th character");
        }
        const tIdx = player.characters.findIndex((c) => c.id === intent.trashCharacterId);
        if (tIdx < 0) return fail(state, "bad_trash", "Trash target missing");
        const [trashed] = player.characters.splice(tIdx, 1);
        returnDonsRested(player, trashed);
        player.trash.push(trashed.defId);
        events.push({ type: "character_trashed_for_space", seat, defId: trashed.defId });
      }
      const inst = makeCard(next, card.defId);
      inst.id = card.id;
      // Official: Characters cannot attack the turn they enter play unless Rush.
      inst.summoningSick = !def.rush;
      player.characters.push(inst);
      events.push({ type: "card_played", seat, defId: card.defId, instanceId: inst.id });
      return done();
    }

    if (def.type === "stage") {
      if (player.stage) {
        player.trash.push(player.stage.defId);
        events.push({ type: "stage_replaced", seat, trashedDefId: player.stage.defId });
      }
      const inst = makeCard(next, card.defId);
      inst.id = card.id;
      player.stage = inst;
      events.push({ type: "card_played", seat, defId: card.defId, instanceId: inst.id });
      return done();
    }

    if (def.type === "event" && def.eventTiming === "main") {
      player.trash.push(card.defId);
      events.push({ type: "card_played", seat, defId: card.defId, instanceId: card.id });
      if ((def.mainDraw ?? 0) > 0) {
        if (!drawN(next, seat, def.mainDraw!, events)) return done();
      }
      return done();
    }
    return fail(state, "unplayable", "Cannot play this card");
  }

  if (intent.type === "declare_attack") {
    if (player.turnsStarted < 2) {
      return fail(state, "first_turn", "No attacks on first turn");
    }
    const attacker = findBoard(player, intent.attackerId);
    if (!attacker || attacker.rested) {
      return fail(state, "bad_attacker", "Invalid attacker");
    }
    if (attacker.id !== player.leader.id && attacker.summoningSick) {
      return fail(state, "summoning_sick", "Character cannot attack the turn it entered play");
    }
    if (intent.target.kind === "character") {
      const targetId = intent.target.instanceId;
      const t = next.players[otherSeat(seat)].characters.find((c) => c.id === targetId);
      if (!t || !t.rested) {
        return fail(state, "bad_target", "Can only attack rested characters");
      }
    }
    attacker.rested = true;
    next.battle = {
      attackerSeat: seat,
      attackerId: attacker.id,
      target: intent.target,
      defenderPowerBonus: 0,
      attackerPowerBonus: 0,
    };
    events.push({
      type: "attack_declared",
      seat,
      attackerId: attacker.id,
      target: intent.target,
    });
    next.phase = "block";
    return done();
  }

  if (intent.type === "end_turn") {
    next.battle = null;
    next.activeSeat = otherSeat(seat);
    next.turnNumber += 1;
    beginTurn(next, events);
    return done();
  }

  return fail(state, "unknown_intent", "Unhandled intent");
}

export function listLegalIntents(state: MatchState, seat: Seat): Intent[] {
  const out: Intent[] = [];
  if (state.phase === "game_over" || state.winner !== null) return out;
  const player = state.players[seat];

  if (state.phase === "mulligan" && !player.mulliganDone) {
    out.push({ type: "mulligan", doMulligan: false });
    out.push({ type: "mulligan", doMulligan: true });
    return out;
  }

  if (state.pendingTrigger?.seat === seat && state.phase === "damage") {
    out.push({ type: "resolve_trigger", accept: true });
    out.push({ type: "resolve_trigger", accept: false });
    return out;
  }

  if (state.phase === "block" && state.battle && seat !== state.battle.attackerSeat) {
    out.push({ type: "pass_block" });
    for (const c of player.characters) {
      if (!c.rested && getCardDef(c.defId).blocker) {
        out.push({ type: "declare_block", blockerId: c.id });
      }
    }
    return out;
  }

  if (state.phase === "counter" && state.battle && seat !== state.battle.attackerSeat) {
    out.push({ type: "pass_counter" });
    player.hand.forEach((c, handIndex) => {
      const def = getCardDef(c.defId);
      if ((def.counter ?? 0) > 0) out.push({ type: "counter_from_hand", handIndex });
      if (def.type === "event" && def.eventTiming === "counter") {
        if (activeDons(player).length >= def.cost) {
          out.push({ type: "counter_event", handIndex });
        }
      }
    });
    return out;
  }

  if (state.phase !== "main" || seat !== state.activeSeat) return out;
  out.push({ type: "end_turn" });

  for (const don of activeDons(player)) {
    out.push({ type: "give_don", donId: don.id, targetId: player.leader.id });
    for (const ch of player.characters) {
      out.push({ type: "give_don", donId: don.id, targetId: ch.id });
    }
  }

  const leaderDef = getCardDef(player.leader.defId);
  if (
    leaderDef.leaderActivateGiveRestedDon &&
    !player.leaderActivatedThisTurn &&
    player.costArea.some((d) => d.rested)
  ) {
    out.push({ type: "activate_leader", targetId: player.leader.id });
    for (const ch of player.characters) {
      out.push({ type: "activate_leader", targetId: ch.id });
    }
  }

  player.hand.forEach((c, handIndex) => {
    const def = getCardDef(c.defId);
    if (def.type === "event" && def.eventTiming === "counter") return;
    if (activeDons(player).length < def.cost) return;
    if (def.type === "character" && player.characters.length >= 5) {
      for (const ch of player.characters) {
        out.push({ type: "play_card", handIndex, trashCharacterId: ch.id });
      }
    } else {
      out.push({ type: "play_card", handIndex });
    }
  });

  if (player.turnsStarted >= 2) {
    const attackers = [player.leader, ...player.characters].filter((c) => {
      if (c.rested) return false;
      if (c.id !== player.leader.id && c.summoningSick) return false;
      return true;
    });
    const opp = state.players[otherSeat(seat)];
    for (const a of attackers) {
      out.push({ type: "declare_attack", attackerId: a.id, target: { kind: "leader" } });
      for (const ch of opp.characters) {
        if (ch.rested) {
          out.push({
            type: "declare_attack",
            attackerId: a.id,
            target: { kind: "character", instanceId: ch.id },
          });
        }
      }
    }
  }
  return out;
}

export function getPlayerView(state: MatchState, seat: Seat) {
  const you = state.players[seat];
  const oppSeat = otherSeat(seat);
  const opp = state.players[oppSeat];
  const cv = (s: Seat, c: CardInstance) => ({
    id: c.id,
    defId: c.defId,
    rested: c.rested,
    attachedDonCount: c.attachedDonIds.length,
    power: powerOf(state, s, c),
    summoningSick: Boolean(c.summoningSick),
    rush: Boolean(getCardDef(c.defId).rush),
  });
  return {
    seat,
    you: {
      leader: cv(seat, you.leader),
      characters: you.characters.map((c) => cv(seat, c)),
      stage: you.stage ? cv(seat, you.stage) : null,
      hand: you.hand.map((c) => ({ id: c.id, defId: c.defId })),
      deckCount: you.deck.length,
      trash: [...you.trash],
      lifeCount: you.life.length,
      donDeckCount: you.donDeck.length,
      costArea: you.costArea.map((d) => ({ id: d.id, rested: d.rested })),
      activeDonCount: activeDons(you).length,
      mulliganDone: you.mulliganDone,
      turnsStarted: you.turnsStarted,
    },
    opponent: {
      leader: cv(oppSeat, opp.leader),
      characters: opp.characters.map((c) => cv(oppSeat, c)),
      stage: opp.stage ? cv(oppSeat, opp.stage) : null,
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      trash: [...opp.trash],
      lifeCount: opp.life.length,
      donDeckCount: opp.donDeck.length,
      costAreaCount: opp.costArea.length,
      activeDonCount: activeDons(opp).length,
      turnsStarted: opp.turnsStarted,
    },
    activeSeat: state.activeSeat,
    phase: state.phase,
    turnNumber: state.turnNumber,
    battle: state.battle,
    pendingTrigger: state.pendingTrigger,
    winner: state.winner,
    winReason: state.winReason,
    legalIntents: listLegalIntents(state, seat),
  };
}

/**
 * Public board for spectators: both hands hidden (counts only), no legal intents.
 * `cameraSeat` chooses which side is rendered as "you" in client layouts.
 */
export function getSpectatorView(state: MatchState, cameraSeat: Seat = 0) {
  const base = getPlayerView(state, cameraSeat);
  const youHandCount = base.you.hand.length;
  return {
    ...base,
    spectator: true as const,
    cameraSeat,
    you: {
      ...base.you,
      hand: [] as { id: string; defId: string }[],
      handCount: youHandCount,
    },
    legalIntents: [] as Intent[],
  };
}

export function assertInvariants(state: MatchState): void {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    if (p.characters.length > 5) throw new Error(`>5 characters seat ${seat}`);
    const attached = new Set(p.attachedDons.map((d) => d.id));
    for (const c of [p.leader, ...p.characters]) {
      for (const id of c.attachedDonIds) {
        if (!attached.has(id)) throw new Error(`orphan don ${id}`);
      }
    }
  }
}

export function skipMulligans(state: MatchState, rng: Rng): MatchState {
  let s = state;
  for (const seat of [0, 1] as Seat[]) {
    const r = applyIntent(s, { type: "mulligan", doMulligan: false }, { seat, rng });
    if (!r.ok) throw new Error(r.error?.message ?? "mulligan failed");
    s = r.state;
  }
  return s;
}

export type { AttackTarget, Rng };
