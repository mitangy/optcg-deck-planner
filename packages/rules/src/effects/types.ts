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
  /** Number of distinct card names among cards matching the selector. */
  | { of: "distinct_names"; selector: Selector }
  | { of: "don_attached_total"; player: Rel }
  /** left - right (floored at 0). */
  | { of: "diff"; left: CountExpr; right: CountExpr }
  /** Total printed/current cost or power of the matching cards. */
  | { of: "total"; selector: Selector; field: "cost" | "power" }
  | { of: "leader_base_power"; player: Rel };

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
  /** Every DON!! on your field: cost area (active or rested) and attached to cards. */
  | "don_field"
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
  /** Current cost equals the number of DON!! cards given to the card. */
  costEqDonGiven?: boolean;
  /** Shares no color with any card bound to the named variable. */
  notColorsOfVar?: string;
  /** Has the same card name as a card bound to the named variable. */
  sameNameAsVar?: string;
  notAttributes?: string[];
  /** Only the ability's source card. */
  onlySelf?: boolean;
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
  | "cannot_be_blocked_by_power_or_more"
  | "cannot_activate_blocker"
  /** Protection from effects whose source card matches `filter`. */
  | "cannot_be_ko_by_effect_from"
  | "cannot_be_ko_by_opponent_effect_from"
  | "cannot_be_rested_by_opponent_effect_from"
  /** Cannot be K.O.'d in battle by attackers matching `filter`. */
  | "cannot_be_ko_in_battle_by"
  /** Cannot attack cards matching `filter`. */
  | "cannot_attack_matching"
  /** Attacking requires trashing `value` cards from hand. */
  | "attack_requires_discard";

export type PlayerRestriction =
  | "cannot_play_characters"
  | "cannot_play_cards_from_hand"
  | "cannot_play_events"
  | "cannot_add_life_to_hand_by_effect"
  | "cannot_attack_leader"
  | "cannot_draw_by_effect"
  | "cannot_set_don_active"
  | "cannot_set_don_active_by_character_effects"
  /** The restricted player's attacks may only target cards matching the filter. */
  | "attack_only_matching"
  /** The player's Character cards are played rested. */
  | "characters_played_rested"
  /** The player's [On Play] effects are negated. */
  | "on_play_negated";

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
  | { c: "turn_count"; op: CmpOp; value: number }
  /** The card battling the source (its opponent in the current battle) matches. */
  | { c: "battle_opponent"; filter: Filter }
  /** The source card carries a per-turn flag (e.g. "battled_character"). */
  | { c: "self_flag"; flag: string }
  /** Something happened this turn: events activated, Characters K.O.'d, hand cards trashed. */
  | { c: "this_turn"; what: "event_activated" | "character_koed" | "hand_trashed"; player: Rel; filter?: Filter };

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
  | { k: "hand_to_deck_top"; count: number }
  | { k: "trash_to_deck_shuffle"; count: number }
  | { k: "life_face_down"; count: number; position?: LifeFacePosition }
  | { k: "life_face_up"; count: number; position?: LifeFacePosition }
  | { k: "mill"; count: number }
  | { k: "power"; target: "leader" | "self" | "active_leader"; amount: number }
  | { k: "give_opponent_don"; count: number }
  | { k: "place_self_in_life"; faceUp: boolean }
  /** "Return 1 or more DON!! cards from your field": chosen DON!! (at least one). */
  | { k: "return_don_any" }
  /** Return given DON!! cards to the cost area rested. */
  | { k: "unattach_don"; count: number }
  /** "A or B": pay exactly one option (the player picks among payable ones). */
  | { k: "either"; options: Cost[][]; labels: string[] };

