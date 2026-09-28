/**
 * Card ability DSL (schema 2). Plain JSON only: definitions are produced by the
 * offline text compiler or written by hand, validated once at registry build,
 * and compiled to flat resumable instructions (`compile.ts`).
 *
 * Player references are relative to the ability's controller.
 */
import type { CardType } from "../types.js";

export const EFFECT_SCHEMA_VERSION = 2 as const;

export type Rel = "you" | "opponent";
export type RelOrAny = Rel | "any";

export type CmpOp = "<=" | ">=" | "==" | "<" | ">" | "!=";

/** Numeric expression evaluated at resolution time. */
export type Value =
  | number
  /** floor(count / per) * times + plus */
  | { count: CountExpr; times?: number; plus?: number; per?: number };

export type CountExpr =
  | { of: "life"; player: RelOrAny }
  | { of: "hand"; player: Rel }
  | { of: "trash"; player: Rel }
  | { of: "deck"; player: Rel }
  | { of: "don_field"; player: Rel }
  | { of: "don_active"; player: Rel }
  | { of: "don_rested"; player: Rel }
  | { of: "don_deck"; player: Rel }
  | { of: "don_attached_self" }
  | { of: "cards"; selector: Selector }
  | { of: "var"; name: string }
  | { of: "var_sum"; name: string; field: "cost" | "power" }
  | { of: "leader_power"; player: Rel }
  | { of: "self_power" }
  | { of: "battle_power"; role: "attacker" | "defender" }
  | { of: "sum"; exprs: CountExpr[] }
  | { of: "don_attached_total"; player: Rel };

export interface Cmp {
  op: CmpOp;
  value: Value;
}

export type Zone =
  | "leader"
  | "character"
  | "leader_or_character"
  | "stage"
  | "field"
  | "hand"
  | "trash"
  | "hand_or_trash"
  | "deck"
  | "life"
  | "deck_top"
  | "don"
  | "resolving";

/** Card predicate. Every present field must match. */
export interface Filter {
  types?: CardType[];
  /** Matches when the card has any listed trait. */
  traits?: string[];
  /** Matches when any trait contains any listed substring ("type including"). */
  traitIncludes?: string[];
  notTraits?: string[];
  /** Excludes cards with any trait containing any listed substring. */
  notTraitIncludes?: string[];
  /** No printed effect text ("no base effect"). */
  vanilla?: boolean;
  /** Printed text (effect + trigger) contains / lacks each listed tag, e.g. "[When Attacking]". */
  textIncludes?: string[];
  textExcludes?: string[];
  /** Printed or aliased name equals any listed name. */
  names?: string[];
  notNames?: string[];
  nameIncludes?: string[];
  colors?: string[];
  /** Matches when the card has more than one color. */
  multicolor?: boolean;
  attributes?: string[];
  cost?: Cmp;
  baseCost?: Cmp;
  power?: Cmp;
  basePower?: Cmp;
  counter?: Cmp;
  hasCounter?: boolean;
  hasTrigger?: boolean;
  rested?: boolean;
  keyword?: Keyword;
  /** Field cards only: played during the current turn. */
  playedThisTurn?: boolean;
  excludeSelf?: boolean;
  /** Excludes every card bound to the named variable. */
  excludeVar?: string;
  /** Only cards bound to the named variable. */
  inVar?: string;
  /** Face-up Life cards only. */
  faceUp?: boolean;
  /** Matches cards whose printed [Trigger] text is present. */
  any?: Filter[];
  /** Every sub-filter must match (ranges such as "5000 to 7000 power"). */
  all?: Filter[];
  /** Number of DON!! cards given to the card. */
  donGiven?: Cmp;
}

export interface Selector {
  player: RelOrAny;
  zone: Zone;
  filter?: Filter;
  /** Union with further selectors ("Characters or DON!! cards", "… or Stages"). */
  also?: Selector[];
}

export type Keyword =
  | "blocker"
  | "rush"
  | "rush_character"
  | "double_attack"
  | "banish"
  | "unblockable";

export type Duration =
  | "battle"
  | "turn"
  | "until_start_of_your_next_turn"
  | "until_end_of_opponent_next_turn"
  | "until_end_of_your_next_turn"
  | "permanent";

