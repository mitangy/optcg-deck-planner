import type { CardDefId } from "../types.js";

export const ABILITY_SCHEMA_VERSION = 1 as const;

export type AbilityKind = "activated" | "triggered" | "continuous" | "replacement" | "rule";
export type AbilityZone = "leader" | "character" | "stage" | "hand" | "life" | "trash";
export type AbilityWindow = "activate_main" | "on_play" | "main" | "life_trigger" | "on_ko" | "when_attacking" | "while_active";
export type AbilityCondition =
  | { type: "leader_has_trait"; trait: string }
  | { type: "leader_has_name"; names: string[] }
  | { type: "leader_is_monocolored" }
  | { type: "source_is_active" }
  | { type: "attached_don_at_least"; count: number }
  | { type: "controller_turn" }
  | { type: "opponent_turn" }
  | { type: "opponent_has_character_power_at_least"; power: number }
  | { type: "controller_has_character_power_at_least"; power: number }
  | { type: "leader_is_multicolored" }
  | { type: "opponent_life_at_most"; count: number }
  | { type: "any"; conditions: AbilityCondition[] };
export type AbilityCost = { type: "rest_don"; count: number } | { type: "rest_source" } | { type: "trash_hand"; count: number } | { type: "trash_source" };
export interface CardSelector { traits?: string[]; nameIncludes?: string[]; excludeDefIds?: CardDefId[] }
export type AbilityOperation =
  | { type: "draw_cards"; count: number; player: "controller" | "opponent" }
  | { type: "search_top_deck"; count: number; maxSelect: number; selector?: CardSelector; destination: "hand" | "life_top"; remainder: "deck_bottom" | "trash" }
  | { type: "attach_rested_don"; count: number; target: "intent_target"; optional: boolean }
  | { type: "invoke_ability"; abilityId: string }
  | { type: "grant_keyword"; keyword: "rush" | "rush_character" | "blocker" }
  | { type: "modify_power"; target: "source" | "friendly_characters"; amount: number; printedPower?: number; requiresTrigger?: boolean; perTrashCards?: number }
  | { type: "replace_base_power"; target: "leader" | "friendly_characters"; power: number; printedPower?: number; requiresTrigger?: boolean }
  | { type: "modify_play_cost"; target: "source_in_hand"; amount: number; minimum: number }
  | { type: "modify_field_cost"; target: "friendly_characters"; amount: number; minimum: number }
  | { type: "replace_counter"; target: "characters_in_hand"; value: number; printedPower?: number }
  | { type: "prevent_effect_ko"; target: "source" }
  | { type: "choose_power_modifier"; target: "friendly_leader_or_character" | "opponent_character"; amount: number; duration: "turn" | "battle"; maxTargets: number; excludeSource?: boolean; restedOnly?: boolean }
  | { type: "copy_opponent_character_power"; duration: "turn" }
  | { type: "choose_ko"; target: "opponent_character"; compare: "base_power" | "cost"; maxValue: number; maxTargets: number };
export interface CardAbilityProgram {
  schemaVersion: typeof ABILITY_SCHEMA_VERSION;
  id: string;
  kind: AbilityKind;
  zones: AbilityZone[];
  windows: AbilityWindow[];
  conditions: AbilityCondition[];
  costs: AbilityCost[];
  operations: AbilityOperation[];
  implementation: "implemented" | "partial" | "unsupported";
  testRefs: string[];
}
export interface CardAbilityRecord { cardDefId: CardDefId; abilities: readonly CardAbilityProgram[] }
export interface CompiledAbilityRegistry {
  schemaVersion: typeof ABILITY_SCHEMA_VERSION;
  contentHash: string;
  cards: ReadonlyMap<CardDefId, Readonly<CardAbilityRecord>>;
  abilities: ReadonlyMap<string, Readonly<CardAbilityProgram>>;
}
