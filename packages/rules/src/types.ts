import type { Rng } from "./rng.js";

export type Seat = 0 | 1;
export type InstanceId = string;
export type CardDefId = string;

export type Phase =
  | "mulligan"
  | "refresh"
  | "draw"
  | "don"
  | "main"
  | "block"
  | "counter"
  | "damage"
  | "game_over";

export type CardType = "leader" | "character" | "event" | "stage";

export interface CardDef {
  id: CardDefId;
  name: string;
  type: CardType;
  colors: string[];
  cost: number;
  power?: number;
  life?: number;
  counter?: number;
  eventTiming?: "main" | "counter";
  stageLeaderPowerBonus?: number;
  counterPowerBonus?: number;
  /** Counter effect that temporarily reduces the attacking opponent's power. */
  counterOpponentPowerPenalty?: number;
  counterFriendlyPower?: {
    power: number;
    charactersOnly?: boolean;
    allowedLeaderName?: string;
    requiredTrait?: string;
  };
  counterRestDonOpponentAllPenalty?: { restDon: number; power: number };
  counterOpponentTargetPenalty?: number;
  mainDraw?: number;
  triggerDraw?: number;
  /** Trigger draw only resolves when the controller's Leader is multicolored. */
  /** Trigger draws cards, then requires cards to be trashed from hand. */
  triggerDrawThenTrash?: { draw: number; trash: number };
  /** Trigger may play a qualifying Character from trash after other Trigger operations. */
  triggerPlayTrashCharacter?: { trait: string; cost: number };
  /** Trigger gives the controller's Leader a temporary power bonus. */
  triggerLeaderPowerBonus?: number;
  /** Trigger gives a chosen friendly Leader/Character a temporary power bonus. */
  triggerFriendlyPowerBonus?: number;
  /** Trigger may negate an opposing Leader/Character, optionally followed by a cost-limited K.O. */
  triggerNegateOpponent?: { charactersOnly?: boolean; thenKoCost?: number };
  /** Trigger resolves this card's printed Main effect. */
  triggerActivateMain?: boolean;
  /** Trigger resolves this card's printed On Play effect. */
  triggerActivateOnPlay?: boolean;
  /** Trigger resolves this card's printed On K.O. effect. */
  triggerActivateOnKo?: boolean;
  /**
   * Leader Activate: Main [Once Per Turn] — attach 1 rested DON!! from cost
   * area to this Leader or one of your Characters (ST01-001).
   */
  leaderActivateGiveRestedDon?: boolean;
  /**
   * Stage Activate: Main — trash this Stage, then attach 1 rested DON!! from
   * cost area to Leader or a Character (OP16-021 Moby Dick).
   */
  stageActivateTrashGiveRestedDon?: boolean;
  /**
   * [On Play] optional draw hook — you may draw this many cards when the
   * character enters play. Demonstrates the generic pending-choice/prompt
   * framework end to end; not every On Play effect is implemented yet.
   */
  onPlayOptionalDraw?: number;
  /** Auto-draw when this Character enters play (before On Play prompts). */
  onPlayDraw?: number;
  /** Optional: add deck top to Life when controller has ≤ maxLife life cards. */
  onPlayLowLifeAddLife?: { maxLife: number };
  /** After onPlayDraw, optional: own deck top → Life or opp Life top → opp hand. */
  onPlayDrawThenLifeChoice?: boolean;
  /** After onPlayDraw, pick a hand card for deck top, then add 1 active DON!!. */
  onPlayDrawHandToDeckDon?: boolean;
  /** Generic top-deck search performed when this card enters play. */
  onPlaySearchTop?: TopDeckSearchEffect;
  /** On Play, trash a hand card to move an eligible card from trash to Life. */
  onPlayTrashHandToLife?: { requiredLeaderTrait?: string; maxCost: number };
  /** On Play, reveal qualifying Characters, draw cards, then trash cards. */
  onPlayRevealDrawTrash?: {
    revealCount: number;
    revealPower: number;
    draw: number;
    trash: number;
  };
  /** Generic top-deck search performed by this card's Activate:Main. */
  activateMainSearchTop?: ActivateMainSearchEffect;
  /** Generic top-deck search performed by this Event's [Main] effect. */
  mainSearchTop?: TopDeckSearchEffect;
  /** Main effect that returns the first eligible Trigger card from trash to hand. */
  mainTrashTriggerToHand?: { excludeDefId?: CardDefId };
  /** Main effect that may play a named Character from hand, then take opponent Life. */
  mainPlayNamedThenOpponentLife?: { name: string; requiredDonOnField: number };
  /** Activate: Main Teach effect-negation sequence. */
  activateMainNegateOpponent?: boolean;
  /** Automatic draw performed by this Character's On K.O. effect. */
  onKoDraw?: number;
  onKoDrawRequiredLeaderTrait?: string;
  /** On K.O., replace the controller's Leader base power for the turn. */
  onKoLeaderBasePower?: { basePower: number; requiredLeaderTrait?: string };
  /** On K.O., K.O. up to N opponent Characters at or below a cost. */
  onKoOpponentKoCost?: { cost: number; maxTargets: number; requiredLeaderTrait?: string };
  /** On K.O., rest up to N opponent Characters at or below a cost. */
  onKoOpponentRestCost?: { cost: number; maxTargets: number };
  /** On K.O., repeat this card's configured top-deck search. */
  onKoSearchTop?: boolean;
  /** On K.O., return DON!! from field to the DON!! deck to add deck top to Life. */
  onKoReturnDonAddLife?: { returnDon: number };
  /** On K.O., trash a trait-matching hand card to replay this card from trash. */
  onKoReviveSelf?: { trashHandTrait: string };
  /** May K.O. this card instead when another friendly Character faces opponent-effect removal. */
  removalReplacementSelfKo?: boolean;
  /** Rush — may attack the turn this Character enters play. */
  /** Optional art URL (TCGPlayer CDN or Bandai cardlist). Display only. */
  imageUrl?: string;
  /** Combat attribute for deck filters / inspect (Strike, Slash, …). Display only. */
  attribute?: string;
  /** Printed ability / effect text for client inspect UI (display only). */
  effectText?: string;
  /** Alternate printings (display only). */
  altArts?: { id: string; label: string; imageUrl: string }[];
  /** Card types/traits printed on the card (e.g. "Blackbeard Pirates"). */
  traits?: string[];
  /** True when the card has a printed [Trigger] effect. */
  hasTrigger?: boolean;
  /**
   * [On Opponent's Attack] [Once Per Turn] Trash 1 hand card: give a chosen
   * own Leader/Character +power this battle (Newgate OP17-001).
   */
  leaderOnOppAttackTrashForPower?: { power: number };
  /**
   * [On Opponent's Attack] [Once Per Turn] Trash 1 Trigger hand card: retarget
   * the attack to this Leader or a Character with `retargetTrait` (Teach).
   */
  leaderOnOppAttackTrashTriggerRetarget?: { retargetTrait: string };
  /**
   * [When Attacking] Trash 1 hand card: reveal top of deck; if its type includes
   * `revealTrait`, draw `draw` cards (Rocks.D.Xebec OP17-039).
   */
  leaderWhenAttackingTrashRevealDraw?: { revealTrait: string; draw: number };
}

