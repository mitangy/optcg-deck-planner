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
  imageUrl?: string;
  attribute?: string;
  effectText?: string;
  triggerText?: string;
  altArts?: { id: string; label: string; imageUrl: string }[];
  traits?: string[];
  hasTrigger?: boolean;
  dataSource?: "bandai" | "bundled" | "tcgplayer" | "stub";
}

export interface CardInstance {
  id: InstanceId;
  defId: CardDefId;
  rested: boolean;
  attachedDonIds: InstanceId[];
  summoningSick?: boolean;
  playedTurn?: number;
  usedAbilities?: Record<string, number>;
  statusLabels?: string[];
}

export interface DonInstance {
  id: InstanceId;
  rested: boolean;
  attachedTo: InstanceId | null;
  noRefresh?: boolean;
}

export type AttackTarget =
  | { kind: "leader" }
  | { kind: "character"; instanceId: InstanceId };

export interface BattleState {
  attackerSeat: Seat;
  attackerId: InstanceId;
  target: AttackTarget;
  originalTargetId?: InstanceId;
  blockerId?: InstanceId;
  /** Kept for client compatibility: always 0 (battle buffs are modifiers). */
  defenderPowerBonus: number;
  attackerPowerBonus: number;
  damageRemaining?: number;
  endDispatched?: boolean;
}

export type ModifierEffect =
  | { type: "power"; amount: number }
  | { type: "cost"; amount: number }
  | { type: "base_power"; value: number }
  | { type: "set_power"; value: number }
  | { type: "set_cost"; value: number }
  | { type: "keyword"; keyword: Keyword }
  | { type: "restrict"; restriction: Restriction; value?: number; attribute?: string; filter?: Filter }
  /** Card gains an attribute (e.g. <Slash>). */
  | { type: "attribute"; attribute: string }
  /** Per-turn marker (e.g. "battled_character"). */
  | { type: "flag"; flag: string }
  /** A replacement ability granted to a player for a duration (from an Event). */
  | { type: "granted"; abilityId: string; sourceDefId: CardDefId }
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
  id: string;
  defId?: CardDefId;
  label?: string;
  zone?: "leader" | "character" | "stage" | "hand" | "trash" | "deck" | "life" | "don" | "resolving";
  ownerSeat?: Seat;
  instanceId?: InstanceId;
  eligible: boolean;
  rested?: boolean;
}

export type ChoiceRequest =
  | { type: "confirm" }
  /**
   * Pick between `min` and `max` eligible options. `distinctNames`: no two
   * picks may share a card name ("with different card names").
   */
  | { type: "select"; min: number; max: number; options: ChoiceOption[]; distinctNames?: true; totalCostAtMost?: number; totalPowerAtMost?: number }
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

export interface PendingChoice {
  id: string;
  resolutionFrameId?: string;
  seat: Seat;
  kind: PendingChoiceKind;
  cardDefId: CardDefId;
  sourceInstanceId?: InstanceId;
  optional: boolean;
  prompt: string;
  request?: ChoiceRequest;
  privateToSeat?: Seat;
  hideCardDefFromOthers?: boolean;
  noTrigger?: boolean;
  unpayable?: boolean;
  optionCount?: number;
  unorderedChoices?: PendingChoice[];
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
  zoneInstanceIds: {
    deck: InstanceId[];
    trash: InstanceId[];
    life: InstanceId[];
  };
  faceUpLife: boolean[];
  resolving: CardInstance[];
  donDeck: DonInstance[];
  costArea: DonInstance[];
  attachedDons: DonInstance[];
  mulliganDone: boolean;
  turnsStarted: number;
  /**
   * They stay face up to the opponent until the next turn begins or the card leaves the hand. Optional so older saved
   * states still load.
   */
  revealedHandIds?: string[];
  donTotal?: number;
  turnLog?: TurnLog;
}

export interface QueuedTrigger {
  id: string;
  seat: Seat;
  sourceInstanceId: InstanceId;
  sourceDefId: CardDefId;
  abilityId: string;
  window: string;
  eventCardId?: InstanceId;
  batch: number;
  ordered?: boolean;
  delayIndex?: number;
  vars?: Record<string, BindingValue>;
}

