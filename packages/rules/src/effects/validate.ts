/**
 * Runtime validation for DSL ability data (generated JSON and manual overrides).
 * Unknown fields, unknown variants and malformed values are rejected with paths.
 */
type V = (value: unknown, path: string, errors: string[]) => void;

const fail = (path: string, expected: string, errors: string[]) => { errors.push(`${path}: expected ${expected}`); };
const str: V = (v, p, e) => { if (typeof v !== "string" || v.length === 0) fail(p, "non-empty string", e); };
const anyStr: V = (v, p, e) => { if (typeof v !== "string") fail(p, "string", e); };
const bool: V = (v, p, e) => { if (typeof v !== "boolean") fail(p, "boolean", e); };
const int = (min = Number.MIN_SAFE_INTEGER): V => (v, p, e) => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min) fail(p, `integer >= ${min}`, e); };
const oneOf = (...values: string[]): V => (v, p, e) => { if (typeof v !== "string" || !values.includes(v)) fail(p, values.join("|"), e); };
const arr = (item: V, min = 0): V => (v, p, e) => {
  if (!Array.isArray(v) || v.length < min) { fail(p, `array (>= ${min})`, e); return; }
  v.forEach((x, i) => item(x, `${p}[${i}]`, e));
};
const lazy = (get: () => V): V => (v, p, e) => get()(v, p, e);
function obj(required: Record<string, V>, optional: Record<string, V> = {}): V {
  return (v, p, e) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) { fail(p, "object", e); return; }
    const row = v as Record<string, unknown>;
    for (const [k, check] of Object.entries(required)) check(row[k], `${p}.${k}`, e);
    for (const k of Object.keys(row)) {
      if (Object.hasOwn(optional, k)) optional[k]!(row[k], `${p}.${k}`, e);
      else if (!Object.hasOwn(required, k)) e.push(`${p}.${k}: unknown field`);
    }
  };
}
function tagged(key: string, variants: Record<string, V>): V {
  return (v, p, e) => {
    const tag = v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
    if (typeof tag !== "string" || !Object.hasOwn(variants, tag)) { e.push(`${p}.${key}: unknown variant ${String(tag)}`); return; }
    variants[tag]!(v, p, e);
  };
}
const variant = (key: string, tag: string, required: Record<string, V> = {}, optional: Record<string, V> = {}) => obj({ [key]: oneOf(tag), ...required }, optional);

const rel = oneOf("you", "opponent");
const relAny = oneOf("you", "opponent", "any");
const cmpOp = oneOf("<=", ">=", "==", "<", ">", "!=");
const keyword = oneOf("blocker", "rush", "rush_character", "double_attack", "banish", "unblockable");
const duration = oneOf("battle", "turn", "until_start_of_your_next_turn", "until_end_of_opponent_next_turn", "until_end_of_your_next_turn", "permanent");
const restriction = oneOf("cannot_attack", "cannot_attack_leader", "cannot_block", "cannot_be_ko", "cannot_be_ko_by_effect", "cannot_be_ko_by_opponent_effect", "cannot_be_ko_in_battle", "cannot_be_removed_by_opponent_effect", "cannot_be_rested_by_opponent_effect", "cannot_be_rested", "cannot_be_ko_in_battle_by_attribute", "cannot_be_returned_by_opponent_effect", "no_refresh", "can_attack_active", "cannot_be_blocked_by_power_or_less", "cannot_be_blocked_by_cost_or_less", "cannot_be_blocked_by_power_or_more", "cannot_activate_blocker", "cannot_be_ko_by_effect_from", "cannot_be_ko_by_opponent_effect_from", "cannot_be_rested_by_opponent_effect_from", "cannot_be_ko_in_battle_by", "cannot_attack_matching", "attack_requires_discard");
const playerRestriction = oneOf("cannot_play_characters", "cannot_play_cards_from_hand", "cannot_play_events", "cannot_add_life_to_hand_by_effect", "cannot_attack_leader", "cannot_draw_by_effect", "cannot_set_don_active", "cannot_set_don_active_by_character_effects", "attack_only_matching", "characters_played_rested", "on_play_negated");
const zone = oneOf("leader", "character", "leader_or_character", "stage", "field", "hand", "trash", "hand_or_trash", "deck", "life", "deck_top", "don", "don_field", "resolving");
const cardType = oneOf("leader", "character", "event", "stage");
const strings = arr(str, 1);