export type Restriction =
  | "cannot_attack"
  | "cannot_attack_leader"
  | "cannot_block"
  | "cannot_be_ko"
  | "cannot_be_ko_by_effect"
  | "cannot_be_ko_by_opponent_effect"
  | "cannot_be_ko_in_battle"
  | "cannot_be_removed_by_opponent_effect"
  | "cannot_be_rested_by_opponent_effect"
  | "cannot_be_rested"
  | "cannot_be_ko_in_battle_by_attribute"
  | "cannot_be_returned_by_opponent_effect"
  | "no_refresh"
  | "can_attack_active"
  | "cannot_be_blocked_by_power_or_less"
  | "cannot_be_blocked_by_cost_or_less"
  | "cannot_activate_blocker";

export type PlayerRestriction =
  | "cannot_play_characters"
  | "cannot_play_cards_from_hand"
  | "cannot_play_events"
  | "cannot_add_life_to_hand_by_effect"
  | "cannot_attack_leader"
  | "cannot_draw_by_effect"
  | "cannot_set_don_active"
  | "cannot_set_don_active_by_character_effects";

export type Target =
  | { ref: "self" }
  | { ref: "leader"; player: Rel }
  | { ref: "var"; name: string }
  | { ref: "all"; selector: Selector }
  /** Desugars into a selection step followed by the action. */
  | {
      ref: "choose";
      selector: Selector;
      min: number;
      max: number;
      /** Who picks. Defaults to the controller. */
      chooser?: Rel;
      bind?: string;
      /** Selections must differ in name / have distinct names (rare). */
      distinctNames?: boolean;
      /** Total cost of selected cards must be at most this value. */
      totalCostAtMost?: Value;
      totalPowerAtMost?: Value;
    }
  /** Attacking card / attack target / blocker of the current battle. */
  | { ref: "battle"; role: "attacker" | "defender" | "opponent_battler" | "own_battler" }
  /** Card that caused an event trigger (e.g. the K.O.'d Character). */
  | { ref: "event_card" };

export type Cond =
  | { c: "leader_name"; names: string[] }
  | { c: "leader_trait"; traits: string[] }
  | { c: "leader_trait_includes"; text: string }
  | { c: "leader_color"; colors: string[] }
  | { c: "leader_multicolor" }
  | { c: "leader_active" }
  | { c: "compare"; left: Value; op: CmpOp; right: Value }
  | { c: "exists"; selector: Selector; atLeast?: number }
  | { c: "none"; selector: Selector }
  | { c: "your_turn" }
  | { c: "opponent_turn" }
  | { c: "self_don"; atLeast: number }
  | { c: "self_rested"; value: boolean }
  | { c: "self_played_this_turn" }
  | { c: "var_count"; name: string; op: CmpOp; value: Value }
  | { c: "var_all_match"; name: string; filter: Filter }
  | { c: "var_any_match"; name: string; filter: Filter }
  | { c: "battle_against"; target: "character" | "leader" }
  | { c: "attacker_is_self" }
  | { c: "self_is_battle_target" }
  | { c: "not"; cond: Cond }
  | { c: "and"; conds: Cond[] }
  | { c: "or"; conds: Cond[] }
  | { c: "first_turn_of_player" }
  | { c: "turn_count"; op: CmpOp; value: number };

/** Costs are paid in order before the effect body. Paying is required to resolve. */
export type Cost =
  | { k: "rest_don"; count: number }
  | { k: "return_don"; count: number }
  | { k: "trash_hand"; count: number; filter?: Filter }
  | { k: "reveal_hand"; count: number; filter?: Filter }
  | { k: "hand_to_deck_bottom"; count: number; filter?: Filter }
  | { k: "rest_self" }
  | { k: "trash_self" }
  | { k: "self_to_hand" }
  | { k: "self_to_deck_bottom" }
  | { k: "rest_cards"; selector: Selector; count: number }
  | { k: "trash_cards"; selector: Selector; count: number }
  | { k: "return_cards_to_hand"; selector: Selector; count: number }
  | { k: "cards_to_deck_bottom"; selector: Selector; count: number }
  | { k: "trash_to_deck_bottom"; count: number; filter?: Filter }
  | { k: "life_to_hand"; count: number; position: "top" | "top_or_bottom" }
  | { k: "trash_life"; count: number; position?: "top" | "top_or_bottom" }
  | { k: "return_active_don"; count: number }
  | { k: "ko_cards"; selector: Selector; count: number }
  /** Give your own active DON!! to one of your cards (as a cost). */
  | { k: "give_don"; count: number; selector: Selector }
  | { k: "play_from_hand"; count: number; filter?: Filter }
  | { k: "trash_to_deck_shuffle"; count: number }
  | { k: "life_face_down"; count: number }
  | { k: "life_face_up"; count: number }
  | { k: "mill"; count: number }
  | { k: "power"; target: "leader" | "self" | "active_leader"; amount: number }
  | { k: "give_opponent_don"; count: number }
  | { k: "place_self_in_life"; faceUp: boolean };