export interface TopDeckSearchEffect {
  count: number;
  maxTake: number;
  filterTrait?: string;
  /** Match either a trait or any card name containing one of these strings. */
  filterTraitOrName?: { trait: string; nameIncludes: string[] };
  excludeDefIds?: CardDefId[];
  requiredLeaderTrait?: string;
  /** Put the selected card on top of Life instead of adding it to hand. */
  takeToLife?: boolean;
  remainder: "deck_bottom" | "trash";
}

export interface ActivateMainSearchEffect extends TopDeckSearchEffect {
  abilityId: string;
  restDon?: number;
  restSource?: boolean;
  trashHand?: number;
}

export interface CardInstance {
  id: InstanceId;
  defId: CardDefId;
  rested: boolean;
  attachedDonIds: InstanceId[];
  /**
   * Characters only: cannot attack until owner's next turn start unless Rush.
   * Cleared in `beginTurn` for the active seat.
   */
  summoningSick?: boolean;
  /**
   * Optional crowd-control / effect labels (e.g. "Stun", "Unrestable",
   * "Nullified"). Populated by card effects when implemented; clients render
   * these as chips alongside rested / summoning-sick / rush.
   */
  statusLabels?: string[];
  /** Temporary power bonus for the current battle (cleared when battle ends). */
  battlePowerBonus?: number;
  /** Temporary modifier cleared when the current turn ends. */
  turnPowerBonus?: number;
  /** Temporary base-power replacement cleared at the next turn start. */
  turnBasePowerOverride?: number;
  /** Absolute turn whose End Phase expires the base-power replacement. */
  basePowerOverrideThroughTurn?: number;
  /** Card text is disabled through this absolute turn number. */
  effectsNegatedThroughTurn?: number;
  /** Character cannot attack through this absolute turn number. */
  cannotAttackThroughTurn?: number;
  /** Per-source Activate: Main use marker, cleared at its controller's turn start. */
  abilityUsedThisTurn?: boolean;
}