const countExpr: V = tagged("of", {
  life: variant("of", "life", { player: relAny }),
  hand: variant("of", "hand", { player: rel }),
  trash: variant("of", "trash", { player: rel }),
  deck: variant("of", "deck", { player: rel }),
  don_field: variant("of", "don_field", { player: rel }),
  don_active: variant("of", "don_active", { player: rel }),
  don_rested: variant("of", "don_rested", { player: rel }),
  don_deck: variant("of", "don_deck", { player: rel }),
  don_attached_self: variant("of", "don_attached_self"),
  cards: variant("of", "cards", { selector: lazy(() => selector) }),
  var: variant("of", "var", { name: str }),
  var_sum: variant("of", "var_sum", { name: str, field: oneOf("cost", "power") }),
  leader_power: variant("of", "leader_power", { player: rel }),
  self_power: variant("of", "self_power"),
  battle_power: variant("of", "battle_power", { role: oneOf("attacker", "defender") }),
  sum: variant("of", "sum", { exprs: arr(lazy(() => countExpr), 1) }),
  distinct_names: variant("of", "distinct_names", { selector: lazy(() => selector) }),
  don_attached_total: variant("of", "don_attached_total", { player: rel }),
  diff: variant("of", "diff", { left: lazy(() => countExpr), right: lazy(() => countExpr) }),
  total: variant("of", "total", { selector: lazy(() => selector), field: oneOf("cost", "power") }),
  leader_base_power: variant("of", "leader_base_power", { player: rel }),
});
const value: V = (v, p, e) => {
  if (typeof v === "number") { if (!Number.isSafeInteger(v)) fail(p, "integer", e); return; }
  obj({ count: countExpr }, { times: int(), plus: int(), per: int(1) })(v, p, e);
};
const cmp = obj({ op: cmpOp, value });
const filter: V = obj({}, {
  types: arr(cardType, 1), traits: strings, traitIncludes: strings, notTraits: strings, names: strings, notNames: strings, nameIncludes: strings,
  colors: strings, multicolor: bool, attributes: strings, cost: cmp, baseCost: cmp, power: cmp, basePower: cmp, counter: cmp, hasCounter: bool,
  hasTrigger: bool, rested: bool, keyword, playedThisTurn: bool, excludeSelf: bool, excludeVar: str, inVar: str, faceUp: bool, any: arr(lazy(() => filter), 1),
  notTraitIncludes: strings, vanilla: bool, textIncludes: strings, textExcludes: strings, all: arr(lazy(() => filter), 1), donGiven: cmp, costEqDonGiven: bool, notColorsOfVar: str, sameNameAsVar: str, notAttributes: strings, onlySelf: bool,
});
const selector: V = obj({ player: relAny, zone }, { filter, also: arr(lazy(() => selector), 1) });

const target: V = tagged("ref", {
  self: variant("ref", "self"),
  leader: variant("ref", "leader", { player: rel }),
  var: variant("ref", "var", { name: str }),
  all: variant("ref", "all", { selector }),
  choose: variant("ref", "choose", { selector, min: int(0), max: int(0) }, { chooser: rel, bind: str, distinctNames: bool, totalCostAtMost: value, totalPowerAtMost: value }),
  battle: variant("ref", "battle", { role: oneOf("attacker", "defender", "opponent_battler", "own_battler") }),
  event_card: variant("ref", "event_card"),
});

const cond: V = tagged("c", {
  leader_name: variant("c", "leader_name", { names: strings }),
  leader_trait: variant("c", "leader_trait", { traits: strings }),
  leader_trait_includes: variant("c", "leader_trait_includes", { text: str }),
  leader_color: variant("c", "leader_color", { colors: strings }),
  leader_multicolor: variant("c", "leader_multicolor"),
  leader_active: variant("c", "leader_active"),
  compare: variant("c", "compare", { left: value, op: cmpOp, right: value }),
  exists: variant("c", "exists", { selector }, { atLeast: int(1) }),
  none: variant("c", "none", { selector }),
  your_turn: variant("c", "your_turn"),
  opponent_turn: variant("c", "opponent_turn"),
  self_don: variant("c", "self_don", { atLeast: int(1) }),
  self_rested: variant("c", "self_rested", { value: bool }),
  self_played_this_turn: variant("c", "self_played_this_turn"),
  var_count: variant("c", "var_count", { name: str, op: cmpOp, value }),
  var_all_match: variant("c", "var_all_match", { name: str, filter }),
  var_any_match: variant("c", "var_any_match", { name: str, filter }),
  battle_against: variant("c", "battle_against", { target: oneOf("character", "leader") }),
  attacker_is_self: variant("c", "attacker_is_self"),
  self_is_battle_target: variant("c", "self_is_battle_target"),
  not: variant("c", "not", { cond: lazy(() => cond) }),
  and: variant("c", "and", { conds: arr(lazy(() => cond), 1) }),
  or: variant("c", "or", { conds: arr(lazy(() => cond), 1) }),
  first_turn_of_player: variant("c", "first_turn_of_player"),
  turn_count: variant("c", "turn_count", { op: cmpOp, value: int(0) }),
  battle_opponent: variant("c", "battle_opponent", { filter }),
  self_flag: variant("c", "self_flag", { flag: str }),
  this_turn: variant("c", "this_turn", { what: oneOf("event_activated", "character_koed", "hand_trashed"), player: rel }, { filter }),
});

