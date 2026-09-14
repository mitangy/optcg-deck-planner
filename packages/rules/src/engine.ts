import {
  ensureDefsForPlayers,
  getCardDef,
  getOnPlayHooks,
  normalizeCardDefId,
} from "./cards/definitions.js";
import { applyEffectOrder, enqueuePendingChoices } from "./effectOrder.js";
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
  PendingChoice,
  PlayerDeckConfig,
  PlayerState,
  Seat,
} from "./types.js";

/** Re-export for callers that need to queue multi-effect windows. */
export { enqueuePendingChoices, applyEffectOrder, sortByApnap } from "./effectOrder.js";

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

function cardHasTrigger(def: ReturnType<typeof getCardDef>): boolean {
  if (def.hasTrigger) return true;
  return Boolean(def.effectText?.includes("[Trigger]"));
}

function characterCostForPlay(state: MatchState, seat: Seat, baseCost: number): number {
  const opp = state.players[otherSeat(seat)];
  const oppLeader = getCardDef(opp.leader.defId);
  const bonus = oppLeader.leaderOpponentCharacterCostBonus ?? 0;
  // Ability is active during the Teach player's opponent's turn (= active seat is the player paying).
  if (bonus > 0 && state.activeSeat === seat) {
    return baseCost + bonus;
  }
  return baseCost;
}

/**
 * Collect simultaneous post-declare-attack triggers for the attack window.
 * Attacker [When Attacking] (e.g. Rocks) and defender [On Opponent's Attack]
 * (Newgate / Teach) share this batch so `enqueuePendingChoices` can APNAP +
 * offer controller reorder.
 */
function collectAttackDeclarationTriggers(
  state: MatchState,
  attackerSeat: Seat,
): PendingChoice[] {
  const out: PendingChoice[] = [];
  const attacker = state.players[attackerSeat];
  const atkLeaderDef = getCardDef(attacker.leader.defId);

  // Leader When Attacking — only when the Leader itself is the attacker.
  if (
    state.battle?.attackerId === attacker.leader.id &&
    atkLeaderDef.leaderWhenAttackingTrashRevealDraw &&
    attacker.hand.length > 0 &&
    attacker.deck.length > 0
  ) {
    const trait = atkLeaderDef.leaderWhenAttackingTrashRevealDraw.revealTrait;
    const draw = atkLeaderDef.leaderWhenAttackingTrashRevealDraw.draw;
    out.push({
      id: alloc(state, "choice"),
      seat: attackerSeat,
      kind: "when_attacking",
      cardDefId: atkLeaderDef.id,
      sourceInstanceId: attacker.leader.id,
      optional: true,
      prompt:
        `${atkLeaderDef.name} — When Attacking: trash 1 card from hand to reveal ` +
        `the top of your deck; if its type includes {${trait}}, draw ${draw}?`,
      abilityId: "rocks_reveal_draw",
    });
  }

  const defSeat = otherSeat(attackerSeat);
  const defender = state.players[defSeat];
  if (!defender.leaderOppAttackAbilityUsedThisTurn) {
    const leaderDef = getCardDef(defender.leader.defId);

    if (leaderDef.leaderOnOppAttackTrashForPower && defender.hand.length > 0) {
      const power = leaderDef.leaderOnOppAttackTrashForPower.power;
      const prompt =
        `${leaderDef.name} — On Opponent's Attack: trash 1 card from hand to give ` +
        `one of your Leader or Characters +${power} power this battle?`;
      out.push({
        id: alloc(state, "choice"),
        seat: defSeat,
        kind: "leader_on_opp_attack",
        cardDefId: leaderDef.id,
        sourceInstanceId: defender.leader.id,
        optional: true,
        prompt,
        abilityId: "newgate_battle_power",
      });
    } else if (leaderDef.leaderOnOppAttackTrashTriggerRetarget) {
      const hasTriggerCard = defender.hand.some((c) =>
        cardHasTrigger(getCardDef(c.defId)),
      );
      if (hasTriggerCard) {
        const trait = leaderDef.leaderOnOppAttackTrashTriggerRetarget.retargetTrait;
        const prompt =
          `${leaderDef.name} — On Opponent's Attack: trash 1 [Trigger] card from hand to ` +
          `redirect this attack to your Leader or a {${trait}} Character?`;
        out.push({
          id: alloc(state, "choice"),
          seat: defSeat,
          kind: "leader_on_opp_attack",
          cardDefId: leaderDef.id,
          sourceInstanceId: defender.leader.id,
          optional: true,
          prompt,
          abilityId: "teach_redirect",
        });
      }
    }
  }

  return out;
}

