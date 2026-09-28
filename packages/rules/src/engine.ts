import { putInZone, takeFromZone } from "./state/zones.js";
import { resumeProgram } from "./runtime/program.js";
import {
  ensureDefsForPlayers,
  getCardDef,
  getOnPlayHooks,
  normalizeCardDefId,
} from "./cards/definitions.js";
import {
  ABILITY_FULLALEAD_SEARCH,
  ABILITY_LAFFITTE_SEARCH,
  ABILITY_LEADER_GIVE_RESTED_DON,
  ABILITY_STAGE_TRASH_GIVE_RESTED_DON,
} from "./cards/abilityIds.js";
import { applyEffectOrder, enqueuePendingChoices } from "./effectOrder.js";
import { createSeededRng, type Rng } from "./rng.js";
import { ABILITY_REGISTRY, abilitiesForCard, abilityForCard, ABILITY_MOBY_DICK_ON_PLAY } from "./registry/searchSlice.js";
import { MATCH_STATE_VERSION, RULES_PROTOCOL_VERSION, RULES_VERSION } from "./state/snapshot.js";
import { resolveDeclarativeSearch, scheduleDeclarativeSearch } from "./runtime/search.js";
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
  TopDeckSearchEffect,
} from "./types.js";
import type { AbilityCondition, AbilityOperation, AbilityZone, CardAbilityProgram } from "./registry/schema.js";

/** Re-export for callers that need to queue multi-effect windows. */
export { enqueuePendingChoices, applyEffectOrder, sortByApnap } from "./effectOrder.js";

function otherSeat(seat: Seat): Seat {
  return seat === 0 ? 1 : 0;
}

/** Choices that need handIndex, targets, or reorder — not a bare accept. */
function pendingChoiceNeedsStructuredIntent(front: PendingChoice): boolean {
  if (front.kind === "order_effects") return true;
  if (front.kind === "search_top_deck") return true;
  if (front.kind === "activate_main" && front.abilityId === "fullalead_search_cost") {
    return true;
  }
  if (front.kind === "on_play") {
    return (
      front.abilityId === "on_play_hand_to_deck" ||
      front.abilityId === "on_play_life_choice" ||
      front.abilityId === "on_play_power_debuff" ||
      front.abilityId === "on_play_ko_power" ||
      front.abilityId === "on_play_trash_hand_to_life" ||
      front.abilityId === "on_play_reveal_draw_trash" ||
      front.abilityId === "discard_hand_count"
    );
  }
  if (front.abilityId === "main_play_named_character") return true;
  if (front.abilityId === "main_trash_trigger_to_hand") return true;
  if (front.abilityId === "trigger_play_trash_character") return true;
  if (
    front.abilityId === "on_ko_set_base_power" ||
    front.abilityId === "on_ko_ko_opponent_cost" ||
    front.abilityId === "on_ko_rest_opponent_cost"
  ) return true;
  if (
    front.abilityId === "counter_friendly_power" ||
    front.abilityId === "counter_rest_don_opponent_all" ||
    front.abilityId === "counter_opponent_target_power" ||
    front.abilityId === "trigger_friendly_power"
  ) return true;
  if (
    front.abilityId === "on_ko_return_don_add_life" ||
    front.abilityId === "on_ko_revive_self"
  ) return true;
  if (
    front.abilityId === "trigger_negate_opponent_card" ||
    front.abilityId === "trigger_ko_opponent_cost" ||
    front.abilityId === "teach_negate_leader" ||
    front.abilityId === "teach_negate_character"
  ) return true;
  if (front.kind === "leader_on_opp_attack" || front.kind === "when_attacking") {
    return true;
  }
  return false;
}

function alloc(state: MatchState, prefix: string): string {
  const id = `${prefix}_${state.nextId}`;
  state.nextId += 1;
  return id;
}

function makeCard(state: MatchState, defId: CardDefId, instanceId?: string): CardInstance {
  return { id: instanceId ?? alloc(state, "card"), defId, rested: false, attachedDonIds: [] };
}