const cost: V = tagged("k", {
  rest_don: variant("k", "rest_don", { count: int(1) }),
  return_don: variant("k", "return_don", { count: int(1) }),
  trash_hand: variant("k", "trash_hand", { count: int(1) }, { filter }),
  reveal_hand: variant("k", "reveal_hand", { count: int(1) }, { filter }),
  hand_to_deck_bottom: variant("k", "hand_to_deck_bottom", { count: int(1) }, { filter }),
  rest_self: variant("k", "rest_self"),
  trash_self: variant("k", "trash_self"),
  self_to_hand: variant("k", "self_to_hand"),
  self_to_deck_bottom: variant("k", "self_to_deck_bottom"),
  rest_cards: variant("k", "rest_cards", { selector, count: int(1) }),
  trash_cards: variant("k", "trash_cards", { selector, count: int(1) }),
  return_cards_to_hand: variant("k", "return_cards_to_hand", { selector, count: int(1) }),
  cards_to_deck_bottom: variant("k", "cards_to_deck_bottom", { selector, count: int(1) }),
  trash_to_deck_bottom: variant("k", "trash_to_deck_bottom", { count: int(1) }, { filter }),
  life_to_hand: variant("k", "life_to_hand", { count: int(1), position: oneOf("top", "top_or_bottom") }),
  trash_life: variant("k", "trash_life", { count: int(1) }, { position: oneOf("top", "top_or_bottom") }),
  return_active_don: variant("k", "return_active_don", { count: int(1) }),
  ko_cards: variant("k", "ko_cards", { selector, count: int(1) }),
  give_don: variant("k", "give_don", { count: int(1), selector }),
  play_from_hand: variant("k", "play_from_hand", { count: int(1) }, { filter }),
  hand_to_deck_top: variant("k", "hand_to_deck_top", { count: int(1) }),
  trash_to_deck_shuffle: variant("k", "trash_to_deck_shuffle", { count: int(1) }),
  life_face_down: variant("k", "life_face_down", { count: int(1) }),
  life_face_up: variant("k", "life_face_up", { count: int(1) }),
  mill: variant("k", "mill", { count: int(1) }),
  power: variant("k", "power", { target: oneOf("leader", "self", "active_leader"), amount: int() }),
  give_opponent_don: variant("k", "give_opponent_don", { count: int(1) }),
  place_self_in_life: variant("k", "place_self_in_life", { faceUp: bool }),
  return_don_any: variant("k", "return_don_any"),
  unattach_don: variant("k", "unattach_don", { count: int(1) }),
  either: variant("k", "either", { options: arr(arr(lazy(() => cost), 1), 2), labels: arr(str, 2) }),
});

const lookPick = obj({ min: int(0), max: int(0), dest: oneOf("hand", "life_top", "life_bottom", "play", "play_rested", "trash", "deck_top", "deck_bottom") }, { filter, faceUp: bool, bind: str, totalCostAtMost: value, distinctNames: bool });
const placement = oneOf("deck_bottom", "deck_top", "trash", "top_or_bottom", "hand", "shuffle");

