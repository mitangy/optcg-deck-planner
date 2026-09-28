import type { Rng } from "./rng.js";
import type { Keyword, PlayerRestriction, Restriction, Filter, Placement } from "./effects/types.js";

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
  | "end"
  | "game_over";

export type CardType = "leader" | "character" | "event" | "stage";

/** Printed card metadata. Executable behavior lives in the ability registry. */
export interface CardDef {
  id: CardDefId;
  name: string;
  type: CardType;
  colors: string[];
  cost: number;
  power?: number;
  life?: number;
  /** Printed Counter value; absent when the card has none. */
  counter?: number;
  /** Events: timing tags present in the printed text. */
  eventTiming?: "main" | "counter";
  imageUrl?: string;
  attribute?: string;
  /** Printed text excluding the [Trigger] clause (display only). */
  effectText?: string;
  /** Printed [Trigger] clause (display only). */
  triggerText?: string;
  altArts?: { id: string; label: string; imageUrl: string }[];
  traits?: string[];
  hasTrigger?: boolean;
  /** `bandai` when verified against the official card list snapshot. */
  dataSource?: "bandai" | "bundled" | "stub";
}

export interface CardInstance {
  id: InstanceId;
  defId: CardDefId;
  rested: boolean;
  attachedDonIds: InstanceId[];
  /** Characters only: cannot attack until owner's next turn start unless Rush. */
  summoningSick?: boolean;
  /** Absolute turn number this card entered the field. */
  playedTurn?: number;
  /** Once-per-turn ability id → absolute turn number of last use. */
  usedAbilities?: Record<string, number>;
  statusLabels?: string[];
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
  /** Instance originally attacked (before Blocker/redirect). */
  originalTargetId?: InstanceId;
  blockerId?: InstanceId;
  /** Kept for client compatibility: always 0 (battle buffs are modifiers). */
  defenderPowerBonus: number;
  attackerPowerBonus: number;
  /** Remaining damage to deal during the damage step. */
  damageRemaining?: number;
}

export type ModifierEffect =
  | { type: "power"; amount: number }
  | { type: "cost"; amount: number }
  | { type: "base_power"; value: number }
  | { type: "set_power"; value: number }
  | { type: "set_cost"; value: number }
  | { type: "keyword"; keyword: Keyword }
  | { type: "restrict"; restriction: Restriction; value?: number; attribute?: string }
  | { type: "negate" }
  | { type: "player_restrict"; restriction: PlayerRestriction; filter?: Filter }
  | { type: "play_cost"; filter: Filter; amount: number; once?: boolean };

export type ModifierExpiry =
  | { kind: "battle" }
  | { kind: "end_of_turn"; turn: number }
  | { kind: "start_of_turn"; turn: number }
  | { kind: "next_refresh"; seat: Seat }
  | { kind: "permanent" };

export interface Modifier {
  id: string;
  /** Seat controlling the effect that created this modifier. */
  sourceSeat: Seat;
  sourceId?: InstanceId;
  target: { kind: "card"; id: InstanceId } | { kind: "player"; seat: Seat };
  effect: ModifierEffect;
  expires: ModifierExpiry;
}

export type PendingChoiceKind =
  | "life_trigger"
  /** Generic effect prompt; see `request`. */
  | "effect"
  /** Controller must pick resolution order for 2+ simultaneous effects. */
  | "order_effects";

export interface ChoiceOption {
  /** Opaque handle submitted by clients. */
  id: string;
  /** Card definition, or "HIDDEN" when the viewer may not see it. */
  defId?: CardDefId;
  /** Human-readable label for non-card options. */
  label?: string;
  zone?: "leader" | "character" | "stage" | "hand" | "trash" | "deck" | "life" | "don" | "resolving";
  ownerSeat?: Seat;
  /** Public field instance (never set for hidden-zone cards). */
  instanceId?: InstanceId;
  eligible: boolean;
  rested?: boolean;
}

export type ChoiceRequest =
  /** Yes / no. `accept: false` declines. */
  | { type: "confirm" }
  /** Pick between `min` and `max` eligible options. */
  | { type: "select"; min: number; max: number; options: ChoiceOption[] }
  /** Pick exactly one labeled mode. */
  | { type: "mode"; options: ChoiceOption[] }
  /** Order every option (first = placed first / top-most). */
  | { type: "order"; options: ChoiceOption[]; destination: string; allowTopOrBottom?: boolean }
  /**
   * Privately look at cards: select up to `maxSelect` eligible cards, then
   * order the rest for `rest` placement (top-or-bottom split when allowed).
   */
  | {
      type: "look";
      options: ChoiceOption[];
      minSelect: number;
      maxSelect: number;
      groups: { label: string; max: number; eligibleIds: string[] }[];
      rest: Placement | "look_only";
      restLabel: string;
    };

