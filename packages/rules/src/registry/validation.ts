/** Runtime validators for untrusted JSON ability data, including nested fields. */
type Validator = (value: unknown, path: string, errors: string[]) => void;
const fail = (path: string, expected: string, errors: string[]) => { errors.push(`${path}: expected ${expected}`); };
const text: Validator = (value, path, errors) => { if (typeof value !== "string" || !value.trim()) fail(path, "non-empty string", errors); };
const bool: Validator = (value, path, errors) => { if (typeof value !== "boolean") fail(path, "boolean", errors); };
const integer = (minimum = Number.MIN_SAFE_INTEGER): Validator => (value, path, errors) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) fail(path, `safe integer >= ${minimum}`, errors);
};
const oneOf = (...values: string[]): Validator => (value, path, errors) => {
  if (typeof value !== "string" || !values.includes(value)) fail(path, values.join(" | "), errors);
};
const array = (item: Validator, minimum = 0): Validator => (value, path, errors) => {
  if (!Array.isArray(value) || value.length < minimum) { fail(path, `array with at least ${minimum} entries`, errors); return; }
  value.forEach((entry, index) => item(entry, `${path}[${index}]`, errors));
};
function fields(required: Record<string, Validator>, optional: Record<string, Validator> = {}): Validator {
  return (value, path, errors) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) { fail(path, "object", errors); return; }
    const row = value as Record<string, unknown>;
    for (const [key, validator] of Object.entries(required)) validator(row[key], `${path}.${key}`, errors);
    for (const key of Object.keys(row)) {
      if (Object.hasOwn(optional, key)) optional[key]!(row[key], `${path}.${key}`, errors);
      else if (!Object.hasOwn(required, key)) errors.push(`${path}.${key}: unknown field`);
    }
  };
}
function tagged(variants: Record<string, Validator>): Validator {
  return (value, path, errors) => {
    const type = value && typeof value === "object" ? (value as Record<string, unknown>).type : undefined;
    if (typeof type !== "string" || !Object.hasOwn(variants, type)) { errors.push(`${path}.type: unknown variant`); return; }
    variants[type]!(value, path, errors);
  };
}
const variant = (type: string, required: Record<string, Validator> = {}, optional: Record<string, Validator> = {}) => fields({ type: oneOf(type), ...required }, optional);
const strings = array(text, 1);
export const validateCondition: Validator = (value, path, errors) => conditions(value, path, errors);
const conditions = tagged({
  leader_has_trait: variant("leader_has_trait", { trait: text }),
  leader_has_name: variant("leader_has_name", { names: strings }),
  leader_is_monocolored: variant("leader_is_monocolored"),
  leader_is_multicolored: variant("leader_is_multicolored"),
  source_is_active: variant("source_is_active"),
  controller_turn: variant("controller_turn"),
  opponent_turn: variant("opponent_turn"),
  attached_don_at_least: variant("attached_don_at_least", { count: integer(0) }),
  opponent_life_at_most: variant("opponent_life_at_most", { count: integer(0) }),
  opponent_has_character_power_at_least: variant("opponent_has_character_power_at_least", { power: integer() }),
  controller_has_character_power_at_least: variant("controller_has_character_power_at_least", { power: integer() }),
  any: variant("any", { conditions: array(validateCondition, 1) }),
});
export const validateCost = tagged({
  rest_don: variant("rest_don", { count: integer(1) }),
  trash_hand: variant("trash_hand", { count: integer(1) }),
  rest_source: variant("rest_source"),
  trash_source: variant("trash_source"),
});
export const validateOperation = tagged({
  draw_cards: variant("draw_cards", { count: integer(1), player: oneOf("controller", "opponent") }),
  search_top_deck: variant("search_top_deck", { count: integer(1), maxSelect: integer(0), destination: oneOf("hand", "life_top"), remainder: oneOf("deck_bottom", "trash") }, { selector: fields({}, { traits: strings, nameIncludes: strings, excludeDefIds: strings }) }),
  attach_rested_don: variant("attach_rested_don", { count: integer(1), target: oneOf("intent_target"), optional: bool }),
  invoke_ability: variant("invoke_ability", { abilityId: text }),
  grant_keyword: variant("grant_keyword", { keyword: oneOf("rush", "rush_character", "blocker") }),
  modify_power: variant("modify_power", { target: oneOf("source", "friendly_characters"), amount: integer() }, { printedPower: integer(0), requiresTrigger: bool, perTrashCards: integer(1) }),
  replace_base_power: variant("replace_base_power", { target: oneOf("leader", "friendly_characters"), power: integer() }, { printedPower: integer(0), requiresTrigger: bool }),
  modify_play_cost: variant("modify_play_cost", { target: oneOf("source_in_hand"), amount: integer(), minimum: integer(0) }),
  modify_field_cost: variant("modify_field_cost", { target: oneOf("friendly_characters"), amount: integer(), minimum: integer(0) }),
  replace_counter: variant("replace_counter", { target: oneOf("characters_in_hand"), value: integer(0) }, { printedPower: integer(0) }),
  prevent_effect_ko: variant("prevent_effect_ko", { target: oneOf("source") }),
  choose_power_modifier: variant("choose_power_modifier", { target: oneOf("friendly_leader_or_character", "opponent_character"), amount: integer(), duration: oneOf("turn", "battle"), maxTargets: integer(1) }, { excludeSource: bool, restedOnly: bool }),
  copy_opponent_character_power: variant("copy_opponent_character_power", { duration: oneOf("turn") }),
  choose_ko: variant("choose_ko", { target: oneOf("opponent_character"), compare: oneOf("base_power", "cost"), maxValue: integer(), maxTargets: integer(1) }),
});

/** Prevent functions, cycles, unsupported prototypes and excessive nesting before validation. */
export function validateJson(value: unknown, path: string, errors: string[], parents = new Set<object>(), depth = 0): void {
  if (depth > 64) { errors.push(`${path}: nesting exceeds 64 levels`); return; }
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object") { errors.push(`${path}: expected JSON value`); return; }
  if (parents.has(value)) { errors.push(`${path}: cyclic data`); return; }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) { errors.push(`${path}: expected plain object`); return; }
  parents.add(value);
  for (const [key, item] of Object.entries(value)) validateJson(item, `${path}.${key}`, errors, parents, depth + 1);
  parents.delete(value);
}

export function freezeData<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freezeData); Object.freeze(value); }
  return value;
}

/** Object.freeze(Map) does not disable set/delete; expose only read methods. */
export function readonlyMap<K, V>(source: Map<K, V>): ReadonlyMap<K, V> {
  const view: ReadonlyMap<K, V> = Object.freeze({
    size: source.size,
    get: (key: K) => source.get(key),
    has: (key: K) => source.has(key),
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    [Symbol.iterator]: () => source[Symbol.iterator](),
    forEach: (callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) => {
      source.forEach((value, key) => callback.call(thisArg, value, key, view));
    },
  });
  return view;
}