const effect: V = tagged("do", {
  seq: variant("do", "seq", { steps: arr(lazy(() => effect), 1) }),
  if: variant("do", "if", { cond, then: lazy(() => effect) }, { else: lazy(() => effect) }),
  may: variant("do", "may", { then: lazy(() => effect) }, { costs: arr(cost, 1), prompt: str, bind: str, chooser: rel }),
  pay: variant("do", "pay", { costs: arr(cost, 1), then: lazy(() => effect) }, { bind: str }),
  choose_one: variant("do", "choose_one", { options: arr(obj({ label: str, effect: lazy(() => effect) }), 2) }, { chooser: rel }),
  select: variant("do", "select", { bind: str, selector, min: int(0), max: int(0) }, { chooser: rel, totalCostAtMost: value, totalPowerAtMost: value, distinctNames: bool, random: bool }),
  draw: variant("do", "draw", { player: rel, count: value }),
  ko: variant("do", "ko", { target }),
  rest: variant("do", "rest", { target }),
  activate: variant("do", "activate", { target }),
  to_hand: variant("do", "to_hand", { target }),
  to_deck: variant("do", "to_deck", { target, position: oneOf("top", "bottom", "top_or_bottom") }),
  to_trash: variant("do", "to_trash", { target }),
  to_life: variant("do", "to_life", { target, position: oneOf("top", "bottom", "top_or_bottom"), faceUp: bool }),
  play: variant("do", "play", { target }, { rested: bool }),
  power: variant("do", "power", { target, amount: value, duration }),
  cost: variant("do", "cost", { target, amount: value, duration }),
  base_power: variant("do", "base_power", { target, value, duration }),
  set_power: variant("do", "set_power", { target, value, duration }),
  delay: variant("do", "delay", { when: oneOf("end_of_turn", "end_of_battle", "opponent_main"), effect: lazy(() => effect) }),
  set_cost: variant("do", "set_cost", { target, value, duration }),
  damage: variant("do", "damage", { player: rel, count: int(1) }),
  activate_event: variant("do", "activate_event", { target }),
  keyword: variant("do", "keyword", { target, keyword, duration }),
  restrict: variant("do", "restrict", { target, restriction, duration }, { value: int(), attribute: str, filter }),
  player_restrict: variant("do", "player_restrict", { player: rel, restriction: playerRestriction, duration }, { filter }),
  negate: variant("do", "negate", { target, duration }),
  add_don: variant("do", "add_don", { player: rel, count: value, rested: bool }),
  give_don: variant("do", "give_don", { target, count: int(1), donState: oneOf("rested", "active", "any") }, { player: rel }),
  set_don_active: variant("do", "set_don_active", { count: int(1) }),
  rest_don: variant("do", "rest_don", { player: rel, count: int(1) }),
  return_don: variant("do", "return_don", { player: rel }, { count: value, chooser: rel, activeOnly: bool, target }),
  choose_number: variant("do", "choose_number", { bind: str, max: int(1) }, { prompt: str }),
  move_don: variant("do", "move_don", { from: target, to: target, count: int(1) }),
  swap_base_power: variant("do", "swap_base_power", { target, duration }, { with: target }),
  life_to_deck: variant("do", "life_to_deck", { player: rel, count: int(1) }),
  attribute: variant("do", "attribute", { target, attribute: str, duration }),
  grant: variant("do", "grant", { ability: str, duration }),
  discard: variant("do", "discard", { player: rel, count: value }, { chooser: rel, filter, min: int(0), random: bool }),
  hand_to_deck: variant("do", "hand_to_deck", { player: rel, count: int(1), position: oneOf("top", "bottom", "top_or_bottom") }, { chooser: rel, filter, min: int(0) }),
  hand_to_life: variant("do", "hand_to_life", { count: int(1), position: oneOf("top", "bottom"), faceUp: bool }, { filter, min: int(0) }),
  deck_to_life: variant("do", "deck_to_life", { player: rel, count: int(1) }, { faceUp: bool }),
  life_to_hand: variant("do", "life_to_hand", { player: rel, count: int(1), position: oneOf("top", "top_or_bottom", "bottom") }, { min: int(0) }),
  trash_life: variant("do", "trash_life", { player: rel, count: value }, { position: oneOf("top", "top_or_bottom") }),
  life_face: variant("do", "life_face", { player: rel, count: int(1), faceUp: bool }, { min: int(0) }),
  mill: variant("do", "mill", { player: rel, count: value }),
  look: variant("do", "look", { player: rel, count: value, picks: arr(lookPick), rest: placement }, { reveal: bool }),
  look_life: variant("do", "look_life", { player: relAny, count: int(1), rest: oneOf("top_or_bottom", "any_order") }, { prompt: str }),
  reveal_top: variant("do", "reveal_top", { player: rel, bind: str }, { zone: oneOf("deck", "life") }),
  shuffle: variant("do", "shuffle", { player: rel }),
  win: variant("do", "win"),
  extra_turn: variant("do", "extra_turn"),
  invoke: variant("do", "invoke", { window: oneOf("main", "on_play", "on_ko", "counter", "when_attacking") }),
  play_cost_reduction: variant("do", "play_cost_reduction", { filter, amount: int(), duration }, { next: bool }),
  redirect_attack: variant("do", "redirect_attack", { target }),
  reveal: variant("do", "reveal", { target }),
  nothing: variant("do", "nothing"),
  script: variant("do", "script", { scriptId: str, version: int(1) }, { params: (v, p, e) => { if (!v || typeof v !== "object" || Array.isArray(v)) fail(p, "object", e); } }),
});

