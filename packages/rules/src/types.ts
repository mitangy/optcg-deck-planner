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
}

export interface CardInstance {
  id: InstanceId;
  defId: CardDefId;
  rested: boolean;
  attachedDonIds: InstanceId[];
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

export interface PendingTrigger {
  seat: Seat;
  cardDefId: CardDefId;
}

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
}

export interface MatchState {
  players: [PlayerState, PlayerState];
  activeSeat: Seat;
  firstSeat: Seat;
  phase: Phase;
  turnNumber: number;
  battle: BattleState | null;
  pendingTrigger: PendingTrigger | null;
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
  | { type: "card_played"; seat: Seat; defId: CardDefId; instanceId: InstanceId }
  | { type: "stage_replaced"; seat: Seat; trashedDefId: CardDefId }
  | { type: "character_trashed_for_space"; seat: Seat; defId: CardDefId }
  | { type: "don_given"; seat: Seat; donId: InstanceId; targetId: InstanceId }
  | { type: "attack_declared"; seat: Seat; attackerId: InstanceId; target: AttackTarget }
  | { type: "blocked"; seat: Seat; blockerId: InstanceId }
  | { type: "counter_applied"; seat: Seat; defId: CardDefId; bonus: number }
  | { type: "battle_resolved"; attackerWon: boolean }
  | { type: "character_ko"; seat: Seat; defId: CardDefId }
  | { type: "life_taken"; seat: Seat; defId: CardDefId; toHand: boolean }
  | { type: "trigger_available"; seat: Seat; defId: CardDefId }
  | { type: "trigger_resolved"; seat: Seat; accepted: boolean }
  | { type: "game_over"; winner: Seat; reason: NonNullable<MatchState["winReason"]> };

export type Intent =
  | { type: "mulligan"; doMulligan: boolean }
  | { type: "play_card"; handIndex: number; trashCharacterId?: InstanceId }
  | { type: "give_don"; donId: InstanceId; targetId: InstanceId }
  | { type: "declare_attack"; attackerId: InstanceId; target: AttackTarget }
  | { type: "declare_block"; blockerId: InstanceId }
  | { type: "pass_block" }
  | { type: "counter_from_hand"; handIndex: number }
  | { type: "counter_event"; handIndex: number }
  | { type: "pass_counter" }
  | { type: "resolve_trigger"; accept: boolean }
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