/**
 * A queued player decision. The front entry blocks all other intents until
 * resolved via `resolve_pending_choice` (or `order_pending_effects`).
 */
export interface PendingChoice {
  id: string;
  /** Resolution frame awaiting this choice (internal; stripped from views). */
  resolutionFrameId?: string;
  seat: Seat;
  kind: PendingChoiceKind;
  cardDefId: CardDefId;
  sourceInstanceId?: InstanceId;
  /** True when declining (accept: false) is legal. */
  optional: boolean;
  prompt: string;
  request?: ChoiceRequest;
  /** Seat allowed to see private option identities. */
  privateToSeat?: Seat;
  /** Hide the source card identity and prompt from every other viewer. */
  hideCardDefFromOthers?: boolean;
  /** Public count retained when private options are redacted. */
  optionCount?: number;
  /** order_effects: the simultaneous abilities to permute. */
  unorderedChoices?: PendingChoice[];
  /** Internal: option id → card instance / value binding. Stripped from views. */
  bindings?: Record<string, string>;
}

/** @deprecated Use `PendingChoice`. */
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
  /** Cards being resolved (Events, accepted Life Triggers). */
  resolving: CardInstance[];
  donDeck: DonInstance[];
  costArea: DonInstance[];
  attachedDons: DonInstance[];
  mulliganDone: boolean;
  turnsStarted: number;
  /** DON!! cards this player owns in total (10 unless a rule changes it). */
  donTotal?: number;
}

/** A triggered ability waiting to start resolution. */
export interface QueuedTrigger {
  id: string;
  seat: Seat;
  sourceInstanceId: InstanceId;
  sourceDefId: CardDefId;
  abilityId: string;
  window: string;
  /** Card that caused an event trigger (e.g. the K.O.'d Character). */
  eventCardId?: InstanceId;
  /** Batch number: triggers queued by the same game action share a batch. */
  batch: number;
  /** Set once the controller has ordered this trigger among simultaneous ones. */
  ordered?: boolean;
  /** Delayed effect index (the ability's n-th `delay` node) instead of the ability itself. */
  delayIndex?: number;
}

/** Turn/battle procedure continuation, advanced when no effects are pending. */
export type EngineStep =
  | { kind: "after_attack_triggers" }
  | { kind: "after_block_triggers" }
  | { kind: "damage" }
  | { kind: "battle_ko"; targetSeat: Seat; targetId: InstanceId; replaced?: boolean }
  | { kind: "life_damage" }
  /** Effect damage outside battle (Life to hand with Trigger checks). */
  | { kind: "effect_damage"; seat: Seat; remaining: number }
  | { kind: "end_battle" }
  | { kind: "end_phase" }
  | { kind: "start_turn_triggers" };

export interface MatchState {
  stateVersion: 3;
  rulesVersion: string;
  protocolVersion: 5;
  registryHash: string;
  rng: { seed: number; cursor: number };
  players: [PlayerState, PlayerState];
  activeSeat: Seat;
  firstSeat: Seat;
  phase: Phase;
  turnNumber: number;
  battle: BattleState | null;
  pendingChoices: PendingChoice[];
  /** Serializable continuations for executing ability programs (stack; last runs). */
  resolutionFrames: ResolutionFrame[];
  triggerQueue: QueuedTrigger[];
  modifiers: Modifier[];
  steps: EngineStep[];
  extraTurns: Seat[];
  /** One-shot effects scheduled for the end of the current turn. */
  delayed: DelayedEffect[];
  winner: Seat | null;
  winReason: "leader_battle_at_zero_life" | "deck_out" | "card_effect" | null;
  nextId: number;
  triggerBatch: number;
  lastEvents: GameEvent[];
}

export type BindingValue = string | string[] | number | boolean | null;

/** A delayed effect: the `index`-th `delay` node of an ability, run at end of turn / battle. */
export interface DelayedEffect {
  when?: "end_of_turn" | "end_of_battle";
  id: string;
  seat: Seat;
  sourceInstanceId: InstanceId;
  sourceDefId: CardDefId;
  abilityId: string;
  index: number;
  turn: number;
}