export type EngineStep =
  | { kind: "after_attack_triggers" }
  | { kind: "after_block_triggers" }
  | { kind: "damage" }
  | { kind: "battle_ko"; targetSeat: Seat; targetId: InstanceId; replaced?: boolean }
  /** `lethal`: the defender was at 0 Life when the hit landed (loses unless a damage replacement applies). `dealt`: damage events already fired for this hit. */
  | { kind: "life_damage"; replaced?: boolean; lethal?: boolean; dealt?: boolean }
  /** Effect damage outside battle (Life to hand with Trigger checks). */
  | { kind: "effect_damage"; seat: Seat; remaining: number; replaced?: boolean }
  | { kind: "end_battle" }
  | { kind: "end_phase" }
  | { kind: "start_turn_triggers" };

export interface MatchState {
  stateVersion: 3;
  rulesVersion: string;
  protocolVersion: 5;
  registryHash: string;
  /** `key` (hex) makes the match draw from a keyed stream; it never leaves the server before the game ends. */
  rng: { seed: number; cursor: number; key?: string };
  players: [PlayerState, PlayerState];
  activeSeat: Seat;
  firstSeat: Seat;
  phase: Phase;
  turnNumber: number;
  battle: BattleState | null;
  pendingChoices: PendingChoice[];
  resolutionFrames: ResolutionFrame[];
  triggerQueue: QueuedTrigger[];
  modifiers: Modifier[];
  steps: EngineStep[];
  extraTurns: Seat[];
  delayed: DelayedEffect[];
  winner: Seat | null;
  winReason: "leader_battle_at_zero_life" | "deck_out" | "card_effect" | null;
  nextId: number;
  triggerBatch: number;
  lastEvents: GameEvent[];
  lifeCheckEveryHit?: boolean;
  /**
   * Optional-cost confirms and hidden-zone selects are always asked (never skipped or auto-bound), the start-of-game
   * Stage prompt appears for a single eligible Stage too, and deck instance ids are a random permutation, so no
   * decklist or draw order leaks. Absent/false: legacy flow.
   */
  privateChoicesV2?: boolean;
}

export type BindingValue = string | string[] | number | boolean | null;

export interface DelayedEffect {
  when?: "end_of_turn" | "end_of_battle" | "opponent_main";
  vars?: Record<string, BindingValue>;
  /** The effect acts on "this Character/Stage": it lapses if that card leaves the field (a card that changes zones is a new card). */
  selfBound?: boolean;
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
  operationIndex: number;
  bindings: Record<string, BindingValue>;
  program?: "ability" | "replacement" | "trash_for_space" | "attack_tax";
}

export type GameEvent =
  | { type: "mulligan_resolved"; seat: Seat; didMulligan: boolean }
  | { type: "phase_changed"; phase: Phase; activeSeat: Seat }
  | { type: "drew"; seat: Seat; count: number; defIds?: CardDefId[]; turnDraw?: boolean }
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
      selectedOptionIds?: string[];
      orderedOptionIds?: string[];
      topOptionIds?: string[];
    }
  | { type: "order_pending_effects"; orderedIds: string[] }
  | { type: "end_turn" };

/** Who is acting. The engine draws all randomness from `state.rng`, so the caller supplies none. */
export interface ApplyContext {
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
  /** 256-bit hex key: shuffles come from a keyed stream the seed cannot reproduce. Absent: seed-only legacy stream. */
  rngKey?: string;
  firstSeat?: Seat;
  players: [PlayerDeckConfig, PlayerDeckConfig];
  /** false keeps the legacy flow (non-[Trigger] Life damage goes to hand without a check), for replaying old games. */
  lifeCheckEveryHit?: boolean;
  /** false keeps the legacy private-choice flow, for replaying old games. */
  privateChoicesV2?: boolean;
}

export interface TurnLog {
  turn: number;
  events: CardDefId[];
  koed: CardDefId[];
  handTrashed: number;
}