/** Queue the attack-declaration timing window (APNAP + controller order). */
function enqueueAttackDeclarationTriggers(
  state: MatchState,
  attackerSeat: Seat,
  events: GameEvent[],
): void {
  enqueuePendingChoices(
    state,
    collectAttackDeclarationTriggers(state, attackerSeat),
    attackerSeat,
    events,
  );
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

/** Board card targeted by the current battle (leader or character). */
function battleDefender(
  state: MatchState,
  battle: NonNullable<MatchState["battle"]>,
): CardInstance | null {
  const defSeat = otherSeat(battle.attackerSeat);
  if (battle.target.kind === "leader") return state.players[defSeat].leader;
  const targetId = battle.target.instanceId;
  return state.players[defSeat].characters.find((c) => c.id === targetId) ?? null;
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
  p += card.battlePowerBonus ?? 0;
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
    leaderOppAttackAbilityUsedThisTurn: false,
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
  player.leaderOppAttackAbilityUsedThisTurn = false;
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

/** Life top is index 0 (same end `resolveDamage` takes from). */
function addDeckTopToLife(
  state: MatchState,
  seat: Seat,
  events: GameEvent[],
): boolean {
  const player = state.players[seat];
  if (!player.deck.length) return false;
  const defId = player.deck.shift()!;
  player.life.unshift(defId);
  events.push({ type: "life_added", seat, defId, source: "deck_top" });
  return true;
}

function collectOnPlayChoices(
  state: MatchState,
  seat: Seat,
  inst: CardInstance,
  def: ReturnType<typeof getCardDef>,
): PendingChoice[] {
  const hooks = getOnPlayHooks(def);
  const player = state.players[seat];
  const opp = state.players[otherSeat(seat)];
  const out: PendingChoice[] = [];

  if (hooks.onPlayLowLifeAddLife) {
    const { maxLife } = hooks.onPlayLowLifeAddLife;
    if (player.life.length <= maxLife && player.deck.length > 0) {
      out.push({
        id: alloc(state, "choice"),
        seat,
        kind: "on_play",
        cardDefId: def.id,
        sourceInstanceId: inst.id,
        optional: true,
        prompt: `${def.name} — On Play: add the top card of your deck to your Life cards?`,
        abilityId: "on_play_add_life",
      });
    }
  }

  if (hooks.onPlayDrawThenLifeChoice) {
    const canOwn = player.deck.length > 0;
    const canOpp = opp.life.length > 0;
    if (canOwn || canOpp) {
      out.push({
        id: alloc(state, "choice"),
        seat,
        kind: "on_play",
        cardDefId: def.id,
        sourceInstanceId: inst.id,
        optional: true,
        prompt:
          `${def.name} — On Play: add your deck top to Life, or add the top of ` +
          `opponent's Life to their hand?`,
        abilityId: "on_play_life_choice",
      });
    }
  }

  if (hooks.onPlayDrawHandToDeckDon) {
    if (player.hand.length > 0) {
      out.push({
        id: alloc(state, "choice"),
        seat,
        kind: "on_play",
        cardDefId: def.id,
        sourceInstanceId: inst.id,
        optional: false,
        prompt: `${def.name} — On Play: choose a card from your hand to place on top of your deck.`,
        abilityId: "on_play_hand_to_deck",
      });
    }
  }

  if (hooks.onPlayOptionalDraw > 0) {
    out.push({
      id: alloc(state, "choice"),
      seat,
      kind: "on_play",
      cardDefId: def.id,
      sourceInstanceId: inst.id,
      optional: true,
      prompt: `${def.name} — On Play: draw ${hooks.onPlayOptionalDraw} card${
        hooks.onPlayOptionalDraw === 1 ? "" : "s"
      }?`,
    });
  }

  return out;
}

function applyOnPlayEnterPlay(
  state: MatchState,
  seat: Seat,
  inst: CardInstance,
  def: ReturnType<typeof getCardDef>,
  events: GameEvent[],
): void {
  const hooks = getOnPlayHooks(def);
  const player = state.players[seat];

  if (hooks.onPlayDraw > 0) {
    if (!drawN(state, seat, hooks.onPlayDraw, events)) return;
  }

  const choices = collectOnPlayChoices(state, seat, inst, def);
  if (choices.length > 0) {
    enqueuePendingChoices(state, choices, seat, events);
    return;
  }

  if (hooks.onPlayDrawHandToDeckDon && player.hand.length === 0) {
    const placed = placeDon(player, 1);
    if (placed > 0) events.push({ type: "don_placed", seat, count: placed });
  }
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

  const atkPow = powerOf(state, atkSeat, attacker);
  const defPow = powerOf(state, defSeat, defender, true);
  const won = atkPow >= defPow;
  events.push({
    type: "battle_resolved",
    attackerWon: won,
    attackerPower: atkPow,
    defenderPower: defPow,
  });
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
    // Turn player for damage triggers = attacker (battle.attackerSeat).
    const turnPlayer = state.battle?.attackerSeat ?? state.activeSeat;
    enqueuePendingChoices(
      state,
      [
        {
          id: alloc(state, "choice"),
          seat: defSeat,
          kind: "life_trigger",
          cardDefId: lifeId,
          optional: true,
          prompt: `${lifeDef.name} — Trigger: draw ${lifeDef.triggerDraw} card${
            lifeDef.triggerDraw === 1 ? "" : "s"
          }?`,
        },
      ],
      turnPlayer,
      events,
    );
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
    pendingChoices: [],
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

  if (intent.type === "order_pending_effects") {
    const front = next.pendingChoices[0];
    if (!front || front.seat !== seat || front.kind !== "order_effects") {
      return fail(state, "no_order_choice", "No effect-order choice pending");
    }
    if (!applyEffectOrder(next, intent.orderedIds, events)) {
      return fail(state, "bad_order", "orderedIds must permute the pending effects");
    }
    return done();
  }

  if (intent.type === "resolve_pending_choice") {
    const front = next.pendingChoices[0];
    if (!front || front.seat !== seat) {
      return fail(state, "no_pending_choice", "No pending choice");
    }
    if (front.kind === "order_effects") {
      return fail(
        state,
        "need_order",
        "Choose effect order with order_pending_effects first",
      );
    }
    if (!intent.accept && !front.optional) {
      return fail(state, "mandatory_choice", "This ability cannot be declined");
    }
    next.pendingChoices.shift();
    const def = getCardDef(front.cardDefId);

    if (front.kind === "life_trigger") {
      if (intent.accept && (def.triggerDraw ?? 0) > 0) {
        if (!drawN(next, seat, def.triggerDraw!, events)) return done();
      }
      next.players[seat].hand.push(makeCard(next, front.cardDefId));
      events.push({ type: "trigger_resolved", seat, accepted: intent.accept });
    } else if (front.kind === "on_play") {
      const hooks = getOnPlayHooks(def);
      const player = next.players[seat];
      const opp = next.players[otherSeat(seat)];

      if (intent.accept && front.abilityId === "on_play_add_life") {
        addDeckTopToLife(next, seat, events);
      } else if (intent.accept && front.abilityId === "on_play_life_choice") {
        if (intent.onPlayChoice === "own_life") {
          if (!addDeckTopToLife(next, seat, events)) {
            return fail(state, "empty_deck", "No card to add to Life");
          }
        } else if (intent.onPlayChoice === "opp_life") {
          if (!opp.life.length) {
            return fail(state, "empty_life", "Opponent has no Life cards");
          }
          const lifeId = opp.life.shift()!;
          opp.hand.push(makeCard(next, lifeId));
          events.push({ type: "life_taken", seat: otherSeat(seat), defId: lifeId, toHand: true });
        } else {
          return fail(state, "bad_choice", "Choose own Life or opponent Life");
        }
      } else if (front.abilityId === "on_play_hand_to_deck") {
        if (
          intent.handIndex == null ||
          intent.handIndex < 0 ||
          intent.handIndex >= player.hand.length
        ) {
          return fail(state, "bad_hand", "Choose a hand card for deck top");
        }
        const [card] = player.hand.splice(intent.handIndex, 1);
        player.deck.unshift(card.defId);
        const placed = placeDon(player, 1);
        if (placed > 0) events.push({ type: "don_placed", seat, count: placed });
      } else if (intent.accept && hooks.onPlayOptionalDraw > 0) {
        if (!drawN(next, seat, hooks.onPlayOptionalDraw, events)) return done();
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.kind === "leader_on_opp_attack") {
      const player = next.players[seat];
      if (intent.accept) {
        if (
          intent.handIndex == null ||
          intent.handIndex < 0 ||
          intent.handIndex >= player.hand.length
        ) {
          return fail(state, "bad_hand", "Choose a hand card to trash");
        }
        const trashed = player.hand[intent.handIndex];
        const trashedDef = getCardDef(trashed.defId);

        if (front.abilityId === "newgate_battle_power") {
          const power = def.leaderOnOppAttackTrashForPower?.power ?? 4000;
          if (!intent.buffTargetId) {
            return fail(state, "bad_target", "Choose a Leader or Character to buff");
          }
          const target =
            player.leader.id === intent.buffTargetId
              ? player.leader
              : player.characters.find((c) => c.id === intent.buffTargetId);
          if (!target) return fail(state, "bad_target", "Buff target not on your field");
          player.hand.splice(intent.handIndex, 1);
          player.trash.push(trashed.defId);
          target.battlePowerBonus = (target.battlePowerBonus ?? 0) + power;
        } else if (front.abilityId === "teach_redirect") {
          if (!cardHasTrigger(trashedDef)) {
            return fail(state, "not_trigger", "Must trash a card with [Trigger]");
          }
          if (!intent.newTarget) {
            return fail(state, "bad_target", "Choose a new attack target");
          }
          const trait =
            def.leaderOnOppAttackTrashTriggerRetarget?.retargetTrait ??
            "Blackbeard Pirates";
          const newTarget = intent.newTarget;
          if (newTarget.kind === "character") {
            const ch = player.characters.find((c) => c.id === newTarget.instanceId);
            if (!ch) return fail(state, "bad_target", "Retarget character missing");
            const chDef = getCardDef(ch.defId);
            if (!(chDef.traits ?? []).includes(trait)) {
              return fail(state, "bad_target", `Character must have {${trait}} type`);
            }
          } else if (newTarget.kind !== "leader") {
            return fail(state, "bad_target", "Invalid retarget");
          }
          player.hand.splice(intent.handIndex, 1);
          player.trash.push(trashed.defId);
          if (!next.battle) return fail(state, "no_battle", "No active battle");
          next.battle.target = intent.newTarget;
        } else {
          return fail(state, "unknown_ability", "Unknown leader attack ability");
        }
        player.leaderOppAttackAbilityUsedThisTurn = true;
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.kind === "when_attacking") {
      const player = next.players[seat];
      if (intent.accept) {
        if (front.abilityId !== "rocks_reveal_draw") {
          return fail(state, "unknown_ability", "Unknown when-attacking ability");
        }
        if (
          intent.handIndex == null ||
          intent.handIndex < 0 ||
          intent.handIndex >= player.hand.length
        ) {
          return fail(state, "bad_hand", "Choose a hand card to trash");
        }
        if (player.deck.length === 0) {
          return fail(state, "empty_deck", "No card to reveal");
        }
        const cfg = def.leaderWhenAttackingTrashRevealDraw;
        if (!cfg) {
          return fail(state, "unknown_ability", "Leader missing reveal-draw hook");
        }
        const [trashed] = player.hand.splice(intent.handIndex, 1);
        player.trash.push(trashed.defId);
        const revealedId = player.deck[0]!;
        const revealedDef = getCardDef(revealedId);
        const matched = (revealedDef.traits ?? []).some(
          (t) => t.includes(cfg.revealTrait) || cfg.revealTrait.includes(t),
        );
        events.push({
          type: "card_revealed",
          seat,
          defId: revealedId,
          matchedTrait: matched,
        });
        if (matched) {
          if (!drawN(next, seat, cfg.draw, events)) return done();
        }
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else {
      // Future kinds (activate_main / optional_ability):
      // engine hooks land per-card; the queue + prompt framework is ready.
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    }

    // Only the life-trigger flow repurposes phase/battle for the damage step;
    // leave both alone for Main-phase ability prompts (e.g. On Play).
    if (next.pendingChoices.length === 0 && next.phase === "damage") {
      clearBattlePowerBonuses(next);
    next.battle = null;
      next.phase = "main";
    }
    return done();
  }

  if (intent.type === "pass_block" || intent.type === "declare_block") {
    if (next.pendingChoices.length > 0) {
      return fail(state, "pending_choice", "Resolve pending abilities first");
    }
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
    if (next.pendingChoices.length > 0) {
      return fail(state, "pending_choice", "Resolve pending abilities first");
    }
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
  if (next.pendingChoices.length > 0) {
    return fail(state, "pending_choice", "Resolve pending choice");
  }

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
    events.push({
      type: "don_given",
      seat,
      donId: don.id,
      targetId: target.id,
      targetDefId: target.defId,
      newPower: powerOf(state, seat, target),
    });
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
    events.push({
      type: "don_given",
      seat,
      donId: don.id,
      targetId: target.id,
      targetDefId: target.defId,
      newPower: powerOf(state, seat, target),
    });
    return done();
  }

  if (intent.type === "play_card") {
    const card = player.hand[intent.handIndex];
    if (!card) return fail(state, "bad_hand", "Bad hand index");
    const def = getCardDef(card.defId);
    if (def.type === "event" && def.eventTiming === "counter") {
      return fail(state, "counter_only", "Counter event not playable in Main");
    }
    const playCost =
      def.type === "character" ? characterCostForPlay(next, seat, def.cost) : def.cost;
    if (!payCost(player, playCost)) return fail(state, "cant_pay", "Not enough DON!!");
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
      events.push({
        type: "card_played",
        seat,
        defId: card.defId,
        instanceId: inst.id,
        costPaid: playCost,
      });
      applyOnPlayEnterPlay(next, seat, inst, def, events);
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
      events.push({
        type: "card_played",
        seat,
        defId: card.defId,
        instanceId: inst.id,
        costPaid: playCost,
      });
      return done();
    }

    if (def.type === "event" && def.eventTiming === "main") {
      player.trash.push(card.defId);
      events.push({
        type: "card_played",
        seat,
        defId: card.defId,
        instanceId: card.id,
        costPaid: playCost,
      });
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
    const defender = battleDefender(next, next.battle);
    const atkPow = powerOf(next, seat, attacker);
    const defPow = defender
      ? powerOf(next, otherSeat(seat), defender, true)
      : 0;
    events.push({
      type: "attack_declared",
      seat,
      attackerId: attacker.id,
      target: intent.target,
      attackerPower: atkPow,
      defenderPower: defPow,
    });
    next.phase = "block";
    enqueueAttackDeclarationTriggers(next, seat, events);
    return done();
  }

  if (intent.type === "end_turn") {
    clearBattlePowerBonuses(next);
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

  if (state.pendingChoices.length > 0) {
    const front = state.pendingChoices[0];
    if (front.seat !== seat) return out;
    if (front.kind === "order_effects") {
      // Default legal order = wrapper sequence (sim/bot-friendly). Live clients
      // must offer a reorder UI and send any permutation via order_pending_effects
      // — do not treat this single legal intent as the only player choice.
      const ids = (front.unorderedChoices ?? []).map((c) => c.id);
      out.push({ type: "order_pending_effects", orderedIds: ids });
      return out;
    }
    out.push({ type: "resolve_pending_choice", accept: true });
    if (front.optional) out.push({ type: "resolve_pending_choice", accept: false });
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
    const need =
      def.type === "character" ? characterCostForPlay(state, seat, def.cost) : def.cost;
    if (activeDons(player).length < need) return;
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

function clearBattlePowerBonuses(state: MatchState): void {
  for (const p of state.players) {
    delete p.leader.battlePowerBonus;
    for (const c of p.characters) delete c.battlePowerBonus;
  }
}

function isBattleDefender(state: MatchState, card: CardInstance): boolean {
  const b = state.battle;
  if (!b) return false;
  if (b.target.kind === "leader") {
    return card.id === state.players[otherSeat(b.attackerSeat)].leader.id;
  }
  return card.id === b.target.instanceId;
}

export function getPlayerView(state: MatchState, seat: Seat) {
  const you = state.players[seat];
  const oppSeat = otherSeat(seat);
  const opp = state.players[oppSeat];
  const cv = (s: Seat, c: CardInstance) => {
    const def = getCardDef(c.defId);
    const statuses: string[] = [];
    if (c.rested) statuses.push("Rested");
    if (c.summoningSick) statuses.push("Summoning sick");
    if (def.rush) statuses.push("Rush");
    for (const label of c.statusLabels ?? []) {
      if (!statuses.includes(label)) statuses.push(label);
    }
    return {
      id: c.id,
      defId: c.defId,
      rested: c.rested,
      attachedDonCount: c.attachedDonIds.length,
      power: powerOf(state, s, c, isBattleDefender(state, c)),
      printedPower: def.power ?? null,
      summoningSick: Boolean(c.summoningSick),
      rush: Boolean(def.rush),
      /** Display labels: rested / sick / rush / future CC (stun, etc.). */
      statusLabels: statuses,
    };
  };
  return {
    seat,
    you: {
      leader: cv(seat, you.leader),
      characters: you.characters.map((c) => cv(seat, c)),
      stage: you.stage ? cv(seat, you.stage) : null,
      hand: you.hand.map((c) => {
        const def = getCardDef(c.defId);
        const row: { id: string; defId: string; playCost?: number } = {
          id: c.id,
          defId: c.defId,
        };
        if (state.phase === "main" && state.activeSeat === seat) {
          if (def.type === "character") {
            row.playCost = characterCostForPlay(state, seat, def.cost);
          } else if (def.type === "event" && def.eventTiming === "main") {
            row.playCost = def.cost;
          } else if (def.type === "stage") {
            row.playCost = def.cost;
          }
        }
        return row;
      }),
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
      mulliganDone: opp.mulliganDone,
    },
    activeSeat: state.activeSeat,
    phase: state.phase,
    turnNumber: state.turnNumber,
    battle: state.battle,
    pendingChoices: state.pendingChoices,
    /**
     * @deprecated Back-compat for older clients (e.g. mobile): the front
     * pending choice in its original `{ seat, cardDefId }` shape when it's a
     * life trigger, else `null`. New clients should read `pendingChoices`.
     */
    pendingTrigger:
      state.pendingChoices[0]?.kind === "life_trigger"
        ? { seat: state.pendingChoices[0].seat, cardDefId: state.pendingChoices[0].cardDefId }
        : null,
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