export interface ResolutionFrame {
  id: string;
  seat: Seat;
  sourceInstanceId: InstanceId;
  sourceDefId: CardDefId;
  abilityId: string;
  window: string;
  /** Instruction pointer into the compiled program. */
  operationIndex: number;
  bindings: Record<string, BindingValue>;
  /** Program kind: an ability, or an engine-generated interrupt program. */
  program?: "ability" | "replacement" | "trash_for_space";
}

export type GameEvent =
  | { type: "mulligan_resolved"; seat: Seat; didMulligan: boolean }
  | { type: "phase_changed"; phase: Phase; activeSeat: Seat }
  | { type: "drew"; seat: Seat; count: number }
  | { type: "don_placed"; seat: Seat; count: number }
  | { type: "card_played"; seat: Seat; defId: CardDefId; instanceId: InstanceId; costPaid: number }
  | { type: "stage_replaced"; seat: Seat; trashedDefId: CardDefId }
  | { type: "stage_trashed"; seat: Seat; defId: CardDefId }
  | { type: "character_trashed_for_space"; seat: Seat; defId: CardDefId }
  | { type: "don_given"; seat: Seat; donId: InstanceId; targetId: InstanceId; targetDefId: CardDefId; newPower: number }
  | { type: "attack_declared"; seat: Seat; attackerId: InstanceId; target: AttackTarget; attackerPower: number; defenderPower: number }
  | { type: "blocked"; seat: Seat; blockerId: InstanceId }
  | { type: "counter_applied"; seat: Seat; defId: CardDefId; bonus: number }
  | { type: "battle_resolved"; attackerWon: boolean; attackerPower: number; defenderPower: number }
  | { type: "character_ko"; seat: Seat; defId: CardDefId }
  | { type: "life_taken"; seat: Seat; defId: CardDefId; toHand: boolean }
  | { type: "life_added"; seat: Seat; defId: CardDefId; source: "deck_top" | "hand" | "field" | "trash"; faceUp?: boolean }
  | { type: "trigger_available"; seat: Seat; defId: CardDefId }
  | { type: "trigger_resolved"; seat: Seat; accepted: boolean }
  | { type: "card_revealed"; seat: Seat; defId: CardDefId; matchedTrait?: boolean }
  | { type: "power_buff_applied"; seat: Seat; targetDefId: CardDefId; amount: number; duration: "turn" | "battle" | "other" }
  | { type: "card_moved"; seat: Seat; defId: CardDefId; from: string; to: string; hidden?: boolean }
  | { type: "ability_activated"; seat: Seat; defId: CardDefId; abilityId: string; text: string }
  | { type: "pending_choice_added"; seat: Seat; kind: PendingChoiceKind; cardDefId: CardDefId; sourceInstanceId?: InstanceId; optional: boolean; prompt: string; privateToSeat?: Seat; hideCardDefFromOthers?: boolean }
  | { type: "pending_choice_resolved"; seat: Seat; kind: PendingChoiceKind; cardDefId: CardDefId; accepted: boolean; privateToSeat?: Seat; hideCardDefFromOthers?: boolean }
  | { type: "game_over"; winner: Seat; reason: NonNullable<MatchState["winReason"]> };

export type Intent =
  | { type: "mulligan"; doMulligan: boolean }
  | { type: "play_card"; handIndex: number; trashCharacterId?: InstanceId }
  | { type: "give_don"; donId: InstanceId; targetId: InstanceId }
  /** Activate:Main on a board source (Leader, Character, or Stage). */
  | { type: "activate_ability"; sourceId: InstanceId; abilityId: string; targetId?: InstanceId }
  | { type: "declare_attack"; attackerId: InstanceId; target: AttackTarget }
  | { type: "declare_block"; blockerId: InstanceId }
  | { type: "pass_block" }
  | { type: "counter_from_hand"; handIndex: number }
  | { type: "counter_event"; handIndex: number }
  | { type: "pass_counter" }
  /** Resolve the front of `pendingChoices`. */
  | {
      type: "resolve_pending_choice";
      accept: boolean;
      /** Selected option handles (select / look / mode). */
      selectedOptionIds?: string[];
      /** Every unselected option handle in placement order (order / look). */
      orderedOptionIds?: string[];
      /** Subset of `orderedOptionIds` placed on top when top-or-bottom is allowed. */
      topOptionIds?: string[];
    }
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