export interface DonInstance {
  id: InstanceId;
  rested: boolean;
  attachedTo: InstanceId | null;
}

export type AttackTarget =
  | { kind: "leader" }
  | { kind: "character"; instanceId: InstanceId };

export interface BattleState {
  attackerSeat: Seat;
  attackerId: InstanceId;
  target: AttackTarget;
  defenderPowerBonus: number;
  attackerPowerBonus: number;
}

/**
 * Kinds of player-facing "may I trigger this?" prompts. `life_trigger` is the
 * original life-card accept/decline flow; the rest generalize the same queue
 * to character/leader abilities as engine support for them lands.
 */
export type PendingChoiceKind =
  | "life_trigger"
  | "on_play"
  | "activate_main"
  | "when_attacking"
  | "optional_ability"
  | "leader_on_opp_attack"
  | "search_top_deck"
  /** Controller must pick resolution order for 2+ simultaneous effects. */
  | "order_effects";

/**
 * A single queued "may I resolve this optional/chain ability?" prompt.
 * `MatchState.pendingChoices` is a FIFO queue: the front entry blocks Main
 * phase actions for its `seat` until resolved via `resolve_pending_choice`
 * (or `order_pending_effects` when `kind` is `order_effects`), so chained
 * character/leader abilities can stack. When multiple effects trigger for the
 * same controller at once, an `order_effects` wrapper is inserted first so the
 * player chooses order (APNAP still puts the turn player ahead of the opponent).
 */
export interface PendingChoice {
  /** Stable id for React keys / logs; not gameplay-significant. */
  id: string;
  /** Declarative runtime continuation resumed by this prompt. */
  resolutionFrameId?: string;
  seat: Seat;
  kind: PendingChoiceKind;
  cardDefId: CardDefId;
  /** Board instance that owns the ability, when applicable. */
  sourceInstanceId?: InstanceId;
  /** False = the ability is mandatory; only `accept` is a legal resolution. */
  optional: boolean;
  /** Human-readable prompt naming the card/ability, shown to the player. */
  prompt: string;
  /**
   * Structured leader-ability id for attack-window prompts.
   * Clients use this to render trash / retarget / reveal pickers.
   */
  abilityId?:
    | "newgate_battle_power"
    | "teach_redirect"
    | "rocks_reveal_draw"
    | "on_play_add_life"
    | "on_play_life_choice"
    | "on_play_power_debuff"
    | "on_play_hand_to_deck"
    | "laffitte_search"
    | "fullalead_search_cost"
    | "top_deck_search"
    | "jinbe_attack_power"
    | "copy_opponent_power"
    | "on_play_ko_power"
    | "on_play_trash_hand_to_life"
    | "on_play_reveal_draw_trash"
    | "discard_hand_count"
    | "main_play_named_character"
    | "main_opponent_life_to_hand"
    | "trigger_negate_opponent_card"
    | "trigger_ko_opponent_cost"
    | "teach_negate_leader"
    | "teach_negate_character"
    | "on_ko_return_don_add_life"
    | "on_ko_revive_self"
    | "marco_removal_replacement"
    | "main_trash_trigger_to_hand"
    | "on_ko_set_base_power"
    | "on_ko_ko_opponent_cost"
    | "on_ko_rest_opponent_cost"
    | "trigger_play_trash_character"
    | "on_play_add_active_don"
    | "counter_friendly_power"
    | "counter_rest_don_opponent_all"
    | "counter_opponent_target_power"
    | "trigger_friendly_power";
  /** Hidden top-deck choices. Only `privateToSeat` receives card identities. */
  search?: {
    options: Array<{
      /** Opaque stable handle submitted by clients. */
      id: string;
      defId: CardDefId;
      eligible: boolean;
    }>;
    maxSelect: number;
    remainder: "deck_bottom" | "trash";
    takeToLife?: boolean;
  };
  trashOptions?: Array<{ id: string; defId: CardDefId; eligible: boolean; instanceId?: InstanceId }>;
  handSelection?: { count: number; qualifyingPower?: number };
  donOptions?: Array<{ id: InstanceId; rested: boolean; attachedTo?: InstanceId | null }>;
  replacementTargetId?: InstanceId;
  targetSelection?: { maxTargets: number; maxCost?: number };
  /** Seat allowed to see `search.options[].defId` and eligibility. */
  privateToSeat?: Seat;
  /** Hide the source card identity and prompt from every other viewer. */
  hideCardDefFromOthers?: boolean;
  /** Public count retained when private search options are redacted. */
  optionCount?: number;
  /**
   * When `kind` is `order_effects`, the simultaneous abilities the controller
   * must permute via `order_pending_effects`.
   */
  unorderedChoices?: PendingChoice[];
}