/** Which Life cards a face-up/down turn may reach: the top N (default), the top or the bottom N, or any single card. */
export type LifeFacePosition = "top" | "top_or_bottom" | "any";

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
  /**
   * "You may [costs]: [then]" — optional; declining skips `then`. With `chooser: "opponent"` the opponent decides and
   * pays: `costs` are written from their view ("you" is the chooser), offered only when payable in full (#515).
   */
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
  | { do: "delay"; when: "end_of_turn" | "end_of_battle" | "opponent_main"; effect: Effect }
  /** Final cost becomes exactly this value. */
  | { do: "set_cost"; target: Target; value: Value; duration: Duration }
  /** Deal damage to a player's Leader outside battle (Life to hand, Triggers apply). */
  | { do: "damage"; player: Rel; count: number }
  /** Activate the [Main] effect of an Event (from hand or trash) without paying its cost. */
  | { do: "activate_event"; target: Target }
  | { do: "keyword"; target: Target; keyword: Keyword; duration: Duration }
  | { do: "restrict"; target: Target; restriction: Restriction; duration: Duration; value?: number; attribute?: string; filter?: Filter }
  | { do: "player_restrict"; player: Rel; restriction: PlayerRestriction; duration: Duration; filter?: Filter }
  | { do: "negate"; target: Target; duration: Duration }
  | { do: "add_don"; player: Rel; count: Value; rested: boolean }
  | { do: "give_don"; target: Target; count: number; donState: "rested" | "active" | "any"; player?: Rel }
  | { do: "set_don_active"; count: number }
  | { do: "rest_don"; player: Rel; count: number }
  | { do: "return_don"; player: Rel; count?: Value; chooser?: Rel; activeOnly?: boolean; target?: Target }
  /** Pick a number 0..max (e.g. "choose a cost"); binds the number. */
  | { do: "choose_number"; bind: string; max: number; prompt?: string }
  /** Move up to `count` DON!! given to the `from` cards onto the first `to` card. */
  | { do: "move_don"; from: Target; to: Target; count: number }
  /** Swap the base power of the (two) targeted cards. */
  | { do: "swap_base_power"; target: Target; duration: Duration; with?: Target }
  | { do: "discard"; player: Rel; count: Value; chooser?: Rel; filter?: Filter; min?: number; random?: boolean }
  | { do: "hand_to_deck"; player: Rel; count: number; position: "top" | "bottom" | "top_or_bottom"; chooser?: Rel; filter?: Filter; min?: number }
  | { do: "hand_to_life"; count: number; position: "top" | "bottom"; faceUp: boolean; filter?: Filter; min?: number }
  | { do: "deck_to_life"; player: Rel; count: number; faceUp?: boolean }
  | { do: "life_to_hand"; player: Rel; count: number; position: "top" | "top_or_bottom" | "bottom"; min?: number }
  | { do: "trash_life"; player: Rel; count: Value; position?: "top" | "top_or_bottom" }
  | { do: "life_face"; player: Rel; count: number; faceUp: boolean; min?: number; position?: LifeFacePosition }
  /** `bind`: the trashed card(s), for "the trashed card" (#515). */
  | { do: "mill"; player: Rel; count: Value; bind?: string }
  /** `reveal`: the picked cards are shown to both players (printed "reveal"). Omitted = private. */
  | { do: "look"; player: Rel; count: Value; picks: LookPick[]; rest: Placement; reveal?: boolean }
  | { do: "look_life"; player: RelOrAny; count: number; rest: "top_or_bottom" | "any_order"; prompt?: string }
  /** Move the top Life card(s) to the top of the deck (unrevealed). */
  | { do: "life_to_deck"; player: Rel; count: number }
  /** Target gains an attribute. */
  | { do: "attribute"; target: Target; attribute: string; duration: Duration }
  /** Grant the controller this card's replacement ability `ability` (id suffix) for a duration. */
  | { do: "grant"; ability: string; duration: Duration }
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
  | { s: "restrict"; target: StaticTarget; restriction: Restriction; value?: number; attribute?: string; filter?: Filter }
  /** Negate the effects of matching cards (e.g. "all of your Characters without … have their effects negated"). */
  | { s: "negate"; target: StaticTarget }
  | { s: "player_restrict"; player: Rel; restriction: PlayerRestriction; filter?: Filter }
  /** Counter value of hand cards: set (replace) or add to printed value. */
  | { s: "counter"; filter: Filter; mode: "set" | "add"; value: number; onlyWithoutCounter?: boolean }
  /** Play cost from hand (the source itself when `self`). */
  | { s: "play_cost"; target: "self" | { filter: Filter }; amount: Value }
  | { s: "name_alias"; names: string[] }
  | { s: "deck_rule"; rule: string }
  | { s: "life_face"; faceUp: boolean };

export type StaticTarget = "self" | { all: Selector };

/** Optional per-entry gate on a static (in addition to the ability's conditions). */
export type GatedStatic = Static & { when?: Cond[] };

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
  | "self_ko"
  /** A card was drawn outside the Draw Phase. */
  | "card_drawn_by_effect"
  /** A Character (any player's) became rested by an effect. */
  | "character_rested"
  /** A Character left the field (K.O., returned, trashed or placed elsewhere). */
  | "character_left_field"
  /** Your Leader was declared as an attack target. */
  | "leader_attacked"
  /** A battle this card fought against an opposing Character ended (self only). */
  | "battle_ended_vs_character";

export interface EventTrigger {
  event: GameEventKind;
  /** Whose card/event: relative to controller. */
  player: RelOrAny;
  filter?: Filter;
  /** Event must be caused by the opponent's effect. */
  byOpponentEffect?: boolean;
  /** Event must be caused by any effect (not battle). */
  byEffect?: boolean;
  /** Event must be caused by the controller's own effect. */
  byYourEffect?: boolean;
  /** Further events that trigger the same ability ("When A or B"). */
  alsoEvents?: GameEventKind[];
  /** Minimum count carried by the event (e.g. "2 or more DON!! cards are returned"). */
  minCount?: number;
  /** Played-from zone for character_played ("played from your trash"). */
  fromZone?: "hand" | "trash" | "deck" | "life";
  /** The effect's source card must match (e.g. "by your {Navy} type card's effect"). */
  sourceFilter?: Filter;
  /** With both `filter` and `sourceFilter`: either may match. */
  either?: boolean;
}

export type ReplacementEvent = "ko" | "ko_by_effect" | "removed_by_opponent_effect" | "ko_in_battle" | "life_damage" | "rested_by_opponent_effect"
  /** Any removal from the field (K.O. or effect), by anyone. */
  | "removed";

export interface Replacement {
  event: ReplacementEvent;
  /** "self" or a selector over the controller's field. */
  target: "self" | Selector;
  byOpponent?: boolean;
  /** Further events the same replacement applies to. */
  alsoEvents?: ReplacementEvent[];
  /** The replaced effect's source card must match. */
  sourceFilter?: Filter;
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
  statics?: GatedStatic[];
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