export type Placement = "deck_bottom" | "deck_top" | "trash" | "top_or_bottom" | "hand" | "shuffle";

export interface LookPick {
  filter?: Filter;
  min: number;
  max: number;
  dest: "hand" | "life_top" | "life_bottom" | "play" | "play_rested" | "trash" | "deck_top" | "deck_bottom";
  faceUp?: boolean;
  /** Bind picked cards for later steps. */
  bind?: string;
  totalCostAtMost?: Value;
  distinctNames?: boolean;
}

export type Effect =
  | { do: "seq"; steps: Effect[] }
  | { do: "if"; cond: Cond; then: Effect; else?: Effect }
  /** "You may [costs]: [then]" — optional; declining skips `then`. */
  | { do: "may"; costs?: Cost[]; then: Effect; prompt?: string; bind?: string; chooser?: Rel }
  /** Pay costs without an optional prompt (e.g. mandatory costs inside a sequence). */
  | { do: "pay"; costs: Cost[]; then: Effect; bind?: string }
  | { do: "choose_one"; options: { label: string; effect: Effect }[]; chooser?: Rel }
  | { do: "select"; bind: string; selector: Selector; min: number; max: number; chooser?: Rel; totalCostAtMost?: Value; totalPowerAtMost?: Value; distinctNames?: boolean; random?: boolean }
  | { do: "draw"; player: Rel; count: Value }
  | { do: "ko"; target: Target }
  | { do: "rest"; target: Target }
  | { do: "activate"; target: Target }
  | { do: "to_hand"; target: Target }
  | { do: "to_deck"; target: Target; position: "top" | "bottom" | "top_or_bottom" }
  | { do: "to_trash"; target: Target }
  | { do: "to_life"; target: Target; position: "top" | "bottom" | "top_or_bottom"; faceUp: boolean }
  | { do: "play"; target: Target; rested?: boolean }
  | { do: "power"; target: Target; amount: Value; duration: Duration }
  | { do: "cost"; target: Target; amount: Value; duration: Duration }
  | { do: "base_power"; target: Target; value: Value; duration: Duration }
  /** Final power becomes exactly this value (after all other modifiers). */
  | { do: "set_power"; target: Target; value: Value; duration: Duration }
  /** Run `effect` at the end of this turn / battle (a delayed one-shot). */
  | { do: "delay"; when: "end_of_turn" | "end_of_battle"; effect: Effect }
  /** Final cost becomes exactly this value. */
  | { do: "set_cost"; target: Target; value: Value; duration: Duration }
  /** Deal damage to a player's Leader outside battle (Life to hand, Triggers apply). */
  | { do: "damage"; player: Rel; count: number }
  /** Activate the [Main] effect of an Event (from hand or trash) without paying its cost. */
  | { do: "activate_event"; target: Target }
  | { do: "keyword"; target: Target; keyword: Keyword; duration: Duration }
  | { do: "restrict"; target: Target; restriction: Restriction; duration: Duration; value?: number; attribute?: string }
  | { do: "player_restrict"; player: Rel; restriction: PlayerRestriction; duration: Duration; filter?: Filter }
  | { do: "negate"; target: Target; duration: Duration }
  | { do: "add_don"; player: Rel; count: Value; rested: boolean }
  | { do: "give_don"; target: Target; count: number; donState: "rested" | "active" | "any"; player?: Rel }
  | { do: "set_don_active"; count: number }
  | { do: "rest_don"; player: Rel; count: number }
  | { do: "return_don"; player: Rel; count: number; chooser?: Rel; activeOnly?: boolean }
  | { do: "discard"; player: Rel; count: Value; chooser?: Rel; filter?: Filter; min?: number; random?: boolean }
  | { do: "hand_to_deck"; player: Rel; count: number; position: "top" | "bottom" | "top_or_bottom"; chooser?: Rel; filter?: Filter; min?: number }
  | { do: "hand_to_life"; count: number; position: "top" | "bottom"; faceUp: boolean; filter?: Filter; min?: number }
  | { do: "deck_to_life"; player: Rel; count: number; faceUp?: boolean }
  | { do: "life_to_hand"; player: Rel; count: number; position: "top" | "top_or_bottom" | "bottom"; min?: number }
  | { do: "trash_life"; player: Rel; count: Value; position?: "top" | "top_or_bottom" }
  | { do: "life_face"; player: Rel; count: number; faceUp: boolean; min?: number }
  | { do: "mill"; player: Rel; count: Value }
  | { do: "look"; player: Rel; count: Value; picks: LookPick[]; rest: Placement; reveal?: boolean }
  | { do: "look_life"; player: RelOrAny; count: number; rest: "top_or_bottom" | "any_order" }
  | { do: "reveal_top"; player: Rel; bind: string; zone?: "deck" | "life" }
  | { do: "shuffle"; player: Rel }
  | { do: "win" }
  | { do: "extra_turn" }
  | { do: "invoke"; window: "main" | "on_play" | "on_ko" | "counter" | "when_attacking" }
  | { do: "play_cost_reduction"; filter: Filter; amount: number; duration: Duration; next?: boolean }
  | { do: "redirect_attack"; target: Target }
  | { do: "reveal"; target: Target }
  | { do: "nothing" }
  | { do: "script"; scriptId: string; version: number; params?: Record<string, unknown> };