/** @deprecated Use `PendingChoice` (kind `"life_trigger"`). Kept for callers importing the old name. */
export type PendingTrigger = PendingChoice;

export interface PlayerState {
  leader: CardInstance;
  characters: CardInstance[];
  stage: CardInstance | null;
  hand: CardInstance[];
  deck: CardDefId[];
  trash: CardDefId[];
  life: CardDefId[];
  /** Stable internal identities for cards in hidden/public non-field zones. */
  zoneInstanceIds: {
    deck: InstanceId[];
    trash: InstanceId[];
    life: InstanceId[];
  };
  /** Parallel to `life`: true entries are publicly face-up. */
  faceUpLife: boolean[];
  donDeck: DonInstance[];
  costArea: DonInstance[];
  attachedDons: DonInstance[];
  mulliganDone: boolean;
  turnsStarted: number;
  /** Cleared at turn start (`beginTurn`). Once-per-turn Leader Activate:Main. */
  leaderActivatedThisTurn: boolean;
  /** Cleared at turn start. Once-per-turn On-Opponent's-Attack leader ability. */
  leaderOppAttackAbilityUsedThisTurn: boolean;
}

export interface MatchState {
  stateVersion: 2;
  rulesVersion: string;
  protocolVersion: 4;
  registryHash: string;
  rng: { seed: number; cursor: number };
  players: [PlayerState, PlayerState];
  activeSeat: Seat;
  firstSeat: Seat;
  phase: Phase;
  turnNumber: number;
  battle: BattleState | null;
  /** FIFO queue of pending player choices (life triggers, On Play/Activate abilities, …). */
  pendingChoices: PendingChoice[];
  /** Serializable continuations for paused declarative ability programs. */
  resolutionFrames: ResolutionFrame[];
  winner: Seat | null;
  winReason: "leader_battle_at_zero_life" | "deck_out" | null;
  nextId: number;
  lastEvents: GameEvent[];
}

export interface ResolutionFrame {
  id: string;
  seat: Seat;
  sourceInstanceId: InstanceId;
  sourceDefId: CardDefId;
  abilityId: string;
  window: string;
  operationIndex: number;
  bindings: Record<string, string | string[] | number | boolean | null>;
}

export type GameEvent =
  | { type: "mulligan_resolved"; seat: Seat; didMulligan: boolean }
  | { type: "phase_changed"; phase: Phase; activeSeat: Seat }
  | { type: "drew"; seat: Seat; count: number }
  | { type: "don_placed"; seat: Seat; count: number }
  | {
      type: "card_played";
      seat: Seat;
      defId: CardDefId;
      instanceId: InstanceId;
      costPaid: number;
    }
  | { type: "stage_replaced"; seat: Seat; trashedDefId: CardDefId }
  /** Stage trashed as an Activate:Main (or similar) cost. */
  | { type: "stage_trashed"; seat: Seat; defId: CardDefId }
  | { type: "character_trashed_for_space"; seat: Seat; defId: CardDefId }
  | {
      type: "don_given";
      seat: Seat;
      donId: InstanceId;
      targetId: InstanceId;
      targetDefId: CardDefId;
      newPower: number;
    }
  | {
      type: "attack_declared";
      seat: Seat;
      attackerId: InstanceId;
      target: AttackTarget;
      attackerPower: number;
      defenderPower: number;
    }
  | { type: "blocked"; seat: Seat; blockerId: InstanceId }
  | { type: "counter_applied"; seat: Seat; defId: CardDefId; bonus: number }
  | {
      type: "battle_resolved";
      attackerWon: boolean;
      attackerPower: number;
      defenderPower: number;
    }
  | { type: "character_ko"; seat: Seat; defId: CardDefId }
  | { type: "life_taken"; seat: Seat; defId: CardDefId; toHand: boolean }
  | { type: "life_added"; seat: Seat; defId: CardDefId; source: "deck_top"; faceUp?: boolean }
  | { type: "trigger_available"; seat: Seat; defId: CardDefId }
  | { type: "trigger_resolved"; seat: Seat; accepted: boolean }
  | {
      type: "card_revealed";
      seat: Seat;
      defId: CardDefId;
      /** True when the reveal satisfied a trait check (e.g. Rocks Pirates). */
      matchedTrait?: boolean;
    }
  | {
      type: "power_buff_applied";
      seat: Seat;
      targetDefId: CardDefId;
      amount: number;
      duration: "turn" | "battle";
    }
  | {
      type: "pending_choice_added";
      seat: Seat;
      kind: PendingChoiceKind;
      cardDefId: CardDefId;
      sourceInstanceId?: InstanceId;
      optional: boolean;
      prompt: string;
      privateToSeat?: Seat;
      hideCardDefFromOthers?: boolean;
    }
  | {
      type: "pending_choice_resolved";
      seat: Seat;
      kind: PendingChoiceKind;
      cardDefId: CardDefId;
      accepted: boolean;
      privateToSeat?: Seat;
      hideCardDefFromOthers?: boolean;
    }
  | { type: "game_over"; winner: Seat; reason: NonNullable<MatchState["winReason"]> };

