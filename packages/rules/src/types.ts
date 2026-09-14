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
  blocker?: boolean;
  eventTiming?: "main" | "counter";
  stageLeaderPowerBonus?: number;
  counterPowerBonus?: number;
  mainDraw?: number;
  triggerDraw?: number;
  /**
   * Leader Activate: Main [Once Per Turn] — attach 1 rested DON!! from cost
   * area to this Leader or one of your Characters (ST01-001).
   */
  leaderActivateGiveRestedDon?: boolean;
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
  /** Rush — may attack the turn this Character enters play. */
  rush?: boolean;
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
   * [Opponent's Turn] Give all of your opponent's Characters +N cost
   * (Teach OP16-080).
   */
  leaderOpponentCharacterCostBonus?: number;
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
    | "on_play_hand_to_deck";
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
  players: [PlayerState, PlayerState];
  activeSeat: Seat;
  firstSeat: Seat;
  phase: Phase;
  turnNumber: number;
  battle: BattleState | null;
  /** FIFO queue of pending player choices (life triggers, On Play/Activate abilities, …). */
  pendingChoices: PendingChoice[];
  winner: Seat | null;
  winReason: "leader_battle_at_zero_life" | "deck_out" | null;
  nextId: number;
  lastEvents: GameEvent[];
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
  | { type: "life_added"; seat: Seat; defId: CardDefId; source: "deck_top" }
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
      type: "pending_choice_added";
      seat: Seat;
      kind: PendingChoiceKind;
      cardDefId: CardDefId;
      sourceInstanceId?: InstanceId;
      optional: boolean;
      prompt: string;
    }
  | {
      type: "pending_choice_resolved";
      seat: Seat;
      kind: PendingChoiceKind;
      cardDefId: CardDefId;
      accepted: boolean;
    }
  | { type: "game_over"; winner: Seat; reason: NonNullable<MatchState["winReason"]> };

export type Intent =
  | { type: "mulligan"; doMulligan: boolean }
  | { type: "play_card"; handIndex: number; trashCharacterId?: InstanceId }
  | { type: "give_don"; donId: InstanceId; targetId: InstanceId }
  /** Attach 1 rested cost-area DON!! to Leader/Character (once per turn). */
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
      /** New attack target after Teach redirect. */
      newTarget?: AttackTarget;
      /** On Play life-branch choice (OP17-112). */
      onPlayChoice?: "own_life" | "opp_life";
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