export type Static =
  | { s: "power"; target: StaticTarget; amount: Value }
  | { s: "cost"; target: StaticTarget; amount: Value }
  | { s: "base_power"; target: StaticTarget; value: Value }
  | { s: "keyword"; target: StaticTarget; keyword: Keyword }
  | { s: "restrict"; target: StaticTarget; restriction: Restriction; value?: number; attribute?: string }
  | { s: "player_restrict"; player: Rel; restriction: PlayerRestriction; filter?: Filter }
  /** Counter value of hand cards: set (replace) or add to printed value. */
  | { s: "counter"; filter: Filter; mode: "set" | "add"; value: number; onlyWithoutCounter?: boolean }
  /** Play cost from hand (the source itself when `self`). */
  | { s: "play_cost"; target: "self" | { filter: Filter }; amount: Value }
  | { s: "name_alias"; names: string[] }
  | { s: "deck_rule"; rule: string }
  | { s: "life_face"; faceUp: boolean };

export type StaticTarget = "self" | { all: Selector };

export type Trigger =
  | "static"
  | "on_play"
  | "when_attacking"
  | "on_ko"
  | "on_block"
  | "on_opp_attack"
  | "activate_main"
  | "main"
  | "counter"
  | "trigger"
  | "end_of_your_turn"
  | "end_of_opponent_turn"
  | "start_of_your_turn"
  | "on_event"
  | "replacement";

export type GameEventKind =
  | "character_ko"
  | "character_played"
  | "don_returned"
  | "self_rested"
  | "life_removed"
  | "event_activated"
  | "trigger_activated"
  | "attack_declared"
  | "card_trashed_from_hand"
  | "self_attacked"
  | "leader_damaged"
  | "character_removed_by_effect"
  | "character_returned"
  | "don_given"
  | "blocker_activated"
  /** This card won a battle and K.O.'d the opposing Character. */
  | "battle_ko_opponent"
  | "life_to_hand"
  /** This card's attack dealt damage to the opponent's Life. */
  | "attack_damage"
  /** This card was K.O.'d (resolves from the trash like On K.O.). */
  | "self_ko";

export interface EventTrigger {
  event: GameEventKind;
  /** Whose card/event: relative to controller. */
  player: RelOrAny;
  filter?: Filter;
  /** Event must be caused by the opponent's effect. */
  byOpponentEffect?: boolean;
}

export type ReplacementEvent = "ko" | "ko_by_effect" | "removed_by_opponent_effect" | "ko_in_battle" | "life_damage";

export interface Replacement {
  event: ReplacementEvent;
  /** "self" or a selector over the controller's field. */
  target: "self" | Selector;
  byOpponent?: boolean;
  /** Paid instead of the replaced event. Empty means the event is simply prevented. */
  instead: Effect;
  optional: boolean;
}

export interface Ability {
  id: string;
  trigger: Trigger;
  /** [Once Per Turn] */
  oncePerTurn?: boolean;
  /** [DON!! xN] */
  don?: number;
  /** Gate conditions checked when the ability would activate/apply. */
  conditions?: Cond[];
  /** Costs paid when activated or accepted (a cost makes a trigger optional). */
  costs?: Cost[];
  effect?: Effect;
  statics?: Static[];
  eventTrigger?: EventTrigger;
  replacement?: Replacement;
  /** Printed clause text this ability implements (display/audit only). */
  text: string;
}

export type SupportStatus = "supported" | "partial" | "unsupported" | "vanilla";

export interface CardAbilities {
  id: string;
  schemaVersion: typeof EFFECT_SCHEMA_VERSION;
  abilities: Ability[];
  /** Printed clauses the compiler/author could not express. */
  unsupported: string[];
  status: SupportStatus;
  /** Where these abilities came from. */
  origin: "generated" | "manual";
}