export type Intent =
  | { type: "mulligan"; doMulligan: boolean }
  | { type: "play_card"; handIndex: number; trashCharacterId?: InstanceId }
  | { type: "give_don"; donId: InstanceId; targetId: InstanceId }
  /**
   * Activate:Main (or similar) on a board source. `abilityId` selects the hook;
   * `targetId` is used when the ability needs a Leader/Character recipient.
   */
  | {
      type: "activate_ability";
      sourceId: InstanceId;
      abilityId: string;
      targetId?: InstanceId;
    }
  /**
   * Legacy ST01-001 Activate:Main — attach 1 rested cost-area DON!! to
   * Leader/Character (once per turn). Prefer `activate_ability` with
   * `leader_give_rested_don`; still accepted by `applyIntent`.
   */
  | { type: "activate_leader"; targetId: InstanceId }
  | { type: "declare_attack"; attackerId: InstanceId; target: AttackTarget }
  | { type: "declare_block"; blockerId: InstanceId }
  | { type: "pass_block" }
  | { type: "counter_from_hand"; handIndex: number }
  | { type: "counter_event"; handIndex: number }
  | { type: "pass_counter" }
  /** Accept/decline the front of `MatchState.pendingChoices` (life trigger or ability prompt). */
  | {
      type: "resolve_pending_choice";
      accept: boolean;
      /** Hand index to trash when accepting Newgate/Teach attack abilities. */
      handIndex?: number;
      /** Own Leader/Character gaining battle power (Newgate). */
      buffTargetId?: InstanceId;
      /** Opponent Character selected by a copy-power attack ability. */
      copyPowerTargetId?: InstanceId;
      /** New attack target after Teach redirect. */
      newTarget?: AttackTarget;
      /** On Play life-branch choice (OP17-112). */
      onPlayChoice?: "own_life" | "opp_life";
      /** Opaque selected option for a private top-deck search; omitted means take zero. */
      selectedOptionId?: string;
      /** Opaque handles for all unselected cards in requested remainder order. */
      orderedOptionIds?: string[];
      /** Trash card selected by an On Play hand-to-Life effect. */
      selectedTrashOptionId?: string;
      /** Hand indices selected by reveal/discard effects. */
      handIndices?: number[];
      /** DON!! ids selected for a DON!!−N effect cost. */
      selectedDonIds?: InstanceId[];
      /** Board instance ids selected by multi-target effects. */
      targetIds?: InstanceId[];
    }
  /**
   * Choose resolution order for the front `order_effects` pending choice.
   * `orderedIds` must be a permutation of that choice's `unorderedChoices` ids.
   */
  | { type: "order_pending_effects"; orderedIds: string[] }
  | { type: "end_turn" };

export interface ApplyContext {
  rng: Rng;
  seat: Seat;
}

export interface ApplyResult {
  ok: boolean;
  state: MatchState;
  events: GameEvent[];
  error?: { code: string; message: string };
}

export interface PlayerDeckConfig {
  leaderId: CardDefId;
  deck: CardDefId[];
}

export interface CreateMatchConfig {
  seed: number;
  firstSeat?: Seat;
  players: [PlayerDeckConfig, PlayerDeckConfig];
}