function syncZoneInstanceIds(state: MatchState): void {
  for (const player of state.players) {
    player.zoneInstanceIds ??= { deck: [], trash: [], life: [] };
    for (const zone of ["deck", "trash", "life"] as const) {
      const ids = player.zoneInstanceIds[zone];
      const cards = player[zone];
      if (ids.length > cards.length) ids.length = cards.length;
      while (ids.length < cards.length) ids.push(alloc(state, "hidden"));
    }
  }
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

function characterPlayCost(
  state: MatchState,
  seat: Seat,
  def: ReturnType<typeof getCardDef>,
): number {
  let cost = def.cost;
  const handSource: CardInstance = { id: `hand:${def.id}`, defId: def.id, rested: false, attachedDonIds: [] };
  for (const operation of continuousOperations(state, seat, handSource, "hand")) if (operation.type === "modify_play_cost" && operation.target === "source_in_hand") cost = Math.max(operation.minimum, cost + operation.amount);
  return cost;
}

function continuousConditionMatches(state: MatchState, seat: Seat, source: CardInstance, condition: AbilityCondition): boolean {
  if (condition.type === "leader_has_trait") return leaderHasTrait(state, seat, condition.trait);
  if (condition.type === "leader_has_name") return condition.names.includes(getCardDef(state.players[seat].leader.defId).name);
  if (condition.type === "leader_is_monocolored") return getCardDef(state.players[seat].leader.defId).colors.length === 1;
  if (condition.type === "leader_is_multicolored") return getCardDef(state.players[seat].leader.defId).colors.length > 1;
  if (condition.type === "opponent_life_at_most") return state.players[otherSeat(seat)].life.length <= condition.count;
  if (condition.type === "any") return condition.conditions.some((candidate) => continuousConditionMatches(state, seat, source, candidate));
  if (condition.type === "source_is_active") return !source.rested;
  if (condition.type === "attached_don_at_least") return source.attachedDonIds.length >= condition.count;
  if (condition.type === "controller_turn") return state.activeSeat === seat;
  if (condition.type === "opponent_turn") return state.activeSeat !== seat;
  if (condition.type === "opponent_has_character_power_at_least") return state.players[otherSeat(seat)].characters.some((card) => powerOf(state, otherSeat(seat), card) >= condition.power);
  if (condition.type === "controller_has_character_power_at_least") return state.players[seat].characters.some((card) => powerOf(state, seat, card) >= condition.power);
  return false;
}

function continuousOperations(state: MatchState, seat: Seat, source: CardInstance, zone?: AbilityZone): AbilityOperation[] {
  if (effectsAreNegated(state, source)) return [];
  const player = state.players[seat];
  const sourceZone = zone ?? (source.id === player.leader.id ? "leader" : player.characters.some((card) => card.id === source.id) ? "character" : player.stage?.id === source.id ? "stage" : undefined);
  if (!sourceZone) return [];
  return abilitiesForCard(source.defId)
    .filter((ability) => ability.kind === "continuous" && ability.zones.includes(sourceZone) && ability.conditions.every((condition) => continuousConditionMatches(state, seat, source, condition)))
    .flatMap((ability) => ability.operations);
}

function cannotBeKoByOpponentEffect(state: MatchState, seat: Seat, card: CardInstance): boolean {
  return continuousOperations(state, seat, card).some((operation) => operation.type === "prevent_effect_ko" && operation.target === "source");
}

function characterFieldCost(state: MatchState, seat: Seat, card: CardInstance): number {
  let cost = getCardDef(card.defId).cost;
  const player = state.players[seat];
  for (const source of [player.leader, ...player.characters, ...(player.stage ? [player.stage] : [])]) {
    for (const operation of continuousOperations(state, seat, source)) {
      if (operation.type === "modify_field_cost") cost = Math.max(operation.minimum, cost + operation.amount);
    }
  }
  return cost;
}

function counterValue(state: MatchState, seat: Seat, def: ReturnType<typeof getCardDef>): number {
  let value = def.counter ?? 0;
  for (const source of state.players[seat].characters) for (const operation of continuousOperations(state, seat, source)) {
    if (operation.type === "replace_counter" && def.type === "character" && operation.target === "characters_in_hand" && (operation.printedPower == null || (def.power ?? 0) === operation.printedPower)) value = operation.value;
  }
  return value;
}

function leaderHasTrait(state: MatchState, seat: Seat, trait: string): boolean {
  return (getCardDef(state.players[seat].leader.defId).traits ?? []).includes(trait);
}

function makeTopDeckSearchChoice(
  state: MatchState,
  seat: Seat,
  sourceDefId: CardDefId,
  sourceInstanceId: string,
  effect: TopDeckSearchEffect,
): PendingChoice {
  const id = alloc(state, "choice");
  const options = state.players[seat].deck.slice(0, effect.count).map((defId, index) => ({
    id: `${id}:option:${index}`,
    defId,
    eligible:
      !(effect.excludeDefIds ?? []).includes(defId) &&
      (effect.filterTraitOrName != null
        ? (getCardDef(defId).traits ?? []).includes(effect.filterTraitOrName.trait) ||
          effect.filterTraitOrName.nameIncludes.some((name) =>
            getCardDef(defId).name.includes(name),
          )
        : effect.filterTrait == null ||
          (getCardDef(defId).traits ?? []).includes(effect.filterTrait)),
  }));
  return {
    id,
    seat,
    kind: "search_top_deck",
    cardDefId: sourceDefId,
    sourceInstanceId,
    optional: false,
    prompt:
      `Look at the top ${options.length} card${options.length === 1 ? "" : "s"}, ` +
      `add up to ${effect.maxTake} eligible card ${effect.takeToLife ? "to the top of your Life cards" : "to your hand"}, then ` +
      (effect.remainder === "trash"
        ? "trash the rest."
        : "order the rest on the bottom of your deck."),
    abilityId: "top_deck_search",
    search: {
      options,
      maxSelect: effect.maxTake,
      remainder: effect.remainder,
      takeToLife: effect.takeToLife,
    },
    privateToSeat: seat,
    optionCount: options.length,
  };
}

function makeProgramSearchChoice(
  state: MatchState,
  seat: Seat,
  source: Pick<CardInstance, "id" | "defId">,
  abilityId: string,
  window: string,
): PendingChoice {
  const ability = abilityForCard(source.defId, abilityId);
  if (!ability) throw new Error(`Missing declarative ability ${source.defId}:${abilityId}`);
  return scheduleDeclarativeSearch(state, seat, source, ability, window, (prefix) => alloc(state, prefix));
}

/** Resolve the exact copy captured by this prompt, even if trash indices changed. */
function selectedTrashIndex(player: PlayerState, choice: PendingChoice, optionId: string | undefined): number {
  const option = choice.trashOptions?.find((entry) => entry.id === optionId);
  if (!option?.eligible || !option.instanceId) return -1;
  const index = player.zoneInstanceIds.trash.indexOf(option.instanceId);
  return index >= 0 && player.trash[index] === option.defId ? index : -1;
}

function resolveTopDeckSearch(
  state: MatchState,
  seat: Seat,
  choice: PendingChoice,
  selectedOptionId: string | undefined,
  orderedOptionIds: string[] | undefined,
  events: GameEvent[],
): string | null {
  const search = choice.search;
  if (!search) return "Search details are missing";
  const options = search.options;
  const currentTop = state.players[seat].deck.slice(0, options.length);
  if (
    currentTop.length !== options.length ||
    currentTop.some((defId, index) => defId !== options[index]!.defId)
  ) {
    return "Deck changed while the search was pending";
  }

  const selected = selectedOptionId
    ? options.find((option) => option.id === selectedOptionId)
    : undefined;
  if (selectedOptionId && !selected) return "Selected search option is invalid";
  if (selected && !selected.eligible) return "Selected card is not eligible";
  if (selected && search.maxSelect < 1) return "This search cannot take a card";

  const remaining = options.filter((option) => option.id !== selectedOptionId);
  const ordered = orderedOptionIds ?? [];
  if (
    ordered.length !== remaining.length ||
    new Set(ordered).size !== ordered.length ||
    ordered.some((id) => !remaining.some((option) => option.id === id))
  ) {
    return "Remainder order must include every unselected card exactly once";
  }

  const player = state.players[seat];
  player.deck.splice(0, options.length);
  const optionInstanceIds = player.zoneInstanceIds.deck.splice(0, options.length);
  for (const id of ordered) {
    const option = remaining.find((candidate) => candidate.id === id)!;
    const optionIndex = options.findIndex((candidate) => candidate.id === id);
    const instanceId = optionInstanceIds[optionIndex]!;
    if (search.remainder === "trash") { player.trash.push(option.defId); player.zoneInstanceIds.trash.push(instanceId); }
    else { player.deck.push(option.defId); player.zoneInstanceIds.deck.push(instanceId); }
  }
  if (selected) {
    const selectedIndex = options.findIndex((option) => option.id === selectedOptionId);
    const selectedInstanceId = optionInstanceIds[selectedIndex]!;
    if (search.takeToLife) {
      player.life.unshift(selected.defId);
      player.zoneInstanceIds.life.unshift(selectedInstanceId);
      player.faceUpLife.unshift(false);
      events.push({ type: "life_added", seat, defId: selected.defId, source: "deck_top" });
    } else {
      player.hand.push(makeCard(state, selected.defId, selectedInstanceId));
    }
    events.push({ type: "card_revealed", seat, defId: selected.defId, matchedTrait: true });
  }
  return null;
}

function canResolveCounterEvent(def: ReturnType<typeof getCardDef>): boolean {
  return (
    def.type === "event" &&
    def.eventTiming === "counter" &&
    ((def.counterPowerBonus ?? 0) > 0 || def.counterFriendlyPower != null)
  );
}

function canResolveMainEvent(def: ReturnType<typeof getCardDef>): boolean {
  return (
    def.type === "event" &&
    def.eventTiming === "main" &&
    ((def.mainDraw ?? 0) > 0 ||
      abilitiesForCard(def.id).some((ability) => ability.windows.includes("main")) ||
      def.mainTrashTriggerToHand != null ||
      def.mainPlayNamedThenOpponentLife != null)
  );
}

function declarativeActivationError(
  state: MatchState,
  seat: Seat,
  source: CardInstance,
  ability: CardAbilityProgram,
  targetId?: string,
): string | null {
  const player = state.players[seat];
  const onStage = player.stage?.id === source.id;
  const onCharacter = player.characters.some((card) => card.id === source.id);
  if (!ability.windows.includes("activate_main") || (!onStage && !onCharacter)) return "Ability source is not in its declared zone";
  if (effectsAreNegated(state, source)) return "Source effects are negated";
  for (const condition of ability.conditions) {
    if (condition.type === "source_is_active" && source.rested) return "Ability source must be active";
    if (condition.type === "leader_has_trait" && !leaderHasTrait(state, seat, condition.trait)) return `Leader must have the ${condition.trait} trait`;
  }
  for (const cost of ability.costs) {
    if (cost.type === "rest_don" && activeDons(player).length < cost.count) return "Not enough active DON!! cards";
    if (cost.type === "trash_hand" && player.hand.length < cost.count) return "Not enough cards in hand";
    if (cost.type === "trash_source" && !onStage && !onCharacter) return "Source is no longer on the field";
  }
  for (const operation of ability.operations) if (operation.type === "attach_rested_don" && targetId != null) {
    if (!findBoard(player, targetId)) return "Ability target is invalid";
    if (player.costArea.filter((don) => don.rested).length < operation.count) return "Not enough rested DON!! cards";
  }
  return null;
}

function payDeclarativeCosts(
  state: MatchState,
  seat: Seat,
  source: CardInstance,
  ability: CardAbilityProgram,
  handIndices: number[],
  events: GameEvent[],
): string | null {
  const player = state.players[seat];
  for (const cost of ability.costs) {
    if (cost.type === "rest_don" && !payCost(player, cost.count)) return "Not enough active DON!! cards";
    if (cost.type === "rest_source") source.rested = true;
    if (cost.type === "trash_hand") {
      if (handIndices.length !== cost.count || new Set(handIndices).size !== handIndices.length || handIndices.some((index) => index < 0 || index >= player.hand.length)) return "Choose every hand card required by the cost";
      for (const index of [...handIndices].sort((a, b) => b - a)) putInZone(player, "trash", player.hand.splice(index, 1)[0]!);
    }
    if (cost.type === "trash_source") {
      if (player.stage?.id === source.id) { player.stage = null; putInZone(player, "trash", source); events.push({ type: "stage_trashed", seat, defId: source.defId }); }
      else {
        const index = player.characters.findIndex((card) => card.id === source.id);
        if (index < 0) return "Source is no longer on the field";
        const [trashed] = player.characters.splice(index, 1);
        returnDonsRested(player, trashed);
        putInZone(player, "trash", trashed);
      }
    }
  }
  return null;
}

function executeDeclarativeOperations(
  state: MatchState,
  seat: Seat,
  source: CardInstance,
  ability: CardAbilityProgram,
  window: string,
  targetId: string | undefined,
  events: GameEvent[],
): string | null {
  const frameId = alloc(state, "frame");
  state.resolutionFrames.push({ id: frameId, seat, sourceInstanceId: source.id, sourceDefId: source.defId, abilityId: ability.id, window, operationIndex: 0, bindings: { targetId: targetId ?? null } });
  return resumeDeclarativeProgram(state, frameId, events);
}

function resumeDeclarativeProgram(state: MatchState, frameId: string, events: GameEvent[]): string | null {
  return resumeProgram(state, frameId, ABILITY_REGISTRY, {
    alloc: (prefix) => alloc(state, prefix),
    execute: (operation, frame) => {
      if (operation.type === "draw_cards") {
        drawN(state, operation.player === "controller" ? frame.seat : otherSeat(frame.seat), operation.count, events);
        return "complete";
      }
      if (operation.type === "search_top_deck") {
        const ability = ABILITY_REGISTRY.abilities.get(frame.abilityId)!;
        const choice = scheduleDeclarativeSearch(state, frame.seat, { id: frame.sourceInstanceId, defId: frame.sourceDefId }, ability, frame.window, (prefix) => alloc(state, prefix), frame);
        enqueuePendingChoices(state, [choice], frame.seat, events);
        return "paused";
      }
      if (operation.type === "attach_rested_don") {
        const targetId = frame.bindings.targetId;
        if (typeof targetId !== "string") return operation.optional ? "complete" : { error: "A DON!! attachment target is required" };
        const target = findBoard(state.players[frame.seat], targetId);
        if (!target) return { error: "DON!! attachment target is unavailable" };
        for (let count = 0; count < operation.count; count += 1) {
          if (!attachOneRestedDon(state, frame.seat, target, events)) return { error: "Unable to attach the required DON!! card" };
        }
        return "complete";
      }
      return { error: `Operation ${operation.type} has no sequential executor` };
    },
  });
}

function makeOpponentLifeChoice(
  state: MatchState,
  seat: Seat,
  cardDefId: CardDefId,
): PendingChoice | null {
  if (state.players[otherSeat(seat)].life.length === 0) return null;
  return {
    id: alloc(state, "choice"),
    seat,
    kind: "optional_ability",
    cardDefId,
    optional: true,
    prompt: `${getCardDef(cardDefId).name} — add the top card of your opponent's Life to their hand?`,
    abilityId: "main_opponent_life_to_hand",
  };
}

function cardHasKeyword(state: MatchState, seat: Seat, card: CardInstance, keyword: "blocker" | "rush" | "rush_character"): boolean {
  return continuousOperations(state, seat, card).some((operation) => operation.type === "grant_keyword" && operation.keyword === keyword);
}

function cardHasRush(state: MatchState, seat: Seat, card: CardInstance): boolean {
  return cardHasKeyword(state, seat, card, "rush") || cardHasKeyword(state, seat, card, "rush_character");
}

function canAttackLeaderImmediately(state: MatchState, seat: Seat, card: CardInstance): boolean {
  return !card.summoningSick || cardHasKeyword(state, seat, card, "rush");
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

  const attackingCard = state.battle
    ? findBoard(attacker, state.battle.attackerId)
    : null;
  if (attackingCard && attackingCard.id !== attacker.leader.id) {
    const attackingDef = getCardDef(attackingCard.defId);
    const attackAbilities = abilitiesForCard(attackingCard.defId).filter((ability) => ability.windows.includes("when_attacking") && ability.conditions.every((condition) => continuousConditionMatches(state, attackerSeat, attackingCard, condition)));
    const powerAbility = attackAbilities.find((ability) => ability.operations.some((operation) => operation.type === "choose_power_modifier"));
    const powerOperation = powerAbility?.operations.find((operation) => operation.type === "choose_power_modifier");
    if (!effectsAreNegated(state, attackingCard) && powerAbility && powerOperation?.type === "choose_power_modifier") {
      out.push({
        id: alloc(state, "choice"),
        seat: attackerSeat,
        kind: "when_attacking",
        cardDefId: attackingDef.id,
        sourceInstanceId: attackingCard.id,
        optional: false,
        prompt:
          `${attackingDef.name} — When Attacking: give up to 1 other friendly ` +
          `Leader or Character +${powerOperation.amount} power during this turn.`,
        abilityId: powerAbility.id as PendingChoice["abilityId"],
      });
    }
    const copyAbility = attackAbilities.find((ability) => ability.operations.some((operation) => operation.type === "copy_opponent_character_power"));
    if (!effectsAreNegated(state, attackingCard) && copyAbility) {
      const hasTarget = state.players[otherSeat(attackerSeat)].characters.length > 0;
      if (hasTarget) {
        out.push({
          id: alloc(state, "choice"),
          seat: attackerSeat,
          kind: "when_attacking",
          cardDefId: attackingDef.id,
          sourceInstanceId: attackingCard.id,
          optional: true,
          prompt: `${attackingDef.name} — When Attacking: select up to 1 of your opponent's Characters to copy its power?`,
          abilityId: copyAbility.id as PendingChoice["abilityId"],
        });
      }
    }
  }

  // Leader When Attacking — only when the Leader itself is the attacker.
  if (
    state.battle?.attackerId === attacker.leader.id &&
    !effectsAreNegated(state, attacker.leader) &&
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
  if (!defender.leaderOppAttackAbilityUsedThisTurn && !effectsAreNegated(state, defender.leader)) {
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

/** Leader, characters, or Stage — for Activate:Main sources. */
function findBoardOrStage(p: PlayerState, id: string): CardInstance | null {
  if (p.leader.id === id) return p.leader;
  if (p.stage?.id === id) return p.stage;
  return p.characters.find((c) => c.id === id) ?? null;
}

function effectsAreNegated(state: MatchState, card: CardInstance): boolean {
  return (card.effectsNegatedThroughTurn ?? -1) >= state.turnNumber;
}

/** Attach one rested cost-area DON!! to a Leader/Character; returns false if none. */
function attachOneRestedDon(
  state: MatchState,
  seat: Seat,
  target: CardInstance,
  events: GameEvent[],
): boolean {
  const player = state.players[seat];
  const donIdx = player.costArea.findIndex((d) => d.rested);
  if (donIdx < 0) return false;
  const [don] = player.costArea.splice(donIdx, 1);
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
  return true;
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
  const effectsActive = !effectsAreNegated(state, card);
  let p = def.power ?? 0;
  if (card.turnBasePowerOverride != null) {
    p = card.turnBasePowerOverride;
  }
  if (def.type === "character") for (const source of state.players[seat].characters) for (const operation of continuousOperations(state, seat, source)) {
    if (operation.type === "replace_base_power" && operation.target === "friendly_characters" && (operation.printedPower == null || (def.power ?? 0) === operation.printedPower) && (!operation.requiresTrigger || cardHasTrigger(def))) p = operation.power;
  }
  if (effectsActive) for (const operation of continuousOperations(state, seat, card)) if (operation.type === "modify_power" && operation.target === "source") {
    p += operation.perTrashCards ? Math.floor(state.players[seat].trash.length / operation.perTrashCards) * operation.amount : operation.amount;
  }
  if (state.activeSeat === seat) p += card.attachedDonIds.length * 1000;
  if (card.id === state.players[seat].leader.id) {
    const st = state.players[seat].stage;
    if (st && !effectsAreNegated(state, st)) {
      p += getCardDef(st.defId).stageLeaderPowerBonus ?? 0;
    }
  }
  if (state.battle) {
    if (card.id === state.battle.attackerId) p += state.battle.attackerPowerBonus;
    if (asDefender) p += state.battle.defenderPowerBonus;
  }
  p += card.battlePowerBonus ?? 0;
  p += card.turnPowerBonus ?? 0;
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
    deck: [],
    trash: [],
    life: [],
    zoneInstanceIds: { deck: [], trash: [], life: [] },
    faceUpLife: [],
    donDeck: Array.from({ length: 10 }, () => makeDon(state)),
    costArea: [],
    attachedDons: [],
    mulliganDone: false,
    turnsStarted: 0,
    leaderActivatedThisTurn: false,
    leaderOppAttackAbilityUsedThisTurn: false,
  };
  const shuffledDeck = rng.shuffle(cfg.deck.map((defId) => ({ defId, id: alloc(state, "card") })));
  player.deck = shuffledDeck.map((card) => card.defId);
  player.zoneInstanceIds.deck = shuffledDeck.map((card) => card.id);
  for (let i = 0; i < 5; i++) {
    if (!player.deck.length) break;
    player.hand.push(makeCard(state, player.deck.shift()!, player.zoneInstanceIds.deck.shift()));
  }
  return player;
}

function setLife(player: PlayerState): void {
  const n = getCardDef(player.leader.defId).life ?? 0;
  for (let i = 0; i < n; i++) {
    if (!player.deck.length) break;
    player.life.push(player.deck.shift()!);
    player.zoneInstanceIds.life.push(player.zoneInstanceIds.deck.shift()!);
    player.faceUpLife.push(false);
  }
}

function beginTurn(state: MatchState, events: GameEvent[]): void {
  for (const participant of state.players) {
    delete participant.leader.turnPowerBonus;
    for (const character of participant.characters) delete character.turnPowerBonus;
  }
  const seat = state.activeSeat;
  const player = state.players[seat];
  player.turnsStarted += 1;
  player.leaderActivatedThisTurn = false;
  player.leaderOppAttackAbilityUsedThisTurn = false;
  for (const c of player.characters) {
    c.summoningSick = false;
    c.abilityUsedThisTurn = false;
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
    player.hand.push(makeCard(state, player.deck.shift()!, player.zoneInstanceIds.deck.shift()));
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
    player.hand.push(makeCard(state, player.deck.shift()!, player.zoneInstanceIds.deck.shift()));
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
  const instanceId = player.zoneInstanceIds.deck.shift()!;
  player.life.unshift(defId);
  player.zoneInstanceIds.life.unshift(instanceId);
  player.faceUpLife.unshift(false);
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

  for (const ability of abilitiesForCard(def.id).filter((candidate) => candidate.windows.includes("on_play") && candidate.conditions.every((condition) => continuousConditionMatches(state, seat, inst, condition)))) {
    const powerOperation = ability.operations.find((operation) => operation.type === "choose_power_modifier" && operation.target === "opponent_character");
    if (powerOperation?.type === "choose_power_modifier" && opp.characters.some((character) => !powerOperation.restedOnly || character.rested)) {
      out.push({
        id: alloc(state, "choice"),
        seat,
        kind: "on_play",
        cardDefId: def.id,
        sourceInstanceId: inst.id,
        optional: true,
        prompt: `${def.name} — On Play: give up to 1 of your opponent's Characters ${powerOperation.amount} power this turn?`,
        abilityId: ability.id as PendingChoice["abilityId"],
      });
    }
    const koOperation = ability.operations.find((operation) => operation.type === "choose_ko");
    if (koOperation?.type === "choose_ko" && opp.characters.some((character) => (koOperation.compare === "base_power" ? (getCardDef(character.defId).power ?? 0) : characterFieldCost(state, otherSeat(seat), character)) <= koOperation.maxValue && !cannotBeKoByOpponentEffect(state, otherSeat(seat), character))) {
      out.push({ id: alloc(state, "choice"), seat, kind: "on_play", cardDefId: def.id, sourceInstanceId: inst.id, optional: true, prompt: `${def.name} — On Play: K.O. up to ${koOperation.maxTargets} eligible opponent Character?`, abilityId: ability.id as PendingChoice["abilityId"] });
    }
  }

  const declarativeOnPlay = abilityForCard(def.id, ABILITY_MOBY_DICK_ON_PLAY);
  if (declarativeOnPlay && declarativeOnPlay.conditions.every((condition) =>
    condition.type !== "leader_has_trait" || leaderHasTrait(state, seat, condition.trait)
  )) {
    out.push(makeProgramSearchChoice(state, seat, inst, declarativeOnPlay.id, "on_play"));
  } else if (
    def.onPlaySearchTop &&
    (!def.onPlaySearchTop.requiredLeaderTrait ||
      leaderHasTrait(state, seat, def.onPlaySearchTop.requiredLeaderTrait))
  ) {
    out.push(makeTopDeckSearchChoice(state, seat, def.id, inst.id, def.onPlaySearchTop));
  }

  const trashToLife = def.onPlayTrashHandToLife;
  if (
    trashToLife &&
    player.hand.length > 0 &&
    (!trashToLife.requiredLeaderTrait || leaderHasTrait(state, seat, trashToLife.requiredLeaderTrait))
  ) {
    const trashOptions = player.trash
      .map((defId, index) => ({ id: alloc(state, "trashOption"), instanceId: player.zoneInstanceIds.trash[index], defId, eligible: getCardDef(defId).cost <= trashToLife.maxCost && cardHasTrigger(getCardDef(defId)) }))
      .filter((option) => option.eligible);
    if (trashOptions.length > 0) {
      out.push({
        id: alloc(state, "choice"),
        seat,
        kind: "on_play",
        cardDefId: def.id,
        sourceInstanceId: inst.id,
        optional: true,
        prompt: `${def.name} — On Play: trash 1 card from your hand to add an eligible Blackbeard card from your trash to the top of Life?`,
        abilityId: "on_play_trash_hand_to_life",
        trashOptions,
        privateToSeat: seat,
      });
    }
  }

  const reveal = def.onPlayRevealDrawTrash;
  if (reveal) {
    const qualifying = player.hand.filter((card) => {
      const cardDef = getCardDef(card.defId);
      return cardDef.type === "character" && (cardDef.power ?? 0) === reveal.revealPower;
    });
    if (qualifying.length >= reveal.revealCount) {
      out.push({
        id: alloc(state, "choice"),
        seat,
        kind: "on_play",
        cardDefId: def.id,
        sourceInstanceId: inst.id,
        optional: true,
        prompt: `${def.name} — On Play: reveal ${reveal.revealCount} Characters with ${reveal.revealPower} power to draw ${reveal.draw}, then trash ${reveal.trash}?`,
        abilityId: "on_play_reveal_draw_trash",
        handSelection: { count: reveal.revealCount, qualifyingPower: reveal.revealPower },
        privateToSeat: seat,
      });
    }
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

  for (const ability of abilitiesForCard(def.id).filter((candidate) => candidate.windows.includes("on_play"))) {
    if (!ability.conditions.every((condition) => continuousConditionMatches(state, seat, inst, condition))) continue;
    for (const operation of ability.operations) if (operation.type === "replace_base_power" && operation.target === "leader") {
      player.leader.turnBasePowerOverride = operation.power;
      player.leader.basePowerOverrideThroughTurn = state.turnNumber + (state.activeSeat === seat ? 1 : 0);
    }
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

function applyOnKoEffect(
  state: MatchState,
  seat: Seat,
  def: ReturnType<typeof getCardDef>,
  events: GameEvent[],
  source?: CardInstance,
): void {
  if (source && effectsAreNegated(state, source)) return;
  if (
    def.onKoDraw &&
    (!def.onKoDrawRequiredLeaderTrait || leaderHasTrait(state, seat, def.onKoDrawRequiredLeaderTrait))
  ) drawN(state, seat, def.onKoDraw, events);
  if (def.onKoSearchTop && def.onPlaySearchTop) {
    const choice = makeTopDeckSearchChoice(
      state,
      seat,
      def.id,
      source?.id ?? `${def.id}:on_ko`,
      def.onPlaySearchTop,
    );
    enqueuePendingChoices(state, [choice], state.activeSeat, events);
  }
  const leaderPower = def.onKoLeaderBasePower;
  if (
    leaderPower &&
    (!leaderPower.requiredLeaderTrait ||
      leaderHasTrait(state, seat, leaderPower.requiredLeaderTrait))
  ) {
    enqueuePendingChoices(
      state,
      [{
        id: alloc(state, "choice"),
        seat,
        kind: "optional_ability",
        cardDefId: def.id,
        optional: true,
        prompt: `${def.name} — set up to 1 of your Leader or Characters' base power to ${leaderPower.basePower} this turn.`,
        abilityId: "on_ko_set_base_power",
      }],
      state.activeSeat,
      events,
    );
  }
  const ko = def.onKoOpponentKoCost;
  if (
    ko &&
    (!ko.requiredLeaderTrait || leaderHasTrait(state, seat, ko.requiredLeaderTrait))
  ) {
    const hasTarget = state.players[otherSeat(seat)].characters.some(
      (character) =>
        characterFieldCost(state, otherSeat(seat), character) <= ko.cost &&
        !cannotBeKoByOpponentEffect(state, otherSeat(seat), character),
    );
    if (hasTarget) enqueuePendingChoices(
      state,
      [{
        id: alloc(state, "choice"),
        seat,
        kind: "optional_ability",
        cardDefId: def.id,
        optional: true,
        prompt: `${def.name} — K.O. up to ${ko.maxTargets} opponent Characters with cost ${ko.cost} or less.`,
        abilityId: "on_ko_ko_opponent_cost",
        targetSelection: { maxTargets: ko.maxTargets, maxCost: ko.cost },
      }],
      state.activeSeat,
      events,
    );
  }
  const rest = def.onKoOpponentRestCost;
  if (rest) {
    const hasTarget = state.players[otherSeat(seat)].characters.some(
      (character) => !character.rested && characterFieldCost(state, otherSeat(seat), character) <= rest.cost,
    );
    if (hasTarget) enqueuePendingChoices(
      state,
      [{
        id: alloc(state, "choice"),
        seat,
        kind: "optional_ability",
        cardDefId: def.id,
        optional: true,
        prompt: `${def.name} — rest up to ${rest.maxTargets} opponent Characters with cost ${rest.cost} or less.`,
        abilityId: "on_ko_rest_opponent_cost",
        targetSelection: { maxTargets: rest.maxTargets, maxCost: rest.cost },
      }],
      state.activeSeat,
      events,
    );
  }
  const life = def.onKoReturnDonAddLife;
  if (life && state.players[seat].deck.length > 0) {
    const player = state.players[seat];
    const options = [
      ...player.costArea.map((don) => ({ id: don.id, rested: don.rested, attachedTo: don.attachedTo })),
      ...player.attachedDons.map((don) => ({ id: don.id, rested: don.rested, attachedTo: don.attachedTo })),
    ];
    if (options.length >= life.returnDon) {
      const choice: PendingChoice = {
        id: alloc(state, "choice"),
        seat,
        kind: "optional_ability",
        cardDefId: def.id,
        optional: true,
        prompt: `${def.name} — return ${life.returnDon} DON!! card to your DON!! deck to add your deck top to Life?`,
        abilityId: "on_ko_return_don_add_life",
        donOptions: options,
        privateToSeat: seat,
      };
      enqueuePendingChoices(state, [choice], state.activeSeat, events);
    }
  }
  const revive = def.onKoReviveSelf;
  if (
    revive &&
    source && state.players[seat].zoneInstanceIds.trash.includes(source.id) &&
    state.players[seat].hand.some((card) =>
      (getCardDef(card.defId).traits ?? []).some((trait) => trait.includes(revive.trashHandTrait)),
    )
  ) {
    const choice: PendingChoice = {
      id: alloc(state, "choice"),
      seat,
      kind: "optional_ability",
      cardDefId: def.id,
      optional: true,
      prompt: `${def.name} — trash 1 {${revive.trashHandTrait}} card from your hand to play this card from trash?`,
      abilityId: "on_ko_revive_self",
      sourceInstanceId: source.id,
      privateToSeat: seat,
    };
    enqueuePendingChoices(state, [choice], state.activeSeat, events);
  }
}

function removeCharacterAsKo(
  state: MatchState,
  targetSeat: Seat,
  targetId: string,
  events: GameEvent[],
): boolean {
  const player = state.players[targetSeat];
  const index = player.characters.findIndex((card) => card.id === targetId);
  if (index < 0) return false;
  const [removed] = player.characters.splice(index, 1);
  returnDonsRested(player, removed);
  putInZone(player, "trash", removed);
  events.push({ type: "character_ko", seat: targetSeat, defId: removed.defId });
  applyOnKoEffect(state, targetSeat, getCardDef(removed.defId), events, removed);
  return true;
}

function koCharacterByOpponentEffect(
  state: MatchState,
  causingSeat: Seat,
  targetSeat: Seat,
  targetId: string,
  events: GameEvent[],
): boolean {
  const player = state.players[targetSeat];
  const target = player.characters.find((card) => card.id === targetId);
  if (!target) return false;
  const replacement = player.characters.find(
    (card) =>
      card.id !== target.id &&
      getCardDef(card.defId).removalReplacementSelfKo &&
      !effectsAreNegated(state, card),
  );
  if (causingSeat !== targetSeat && replacement) {
    const choice: PendingChoice = {
      id: alloc(state, "choice"),
      seat: targetSeat,
      kind: "optional_ability",
      cardDefId: replacement.defId,
      sourceInstanceId: replacement.id,
      replacementTargetId: target.id,
      optional: true,
      prompt: `${getCardDef(replacement.defId).name} — K.O. this Character instead of ${getCardDef(target.defId).name}?`,
      abilityId: "marco_removal_replacement",
    };
    enqueuePendingChoices(state, [choice], causingSeat, events);
    return true;
  }
  return removeCharacterAsKo(state, targetSeat, target.id, events);
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
      putInZone(def, "trash", ko);
      events.push({ type: "character_ko", seat: defSeat, defId: ko.defId });
      applyOnKoEffect(state, defSeat, getCardDef(ko.defId), events, ko);
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
  const lifeInstanceId = def.zoneInstanceIds.life.shift()!;
  def.faceUpLife.shift();
  const lifeDef = getCardDef(lifeId);
  if (
    (lifeDef.triggerDraw ?? 0) > 0 ||
    lifeDef.triggerDrawThenTrash != null ||
    lifeDef.triggerActivateMain ||
    abilitiesForCard(lifeId).some((ability) => ability.windows.includes("life_trigger")) ||
    lifeDef.triggerActivateOnPlay ||
    lifeDef.triggerActivateOnKo ||
    lifeDef.triggerNegateOpponent != null ||
    lifeDef.triggerFriendlyPowerBonus != null ||
    lifeDef.triggerLeaderPowerBonus != null
  ) {
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
          sourceInstanceId: lifeInstanceId,
          optional: true,
          prompt: abilitiesForCard(lifeId).some((ability) => ability.windows.includes("life_trigger"))
            ? `${lifeDef.name} — activate this card's Trigger effect?`
            : lifeDef.triggerActivateMain
            ? `${lifeDef.name} — Trigger: activate this card's Main effect?`
            : lifeDef.triggerActivateOnPlay
              ? `${lifeDef.name} — Trigger: activate this card's On Play effect?`
            : lifeDef.triggerActivateOnKo
              ? `${lifeDef.name} — Trigger: activate this card's On K.O. effect?`
            : lifeDef.triggerDrawThenTrash
              ? `${lifeDef.name} — Trigger: draw ${lifeDef.triggerDrawThenTrash.draw}, then trash ${lifeDef.triggerDrawThenTrash.trash} card?`
            : lifeDef.triggerNegateOpponent
              ? `${lifeDef.name} — Trigger: activate its opponent-card negation effect?`
            : lifeDef.triggerFriendlyPowerBonus != null
              ? `${lifeDef.name} — Trigger: give up to 1 friendly Leader or Character +${lifeDef.triggerFriendlyPowerBonus} power this turn?`
            : lifeDef.triggerLeaderPowerBonus != null
              ? `${lifeDef.name} — Trigger: your Leader gains +${lifeDef.triggerLeaderPowerBonus} power this turn?`
              : `${lifeDef.name} — Trigger: draw ${lifeDef.triggerDraw} card${
                  lifeDef.triggerDraw === 1 ? "" : "s"
                }?`,
          privateToSeat: defSeat,
          hideCardDefFromOthers: true,
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
  def.hand.push(makeCard(state, lifeId, lifeInstanceId));
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
    stateVersion: MATCH_STATE_VERSION,
    rulesVersion: RULES_VERSION,
    protocolVersion: RULES_PROTOCOL_VERSION,
    registryHash: ABILITY_REGISTRY.contentHash,
    rng: { seed: config.seed >>> 0, cursor: 0 },
    players: null as unknown as [PlayerState, PlayerState],
    activeSeat: firstSeat,
    firstSeat,
    phase: "mulligan",
    turnNumber: 0,
    battle: null,
    pendingChoices: [],
    resolutionFrames: [],
    winner: null,
    winReason: null,
    nextId: 1,
    lastEvents: [],
  };
  state.players = [
    buildPlayer(state, players[0], rng),
    buildPlayer(state, players[1], rng),
  ];
  state.rng = rng.snapshot();
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
  syncZoneInstanceIds(next);
  const stateRng = createSeededRng(next.rng);
  const events: GameEvent[] = [];
  const seat = ctx.seat;
  const player = next.players[seat];
  const done = (): ApplyResult => {
    syncZoneInstanceIds(next);
    next.rng = stateRng.snapshot();
    next.lastEvents = events;
    return { ok: true, state: next, events };
  };

  if (intent.type === "mulligan") {
    if (next.phase !== "mulligan") return fail(state, "bad_phase", "Not mulligan");
    if (player.mulliganDone) return fail(state, "already_done", "Already decided");
    if (intent.doMulligan) {
      for (const c of player.hand) { player.deck.push(c.defId); player.zoneInstanceIds.deck.push(c.id); }
      player.hand = [];
      const shuffled = stateRng.shuffle(player.deck.map((defId, index) => ({ defId, id: player.zoneInstanceIds.deck[index]! })));
      player.deck = shuffled.map((card) => card.defId);
      player.zoneInstanceIds.deck = shuffled.map((card) => card.id);
      for (let i = 0; i < 5; i++) {
        if (!player.deck.length) break;
        player.hand.push(makeCard(next, player.deck.shift()!, player.zoneInstanceIds.deck.shift()));
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

    if (front.kind === "search_top_deck") {
      if (!intent.accept) {
        return fail(state, "mandatory_choice", "Complete the top-deck search");
      }
      const error = front.resolutionFrameId
        ? resolveDeclarativeSearch(next, seat, front, intent.selectedOptionId, intent.orderedOptionIds, (defId, instanceId) => makeCard(next, defId, instanceId), events)
        : resolveTopDeckSearch(next, seat, front, intent.selectedOptionId, intent.orderedOptionIds, events);
      if (error) return fail(state, "bad_search_choice", error);
      if (front.resolutionFrameId) {
        const continuationError = resumeDeclarativeProgram(next, front.resolutionFrameId, events);
        if (continuationError) return fail(state, "ability_resolution_failed", continuationError);
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: true,
      });
    } else if (front.kind === "life_trigger") {
      if (intent.accept && (def.triggerDraw ?? 0) > 0) {
        if (!drawN(next, seat, def.triggerDraw!, events)) return done();
      }
      if (intent.accept && def.triggerDrawThenTrash) {
        if (!drawN(next, seat, def.triggerDrawThenTrash.draw, events)) return done();
        const discardChoice: PendingChoice = {
          id: alloc(next, "choice"),
          seat,
          kind: "on_play",
          cardDefId: def.id,
          optional: false,
          prompt: `${def.name} — trash ${def.triggerDrawThenTrash.trash} card from your hand.`,
          abilityId: "discard_hand_count",
          handSelection: { count: def.triggerDrawThenTrash.trash },
          privateToSeat: seat,
        };
        next.pendingChoices.unshift(discardChoice);
        events.push({
          type: "pending_choice_added",
          seat,
          kind: discardChoice.kind,
          cardDefId: discardChoice.cardDefId,
          optional: discardChoice.optional,
          prompt: discardChoice.prompt,
          privateToSeat: discardChoice.privateToSeat,
        });
      }
      if (intent.accept && def.triggerPlayTrashCharacter) {
        const cfg = def.triggerPlayTrashCharacter;
        const trashOptions = next.players[seat].trash.map((cardDefId, index) => {
          const cardDef = getCardDef(cardDefId);
          return {
            id: alloc(next, "trashOption"),
            instanceId: next.players[seat].zoneInstanceIds.trash[index],
            defId: cardDefId,
            eligible:
              cardDef.type === "character" &&
              cardDef.cost === cfg.cost &&
              (cardDef.traits ?? []).includes(cfg.trait),
          };
        });
        if (next.players[seat].characters.length < 5 && trashOptions.some((option) => option.eligible)) {
          const choice: PendingChoice = {
            id: alloc(next, "choice"),
            seat,
            kind: "optional_ability",
            cardDefId: def.id,
            optional: true,
            prompt: `${def.name} — play up to 1 cost-${cfg.cost} {${cfg.trait}} Character from trash.`,
            abilityId: "trigger_play_trash_character",
            trashOptions,
            privateToSeat: seat,
          };
          next.pendingChoices.unshift(choice);
          events.push({ type: "pending_choice_added", seat, kind: choice.kind, cardDefId: choice.cardDefId, optional: choice.optional, prompt: choice.prompt, privateToSeat: seat });
        }
      }
      if (intent.accept && def.triggerLeaderPowerBonus != null) {
        next.players[seat].leader.turnPowerBonus =
          (next.players[seat].leader.turnPowerBonus ?? 0) + def.triggerLeaderPowerBonus;
        events.push({
          type: "power_buff_applied",
          seat,
          targetDefId: next.players[seat].leader.defId,
          amount: def.triggerLeaderPowerBonus,
          duration: "turn",
        });
      }
      if (intent.accept && def.triggerNegateOpponent) {
        const choice: PendingChoice = {
          id: alloc(next, "choice"),
          seat,
          kind: "optional_ability",
          cardDefId: def.id,
          optional: true,
          prompt: def.triggerNegateOpponent.charactersOnly
            ? `${def.name} — negate up to 1 of your opponent's Characters during this turn.`
            : `${def.name} — negate up to 1 of your opponent's Leader or Characters during this turn.`,
          abilityId: "trigger_negate_opponent_card",
        };
        next.pendingChoices.unshift(choice);
        events.push({
          type: "pending_choice_added",
          seat,
          kind: choice.kind,
          cardDefId: choice.cardDefId,
          optional: choice.optional,
          prompt: choice.prompt,
        });
      }
      if (intent.accept && def.triggerFriendlyPowerBonus != null) {
        const choice: PendingChoice = {
          id: alloc(next, "choice"),
          seat,
          kind: "optional_ability",
          cardDefId: def.id,
          optional: true,
          prompt: `${def.name} — choose your Leader or Character to gain +${def.triggerFriendlyPowerBonus} power this turn.`,
          abilityId: "trigger_friendly_power",
        };
        next.pendingChoices.unshift(choice);
        events.push({ type: "pending_choice_added", seat, kind: choice.kind, cardDefId: choice.cardDefId, optional: choice.optional, prompt: choice.prompt });
      }
      if (intent.accept) {
        next.players[seat].trash.push(front.cardDefId);
        next.players[seat].zoneInstanceIds.trash.push(front.sourceInstanceId ?? alloc(next, "hidden"));
        const triggerSource: CardInstance = { id: front.sourceInstanceId ?? `${front.id}:trigger`, defId: def.id, attachedDonIds: [], rested: false };
        for (const ability of abilitiesForCard(def.id).filter((candidate) => candidate.windows.includes("life_trigger"))) {
          if (!ability.conditions.every((condition) => continuousConditionMatches(next, seat, triggerSource, condition))) continue;
          const error = executeDeclarativeOperations(next, seat, triggerSource, ability, "life_trigger", undefined, events);
          if (error) return fail(state, "ability_resolution_failed", error);
          if (next.winner !== null) return done();
        }
        if (def.triggerActivateMain && def.mainSearchTop) {
          const searchChoice = makeTopDeckSearchChoice(next, seat, def.id, triggerSource.id, def.mainSearchTop);
          next.pendingChoices.unshift(searchChoice);
          events.push({
            type: "pending_choice_added",
            seat,
            kind: searchChoice.kind,
            cardDefId: searchChoice.cardDefId,
            optional: searchChoice.optional,
            prompt: searchChoice.prompt,
            privateToSeat: searchChoice.privateToSeat,
            hideCardDefFromOthers: searchChoice.hideCardDefFromOthers,
          });
        }
        if (def.triggerActivateOnPlay) {
          const triggerSource: CardInstance = {
            id: `${front.id}:trigger`,
            defId: front.cardDefId,
            rested: false,
            attachedDonIds: [],
          };
          const onPlayChoices = collectOnPlayChoices(next, seat, triggerSource, def);
          if (onPlayChoices.length > 0) {
            next.pendingChoices.unshift(...onPlayChoices);
            for (const choice of onPlayChoices) {
              events.push({
                type: "pending_choice_added",
                seat,
                kind: choice.kind,
                cardDefId: choice.cardDefId,
                optional: choice.optional,
                prompt: choice.prompt,
                privateToSeat: choice.privateToSeat,
                hideCardDefFromOthers: choice.hideCardDefFromOthers,
              });
            }
          }
        }
        if (def.triggerActivateOnKo) {
          const triggerSource: CardInstance = {
            id: `${front.id}:trigger`,
            defId: front.cardDefId,
            rested: false,
            attachedDonIds: [],
          };
          applyOnKoEffect(next, seat, def, events, triggerSource);
        }
      } else {
        next.players[seat].hand.push(makeCard(next, front.cardDefId, front.sourceInstanceId));
      }
      events.push({ type: "trigger_resolved", seat, accepted: intent.accept });
    } else if (front.kind === "on_play") {
      const hooks = getOnPlayHooks(def);
      const player = next.players[seat];
      const opp = next.players[otherSeat(seat)];

      if (intent.accept && front.abilityId === "on_play_power_debuff") {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose an opponent Character");
        const target = opp.characters.find((character) => character.id === intent.buffTargetId);
        const ability = abilityForCard(def.id, front.abilityId);
        const operation = ability?.operations.find((candidate) => candidate.type === "choose_power_modifier" && candidate.target === "opponent_character");
        const source = (front.sourceInstanceId ? findBoardOrStage(player, front.sourceInstanceId) : undefined) ?? { id: front.sourceInstanceId ?? front.id, defId: def.id, rested: false, attachedDonIds: [] };
        if (!target || operation?.type !== "choose_power_modifier" || !ability?.conditions.every((condition) => continuousConditionMatches(next, seat, source, condition)) || (operation.restedOnly && !target.rested)) {
          return fail(state, "bad_target", "Choose a rested opponent Character");
        }
        target.turnPowerBonus = (target.turnPowerBonus ?? 0) + operation.amount;
        events.push({
          type: "power_buff_applied",
          seat,
          targetDefId: target.defId,
          amount: operation.amount,
          duration: "turn",
        });
      } else if (intent.accept && front.abilityId === "on_play_ko_power") {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose an opponent Character");
        const targetIndex = opp.characters.findIndex((character) => character.id === intent.buffTargetId);
        const ability = abilityForCard(def.id, front.abilityId);
        const koEffect = ability?.operations.find((operation) => operation.type === "choose_ko");
        const source = (front.sourceInstanceId ? findBoardOrStage(player, front.sourceInstanceId) : undefined) ?? { id: front.sourceInstanceId ?? front.id, defId: def.id, rested: false, attachedDonIds: [] };
        if (
          targetIndex < 0 ||
          koEffect?.type !== "choose_ko" ||
          !ability?.conditions.every((condition) => continuousConditionMatches(next, seat, source, condition)) ||
          (koEffect.compare === "base_power" ? (getCardDef(opp.characters[targetIndex]!.defId).power ?? 0) : characterFieldCost(next, otherSeat(seat), opp.characters[targetIndex]!)) > koEffect.maxValue ||
          cannotBeKoByOpponentEffect(next, otherSeat(seat), opp.characters[targetIndex]!)
        ) {
          return fail(state, "bad_target", "Choose an eligible opponent Character");
        }
        koCharacterByOpponentEffect(next, seat, otherSeat(seat), opp.characters[targetIndex]!.id, events);
      } else if (intent.accept && front.abilityId === "on_play_trash_hand_to_life") {
        if (intent.handIndex == null || intent.handIndex < 0 || intent.handIndex >= player.hand.length) {
          return fail(state, "bad_hand", "Choose a card to trash");
        }
        if (selectedTrashIndex(next.players[seat], front, intent.selectedTrashOptionId) < 0) {
          return fail(state, "bad_target", "Choose an eligible card from trash");
        }
        const trashToLife = def.onPlayTrashHandToLife;
        if (!trashToLife || (trashToLife.requiredLeaderTrait && !leaderHasTrait(next, seat, trashToLife.requiredLeaderTrait))) {
          return fail(state, "bad_target", "Leader does not meet this effect's requirement");
        }
        const trashIndex = selectedTrashIndex(player, front, intent.selectedTrashOptionId);
        if (trashIndex < 0) return fail(state, "bad_target", "Selected trash card is missing");
        const handCard = player.hand.splice(intent.handIndex, 1)[0]!;
        putInZone(player, "trash", handCard);
        const toLife = takeFromZone(player, "trash", trashIndex);
        putInZone(player, "life", toLife, "top", true);
        events.push({ type: "life_added", seat, defId: toLife.defId, source: "deck_top", faceUp: true });
      } else if (intent.accept && front.abilityId === "on_play_reveal_draw_trash") {
        const cfg = def.onPlayRevealDrawTrash;
        const indices = intent.handIndices ?? [];
        if (!cfg || indices.length !== cfg.revealCount || new Set(indices).size !== indices.length) {
          return fail(state, "bad_hand", "Choose the required number of cards to reveal");
        }
        for (const index of indices) {
          const card = player.hand[index];
          const cardDef = card ? getCardDef(card.defId) : null;
          if (!cardDef || cardDef.type !== "character" || (cardDef.power ?? 0) !== cfg.revealPower) {
            return fail(state, "bad_hand", `Reveal ${cfg.revealCount} qualifying Characters`);
          }
        }
        if (!drawN(next, seat, cfg.draw, events)) return done();
        const discardChoice: PendingChoice = {
          id: alloc(next, "choice"),
          seat,
          kind: "on_play",
          cardDefId: def.id,
          sourceInstanceId: front.sourceInstanceId,
          optional: false,
          prompt: `${def.name} — trash ${cfg.trash} cards from your hand.`,
          abilityId: "discard_hand_count",
          handSelection: { count: cfg.trash },
          privateToSeat: seat,
        };
        next.pendingChoices.unshift(discardChoice);
        events.push({
          type: "pending_choice_added",
          seat,
          kind: discardChoice.kind,
          cardDefId: discardChoice.cardDefId,
          optional: discardChoice.optional,
          prompt: discardChoice.prompt,
          privateToSeat: discardChoice.privateToSeat,
        });
      } else if (intent.accept && front.abilityId === "discard_hand_count") {
        const count = front.handSelection?.count ?? 0;
        const indices = intent.handIndices ?? [];
        if (indices.length !== count || new Set(indices).size !== indices.length || indices.some((index) => index < 0 || index >= player.hand.length)) {
          return fail(state, "bad_hand", `Choose exactly ${count} cards to trash`);
        }
        for (const index of [...indices].sort((a, b) => b - a)) {
          const [trashed] = player.hand.splice(index, 1);
          putInZone(player, "trash", trashed);
        }
      } else if (intent.accept && front.abilityId === "on_play_add_life") {
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
          const lifeCard = takeFromZone(opp, "life", 0);
          const lifeId = lifeCard.defId;
          opp.hand.push(makeCard(next, lifeId, lifeCard.id));
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
        putInZone(player, "deck", card, "top");
        if (player.donDeck.length > 0) {
          const choice: PendingChoice = {
            id: alloc(next, "choice"),
            seat,
            kind: "on_play",
            cardDefId: def.id,
            sourceInstanceId: front.sourceInstanceId,
            optional: true,
            prompt: `${def.name} — add up to 1 DON!! from your DON!! deck active.`,
            abilityId: "on_play_add_active_don",
          };
          next.pendingChoices.unshift(choice);
          events.push({ type: "pending_choice_added", seat, kind: choice.kind, cardDefId: choice.cardDefId, sourceInstanceId: choice.sourceInstanceId, optional: choice.optional, prompt: choice.prompt });
        }
      } else if (front.abilityId === "on_play_add_active_don") {
        if (intent.accept) {
          const placed = placeDon(player, 1);
          if (placed > 0) events.push({ type: "don_placed", seat, count: placed });
        }
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
    } else if (front.kind === "activate_main" && front.resolutionFrameId) {
      const player = next.players[seat];
      const frameIndex = next.resolutionFrames.findIndex((frame) => frame.id === front.resolutionFrameId);
      const frame = next.resolutionFrames[frameIndex];
      if (!frame) return fail(state, "missing_resolution", "Ability continuation is missing");
      if (intent.accept) {
        const source = findBoardOrStage(player, frame.sourceInstanceId);
        const ability = abilityForCard(frame.sourceDefId, frame.abilityId);
        if (!source || !ability) return fail(state, "bad_source", "Ability source is no longer available");
        const activationError = declarativeActivationError(next, seat, source, ability, typeof frame.bindings.targetId === "string" ? frame.bindings.targetId : undefined);
        if (activationError) return fail(state, "cant_activate", activationError);
        if (intent.handIndex == null) return fail(state, "bad_hand", "Choose a card from your hand to trash");
        const costError = payDeclarativeCosts(next, seat, source, ability, [intent.handIndex], events);
        if (costError) return fail(state, "cant_pay", costError);
        next.resolutionFrames.splice(frameIndex, 1);
        const operationError = executeDeclarativeOperations(next, seat, source, ability, "activate_main", typeof frame.bindings.targetId === "string" ? frame.bindings.targetId : undefined, events);
        if (operationError) return fail(state, "ability_failed", operationError);
      } else {
        next.resolutionFrames.splice(frameIndex, 1);
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
          putInZone(player, "trash", trashed);
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
          putInZone(player, "trash", trashed);
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
        if (front.abilityId === "jinbe_attack_power") {
          const ability = abilityForCard(def.id, front.abilityId);
          const operation = ability?.operations.find((candidate) => candidate.type === "choose_power_modifier");
          if (!ability || operation?.type !== "choose_power_modifier") {
            return fail(state, "unknown_ability", "Character missing attack power hook");
          }
          if (intent.buffTargetId) {
            const target = findBoard(player, intent.buffTargetId);
            if (!target || (operation.excludeSource && target.id === front.sourceInstanceId)) {
              return fail(state, "bad_target", "Choose another friendly Leader or Character");
            }
            target.turnPowerBonus = (target.turnPowerBonus ?? 0) + operation.amount;
            events.push({
              type: "power_buff_applied",
              seat,
              targetDefId: target.defId,
              amount: operation.amount,
              duration: "turn",
            });
          }
        } else if (front.abilityId === "rocks_reveal_draw") {
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
          putInZone(player, "trash", trashed);
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
        } else if (front.abilityId === "copy_opponent_power") {
          const ability = abilityForCard(def.id, front.abilityId);
          if (!ability?.operations.some((operation) => operation.type === "copy_opponent_character_power")) return fail(state, "unknown_ability", "Character missing copy-power ability");
          if (intent.copyPowerTargetId) {
            const target = next.players[otherSeat(seat)].characters.find(
              (character) => character.id === intent.copyPowerTargetId,
            );
            const source = front.sourceInstanceId
              ? findBoard(next.players[seat], front.sourceInstanceId)
              : null;
            if (!target || !source) return fail(state, "bad_target", "Choose an opponent Character");
            source.turnBasePowerOverride = powerOf(next, otherSeat(seat), target);
            source.basePowerOverrideThroughTurn = next.turnNumber;
            events.push({
              type: "power_buff_applied",
              seat,
              targetDefId: source.defId,
              amount: source.turnBasePowerOverride - (getCardDef(source.defId).power ?? 0),
              duration: "turn",
            });
          }
        } else {
          return fail(state, "unknown_ability", "Unknown when-attacking ability");
        }
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "main_play_named_character") {
      const player = next.players[seat];
      const cfg = def.mainPlayNamedThenOpponentLife;
      if (!cfg) return fail(state, "unknown_ability", "Event is missing its play-from-hand hook");
      if (intent.accept) {
        if (
          intent.handIndex == null ||
          intent.handIndex < 0 ||
          intent.handIndex >= player.hand.length
        ) {
          return fail(state, "bad_hand", "Choose a Character from your hand");
        }
        const selected = player.hand[intent.handIndex]!;
        const selectedDef = getCardDef(selected.defId);
        if (selectedDef.type !== "character" || selectedDef.name !== cfg.name) {
          return fail(state, "bad_hand", `Choose a [${cfg.name}] Character`);
        }
        if (player.characters.length >= 5) {
          return fail(state, "board_full", "No open Character area");
        }
        player.hand.splice(intent.handIndex, 1);
        const inst = makeCard(next, selected.defId);
        inst.id = selected.id;
        inst.summoningSick = true;
        player.characters.push(inst);
        events.push({
          type: "card_played",
          seat,
          defId: selected.defId,
          instanceId: inst.id,
          costPaid: 0,
        });
        applyOnPlayEnterPlay(next, seat, inst, selectedDef, events);
      }
      const lifeChoice = makeOpponentLifeChoice(next, seat, front.cardDefId);
      if (lifeChoice) {
        next.pendingChoices.unshift(lifeChoice);
        events.push({
          type: "pending_choice_added",
          seat,
          kind: lifeChoice.kind,
          cardDefId: lifeChoice.cardDefId,
          optional: lifeChoice.optional,
          prompt: lifeChoice.prompt,
        });
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "main_opponent_life_to_hand") {
      if (intent.accept) {
        const opponent = next.players[otherSeat(seat)];
        if (!opponent.life.length) return fail(state, "empty_life", "Opponent has no Life cards");
        const lifeCard = takeFromZone(opponent, "life", 0);
        const lifeId = lifeCard.defId;
        opponent.hand.push(makeCard(next, lifeId, lifeCard.id));
        events.push({ type: "life_taken", seat: otherSeat(seat), defId: lifeId, toHand: true });
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "main_trash_trigger_to_hand") {
      if (intent.accept) {
        if (
          selectedTrashIndex(next.players[seat], front, intent.selectedTrashOptionId) < 0
        ) {
          return fail(state, "bad_target", "Choose an eligible Trigger card from trash");
        }
        const player = next.players[seat];
        const index = selectedTrashIndex(player, front, intent.selectedTrashOptionId);
        if (index < 0) return fail(state, "bad_target", "Selected trash card is missing");
        const returned = takeFromZone(player, "trash", index);
        player.hand.push(makeCard(next, returned.defId, returned.id));
        events.push({ type: "card_revealed", seat, defId: returned.defId, matchedTrait: true });
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "trigger_play_trash_character") {
      const cfg = def.triggerPlayTrashCharacter;
      if (!cfg) return fail(state, "unknown_ability", "Trigger is missing its trash-play hook");
      if (intent.accept) {
        if (selectedTrashIndex(next.players[seat], front, intent.selectedTrashOptionId) < 0) {
          return fail(state, "bad_target", "Choose an eligible Character from trash");
        }
        const player = next.players[seat];
        if (player.characters.length >= 5) return fail(state, "board_full", "No open Character area");
        const index = selectedTrashIndex(player, front, intent.selectedTrashOptionId);
        if (index < 0) return fail(state, "bad_target", "Selected trash card is missing");
        const recovered = takeFromZone(player, "trash", index);
        const cardDefId = recovered.defId;
        const cardDef = getCardDef(cardDefId);
        const played = makeCard(next, cardDefId, recovered.id);
        played.summoningSick = true;
        player.characters.push(played);
        events.push({ type: "card_played", seat, defId: cardDefId, instanceId: played.id, costPaid: 0 });
        applyOnPlayEnterPlay(next, seat, played, cardDef, events);
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "trigger_negate_opponent_card") {
      const cfg = def.triggerNegateOpponent;
      if (!cfg) return fail(state, "unknown_ability", "Trigger is missing its negation hook");
      if (intent.accept) {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose an opponent card");
        const opponent = next.players[otherSeat(seat)];
        const target = cfg.charactersOnly
          ? opponent.characters.find((card) => card.id === intent.buffTargetId)
          : findBoard(opponent, intent.buffTargetId);
        if (!target) return fail(state, "bad_target", "Choose an eligible opponent card");
        target.effectsNegatedThroughTurn = next.turnNumber;
      }
      if (cfg.thenKoCost != null) {
        const choice: PendingChoice = {
          id: alloc(next, "choice"),
          seat,
          kind: "optional_ability",
          cardDefId: def.id,
          optional: true,
          prompt: `${def.name} — K.O. up to 1 of your opponent's Characters with a cost of ${cfg.thenKoCost} or less.`,
          abilityId: "trigger_ko_opponent_cost",
        };
        next.pendingChoices.unshift(choice);
        events.push({
          type: "pending_choice_added",
          seat,
          kind: choice.kind,
          cardDefId: choice.cardDefId,
          optional: choice.optional,
          prompt: choice.prompt,
        });
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "trigger_ko_opponent_cost") {
      const maxCost = def.triggerNegateOpponent?.thenKoCost;
      if (maxCost == null) return fail(state, "unknown_ability", "Trigger is missing its K.O. hook");
      if (intent.accept) {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose an opponent Character");
        const opponent = next.players[otherSeat(seat)];
        const index = opponent.characters.findIndex((card) => card.id === intent.buffTargetId);
        const target = index >= 0 ? opponent.characters[index]! : null;
        if (
          !target ||
          characterFieldCost(next, otherSeat(seat), target) > maxCost ||
          cannotBeKoByOpponentEffect(next, otherSeat(seat), target)
        ) {
          return fail(state, "bad_target", "Choose an eligible opponent Character");
        }
        koCharacterByOpponentEffect(next, seat, otherSeat(seat), target.id, events);
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "teach_negate_leader") {
      const opponent = next.players[otherSeat(seat)];
      if (intent.accept) {
        if (intent.buffTargetId !== opponent.leader.id) {
          return fail(state, "bad_target", "Choose the opponent's Leader");
        }
        opponent.leader.effectsNegatedThroughTurn = next.turnNumber;
      }
      if (opponent.characters.length > 0) {
        const choice: PendingChoice = {
          id: alloc(next, "choice"),
          seat,
          kind: "activate_main",
          cardDefId: front.cardDefId,
          sourceInstanceId: front.sourceInstanceId,
          optional: true,
          prompt: `${def.name} — negate up to 1 opponent Character; it cannot attack through the end of your opponent's next turn.`,
          abilityId: "teach_negate_character",
        };
        next.pendingChoices.unshift(choice);
        events.push({
          type: "pending_choice_added",
          seat,
          kind: choice.kind,
          cardDefId: choice.cardDefId,
          sourceInstanceId: choice.sourceInstanceId,
          optional: choice.optional,
          prompt: choice.prompt,
        });
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "teach_negate_character") {
      if (intent.accept) {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose an opponent Character");
        const target = next.players[otherSeat(seat)].characters.find(
          (card) => card.id === intent.buffTargetId,
        );
        if (!target) return fail(state, "bad_target", "Choose an opponent Character");
        target.effectsNegatedThroughTurn = next.turnNumber + 1;
        target.cannotAttackThroughTurn = next.turnNumber + 1;
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "on_ko_return_don_add_life") {
      const cfg = def.onKoReturnDonAddLife;
      if (!cfg) return fail(state, "unknown_ability", "Card is missing its On K.O. DON!! hook");
      if (intent.accept) {
        const ids = intent.selectedDonIds ?? [];
        if (
          ids.length !== cfg.returnDon ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !front.donOptions?.some((option) => option.id === id))
        ) {
          return fail(state, "bad_don", `Choose exactly ${cfg.returnDon} DON!! card`);
        }
        const player = next.players[seat];
        for (const id of ids) {
          const costIndex = player.costArea.findIndex((don) => don.id === id);
          if (costIndex >= 0) {
            const [don] = player.costArea.splice(costIndex, 1);
            don.rested = false;
            don.attachedTo = null;
            player.donDeck.push(don);
            continue;
          }
          const attachedIndex = player.attachedDons.findIndex((don) => don.id === id);
          if (attachedIndex < 0) return fail(state, "bad_don", "Selected DON!! is no longer on your field");
          const [don] = player.attachedDons.splice(attachedIndex, 1);
          const attached = don.attachedTo ? findBoardOrStage(player, don.attachedTo) : null;
          if (attached) attached.attachedDonIds = attached.attachedDonIds.filter((donId) => donId !== id);
          don.rested = false;
          don.attachedTo = null;
          player.donDeck.push(don);
        }
        if (!addDeckTopToLife(next, seat, events)) {
          return fail(state, "empty_deck", "No card to add to Life");
        }
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "on_ko_revive_self") {
      const cfg = def.onKoReviveSelf;
      if (!cfg) return fail(state, "unknown_ability", "Card is missing its On K.O. revival hook");
      if (intent.accept) {
        const player = next.players[seat];
        if (intent.handIndex == null || intent.handIndex < 0 || intent.handIndex >= player.hand.length) {
          return fail(state, "bad_hand", "Choose a card from your hand to trash");
        }
        const handCard = player.hand[intent.handIndex]!;
        if (!(getCardDef(handCard.defId).traits ?? []).some((trait) => trait.includes(cfg.trashHandTrait))) {
          return fail(state, "bad_hand", `Choose a {${cfg.trashHandTrait}} card`);
        }
        const trashIndex = front.sourceInstanceId ? player.zoneInstanceIds.trash.indexOf(front.sourceInstanceId) : -1;
        if (trashIndex < 0 || player.trash[trashIndex] !== def.id || player.characters.length >= 5) {
          return fail(state, "cant_revive", "This Character cannot be played from trash now");
        }
        player.hand.splice(intent.handIndex, 1);
        putInZone(player, "trash", handCard);
        const recovered = takeFromZone(player, "trash", trashIndex);
        const revived = makeCard(next, def.id, recovered.id);
        revived.summoningSick = true;
        player.characters.push(revived);
        events.push({ type: "card_played", seat, defId: def.id, instanceId: revived.id, costPaid: 0 });
        applyOnPlayEnterPlay(next, seat, revived, def, events);
      }
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "marco_removal_replacement") {
      const player = next.players[seat];
      const source = front.sourceInstanceId
        ? player.characters.find((card) => card.id === front.sourceInstanceId)
        : null;
      const target = front.replacementTargetId
        ? player.characters.find((card) => card.id === front.replacementTargetId)
        : null;
      if (!source || !target || !getCardDef(source.defId).removalReplacementSelfKo) {
        return fail(state, "stale_choice", "Replacement source or target is no longer on the field");
      }
      removeCharacterAsKo(next, seat, intent.accept ? source.id : target.id, events);
      events.push({
        type: "pending_choice_resolved",
        seat,
        kind: front.kind,
        cardDefId: front.cardDefId,
        accepted: intent.accept,
      });
    } else if (front.abilityId === "on_ko_set_base_power") {
      const cfg = def.onKoLeaderBasePower;
      if (!cfg) return fail(state, "unknown_ability", "Card is missing its base-power hook");
      if (intent.accept) {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose your Leader or Character");
        const target = findBoard(next.players[seat], intent.buffTargetId);
        if (!target) return fail(state, "bad_target", "Choose your Leader or Character");
        target.turnBasePowerOverride = cfg.basePower;
        target.basePowerOverrideThroughTurn = next.turnNumber;
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "on_ko_ko_opponent_cost") {
      const cfg = def.onKoOpponentKoCost;
      if (!cfg) return fail(state, "unknown_ability", "Card is missing its On K.O. K.O. hook");
      if (intent.accept) {
        const ids = intent.targetIds ?? [];
        if (ids.length < 1 || ids.length > cfg.maxTargets || new Set(ids).size !== ids.length) {
          return fail(state, "bad_target", `Choose 1 to ${cfg.maxTargets} Characters`);
        }
        const opponent = next.players[otherSeat(seat)];
        for (const id of ids) {
          const target = opponent.characters.find((character) => character.id === id);
          if (
            !target ||
            characterFieldCost(next, otherSeat(seat), target) > cfg.cost ||
            cannotBeKoByOpponentEffect(next, otherSeat(seat), target)
          ) {
            return fail(state, "bad_target", "Choose eligible opponent Characters");
          }
        }
        for (const id of ids) koCharacterByOpponentEffect(next, seat, otherSeat(seat), id, events);
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "on_ko_rest_opponent_cost") {
      const cfg = def.onKoOpponentRestCost;
      if (!cfg) return fail(state, "unknown_ability", "Card is missing its On K.O. rest hook");
      if (intent.accept) {
        const ids = intent.targetIds ?? [];
        if (ids.length < 1 || ids.length > cfg.maxTargets || new Set(ids).size !== ids.length) {
          return fail(state, "bad_target", `Choose 1 to ${cfg.maxTargets} Characters`);
        }
        const opponent = next.players[otherSeat(seat)];
        const targets = ids.map((id) => opponent.characters.find((character) => character.id === id));
        if (targets.some((target) => !target || target.rested || characterFieldCost(next, otherSeat(seat), target) > cfg.cost)) {
          return fail(state, "bad_target", "Choose eligible active opponent Characters");
        }
        for (const target of targets) target!.rested = true;
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "counter_friendly_power") {
      const cfg = def.counterFriendlyPower;
      if (!cfg) return fail(state, "unknown_ability", "Counter Event is missing its target hook");
      if (intent.accept) {
        if (!intent.buffTargetId) return fail(state, "bad_target", "Choose a friendly card");
        const player = next.players[seat];
        const target = findBoard(player, intent.buffTargetId);
        if (!target) return fail(state, "bad_target", "Choose a friendly Leader or Character");
        const targetDef = getCardDef(target.defId);
        const isLeader = target.id === player.leader.id;
        if (
          (cfg.charactersOnly && isLeader && targetDef.name !== cfg.allowedLeaderName) ||
          (cfg.requiredTrait && !(targetDef.traits ?? []).includes(cfg.requiredTrait))
        ) {
          return fail(state, "bad_target", "Choose an eligible friendly card");
        }
        target.battlePowerBonus = (target.battlePowerBonus ?? 0) + cfg.power;
      }
      if (def.counterRestDonOpponentAllPenalty && activeDons(next.players[seat]).length >= def.counterRestDonOpponentAllPenalty.restDon) {
        const options = activeDons(next.players[seat]).map((don) => ({ id: don.id, rested: don.rested, attachedTo: don.attachedTo }));
        const choice: PendingChoice = {
          id: alloc(next, "choice"), seat, kind: "optional_ability", cardDefId: def.id, optional: true,
          prompt: `${def.name} — rest ${def.counterRestDonOpponentAllPenalty.restDon} DON!! to give all opponent cards -${def.counterRestDonOpponentAllPenalty.power} power this turn?`,
          abilityId: "counter_rest_don_opponent_all", donOptions: options, privateToSeat: seat,
        };
        next.pendingChoices.unshift(choice);
        events.push({ type: "pending_choice_added", seat, kind: choice.kind, cardDefId: choice.cardDefId, optional: choice.optional, prompt: choice.prompt, privateToSeat: seat });
      } else if (def.counterOpponentTargetPenalty) {
        const choice: PendingChoice = {
          id: alloc(next, "choice"), seat, kind: "optional_ability", cardDefId: def.id, optional: true,
          prompt: `${def.name} — give up to 1 opposing Leader or Character -${def.counterOpponentTargetPenalty} power this turn.`,
          abilityId: "counter_opponent_target_power",
        };
        next.pendingChoices.unshift(choice);
        events.push({ type: "pending_choice_added", seat, kind: choice.kind, cardDefId: choice.cardDefId, optional: choice.optional, prompt: choice.prompt });
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "counter_rest_don_opponent_all") {
      const cfg = def.counterRestDonOpponentAllPenalty;
      if (!cfg) return fail(state, "unknown_ability", "Counter Event is missing its DON!! follow-up");
      if (intent.accept) {
        const ids = intent.selectedDonIds ?? [];
        if (ids.length !== cfg.restDon || new Set(ids).size !== ids.length) return fail(state, "bad_don", `Choose exactly ${cfg.restDon} DON!!`);
        const player = next.players[seat];
        for (const id of ids) {
          const don = player.costArea.find((entry) => entry.id === id && !entry.rested);
          if (!don || !front.donOptions?.some((option) => option.id === id)) return fail(state, "bad_don", "Choose active DON!! cards");
          don.rested = true;
        }
        const opponent = next.players[otherSeat(seat)];
        for (const target of [opponent.leader, ...opponent.characters]) {
          target.turnPowerBonus = (target.turnPowerBonus ?? 0) - cfg.power;
        }
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "counter_opponent_target_power") {
      if (intent.accept) {
        if (!intent.buffTargetId || !def.counterOpponentTargetPenalty) return fail(state, "bad_target", "Choose an opponent card");
        const target = findBoard(next.players[otherSeat(seat)], intent.buffTargetId);
        if (!target) return fail(state, "bad_target", "Choose an opponent Leader or Character");
        target.turnPowerBonus = (target.turnPowerBonus ?? 0) - def.counterOpponentTargetPenalty;
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
    } else if (front.abilityId === "trigger_friendly_power") {
      if (intent.accept) {
        if (!intent.buffTargetId || def.triggerFriendlyPowerBonus == null) return fail(state, "bad_target", "Choose a friendly card");
        const target = findBoard(next.players[seat], intent.buffTargetId);
        if (!target) return fail(state, "bad_target", "Choose a friendly Leader or Character");
        target.turnPowerBonus = (target.turnPowerBonus ?? 0) + def.triggerFriendlyPowerBonus;
      }
      events.push({ type: "pending_choice_resolved", seat, kind: front.kind, cardDefId: front.cardDefId, accepted: intent.accept });
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
      if (effectsAreNegated(next, blocker) || !cardHasKeyword(next, seat, blocker, "blocker")) {
        return fail(state, "not_blocker", "No Blocker keyword");
      }
      const attackerSeat = next.battle.attackerSeat;
      const rogerOnAttackerField = next.players[attackerSeat].characters.some(
        (character) => character.defId === "OP09-118",
      );
      if (
        rogerOnAttackerField &&
        (next.players[attackerSeat].life.length === 0 || player.life.length === 0)
      ) {
        next.winner = attackerSeat;
        next.winReason = "leader_battle_at_zero_life";
        next.phase = "game_over";
        next.battle = null;
        events.push({ type: "game_over", winner: attackerSeat, reason: "leader_battle_at_zero_life" });
        return done();
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
      const counter = counterValue(next, seat, def);
      if (counter <= 0) {
        return fail(state, "no_counter", "No counter value");
      }
      player.hand.splice(intent.handIndex, 1);
      putInZone(player, "trash", card);
      next.battle.defenderPowerBonus += counter;
      if (def.counterOpponentPowerPenalty) {
        next.battle.attackerPowerBonus -= def.counterOpponentPowerPenalty;
      }
      events.push({ type: "counter_applied", seat, defId: card.defId, bonus: counter });
      return done();
    }
    if (intent.type === "counter_event") {
      const card = player.hand[intent.handIndex];
      if (!card) return fail(state, "bad_hand", "Bad hand index");
      const def = getCardDef(card.defId);
      if (def.type !== "event" || def.eventTiming !== "counter") {
        return fail(state, "not_counter_event", "Not a counter event");
      }
      if (!canResolveCounterEvent(def)) {
        return fail(state, "unsupported_effect", "This Counter Event is not implemented yet");
      }
      if (!payCost(player, def.cost)) return fail(state, "cant_pay", "Not enough DON!!");
      player.hand.splice(intent.handIndex, 1);
      putInZone(player, "trash", card);
      const bonus = def.counterPowerBonus ?? 0;
      if (def.counterFriendlyPower) {
        enqueuePendingChoices(
          next,
          [{
            id: alloc(next, "choice"),
            seat,
            kind: "optional_ability",
            cardDefId: def.id,
            optional: true,
            prompt: `${def.name} — give up to 1 eligible friendly card +${def.counterFriendlyPower.power} power this battle.`,
            abilityId: "counter_friendly_power",
          }],
          next.battle.attackerSeat,
          events,
        );
      } else {
        next.battle.defenderPowerBonus += bonus;
      }
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
    if (effectsAreNegated(next, player.leader)) {
      return fail(state, "effects_negated", "Leader effects are negated");
    }
    if (!leaderDef.leaderActivateGiveRestedDon) {
      return fail(state, "no_activate", "Leader has no Activate:Main");
    }
    if (player.leaderActivatedThisTurn) {
      return fail(state, "once_per_turn", "Activate:Main already used");
    }
    const target = findBoard(player, intent.targetId);
    if (!target) return fail(state, "bad_target", "Invalid Activate:Main target");
    if (!attachOneRestedDon(next, seat, target, events)) {
      return fail(state, "no_rested_don", "Need a rested DON!!");
    }
    player.leaderActivatedThisTurn = true;
    return done();
  }

  if (intent.type === "activate_ability") {
    const source = findBoardOrStage(player, intent.sourceId);
    if (!source) return fail(state, "bad_source", "Invalid ability source");

    if (intent.abilityId === ABILITY_LEADER_GIVE_RESTED_DON) {
      if (source.id !== player.leader.id) {
        return fail(state, "bad_source", "Ability source must be Leader");
      }
      if (effectsAreNegated(next, source)) {
        return fail(state, "effects_negated", "Leader effects are negated");
      }
      const leaderDef = getCardDef(player.leader.defId);
      if (!leaderDef.leaderActivateGiveRestedDon) {
        return fail(state, "no_activate", "Leader has no Activate:Main");
      }
      if (player.leaderActivatedThisTurn) {
        return fail(state, "once_per_turn", "Activate:Main already used");
      }
      if (intent.targetId == null) {
        return fail(state, "bad_target", "Activate:Main needs a target");
      }
      const target = findBoard(player, intent.targetId);
      if (!target) return fail(state, "bad_target", "Invalid Activate:Main target");
      if (!attachOneRestedDon(next, seat, target, events)) {
        return fail(state, "no_rested_don", "Need a rested DON!!");
      }
      player.leaderActivatedThisTurn = true;
      return done();
    }

    const declarativeAbility = abilityForCard(source.defId, intent.abilityId);
    if (declarativeAbility?.windows.includes("activate_main")) {
      const activationError = declarativeActivationError(next, seat, source, declarativeAbility, intent.targetId);
      if (activationError) return fail(state, activationError.includes("rested DON") ? "no_rested_don" : "cant_activate", activationError);
      const handCost = declarativeAbility.costs.find((cost) => cost.type === "trash_hand");
      if (handCost?.type === "trash_hand") {
        const frameId = alloc(next, "frame");
        next.resolutionFrames.push({ id: frameId, seat, sourceInstanceId: source.id, sourceDefId: source.defId, abilityId: declarativeAbility.id, window: "activate_main", operationIndex: 0, bindings: { targetId: intent.targetId ?? null } });
        enqueuePendingChoices(next, [{ id: alloc(next, "choice"), resolutionFrameId: frameId, seat, kind: "activate_main", cardDefId: source.defId, sourceInstanceId: source.id, optional: true, prompt: `${getCardDef(source.defId).name} — trash ${handCost.count} card from your hand to activate this ability?`, abilityId: "fullalead_search_cost", handSelection: { count: handCost.count }, privateToSeat: seat }], seat, events);
        return done();
      }
      const costError = payDeclarativeCosts(next, seat, source, declarativeAbility, [], events);
      if (costError) return fail(state, "cant_pay", costError);
      const operationError = executeDeclarativeOperations(next, seat, source, declarativeAbility, "activate_main", intent.targetId, events);
      if (operationError) return fail(state, "ability_failed", operationError);
      return done();
    }

    if (intent.abilityId === "teach_negate_opponent") {
      const sourceDef = getCardDef(source.defId);
      if (
        !sourceDef.activateMainNegateOpponent ||
        source.id === player.leader.id ||
        source.id === player.stage?.id ||
        !source.summoningSick ||
        source.abilityUsedThisTurn ||
        effectsAreNegated(next, source) ||
        !leaderHasTrait(next, seat, "Blackbeard Pirates")
      ) {
        return fail(state, "cant_activate", "Teach cannot activate this ability now");
      }
      source.abilityUsedThisTurn = true;
      enqueuePendingChoices(
        next,
        [
          {
            id: alloc(next, "choice"),
            seat,
            kind: "activate_main",
            cardDefId: source.defId,
            sourceInstanceId: source.id,
            optional: true,
            prompt: `${sourceDef.name} — negate your opponent's Leader effects during this turn?`,
            abilityId: "teach_negate_leader",
          },
        ],
        seat,
        events,
      );
      return done();
    }

    return fail(state, "unknown_ability", `Unknown ability ${intent.abilityId}`);
  }

  if (intent.type === "play_card") {
    const card = player.hand[intent.handIndex];
    if (!card) return fail(state, "bad_hand", "Bad hand index");
    const def = getCardDef(card.defId);
    if (def.type === "event" && def.eventTiming === "counter") {
      return fail(state, "counter_only", "Counter event not playable in Main");
    }
    if (def.type === "event" && def.eventTiming === "main" && !canResolveMainEvent(def)) {
      return fail(state, "unsupported_effect", "This Main Event is not implemented yet");
    }
    const playCost =
      def.type === "character" ? characterPlayCost(next, seat, def) : def.cost;
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
        putInZone(player, "trash", trashed);
        events.push({ type: "character_trashed_for_space", seat, defId: trashed.defId });
      }
      const inst = makeCard(next, card.defId);
      inst.id = card.id;
      // Official: Characters cannot attack the turn they enter play unless Rush.
      inst.summoningSick = true;
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
        putInZone(player, "trash", player.stage);
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
      applyOnPlayEnterPlay(next, seat, inst, def, events);
      return done();
    }

    if (def.type === "event" && def.eventTiming === "main") {
      putInZone(player, "trash", card);
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
      const trashReturn = def.mainTrashTriggerToHand;
      if (
        trashReturn &&
        (getCardDef(next.players[seat].leader.defId).traits ?? []).includes("Blackbeard Pirates")
      ) {
        const trashOptions = player.trash.map((defId, index) => ({
          id: alloc(next, "trashOption"),
          instanceId: player.zoneInstanceIds.trash[index],
          defId,
          eligible: defId !== trashReturn.excludeDefId && cardHasTrigger(getCardDef(defId)),
        }));
        if (trashOptions.some((option) => option.eligible)) {
          enqueuePendingChoices(
            next,
            [
              {
                id: alloc(next, "choice"),
                seat,
                kind: "optional_ability",
                cardDefId: def.id,
                optional: true,
                prompt: `${def.name} — add up to 1 non-${def.name} [Trigger] card from trash to hand.`,
                abilityId: "main_trash_trigger_to_hand",
                trashOptions,
                privateToSeat: seat,
              },
            ],
            seat,
            events,
          );
        }
      }
      for (const ability of abilitiesForCard(def.id).filter((candidate) => candidate.windows.includes("main"))) {
        if (!ability.conditions.every((condition) => continuousConditionMatches(next, seat, card, condition))) continue;
        const error = executeDeclarativeOperations(next, seat, card, ability, "main", undefined, events);
        if (error) return fail(state, "ability_resolution_failed", error);
      }
      if (def.mainSearchTop) {
        enqueuePendingChoices(next, [makeTopDeckSearchChoice(next, seat, def.id, card.id, def.mainSearchTop)], seat, events);
      }
      const playNamed = def.mainPlayNamedThenOpponentLife;
      if (
        playNamed &&
        player.costArea.length + player.attachedDons.length >= playNamed.requiredDonOnField
      ) {
        const canPlay =
          player.characters.length < 5 &&
          player.hand.some((entry) => {
            const entryDef = getCardDef(entry.defId);
            return entryDef.type === "character" && entryDef.name === playNamed.name;
          });
        const choice: PendingChoice | null = canPlay
          ? {
              id: alloc(next, "choice"),
              seat,
              kind: "optional_ability",
              cardDefId: def.id,
              optional: true,
              prompt: `${def.name} — play up to 1 [${playNamed.name}] from your hand.`,
              abilityId: "main_play_named_character",
              privateToSeat: seat,
            }
          : makeOpponentLifeChoice(next, seat, def.id);
        if (choice) enqueuePendingChoices(next, [choice], seat, events);
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
    if (
      attacker.id !== player.leader.id &&
      (attacker.cannotAttackThroughTurn ?? -1) >= next.turnNumber
    ) {
      return fail(state, "cannot_attack", "Character cannot attack this turn");
    }
    if (
      attacker.id !== player.leader.id &&
      attacker.summoningSick &&
      (effectsAreNegated(next, attacker) || !cardHasRush(next, seat, attacker))
    ) {
      return fail(state, "summoning_sick", "Character cannot attack the turn it entered play");
    }
    if (
      intent.target.kind === "leader" &&
      attacker.id !== player.leader.id &&
      !canAttackLeaderImmediately(next, seat, attacker)
    ) {
      return fail(state, "rush_character_only", "Rush: Character cannot attack a Leader this turn");
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
    for (const participant of next.players) for (const card of [participant.leader, ...participant.characters]) if ((card.basePowerOverrideThroughTurn ?? next.turnNumber) <= next.turnNumber) {
      delete card.turnBasePowerOverride;
      delete card.basePowerOverrideThroughTurn;
    }
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
    if (front.kind === "search_top_deck") {
      out.push({
        type: "resolve_pending_choice",
        accept: true,
        orderedOptionIds: (front.search?.options ?? []).map((option) => option.id),
      });
      return out;
    }
    if (front.kind === "when_attacking" && front.abilityId === "jinbe_attack_power") {
      // Choosing no target is legal for "up to 1" and is the timer fallback.
      out.push({ type: "resolve_pending_choice", accept: true });
      return out;
    }
    if (pendingChoiceNeedsStructuredIntent(front)) {
      // Mandatory structured prompts need hand/target picks — no bare accept for timers.
      if (!front.optional) return out;
      // Optional structured: Accept/Decline; client supplies fields when accepting.
      out.push({ type: "resolve_pending_choice", accept: true });
      out.push({ type: "resolve_pending_choice", accept: false });
      return out;
    }
    out.push({ type: "resolve_pending_choice", accept: true });
    if (front.optional) out.push({ type: "resolve_pending_choice", accept: false });
    return out;
  }

  if (state.phase === "block" && state.battle && seat !== state.battle.attackerSeat) {
    out.push({ type: "pass_block" });
    for (const c of player.characters) {
      if (!c.rested && !effectsAreNegated(state, c) && cardHasKeyword(state, seat, c, "blocker")) {
        out.push({ type: "declare_block", blockerId: c.id });
      }
    }
    return out;
  }

  if (state.phase === "counter" && state.battle && seat !== state.battle.attackerSeat) {
    out.push({ type: "pass_counter" });
    player.hand.forEach((c, handIndex) => {
      const def = getCardDef(c.defId);
      if (counterValue(state, seat, def) > 0) out.push({ type: "counter_from_hand", handIndex });
      if (canResolveCounterEvent(def)) {
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
    !effectsAreNegated(state, player.leader) &&
    !player.leaderActivatedThisTurn &&
    player.costArea.some((d) => d.rested)
  ) {
    for (const t of [player.leader, ...player.characters]) {
      out.push({
        type: "activate_ability",
        sourceId: player.leader.id,
        abilityId: ABILITY_LEADER_GIVE_RESTED_DON,
        targetId: t.id,
      });
    }
  }

  if (
    player.stage &&
    abilityForCard(player.stage.defId, ABILITY_STAGE_TRASH_GIVE_RESTED_DON)
  ) {
    const stageId = player.stage.id;
    out.push({
      type: "activate_ability",
      sourceId: stageId,
      abilityId: ABILITY_STAGE_TRASH_GIVE_RESTED_DON,
    });
    if (player.costArea.some((d) => d.rested)) for (const t of [player.leader, ...player.characters]) {
      out.push({
        type: "activate_ability",
        sourceId: stageId,
        abilityId: ABILITY_STAGE_TRASH_GIVE_RESTED_DON,
        targetId: t.id,
      });
    }
  }

  for (const character of player.characters) {
    const ability = abilityForCard(character.defId, ABILITY_LAFFITTE_SEARCH);
    const restDon = ability?.costs.find((cost) => cost.type === "rest_don");
    if (
      ability &&
      !character.rested &&
      !effectsAreNegated(state, character) &&
      activeDons(player).length >= (restDon?.type === "rest_don" ? restDon.count : 0)
    ) {
      out.push({
        type: "activate_ability",
        sourceId: character.id,
        abilityId: ABILITY_LAFFITTE_SEARCH,
      });
    }
  }

  for (const character of player.characters) {
    const def = getCardDef(character.defId);
    if (
      def.activateMainNegateOpponent &&
      character.summoningSick &&
      !character.abilityUsedThisTurn &&
      !effectsAreNegated(state, character) &&
      leaderHasTrait(state, seat, "Blackbeard Pirates")
    ) {
      out.push({
        type: "activate_ability",
        sourceId: character.id,
        abilityId: "teach_negate_opponent",
      });
    }
  }

  if (player.stage && !player.stage.rested && player.hand.length > 0) {
    const ability = abilityForCard(player.stage.defId, ABILITY_FULLALEAD_SEARCH);
    if (ability) {
      out.push({
        type: "activate_ability",
        sourceId: player.stage.id,
        abilityId: ABILITY_FULLALEAD_SEARCH,
      });
    }
  }

  player.hand.forEach((c, handIndex) => {
    const def = getCardDef(c.defId);
    if (def.type === "event" && def.eventTiming === "counter") return;
    if (def.type === "event" && def.eventTiming === "main" && !canResolveMainEvent(def)) return;
    const need =
      def.type === "character" ? characterPlayCost(state, seat, def) : def.cost;
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
      if ((c.cannotAttackThroughTurn ?? -1) >= state.turnNumber) return false;
      if (
        c.id !== player.leader.id &&
        c.summoningSick &&
        (effectsAreNegated(state, c) || !cardHasRush(state, seat, c))
      ) return false;
      return true;
    });
    const opp = state.players[otherSeat(seat)];
    for (const a of attackers) {
      const aDef = getCardDef(a.defId);
      if (a.id === player.leader.id || canAttackLeaderImmediately(state, seat, a)) {
        out.push({ type: "declare_attack", attackerId: a.id, target: { kind: "leader" } });
      }
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
    if (effectsAreNegated(state, c)) statuses.push("Effects negated");
    if ((c.cannotAttackThroughTurn ?? -1) >= state.turnNumber) statuses.push("Cannot attack");
    const rush = !effectsAreNegated(state, c) && cardHasRush(state, s, c);
    if (c.summoningSick && !rush) statuses.push("Summoning sick");
    if (rush) statuses.push("Rush");
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
      fieldCost: def.type === "character" ? characterFieldCost(state, s, c) : def.cost,
      summoningSick: Boolean(c.summoningSick && !rush),
      rush,
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
            row.playCost = characterPlayCost(state, seat, def);
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
      faceUpLife: you.life.flatMap((defId, index) => you.faceUpLife[index] ? [{ index, defId }] : []),
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
      faceUpLife: opp.life.flatMap((defId, index) => opp.faceUpLife[index] ? [{ index, defId }] : []),
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
    pendingChoices: state.pendingChoices.map((choice) => projectPendingChoice(choice, seat)),
    /**
     * @deprecated Back-compat for older clients (e.g. mobile): the front
     * pending choice in its original `{ seat, cardDefId }` shape when it's a
     * life trigger, else `null`. New clients should read `pendingChoices`.
     */
    pendingTrigger:
      state.pendingChoices[0]?.kind === "life_trigger"
        ? {
            seat: state.pendingChoices[0].seat,
            cardDefId:
              state.pendingChoices[0].seat === seat
                ? state.pendingChoices[0].cardDefId
                : "HIDDEN",
          }
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
    pendingChoices: state.pendingChoices.map((choice) => projectPendingChoice(choice, null)),
    pendingTrigger:
      state.pendingChoices[0]?.kind === "life_trigger"
        ? { seat: state.pendingChoices[0].seat, cardDefId: "HIDDEN" }
        : null,
    legalIntents: [] as Intent[],
  };
}

function projectPendingChoice(choice: PendingChoice, viewerSeat: Seat | null): PendingChoice {
  const projected = structuredClone(choice) as PendingChoice;
  delete projected.resolutionFrameId;
  if (projected.trashOptions) projected.trashOptions = projected.trashOptions.map(({ instanceId: _internal, ...option }) => option);
  if (projected.unorderedChoices) {
    projected.unorderedChoices = projected.unorderedChoices.map((nested) =>
      projectPendingChoice(nested, viewerSeat),
    );
  }
  if (projected.search && projected.privateToSeat !== viewerSeat) {
    projected.optionCount = projected.search.options.length;
    delete projected.search;
  }
  if (projected.privateToSeat !== viewerSeat) {
    delete projected.trashOptions;
    delete projected.donOptions;
  }
  if (projected.hideCardDefFromOthers && projected.privateToSeat !== viewerSeat) {
    projected.cardDefId = "HIDDEN";
    projected.prompt = "Opponent is resolving a private card choice.";
  }
  return projected;
}

/** Viewer-specific event projection for hidden Life and private pending choices. */
export function projectGameEvents(
  events: readonly GameEvent[],
  viewerSeat: Seat | null,
): GameEvent[] {
  return events.map((event) => {
    if (event.type === "life_added" && !event.faceUp) {
      return { ...event, defId: "HIDDEN" };
    }
    if (
      (event.type === "life_taken" || event.type === "trigger_available") &&
      viewerSeat !== event.seat
    ) {
      return { ...event, defId: "HIDDEN" };
    }
    if (
      (event.type === "pending_choice_added" || event.type === "pending_choice_resolved") &&
      event.hideCardDefFromOthers &&
      event.privateToSeat !== viewerSeat
    ) {
      return event.type === "pending_choice_added"
        ? {
            ...event,
            cardDefId: "HIDDEN",
            prompt: "Opponent is resolving a private card choice.",
          }
        : { ...event, cardDefId: "HIDDEN" };
    }
    return structuredClone(event) as GameEvent;
  });
}

export function assertInvariants(state: MatchState): void {
  for (const seat of [0, 1] as Seat[]) {
    const p = state.players[seat];
    if (p.faceUpLife.length !== p.life.length) throw new Error(`life visibility mismatch seat ${seat}`);
    if (p.zoneInstanceIds.deck.length !== p.deck.length || p.zoneInstanceIds.trash.length !== p.trash.length || p.zoneInstanceIds.life.length !== p.life.length) throw new Error(`zone identity mismatch seat ${seat}`);
    const cardIds = [p.leader.id, ...p.characters.map((card) => card.id), ...(p.stage ? [p.stage.id] : []), ...p.hand.map((card) => card.id), ...p.zoneInstanceIds.deck, ...p.zoneInstanceIds.trash, ...p.zoneInstanceIds.life];
    if (new Set(cardIds).size !== cardIds.length) throw new Error(`duplicate card instance id seat ${seat}`);
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