const staticTarget: V = (v, p, e) => { if (v === "self") return; obj({ all: selector })(v, p, e); };
const statik: V = tagged("s", {
  power: variant("s", "power", { target: staticTarget, amount: value }),
  cost: variant("s", "cost", { target: staticTarget, amount: value }),
  base_power: variant("s", "base_power", { target: staticTarget, value }),
  keyword: variant("s", "keyword", { target: staticTarget, keyword }),
  restrict: variant("s", "restrict", { target: staticTarget, restriction }, { value: int(), attribute: str, filter }),
  negate: variant("s", "negate", { target: staticTarget }),
  player_restrict: variant("s", "player_restrict", { player: rel, restriction: playerRestriction }, { filter }),
  counter: variant("s", "counter", { filter, mode: oneOf("set", "add"), value: int() }, { onlyWithoutCounter: bool }),
  play_cost: variant("s", "play_cost", { target: (v, p, e) => { if (v === "self") return; obj({ filter })(v, p, e); }, amount: value }),
  name_alias: variant("s", "name_alias", { names: strings }),
  deck_rule: variant("s", "deck_rule", { rule: str }),
  life_face: variant("s", "life_face", { faceUp: bool }),
});

const gatedStatic: V = (v, p, e) => {
  if (v && typeof v === "object" && !Array.isArray(v) && "when" in (v as Record<string, unknown>)) {
    const { when, ...rest } = v as Record<string, unknown>;
    arr(cond)(when, p + ".when", e);
    statik(rest, p, e);
    return;
  }
  statik(v, p, e);
};
const trigger = oneOf("static", "on_play", "when_attacking", "on_ko", "on_block", "on_opp_attack", "activate_main", "main", "counter", "trigger", "end_of_your_turn", "end_of_opponent_turn", "start_of_your_turn", "on_event", "replacement");
const gameEvent = oneOf("character_ko", "character_played", "don_returned", "self_rested", "life_removed", "event_activated", "trigger_activated", "attack_declared", "card_trashed_from_hand", "self_attacked", "leader_damaged", "character_removed_by_effect", "character_returned", "attack_damage", "self_ko", "don_given", "blocker_activated", "battle_ko_opponent", "life_to_hand", "card_drawn_by_effect", "character_rested", "character_left_field", "leader_attacked", "battle_ended_vs_character");
const eventTrigger = obj({ event: gameEvent, player: relAny }, { filter, byOpponentEffect: bool, byEffect: bool, byYourEffect: bool, alsoEvents: arr(gameEvent, 1), minCount: int(1), fromZone: oneOf("hand", "trash", "deck", "life"), sourceFilter: filter, either: bool });
const replacementEvent = oneOf("ko", "ko_by_effect", "removed_by_opponent_effect", "ko_in_battle", "life_damage", "rested_by_opponent_effect", "removed");
const replacement = obj({ event: replacementEvent, target: (v, p, e) => { if (v === "self") return; selector(v, p, e); }, instead: effect, optional: bool }, { byOpponent: bool, alsoEvents: arr(replacementEvent, 1), sourceFilter: filter });

const ability: V = (v, p, e) => {
  obj({ id: str, trigger, text: anyStr }, { oncePerTurn: bool, don: int(1), conditions: arr(cond), costs: arr(cost), effect, statics: arr(gatedStatic, 1), eventTrigger, replacement })(v, p, e);
  const a = v as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return;
  if (a.trigger === "static" && !a.statics) e.push(`${p}: static ability requires statics`);
  if (a.trigger !== "static" && a.statics) e.push(`${p}: statics are only valid on static abilities`);
  if (a.trigger === "on_event" && !a.eventTrigger) e.push(`${p}: on_event ability requires eventTrigger`);
  if (a.trigger === "replacement" && !a.replacement) e.push(`${p}: replacement ability requires replacement`);
  if (!["static", "replacement"].includes(String(a.trigger)) && !a.effect) e.push(`${p}: triggered/activated ability requires effect`);
};

export function validateCardAbilitiesRecord(value: unknown, path: string): string[] {
  const errors: string[] = [];
  obj({ id: str, schemaVersion: (v, pp, ee) => { if (v !== 2) fail(pp, "2", ee); }, abilities: arr(ability), unsupported: arr(anyStr), status: oneOf("supported", "partial", "unsupported", "vanilla"), origin: oneOf("generated", "manual") })(value, path, errors);
  const abilities = (value as { abilities?: { id?: string }[] } | null)?.abilities;
  if (Array.isArray(abilities)) {
    const ids = abilities.map((a) => a?.id);
    if (new Set(ids).size !== ids.length) errors.push(`${path}.abilities: duplicate ability id`);
  }
  return errors;
}
