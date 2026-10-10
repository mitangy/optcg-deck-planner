/**
 * Sentence grammar: protected card text → DSL effects, conditions, costs and statics.
 * Every parser returns null unless it consumes its entire input.
 */
import type { Cond, Cost, Duration, Effect, Filter, Keyword, LookPick, Placement, Rel, Restriction, Selector, Static, StaticTarget, Target, Value } from "../../effects/types.js";
import { restoreNames } from "./normalize.js";
import { nameList, num, parseCardPhrase, parseCountPhrase, quote, traitList, type CardPhrase, type Ctx, type PhraseOptions } from "./phrases.js";

type Rule<T> = [RegExp, (m: RegExpExecArray, ctx: Ctx) => T | null];

function firstMatch<T>(text: string, rules: Rule<T>[], ctx: Ctx): T | null {
  for (const [re, build] of rules) {
    const m = re.exec(text);
    if (!m) continue;
    const out = build(m, ctx);
    if (out) return out;
  }
  return null;
}

export function clean(sentence: string): string {
  return sentence.trim().replace(/\.$/, "").replace(/^then,?\s+/i, "").trim();
}

const rel = (text: string): Rel => (/opponent|their/i.test(text) ? "opponent" : "you");

export function parseDuration(text: string | undefined): Duration | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t === "during this turn" || t === "this turn") return "turn";
  if (t === "during this battle" || t === "this battle") return "battle";
  if (t === "until the start of your next turn") return "until_start_of_your_next_turn";
  if (t === "until the end of your opponent's next turn" || t === "until the end of your opponent's next end phase" || t === "during your opponent's next turn") return "until_end_of_opponent_next_turn";
  if (t === "until the end of your next turn" || t === "during your next turn") return "until_end_of_your_next_turn";
  return null;
}
const DUR = "(during this turn|during this battle|until the start of your next turn|until the end of your opponent's next turn|until the end of your opponent's next End Phase|until the end of your next turn|during your opponent's next turn)";

function phrase(text: string, ctx: Ctx, opts?: PhraseOptions): CardPhrase | null {
  return parseCardPhrase(text, ctx, opts);
}

export function toTarget(p: CardPhrase, bind?: string): Target {
  switch (p.quant.kind) {
    case "self": return { ref: "self" };
    case "leader": return { ref: "leader", player: p.quant.player };
    case "all": return { ref: "all", selector: p.selector };
    case "up_to": return { ref: "choose", selector: p.selector, min: 0, max: p.quant.n, ...(bind ? { bind } : {}), ...(p.totalCostAtMost != null ? { totalCostAtMost: p.totalCostAtMost } : {}), ...(p.totalPowerAtMost != null ? { totalPowerAtMost: p.totalPowerAtMost } : {}), ...(p.distinctNames ? { distinctNames: true } : {}) };
    case "exact": return { ref: "choose", selector: p.selector, min: p.quant.n, max: p.quant.n, ...(bind ? { bind } : {}), ...(p.totalCostAtMost != null ? { totalCostAtMost: p.totalCostAtMost } : {}), ...(p.distinctNames ? { distinctNames: true } : {}) };
  }
}

/** Targets on the field ("KO up to 1 of your opponent's Characters"). */
function fieldTarget(text: string, ctx: Ctx, bind = "_last"): Target | null {
  const t = text.trim();
  if (/^(?:that card|that character|it|the chosen character|that leader or character|that leader|the selected character|the selected card|the revealed card|the selected leader or character)$/i.test(t)) return { ref: "var", name: "_last" };
  if (/^(?:the attacking character|the attacking card|the attacker)$/i.test(t)) return { ref: "battle", role: "attacker" };
  if (/^(?:the character|the card) (?:that|which) (?:is being attacked|was attacked)$/i.test(t)) return { ref: "battle", role: "defender" };
  if (/^(?:the kod character|that kod character)$/i.test(t)) return { ref: "event_card" };
  const p = phrase(t, ctx);
  if (!p) return null;
  if (p.selector.zone === "hand" || p.selector.zone === "trash" || p.selector.zone === "deck" || p.selector.zone === "life") return null;
  if (p.selector.zone === "field" && !p.selector.filter?.types && p.quant.kind !== "self") {
    // "cards" on the field: Leader, Characters, and Stage.
  }
  return toTarget(p, bind);
}

function zoneTarget(text: string, zone: "hand" | "trash" | "deck" | "life" | "hand_or_trash", ctx: Ctx, bind = "_last"): Target | null {
  const p = phrase(text, ctx, { zone, defaultPlayer: "you" });
  if (!p) return null;
  p.selector = { ...p.selector, zone };
  if (p.selector.player === "any") p.selector.player = "you";
  return toTarget(p, bind);
}

function keywordOf(text: string): Keyword | null {
  const map: Record<string, Keyword> = { blocker: "blocker", rush: "rush", "rush: character": "rush_character", "double attack": "double_attack", banish: "banish", unblockable: "unblockable" };
  return map[text.toLowerCase()] ?? null;
}

function signed(text: string): number {
  return Number(text.replace("+", ""));
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const COND_RULES: Rule<Cond>[] = [
  [/^either you or your opponent has (\d+) life cards?$/i, (m) => ({ c: "or", conds: [{ c: "compare", left: { count: { of: "life", player: "you" } }, op: "==", right: num(m[1]!) }, { c: "compare", left: { count: { of: "life", player: "opponent" } }, op: "==", right: num(m[1]!) }] })],
  [/^either you or your opponent has (\d+) DON!! cards on the field$/i, (m) => ({ c: "or", conds: [{ c: "compare", left: { count: { of: "don_field", player: "you" } }, op: ">=", right: num(m[1]!) }, { c: "compare", left: { count: { of: "don_field", player: "opponent" } }, op: ">=", right: num(m[1]!) }] })],
  [/^your leader has the (§T\d+§) type or is (§N\d+§)$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); const n = nameList(m[2]!, ctx); return t && n ? { c: "or", conds: [{ c: "leader_trait", traits: t }, { c: "leader_name", names: n }] } : null; }],
  [/^your leader has the (§T\d+§) type or a type including (§Q\d+§)$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); const q = quote(m[2]!, ctx); return t && q ? { c: "or", conds: [{ c: "leader_trait", traits: t }, { c: "leader_trait_includes", text: q }] } : null; }],
  [/^your opponent's leader has (\d+) power or (more|less)$/i, (m) => ({ c: "compare", left: { count: { of: "leader_power", player: "opponent" } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) })],
  [/^you have (§N\d+§) and (§N\d+§)$/i, (m, ctx) => { const a = nameList(m[1]!, ctx); const b = nameList(m[2]!, ctx); return a && b ? { c: "and", conds: [{ c: "exists", selector: { player: "you", zone: "field", filter: { names: a } } }, { c: "exists", selector: { player: "you", zone: "field", filter: { names: b } } }] } : null; }],
  [/^it is your second turn or later$/i, () => ({ c: "turn_count", op: ">=", value: 2 })],
  [/^you have (\d+) (.+?) with different card names$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[2]!, ctx); return p ? { c: "compare", left: { count: { of: "distinct_names", selector: p.selector } }, op: ">=", right: num(m[1]!) } : null; }],
  [/^you have (\d+) or (less|more) cards in your hand and (?:a|an) (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[3]!, ctx); return p ? { c: "and", conds: [{ c: "compare", left: { count: { of: "hand", player: "you" } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) }, { c: "exists", selector: p.selector }] } : null; }],
  [/^you have (\d+) or (more|less) DON!! cards on your field and (\d+) or (less|more) cards in your hand$/i, (m) => ({ c: "and", conds: [{ c: "compare", left: { count: { of: "don_field", player: "you" } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) }, { c: "compare", left: { count: { of: "hand", player: "you" } }, op: m[4]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[3]!) }] })],
  [/^your leader is (§N\d+§) or multicolored$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { c: "or", conds: [{ c: "leader_name", names: n }, { c: "leader_multicolor" }] } : null; }],
  [/^your leader's colors include (red|green|blue|purple|black|yellow)$/i, (m) => ({ c: "leader_color", colors: [m[1]!.toLowerCase()] })],
  [/^(your|your opponent's) leader has the <(\w+)> attribute$/i, (m) => ({ c: "exists", selector: { player: rel(m[1]!), zone: "leader", filter: { attributes: [m[2]!] } } })],
  [/^your leader has the (§T\d+§) type or the <(\w+)> attribute$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); return t ? { c: "or", conds: [{ c: "leader_trait", traits: t }, { c: "exists", selector: { player: "you", zone: "leader", filter: { attributes: [m[2]!] } } }] } : null; }],
  [/^the number of your life cards is equal to or less than the number of your opponent's life cards$/i, () => ({ c: "compare", left: { count: { of: "life", player: "you" } }, op: "<=", right: { count: { of: "life", player: "opponent" } } })],
  [/^the number of cards in your hand is at least (\d+) less than the number in your opponent's hand$/i, (m) => ({ c: "compare", left: { count: { of: "hand", player: "you" }, plus: num(m[1]!) }, op: "<=", right: { count: { of: "hand", player: "opponent" } } })],
  [/^the number of your characters is at least (\d+) less than the number of your opponent's characters$/i, (m) => ({ c: "compare", left: { count: { of: "cards", selector: { player: "you", zone: "character" } }, plus: num(m[1]!) }, op: "<=", right: { count: { of: "cards", selector: { player: "opponent", zone: "character" } } } })],
  [/^(you|your opponent) (?:has|have) a total of (\d+) or more given DON!! cards$/i, (m) => ({ c: "compare", left: { count: { of: "don_attached_total", player: rel(m[1]!) } }, op: ">=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) any DON!! cards given$/i, (m) => ({ c: "compare", left: { count: { of: "don_attached_total", player: rel(m[1]!) } }, op: ">=", right: 1 })],
  [/^(?:there is|(you|your opponent) (?:has|have)) a character with a cost of (\d+) or with a cost of (\d+) or more$/i, (m) => ({ c: "exists", selector: { player: m[1] ? rel(m[1]) : "any", zone: "character", filter: { any: [{ cost: { op: "==", value: num(m[2]!) } }, { cost: { op: ">=", value: num(m[3]!) } }] } } })],
  [/^your deck has (\d+) cards$/i, (m) => ({ c: "compare", left: { count: { of: "deck", player: "you" } }, op: "==", right: num(m[1]!) })],
  [/^you only have (§T\d+§) type characters$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); return t ? { c: "none", selector: { player: "you", zone: "character", filter: { notTraits: t } } } : null; }],
  [/^(?:the trashed card) (?:is|has) (.+)$/i, (m, ctx) => { const body = m[1]!; const p = parseCardPhrase(/^(?:a|an|\d) /i.test(body) ? body : "all cards " + body, ctx) ?? parseCardPhrase("all cards with " + body, ctx); return p ? { c: "var_all_match", name: "_last", filter: p.selector.filter ?? {} } : null; }],
  [/^(?:that character) (?:is|has) (.+)$/i, (m, ctx) => { const body = m[1]!; const p = parseCardPhrase("all cards with " + body, ctx) ?? parseCardPhrase("all cards " + body, ctx); return p ? { c: "var_all_match", name: ctx.eventCard ? "_event" : "_last", filter: p.selector.filter ?? {} } : null; }],
  [/^this (?:character|leader) has (\d+) power or (more|less)$/i, (m) => ({ c: "compare", left: { count: { of: "self_power" } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) })],
  [/^your leader has (\d+) power or (more|less)$/i, (m) => ({ c: "compare", left: { count: { of: "leader_power", player: "you" } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) })],
  [/^your leader has (\d+) power or (more|less) and the (§T\d+§) type$/i, (m, ctx) => { const t = traitList(m[3]!, ctx); return t ? { c: "and", conds: [{ c: "compare", left: { count: { of: "leader_power", player: "you" } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) }, { c: "leader_trait", traits: t }] } : null; }],
  [/^your leader has the (§T\d+§) type and is active$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); return t ? { c: "and", conds: [{ c: "leader_trait", traits: t }, { c: "leader_active" }] } : null; }],
  [/^you have a face-up life card$/i, () => ({ c: "exists", selector: { player: "you", zone: "life", filter: { faceUp: true } } })],
  [/^all of your DON!! cards are rested$/i, () => ({ c: "compare", left: { count: { of: "don_active", player: "you" } }, op: "==", right: 0 })],
  [/^(you|your opponent) (?:has|have) (\d+) cards in (?:your|their) hand$/i, (m) => ({ c: "compare", left: { count: { of: "hand", player: rel(m[1]!) } }, op: "==", right: num(m[2]!) })],
  [/^you have a total of (\d+) or (less|more) cards in your life area and hand$/i, (m) => ({ c: "compare", left: { count: { of: "sum", exprs: [{ of: "life", player: "you" }, { of: "hand", player: "you" }] } }, op: m[2]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[1]!) })],
  [/^the number of DON!! cards on your field is at least (\d+) less than the number on your opponent's field$/i, (m) => ({ c: "compare", left: { count: { of: "don_field", player: "you" }, plus: num(m[1]!) }, op: "<=", right: { count: { of: "don_field", player: "opponent" } } })],
  [/^you have (less|fewer|more) characters than your opponent$/i, (m) => ({ c: "compare", left: { count: { of: "cards", selector: { player: "you", zone: "character" } } }, op: m[1]!.toLowerCase() === "more" ? ">" : "<", right: { count: { of: "cards", selector: { player: "opponent", zone: "character" } } } })],
  [/^you have no other (§N\d+§)(?: characters?)?$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { c: "none", selector: { player: "you", zone: "character", filter: { names: n, excludeSelf: true } } } : null; }],
  [/^you do not have (\d+) (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[2]!, ctx); return p ? { c: "compare", left: { count: { of: "cards", selector: p.selector } }, op: "<", right: num(m[1]!) } : null; }],
  [/^you have (§N\d+§) and (§N\d+§) in your trash$/i, (m, ctx) => { const a = nameList(m[1]!, ctx); const b = nameList(m[2]!, ctx); return a && b ? { c: "and", conds: [{ c: "exists", selector: { player: "you", zone: "trash", filter: { names: a } } }, { c: "exists", selector: { player: "you", zone: "trash", filter: { names: b } } }] } : null; }],
  [/^(you|your opponent) (?:has|have) (\d+) (.+?)(?: on (?:your|their) field)?$/i, (m, ctx) => { if (/life|cards in|DON!!/i.test(m[3]!)) return null; const p = parseCardPhrase("all " + (rel(m[1]!) === "you" ? "your " : "your opponent's ") + m[3]!, ctx); return p ? { c: "exists", selector: p.selector, atLeast: num(m[2]!) } : null; }],
  [/^you have (\d+) or (\d+) or more DON!! cards on your field$/i, (m) => ({ c: "or", conds: [{ c: "compare", left: { count: { of: "don_field", player: "you" } }, op: "==", right: num(m[1]!) }, { c: "compare", left: { count: { of: "don_field", player: "you" } }, op: ">=", right: num(m[2]!) }] })],
  [/^(?:the revealed card|that card|it)'s type includes (§Q\d+§)$/i, (m, ctx) => { const q = quote(m[1]!, ctx); return q ? { c: "var_all_match", name: "_last", filter: { traitIncludes: [q] } } : null; }],
  [/^(?:the revealed card|that card|it) (?:is|has) (.+)$/i, (m, ctx) => { const body = m[1]!; const p = parseCardPhrase(/^(?:a|an|\d) /i.test(body) ? body : "all cards " + body, ctx) ?? parseCardPhrase("all cards with " + body, ctx); return p ? { c: "var_all_match", name: "_last", filter: p.selector.filter ?? {} } : null; }],
  [/^you have (§N\d+§(?:(?: or |, )§N\d+§)*)(?: on your field)?$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { c: "exists", selector: { player: "you", zone: "field", filter: { names: n } } } : null; }],
  [/^(you|your opponent) (?:has|have) (\d+) life cards?$/i, (m) => ({ c: "compare", left: { count: { of: "life", player: rel(m[1]!) } }, op: "==", right: num(m[2]!) })],
  [/^the only characters on your field are (§T\d+§(?:(?:, | or )§T\d+§)*) type characters$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); return t ? { c: "none", selector: { player: "you", zone: "character", filter: { notTraits: t } } } : null; }],
  [/^you only have characters with a type including (§Q\d+§)$/i, (m, ctx) => { const q = quote(m[1]!, ctx); return q ? { c: "none", selector: { player: "you", zone: "character", filter: { notTraitIncludes: [q] } } } : null; }],
  [/^you have any DON!! cards given$/i, () => ({ c: "compare", left: { count: { of: "don_attached_total", player: "you" } }, op: ">=", right: 1 })],
  [/^(you|your opponent) (?:has|have) (\d+) or (more|less) (.+?) in (?:your|their) trash$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[4]!, ctx, { zone: "trash" }); return p ? { c: "compare", left: { count: { of: "cards", selector: { ...p.selector, player: rel(m[1]!), zone: "trash" } } }, op: m[3]!.toLowerCase() === "more" ? ">=" : "<=", right: num(m[2]!) } : null; }],
  [/^your leader is (§N\d+§(?:(?:, | or |, or )§N\d+§)*)$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { c: "leader_name", names: n } : null; }],
  [/^your leader is multicolored$/i, () => ({ c: "leader_multicolor" })],
  [/^your leader is active$/i, () => ({ c: "leader_active" })],
  [/^your leader is (red|green|blue|purple|black|yellow)$/i, (m) => ({ c: "leader_color", colors: [m[1]!.toLowerCase()] })],
  [/^your leader has the (§T\d+§(?:(?:, | or |, or )§T\d+§)*) type$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); return t ? { c: "leader_trait", traits: t } : null; }],
  [/^your leader's type includes (§Q\d+§)$/i, (m, ctx) => { const q = quote(m[1]!, ctx); return q ? { c: "leader_trait_includes", text: q } : null; }],
  [/^your leader is (§N\d+§) or has the (§T\d+§) type$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); const t = traitList(m[2]!, ctx); return n && t ? { c: "or", conds: [{ c: "leader_name", names: n }, { c: "leader_trait", traits: t }] } : null; }],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) life cards?$/i, (m) => ({ c: "compare", left: { count: { of: "life", player: rel(m[1]!) } }, op: /more/.test(m[3]!) ? ">=" : "<=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) no life cards$/i, (m) => ({ c: "compare", left: { count: { of: "life", player: rel(m[1]!) } }, op: "==", right: 0 })],
  [/^you and your opponent have a total of (\d+) or (less|more) life cards$/i, (m) => ({ c: "compare", left: { count: { of: "life", player: "any" } }, op: m[2] === "less" ? "<=" : ">=", right: num(m[1]!) })],
  [/^you have (less|more|fewer) life cards than your opponent$/i, (m) => ({ c: "compare", left: { count: { of: "life", player: "you" } }, op: m[1] === "more" ? ">" : "<", right: { count: { of: "life", player: "opponent" } } })],
  [/^your opponent has (less|more|fewer) life cards than you$/i, (m) => ({ c: "compare", left: { count: { of: "life", player: "opponent" } }, op: m[1] === "more" ? ">" : "<", right: { count: { of: "life", player: "you" } } })],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) cards in (?:your|their) hand$/i, (m) => ({ c: "compare", left: { count: { of: "hand", player: rel(m[1]!) } }, op: /more/.test(m[3]!) ? ">=" : "<=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) cards in (?:your|their) trash$/i, (m) => ({ c: "compare", left: { count: { of: "trash", player: rel(m[1]!) } }, op: /more/.test(m[3]!) ? ">=" : "<=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) cards in (?:your|their) deck$/i, (m) => ({ c: "compare", left: { count: { of: "deck", player: rel(m[1]!) } }, op: /more/.test(m[3]!) ? ">=" : "<=", right: num(m[2]!) })],
  [/^there (?:is|are) (\d+) or (less|more) cards in (your|your opponent's) deck$/i, (m) => ({ c: "compare", left: { count: { of: "deck", player: rel(m[3]!) } }, op: m[2] === "more" ? ">=" : "<=", right: num(m[1]!) })],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) DON!! cards on (?:your|their) field$/i, (m) => ({ c: "compare", left: { count: { of: "don_field", player: rel(m[1]!) } }, op: /more/.test(m[3]!) ? ">=" : "<=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) (\d+) DON!! cards on (?:your|their) field$/i, (m) => ({ c: "compare", left: { count: { of: "don_field", player: rel(m[1]!) } }, op: ">=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more) rested DON!! cards$/i, (m) => ({ c: "compare", left: { count: { of: "don_rested", player: rel(m[1]!) } }, op: m[3] === "more" ? ">=" : "<=", right: num(m[2]!) })],
  [/^(you|your opponent) (?:has|have) (\d+) or (less|more) active DON!! cards$/i, (m) => ({ c: "compare", left: { count: { of: "don_active", player: rel(m[1]!) } }, op: m[3] === "more" ? ">=" : "<=", right: num(m[2]!) })],
  [/^the number of DON!! cards on your field is equal to or less than the number on your opponent's field$/i, () => ({ c: "compare", left: { count: { of: "don_field", player: "you" } }, op: "<=", right: { count: { of: "don_field", player: "opponent" } } })],
  [/^the number of DON!! cards on your field is equal to or more than the number on your opponent's field$/i, () => ({ c: "compare", left: { count: { of: "don_field", player: "you" } }, op: ">=", right: { count: { of: "don_field", player: "opponent" } } })],
  [/^your opponent has more DON!! cards on their field than you$/i, () => ({ c: "compare", left: { count: { of: "don_field", player: "opponent" } }, op: ">", right: { count: { of: "don_field", player: "you" } } })],
  [/^you have (\d+) or more cards in your hand than your opponent$/i, (m) => ({ c: "compare", left: { count: { of: "hand", player: "you" } }, op: ">=", right: { count: { of: "hand", player: "opponent" }, plus: num(m[1]!) } })],
  [/^this (?:character|card) was played on this turn$/i, () => ({ c: "self_played_this_turn" })],
  [/^this character is rested$/i, () => ({ c: "self_rested", value: true })],
  [/^this character is active$/i, () => ({ c: "self_rested", value: false })],
  [/^it is your turn$/i, () => ({ c: "your_turn" })],
  [/^it is your opponent's turn$/i, () => ({ c: "opponent_turn" })],
  [/^this character is battling (?:your opponent's|an opponent's) character$/i, () => ({ c: "battle_against", target: "character" })],
  [/^you don't have (§N\d+§(?:(?: or |, )§N\d+§)*)$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { c: "none", selector: { player: "you", zone: "leader_or_character", filter: { names: n } } } : null; }],
  [/^you have no other (§N\d+§) characters?$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { c: "none", selector: { player: "you", zone: "character", filter: { names: n, excludeSelf: true } } } : null; }],
  [/^(you|your opponent) (?:has|have) (\d+) or more (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[3]!}`, ctx);
    return p && p.quant.kind === "all" ? { c: "exists", selector: p.selector, atLeast: num(m[2]!) } : null;
  }],
  [/^(you|your opponent) (?:has|have) (\d+) or less (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[3]!}`, ctx);
    return p && p.quant.kind === "all" ? { c: "compare", left: { count: { of: "cards", selector: p.selector } }, op: "<=", right: num(m[2]!) } : null;
  }],
  [/^(you|your opponent) (?:has|have) (?:a|an|any) (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[2]!}`, ctx);
    return p && p.quant.kind === "all" ? { c: "exists", selector: p.selector } : null;
  }],
  [/^(you|your opponent) (?:has|have) no (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[2]!}`, ctx);
    return p && p.quant.kind === "all" ? { c: "none", selector: p.selector } : null;
  }],
  [/^there (?:is|are) (?:a|an) (.+?)(?: on the field)?$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[1]!}`, ctx); return p && p.quant.kind === "all" ? { c: "exists", selector: p.selector } : null; }],
  [/^there are (\d+) or more (.+?)(?: on the field)?$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p && p.quant.kind === "all" ? { c: "exists", selector: p.selector, atLeast: num(m[1]!) } : null; }],
  [/^(?:the number of )?(.+?) is (\d+) or (more|less)$/i, (m, ctx) => { const count = parseCountPhrase(m[1]!, ctx); return count ? { c: "compare", left: { count }, op: m[3] === "more" ? ">=" : "<=", right: num(m[2]!) } : null; }],
  [/^this character has (\d+) or more DON!! cards given to it$/i, (m) => ({ c: "self_don", atLeast: num(m[1]!) })],
  [/^this (?:leader|character) is attacking$/i, () => ({ c: "attacker_is_self" })],
];

export function parseCondition(text: string, ctx: Ctx): Cond | null {
  const t = text.trim().replace(/^if /i, "").replace(/,$/, "");
  const direct = firstMatch(t, COND_RULES, ctx);
  if (direct) return direct;
  // Conjunctions: try every " and " split.
  const parts = splitTop(t, / and /);
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 1) {
      const left = parseCondition(parts.slice(0, i).join(" and "), ctx);
      const right = left && parseCondition(parts.slice(i).join(" and "), ctx);
      if (left && right) return { c: "and", conds: [left, right] };
    }
  }
  const ors = splitTop(t, / or /);
  if (ors.length > 1) {
    for (let i = 1; i < ors.length; i += 1) {
      const left = parseCondition(ors.slice(0, i).join(" or "), ctx);
      const right = left && parseCondition(ors.slice(i).join(" or "), ctx);
      if (left && right) return { c: "or", conds: [left, right] };
    }
  }
  return null;
}

function splitTop(text: string, sep: RegExp): string[] {
  return text.split(sep);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

const COST_RULES: Rule<Cost>[] = [
  [/^reveal a total of (\d+) (.+?) from your hand$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[2]!, ctx) ?? parseCardPhrase("all " + m[2]!.replace(/^event or /i, "") , ctx); if (!p) return null; const filter = /^event or /i.test(m[2]!) && p.selector.filter ? { any: [{ types: ["event" as const] }, p.selector.filter] } : p.selector.filter; return { k: "reveal_hand", count: num(m[1]!), ...(filter ? { filter } : {}) }; }],
  [/^return (\d+) characters? to your hand$/i, (m) => ({ k: "return_cards_to_hand", selector: { player: "you", zone: "character" }, count: num(m[1]!) })],
  [/^play (\d+) (.+?) from your hand$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[2]!, ctx); return p ? { k: "play_from_hand", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^return (\d+) cards? from your trash to your deck and shuffle it$/i, (m) => ({ k: "trash_to_deck_shuffle", count: num(m[1]!) })],
  [/^place this card and (\d+) cards? from your hand at the bottom of your deck(?: in any order)?$/i, (m) => null],
  [/^give your (?:1 )?active leader -(\d+) power during this turn$/i, (m) => ({ k: "power", target: "active_leader", amount: -num(m[1]!) })],
  [/^trash (\d+) cards? from the top or bottom of your life cards$/i, (m) => ({ k: "trash_life", count: num(m[1]!), position: "top_or_bottom" })],
  [/^give (\d+) active DON!! cards? to (?:1 of )?(.+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[2]!.replace(/^your /i, ""), ctx); return p ? { k: "give_don", count: num(m[1]!), selector: p.selector } : null; }],
  [/^place (\d+) (.+?) at the bottom of (?:the owner's|your) deck$/i, (m, ctx) => { if (/from your (hand|trash)/i.test(m[2]!)) return null; const p = parseCardPhrase("all your " + m[2]!, ctx); return p ? { k: "cards_to_deck_bottom", selector: p.selector, count: num(m[1]!) } : null; }],
  [/^rest your (?:1 )?leader$/i, () => ({ k: "rest_cards", selector: { player: "you", zone: "leader" }, count: 1 })],
  [/^rest your leader (§N\d+§(?:(?:, | or )§N\d+§)*)$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? { k: "rest_cards", selector: { player: "you", zone: "leader", filter: { names: n, rested: false } }, count: 1 } : null; }],
  [/^KO (\d+) of your (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[2]!, ctx); return p ? { k: "ko_cards", selector: p.selector, count: num(m[1]!) } : null; }],
  [/^return (\d+) of your active DON!! cards? to your DON!! deck$/i, (m) => ({ k: "return_active_don", count: num(m[1]!) })],
  [/^return (\d+) DON!! cards? from your field to your DON!! deck$/i, (m) => ({ k: "return_don", count: num(m[1]!) })],
  [/^add (\d+) cards? from your life area to your hand$/i, (m) => ({ k: "life_to_hand", count: num(m[1]!), position: "top" })],
  [/^place this (?:card|character) and (\d+) cards? from your hand at the bottom of your deck(?: in any order)?$/i, () => null],
  [/^DON!! -(\d+)$/i, (m) => ({ k: "return_don", count: num(m[1]!) })],
  [/^\[RDON (\d+)\]$/, (m) => ({ k: "rest_don", count: num(m[1]!) })],
  [/^rest (\d+) of your DON!! cards?$/i, (m) => ({ k: "rest_don", count: num(m[1]!) })],
  [/^rest this (?:character|stage|leader|card)$/i, () => ({ k: "rest_self" })],
  [/^trash this (?:character|stage|card)$/i, () => ({ k: "trash_self" })],
  [/^return this character to the owner's hand$/i, () => ({ k: "self_to_hand" })],
  [/^place this character at the bottom of the owner's deck$/i, () => ({ k: "self_to_deck_bottom" })],
  [/^trash (\d+|a) cards? from your hand$/i, (m) => ({ k: "trash_hand", count: num(m[1]!) })],
  [/^trash (\d+|a) (.+?) from your hand$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p ? { k: "trash_hand", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^reveal (\d+) (.+?) from your hand$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p ? { k: "reveal_hand", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^place (\d+) cards? from your hand at the bottom of your deck(?: in any order)?$/i, (m) => ({ k: "hand_to_deck_bottom", count: num(m[1]!) })],
  [/^place (\d+) (.+?) from your hand at the bottom of your deck(?: in any order)?$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p ? { k: "hand_to_deck_bottom", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^(?:place|return) (\d+) cards? from your trash (?:at|to) the bottom of your deck(?: in any order)?$/i, (m) => ({ k: "trash_to_deck_bottom", count: num(m[1]!) })],
  [/^(?:place|return) (\d+) (.+?) from your trash (?:at|to) the bottom of your deck(?: in any order)?$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p ? { k: "trash_to_deck_bottom", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^add (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({ k: "life_to_hand", count: num(m[1]!), position: "top" })],
  [/^add (\d+) cards? from the top or bottom of your life cards to your hand$/i, (m) => ({ k: "life_to_hand", count: num(m[1]!), position: "top_or_bottom" })],
  [/^trash (\d+) cards? from the top of your life cards$/i, (m) => ({ k: "trash_life", count: num(m[1]!) })],
  [/^turn (\d+) cards? from the top of your life cards face-down$/i, (m) => ({ k: "life_face_down", count: num(m[1]!) })],
  [/^turn (\d+) cards? from the top of your life cards face-up$/i, (m) => ({ k: "life_face_up", count: num(m[1]!) })],
  [/^trash (\d+) cards? from the top of your deck$/i, (m) => ({ k: "mill", count: num(m[1]!) })],
  [/^give your (active )?leader -(\d+) power during this turn$/i, (m) => ({ k: "power", target: m[1] ? "active_leader" : "leader", amount: -num(m[2]!) })],
  [/^give this character -(\d+) power during this turn$/i, (m) => ({ k: "power", target: "self", amount: -num(m[1]!) })],
  [/^give (\d+) of your opponent's rested DON!! cards? to 1 of your opponent's characters$/i, (m) => ({ k: "give_opponent_don", count: num(m[1]!) })],
  [/^rest (\d+) of your (.+)$/i, (m, ctx) => { const p = parseCardPhrase(`all your ${m[2]!}`, ctx); return p ? { k: "rest_cards", selector: { ...p.selector, filter: { ...p.selector.filter, rested: false } }, count: num(m[1]!) } : null; }],
  [/^trash (\d+) of your (.+)$/i, (m, ctx) => { const p = parseCardPhrase(`all your ${m[2]!}`, ctx); return p ? { k: "trash_cards", selector: p.selector, count: num(m[1]!) } : null; }],
  [/^return (\d+) of your (.+?) to (?:the owner's|your) hand$/i, (m, ctx) => { const p = parseCardPhrase(`all your ${m[2]!}`, ctx); return p ? { k: "return_cards_to_hand", selector: p.selector, count: num(m[1]!) } : null; }],
  [/^place (\d+) of your (.+?) at the bottom of (?:the owner's|your) deck$/i, (m, ctx) => { const p = parseCardPhrase(`all your ${m[2]!}`, ctx); return p ? { k: "cards_to_deck_bottom", selector: p.selector, count: num(m[1]!) } : null; }],
  [/^place this card at the (top|bottom) of your life cards face-(up|down)$/i, (m) => ({ k: "place_self_in_life", faceUp: m[2] === "up" })],
];

export function parseCosts(text: string, ctx: Ctx): Cost[] | null {
  const t = text.trim().replace(/^you may /i, "").replace(/,$/, "").trim();
  if (!t) return [];
  const combined = /^rest (\d+) of your DON!! cards? and this (?:character|stage|leader)$/i.exec(t);
  if (combined) return [{ k: "rest_don", count: num(combined[1]!) }, { k: "rest_self" }];
  const direct = firstMatch(t, COST_RULES, ctx);
  if (direct) return [direct];
  // Split on ", you may", " and you may", ", and", " and", ","
  const seps = [/,\s*(?:and\s+)?(?:you may\s+)?/i, /\s+and\s+(?:you may\s+)?/i, /\s+/];
  for (const sep of seps.slice(0, 2)) {
    const parts = t.split(sep);
    if (parts.length < 2) continue;
    for (let i = 1; i < parts.length; i += 1) {
      const left = parseCosts(parts.slice(0, i).join(" and "), ctx);
      const right = left && parseCosts(parts.slice(i).join(" and "), ctx);
      if (left && right) return [...left, ...right];
    }
  }
  const noComma = /^(DON!! -\d+) (?:you may )?(.+)$/i.exec(t);
  if (noComma) { const a = parseCosts(noComma[1]!, ctx); const b = a && parseCosts(noComma[2]!, ctx); if (a && b) return [...a, ...b]; }
  const carry = /^(rest|trash|return|place) (this (?:character|stage|leader|card)) and (\d+ .+)$/i.exec(t);
  if (carry) { const a = parseCosts(carry[1] + " " + carry[2], ctx); const b = a && parseCosts(carry[1] + " " + carry[3], ctx); if (a && b) return [...a, ...b]; }
  const carry2 = /^(rest|trash|return|place) (\d+ .+?) and (this (?:character|stage|leader|card))(.*)$/i.exec(t);
  if (carry2) { const a = parseCosts(carry2[1] + " " + carry2[2] + carry2[4], ctx); const b = a && parseCosts(carry2[1] + " " + carry2[3] + carry2[4], ctx); if (a && b) return [...a, ...b]; }
  // "[RDON 1] you may rest this Character"
  const rdon = /^(\[RDON \d+\])\s+(.+)$/.exec(t);
  if (rdon) { const a = parseCosts(rdon[1]!, ctx); const b = a && parseCosts(rdon[2]!, ctx); if (a && b) return [...a, ...b]; }
  return null;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

const DON_TARGET: Record<string, (ctx: Ctx) => Target> = {};

function donRecipient(text: string, ctx: Ctx): Target | null {
  const t = text.trim().toLowerCase();
  if (t === "your leader or 1 of your characters" || t === "your leader or up to 1 of your characters" || t === "1 of your leader or character cards" || t === "your leader or character" || t === "this leader or 1 of your characters") return { ref: "choose", selector: { player: "you", zone: "leader_or_character" }, min: 0, max: 1 };
  if (t === "your leader") return { ref: "leader", player: "you" };
  if (t === "this character" || t === "this leader") return { ref: "self" };
  if (t === "1 of your characters" || t === "up to 1 of your characters") return { ref: "choose", selector: { player: "you", zone: "character" }, min: 0, max: 1 };
  const p = parseCardPhrase(text.replace(/^(?:1|up to 1) of /i, "1 of "), ctx);
  if (p) { const target = toTarget(p); if (target.ref === "choose") return { ...target, min: 0, max: 1 }; return target; }
  void DON_TARGET;
  return null;
}

function lookDest(text: string): LookPick["dest"] | null {
  const t = text.trim().toLowerCase();
  if (t === "add it to your hand" || t === "add them to your hand" || t === "add it to your hand" ) return "hand";
  if (t === "play it" || t === "play them") return "play";
  if (t === "play it rested") return "play_rested";
  if (t === "add it to the top of your life cards") return "life_top";
  if (t === "trash it" || t === "trash them") return "trash";
  if (t === "place it at the top of your deck") return "deck_top";
  if (t === "place it at the bottom of your deck") return "deck_bottom";
  return null;
}

function restPlacement(text: string): Placement | null {
  const t = text.trim().toLowerCase().replace(/\.$/, "");
  if (/^(?:then, )?place the rest at the bottom of (?:your|the|their) deck(?: in any order)?$/.test(t)) return "deck_bottom";
  if (/^(?:then, )?place the rest at the top of (?:your|the|their) deck(?: in any order)?$/.test(t)) return "deck_top";
  if (/^(?:then, )?place the rest at the top or bottom of (?:your|the|their) deck(?: in any order)?$/.test(t)) return "top_or_bottom";
  if (/^(?:then, )?trash the rest$/.test(t)) return "trash";
  if (/^(?:then, )?(?:add the rest to your hand)$/.test(t)) return "hand";
  if (/^(?:then, )?(?:shuffle your deck|shuffle the rest into your deck)$/.test(t)) return "shuffle";
  return null;
}

function pickFrom(countText: string, cardText: string, dest: LookPick["dest"], ctx: Ctx): LookPick | null {
  const n = num(countText);
  if (/^cards?$/i.test(cardText.trim())) return { min: 0, max: n, dest };
  const p = parseCardPhrase(`all ${cardText}`, ctx);
  if (!p) return null;
  return { min: 0, max: n, dest, ...(p.selector.filter ? { filter: p.selector.filter } : {}), ...(p.totalCostAtMost != null ? { totalCostAtMost: p.totalCostAtMost } : {}) };
}

function parseLookPicks(text: string, ctx: Ctx): LookPick[] | null {
  // "reveal up to 1 {X} type card and add it to your hand"
  const t = text.trim().replace(/^and /i, "");
  let m: RegExpExecArray | null;
  if ((m = /^(?:reveal )?up to (\d+|a total of \d+) (.+?) and (add (?:it|them) to your hand|play (?:it|them)(?: rested)?|add it to the top of your life cards|trash (?:it|them))$/i.exec(t))) {
    const dest = lookDest(m[3]!);
    const count = m[1]!.replace("a total of ", "");
    const pick = dest ? pickFrom(count, m[2]!, dest, ctx) : null; if (pick) return [pick];
  }
  if ((m = /^(?:reveal )?a total of up to (\d+) (.+?) and (add (?:it|them) to your hand)$/i.exec(t))) { const pick = pickFrom(m[1]!, m[2]!, "hand", ctx); if (pick) return [pick]; }
  if ((m = /^add up to (\d+) (.+?) to your hand$/i.exec(t))) { const pick = pickFrom(m[1]!, m[2]!, "hand", ctx); if (pick) return [pick]; }
  if ((m = /^reveal up to (\d+) (.+?) or up to (\d+) (.+?) and add (?:it|them) to your hand$/i.exec(t))) {
    const a = pickFrom(m[1]!, m[2]!, "hand", ctx); const b = pickFrom(m[3]!, m[4]!, "hand", ctx);
    if (a && b) return [{ min: 0, max: Math.max(a.max, b.max), dest: "hand", filter: { any: [a.filter ?? {}, b.filter ?? {}] } }];
  }
  if ((m = /^add up to (\d+) (.+?) to the top of your life cards( face-up)?$/i.exec(t))) { const pick = pickFrom(m[1]!, m[2]!, "life_top", ctx); if (pick && m[3]) pick.faceUp = true; return pick ? [pick] : null; }
  if ((m = /^play up to (\d+) (.+?)( rested)?$/i.exec(t))) { const pick = pickFrom(m[1]!, m[2]!, m[3] ? "play_rested" : "play", ctx); return pick ? [pick] : null; }
  if ((m = /^trash up to (\d+) (.+?)$/i.exec(t))) { const pick = pickFrom(m[1]!, m[2]!, "trash", ctx); return pick ? [pick] : null; }
  if ((m = /^reveal up to (\d+) (.+?) and up to (\d+) (.+?) and add them to your hand$/i.exec(t))) {
    const a = pickFrom(m[1]!, m[2]!, "hand", ctx); const b = pickFrom(m[3]!, m[4]!, "hand", ctx); return a && b ? [a, b] : null;
  }
  return null;
}

type EffectRule = Rule<Effect>;

/**
 * "Your opponent may PAY. If they do not, Y": PAY is a cost the opponent pays, so it is offered only when they can pay
 * it in full and paying part of it never counts as doing it (#515). The cost is written from the payer's view.
 */
function opponentMay(cost: Cost, prompt: string): Effect {
  return { do: "may", chooser: "opponent", costs: [cost], then: { do: "nothing" }, bind: "_did", prompt };
}

const EFFECT_RULES: EffectRule[] = [
  [/^place the rest at the (top|bottom|top or bottom) of (?:your|the) deck$/i, (m) => ({ do: "to_deck", target: { ref: "var", name: "_last" }, position: m[1]!.toLowerCase() === "top or bottom" ? "top_or_bottom" : m[1]!.toLowerCase() as "top" | "bottom" })],
  [/^change the target of that attack to this leader or to one of your (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { do: "redirect_attack", target: { ref: "choose", selector: { player: "you", zone: "leader", also: [p.selector] }, min: 1, max: 1 } } : null; }],
  [/^add (up to \d+ .+?) from your trash to the top of your life cards( face-up)?$/i, (m, ctx) => { const t = zoneTarget(m[1]!, "trash", ctx); return t ? { do: "to_life", target: t, position: "top", faceUp: Boolean(m[2]) } : null; }],
  [/^add (up to \d+ .+?) from your hand or trash to the top of your life cards( face-up)?$/i, (m, ctx) => { const t = zoneTarget(m[1]!, "hand_or_trash", ctx); return t ? { do: "to_life", target: t, position: "top", faceUp: Boolean(m[2]) } : null; }],
  [new RegExp("^give your opponent's leader and all of their characters ([+-]\\d+) power " + DUR + "$", "i"), (m) => { const d = parseDuration(m[2]); return d ? { do: "seq", steps: [{ do: "power", target: { ref: "leader", player: "opponent" }, amount: signed(m[1]!), duration: d }, { do: "power", target: { ref: "all", selector: { player: "opponent", zone: "character" } }, amount: signed(m[1]!), duration: d }] } : null; }],
  [new RegExp("^negate the effects? of your opponent's leader and all of their characters " + DUR + "$", "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "seq", steps: [{ do: "negate", target: { ref: "leader", player: "opponent" }, duration: d }, { do: "negate", target: { ref: "all", selector: { player: "opponent", zone: "character" } }, duration: d }] } : null; }],
  [new RegExp("^your opponent cannot activate \\[Blocker\\] " + DUR + "$", "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "restrict", target: { ref: "all", selector: { player: "opponent", zone: "character" } }, restriction: "cannot_block", duration: d } : null; }],
  [new RegExp("^your opponent cannot activate (?:a )?\\[Blocker\\] character that has (\\d+) or more power " + DUR + "$", "i"), (m) => { const d = parseDuration(m[2]); return d ? { do: "restrict", target: { ref: "self" }, restriction: "cannot_be_blocked_by_power_or_more", value: num(m[1]!), duration: d } : null; }],
  [/^your opponent cannot activate \[Blocker\] if (?:that leader or character|the selected character|that card) attacks (during this turn)$/i, () => ({ do: "keyword", target: { ref: "var", name: "_last" }, keyword: "unblockable", duration: "turn" })],
  [/^if the selected character attacks during this turn, your opponent cannot activate \[Blocker\]$/i, () => ({ do: "keyword", target: { ref: "var", name: "_last" }, keyword: "unblockable", duration: "turn" })],
  [/^look at (\d+) cards? from the top of your deck and (?:return|place) them (?:at|to) the top or bottom of (?:the|your) deck in any order$/i, (m) => ({ do: "look", player: "you", count: num(m[1]!), picks: [], rest: "top_or_bottom", reveal: false })],
  [/^look at (\d+) cards? from the top of your deck and place them at the top of your deck in any order$/i, (m) => ({ do: "look", player: "you", count: num(m[1]!), picks: [], rest: "deck_top", reveal: false })],
  [/^look at (\d+) cards? from the top of your deck, reorganize them in any order and place them at the top or bottom of your deck$/i, (m) => ({ do: "look", player: "you", count: num(m[1]!), picks: [], rest: "top_or_bottom", reveal: false })],
  [/^trash up to (\d+) of your opponent's life cards$/i, (m) => ({ do: "may", then: { do: "trash_life", player: "opponent", count: num(m[1]!) }, prompt: "trash your opponent's top Life card" })],
  [new RegExp("^none of your characters can be KO'd " + DUR + "$", "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "restrict", target: { ref: "all", selector: { player: "you", zone: "character" } }, restriction: "cannot_be_ko", duration: d } : null; }],
  [/^add (up to \d+ .+?) to the top of the owner's life cards face-(up|down)$/i, (m, ctx) => { const t = fieldTarget(m[1]!, ctx); return t ? { do: "to_life", target: t, position: "top", faceUp: m[2]!.toLowerCase() === "up" } : null; }],
  [/^reveal (\d+) cards? from the top of your deck and add up to (\d+) (.+?) to your hand$/i, (m, ctx) => { const pick = pickFrom(m[2]!, m[3]!, "hand", ctx); return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_top", reveal: true } : null; }],
  [/^reveal (\d+) cards? from the top of your deck and play up to (\d+) (.+?) rested$/i, (m, ctx) => { const pick = pickFrom(m[2]!, m[3]!, "play_rested", ctx); return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_bottom", reveal: true } : null; }],
  [/^trash all (?:of )?your face-up life cards$/i, () => ({ do: "to_trash", target: { ref: "all", selector: { player: "you", zone: "life", filter: { faceUp: true } } } })],
  [/^play up to (\d+) each of (.+?) (with a cost of .+?) from your hand$/i, (m, ctx) => { const names = nameList(m[2]!.replace(/, and /g, ", "), ctx); const p = names && parseCardPhrase("all cards " + m[3]!, ctx); return names && p ? { do: "play", target: { ref: "choose", selector: { player: "you", zone: "hand", filter: { ...(p.selector.filter ?? {}), names } }, min: 0, max: num(m[1]!) * names.length, distinctNames: true } } : null; }],
  [/^(.+?) gains? \[(Rush|Blocker|Double Attack|Banish|Unblockable)\]$/i, (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const k = keywordOf(m[2]!); return t && k ? { do: "keyword", target: t, keyword: k, duration: "permanent" } : null; }],
  [/^return all of your (.+?) to the owner's hand$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { do: "to_hand", target: { ref: "all", selector: p.selector } } : null; }],
  [new RegExp("^for every (.+?) on your field, give (up to \\d+ .+?) ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); const t = fieldTarget(m[2]!, ctx); const d = parseDuration(m[4]); return p && t && d ? { do: "power", target: t, amount: { count: { of: "cards", selector: p.selector }, times: signed(m[3]!) }, duration: d } : null; }],
  [/^set up to (\d+) of your (.+?) and up to (\d+) of your DON!! cards as active$/i, (m, ctx) => { const p = parseCardPhrase("up to " + m[1] + " of your " + m[2], ctx); return p ? { do: "seq", steps: [{ do: "activate", target: toTarget(p) }, { do: "set_don_active", count: num(m[3]!) }] } : null; }],
  [/^your opponent adds (\d+) cards? from their life area to their hand$/i, (m) => ({ do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top" })],
  [new RegExp("^your leader gains ([+-]\\d+) power for each of your characters " + DUR + "$", "i"), (m) => { const d = parseDuration(m[2]); return d ? { do: "power", target: { ref: "leader", player: "you" }, amount: { count: { of: "cards", selector: { player: "you", zone: "character" } }, times: signed(m[1]!) }, duration: d } : null; }],
  [new RegExp("^this character and (up to \\d+ .+?) gain ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return t && d ? { do: "seq", steps: [{ do: "power", target: { ref: "self" }, amount: signed(m[2]!), duration: d }, { do: "power", target: t, amount: signed(m[2]!), duration: d }] } : null; }],
  [/^place all cards in your hand at the bottom of your deck(?: in any order)?$/i, () => ({ do: "to_deck", target: { ref: "all", selector: { player: "you", zone: "hand" } }, position: "bottom" })],
  [/^your opponent places (\d+) of their characters at the bottom of the owner's deck$/i, (m) => ({ do: "to_deck", target: { ref: "choose", selector: { player: "opponent", zone: "character" }, min: num(m[1]!), max: num(m[1]!), chooser: "opponent" }, position: "bottom" })],
  [/^return any number of characters on your field to the owner's hand$/i, () => ({ do: "to_hand", target: { ref: "choose", selector: { player: "you", zone: "character" }, min: 0, max: 99 } })],
  [/^you may add this (?:character )?card to your hand$/i, () => ({ do: "may", then: { do: "to_hand", target: { ref: "self" } }, prompt: "add this card to your hand" })],
  [/^draw (\d+) cards?, look at up to (\d+) cards? from the top of your or your opponent's life cards,? and place it at the top or bottom of the life cards$/i, (m) => ({ do: "seq", steps: [{ do: "draw", player: "you", count: num(m[1]!) }, { do: "look_life", player: "any", count: num(m[2]!), rest: "top_or_bottom" }] })],
  [/^your opponent may trash (\d+) cards? from their hand$/i, (m) => opponentMay({ k: "trash_hand", count: num(m[1]!) }, "trash cards from your hand")],
  [/^if they do not, (.+)$/i, (m, ctx) => { const inner = parseStatement(m[1]!, ctx); return inner ? { do: "if", cond: { c: "var_count", name: "_did", op: "==", value: 0 }, then: inner } : null; }],
  [/^if they do, (.+)$/i, (m, ctx) => { const inner = parseStatement(m[1]!, ctx); return inner ? { do: "if", cond: { c: "var_count", name: "_did", op: ">=", value: 1 }, then: inner } : null; }],
  [new RegExp("^give ([+-]\\d+) power " + DUR + " to (up to \\d+ .+)$", "i"), (m, ctx) => { const t = fieldTarget(m[3]!, ctx); const d = parseDuration(m[2]); return t && d ? { do: "power", target: t, amount: signed(m[1]!), duration: d } : null; }],
  [/^place up to (\d+) cards? from your opponent's trash at the bottom of the owner's deck$/i, (m) => ({ do: "to_deck", target: { ref: "choose", selector: { player: "opponent", zone: "trash" }, min: 0, max: num(m[1]!) }, position: "bottom" })],
  [/^your opponent may return (\d+) of their active DON!! cards to their DON!! deck$/i, (m) => opponentMay({ k: "return_active_don", count: num(m[1]!) }, "return active DON!! to your DON!! deck")],
  [new RegExp("^your leader and this character's base power becomes? (\\d+) " + DUR + "$", "i"), (m) => { const d = parseDuration(m[2]); return d ? { do: "seq", steps: [{ do: "base_power", target: { ref: "leader", player: "you" }, value: num(m[1]!), duration: d }, { do: "base_power", target: { ref: "self" }, value: num(m[1]!), duration: d }] } : null; }],
  [new RegExp("^(.+?)'s? base power becomes the same as your opponent's leader's power " + DUR + "$", "i"), (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return t && d ? { do: "base_power", target: t, value: { count: { of: "leader_power", player: "opponent" } }, duration: d } : null; }],
  [/^look at (\d+) cards? from the top of your deck; reveal up to (\d+) (.+?), add them to your hand and place the rest at the bottom of your deck(?: in any order)?$/i, (m, ctx) => { const pick = pickFrom(m[2]!, m[3]!, "hand", ctx); return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_bottom", reveal: true } : null; }],
  [/^place all of (your opponent's .+?) at the bottom of the owner's deck(?: in any order(?: of their choosing)?)?$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); return p ? { do: "to_deck", target: { ref: "all", selector: p.selector }, position: "bottom" } : null; }],
  [/^KO (your opponent's characters) with a total cost of (\d+) or less$/i, (m) => ({ do: "ko", target: { ref: "choose", selector: { player: "opponent", zone: "character" }, min: 0, max: 99, totalCostAtMost: num(m[2]!) } })],
  [/^(?:the character played with this effect|that character) gains \[(Rush|Blocker|Double Attack|Banish|Unblockable)\] (during this turn)$/i, (m) => { const k = keywordOf(m[1]!); return k ? { do: "keyword", target: { ref: "var", name: "_affected" }, keyword: k, duration: "turn" } : null; }],
  [/^rest this (?:character|leader) and (up to \d+ .+)$/i, (m, ctx) => { const t = fieldTarget(m[1]!, ctx); return t ? { do: "seq", steps: [{ do: "rest", target: { ref: "self" } }, { do: "rest", target: t }] } : null; }],
  [/^(?:then, )?your opponent adds (\d+) cards? from the top of their life cards to their hand$/i, (m) => ({ do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top" })],
  [/^you take (\d+) damage$/i, (m) => ({ do: "damage", player: "you", count: num(m[1]!) })],
  [/^trash all cards from your hand$/i, () => ({ do: "to_trash", target: { ref: "all", selector: { player: "you", zone: "hand" } } })],
  [/^trash cards from your hand until you have (\d+) cards in your hand$/i, (m) => ({ do: "discard", player: "you", count: { count: { of: "hand", player: "you" }, plus: -num(m[1]!) } })],
  [/^you and your opponent trash cards from your hands until you each have (\d+) cards in your hands$/i, (m) => ({ do: "seq", steps: [{ do: "discard", player: "you", count: { count: { of: "hand", player: "you" }, plus: -num(m[1]!) } }, { do: "discard", player: "opponent", chooser: "opponent", count: { count: { of: "hand", player: "opponent" }, plus: -num(m[1]!) } }] })],
  [/^you cannot attack a leader (during this turn)$/i, () => ({ do: "player_restrict", player: "you", restriction: "cannot_attack_leader", duration: "turn" })],
  [/^you cannot play cards from your hand (during this turn)$/i, () => ({ do: "player_restrict", player: "you", restriction: "cannot_play_cards_from_hand", duration: "turn" })],
  [/^your opponent places (\d+) (.+?) from their trash at the (top|bottom) of their deck(?: in any order)?$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[2]!, ctx, { zone: "trash" }); return p ? { do: "to_deck", target: { ref: "choose", selector: { ...p.selector, player: "opponent", zone: "trash" }, min: num(m[1]!), max: num(m[1]!), chooser: "opponent" }, position: m[3]!.toLowerCase() as "top" | "bottom" } : null; }],
  [/^your opponent plays (up to \d+ .+?) from their hand$/i, (m, ctx) => { const p = parseCardPhrase(m[1]!, ctx, { zone: "hand" }); if (!p) return null; const t = toTarget({ ...p, selector: { ...p.selector, player: "opponent", zone: "hand" } }); return t.ref === "choose" ? { do: "play", target: { ...t, chooser: "opponent" } } : null; }],
  [/^your opponent may add (\d+) DON!! cards? from their DON!! deck and set (?:it|them) as active$/i, (m) => ({ do: "may", chooser: "opponent", then: { do: "add_don", player: "opponent", count: num(m[1]!), rested: false }, prompt: "add DON!! from your DON!! deck" })],
  [/^give your leader and all of your characters up to (\d+) rested DON!! cards? each$/i, (m) => ({ do: "seq", steps: [{ do: "give_don", target: { ref: "leader", player: "you" }, count: num(m[1]!), donState: "rested" }, { do: "give_don", target: { ref: "all", selector: { player: "you", zone: "character" } }, count: num(m[1]!), donState: "rested" }] })],
  [new RegExp("^(up to \\d+ .+?) cannot activate \\[Blocker\\] " + DUR + "$", "i"), (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return t && d ? { do: "restrict", target: t, restriction: "cannot_block", duration: d } : null; }],
  [new RegExp("^all of your opponent's (.+?) cannot activate \\[Blocker\\] " + DUR + "$", "i"), (m, ctx) => { const p = parseCardPhrase("all your opponent's " + m[1]!, ctx); const d = parseDuration(m[2]); return p && d ? { do: "restrict", target: { ref: "all", selector: p.selector }, restriction: "cannot_block", duration: d } : null; }],
  [/^(up to \d+ .+?) can attack characters on the turn in which (?:it is|they are) played$/i, (m, ctx) => { const t = fieldTarget(m[1]!, ctx); return t ? { do: "keyword", target: t, keyword: "rush_character", duration: "turn" } : null; }],
  [/^set this character or up to (\d+) of your DON!! cards as active$/i, (m) => ({ do: "choose_one", options: [{ label: "Set this Character as active", effect: { do: "activate", target: { ref: "self" } } }, { label: "Set up to " + m[1] + " DON!! as active", effect: { do: "set_don_active", count: num(m[1]!) } }] })],
  [new RegExp("^negate the effects? of (.+?) and give that card ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return t && d ? { do: "seq", steps: [{ do: "negate", target: t, duration: d }, { do: "power", target: { ref: "var", name: "_last" }, amount: signed(m[2]!), duration: d }] } : null; }],
  [new RegExp("^negate the effects? of (.+?) and that character cannot attack " + DUR + "$", "i"), (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return t && d ? { do: "seq", steps: [{ do: "negate", target: t, duration: d }, { do: "restrict", target: { ref: "var", name: "_last" }, restriction: "cannot_attack", duration: d }] } : null; }],
  [new RegExp("^give (up to \\d+ of .+?) ([+-]\\d+) power " + DUR + " and this character gains \\[(Rush|Blocker|Double Attack|Banish)\\]$", "i"), (m, ctx) => { const t = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); const k = keywordOf(m[4]!); return t && d && k ? { do: "seq", steps: [{ do: "power", target: t, amount: signed(m[2]!), duration: d }, { do: "keyword", target: { ref: "self" }, keyword: k, duration: d }] } : null; }],
  [/^if (?:the selected card|that card|that character) attacks during this turn, your opponent cannot activate \[Blocker\]$/i, () => ({ do: "keyword", target: { ref: "var", name: "_last" }, keyword: "unblockable", duration: "turn" })],
  [/^draw (?:a card|\d+ cards?) for each of (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); return p ? { do: "draw", player: "you", count: { count: { of: "cards", selector: p.selector } } } : null; }],
  [/^draw cards? so that you have (\d+) cards in your hand$/i, (m) => ({ do: "draw", player: "you", count: { count: { of: "hand", player: "you" }, times: -1, plus: num(m[1]!) } })],
  [/^draw up to (\d+) cards?$/i, (m) => ({ do: "choose_one", options: Array.from({ length: num(m[1]!) + 1 }, (_, i) => ({ label: "Draw " + (num(m[1]!) - i), effect: num(m[1]!) - i > 0 ? { do: "draw" as const, player: "you" as const, count: num(m[1]!) - i } : { do: "nothing" as const } })) })],
  [/^choose (up to \d+|\d+) (.+?) and (ko|rest|return) (?:it|them)(?: to the owner's hand)?$/i, (m, ctx) => { const p = parseCardPhrase(m[1] + " of " + m[2], ctx) ?? parseCardPhrase(m[1] + " " + m[2], ctx); if (!p) return null; const target = toTarget(p, "_last"); const verb = m[3]!.toLowerCase(); return verb === "ko" ? { do: "ko", target } : verb === "rest" ? { do: "rest", target } : { do: "to_hand", target }; }],
  [/^your opponent chooses (\d+) cards? from your hand; trash (?:that card|those cards)$/i, (m) => ({ do: "discard", player: "you", count: num(m[1]!), chooser: "opponent" })],
  [/^choose (\d+) cards? from your opponent's hand; your opponent reveals (?:that card|those cards)$/i, (m) => ({ do: "seq", steps: [{ do: "select", bind: "_last", selector: { player: "opponent", zone: "hand" }, min: num(m[1]!), max: num(m[1]!), chooser: "you" }, { do: "reveal", target: { ref: "var", name: "_last" } }] })],
  [/^set up to (\d+) of your (.+?) and your leader as active$/i, (m, ctx) => { const p = parseCardPhrase("up to " + m[1] + " of your " + m[2], ctx); return p ? { do: "seq", steps: [{ do: "activate", target: toTarget(p) }, { do: "activate", target: { ref: "leader", player: "you" } }] } : null; }],
  [/^deal (\d+) damage to your opponent$/i, (m) => ({ do: "damage", player: "opponent", count: num(m[1]!) })],
  [/^reveal up to (\d+) (.+?) from your deck and add (?:it|them) to your hand$/i, (m, ctx) => { const target = zoneTarget(m[1] ? "up to " + m[1] + " " + m[2] : m[2]!, "deck", ctx); return target ? { do: "seq", steps: [{ do: "to_hand", target }, { do: "shuffle", player: "you" }] } : null; }],
  [/^you cannot add life cards to your hand using your own effects (during this turn)$/i, () => ({ do: "player_restrict", player: "you", restriction: "cannot_add_life_to_hand_by_effect", duration: "turn" })],
  [/^the next time you play (.+?) from your hand during this turn, the cost will be reduced by (\d+)$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!.replace(/^(?:a|an) /i, ""), ctx); return p ? { do: "play_cost_reduction", filter: p.selector.filter ?? {}, amount: -num(m[2]!), duration: "turn", next: true } : null; }],
  [new RegExp("^your opponent cannot activate the \\[Blocker\\] of any character with a cost of (\\d+) or less " + DUR + "$", "i"), (m) => { const d = parseDuration(m[2]); return d ? { do: "restrict", target: { ref: "self" }, restriction: "cannot_be_blocked_by_cost_or_less", value: num(m[1]!), duration: d } : null; }],
  [/^at the end of this battle, (.+)$/i, (m, ctx) => { const inner = parseStatement(m[1]!, ctx); return inner ? { do: "delay", when: "end_of_battle", effect: inner } : null; }],
  [/^(.+?) at the end of this turn$/i, (m, ctx) => { if (/^(?:set|add up to \d+ DON)/i.test(m[1]!)) return null; const inner = parseStatement(m[1]!, ctx); return inner ? { do: "delay", when: "end_of_turn", effect: inner } : null; }],
  [new RegExp("^(your leader) and all of your characters gain ([+-]\\d+) power " + DUR + "$", "i"), (m) => { const d = parseDuration(m[3]); return d ? { do: "seq", steps: [{ do: "power", target: { ref: "leader", player: "you" }, amount: signed(m[2]!), duration: d }, { do: "power", target: { ref: "all", selector: { player: "you", zone: "character" } }, amount: signed(m[2]!), duration: d }] } : null; }],
  [new RegExp("^set the cost of (.+?) to (\\d+) " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "set_cost", target, value: num(m[2]!), duration: d } : null; }],
  [/^give up to (\d+) rested DON!! cards? to each of (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[2]!, ctx); return p ? { do: "give_don", target: { ref: "all", selector: p.selector }, count: num(m[1]!), donState: "rested" } : null; }],
  [/^give (up to \d+ of .+?) up to (\d+) rested DON!! cards? each$/i, (m, ctx) => { const p = parseCardPhrase(m[1]!, ctx); return p ? { do: "give_don", target: toTarget(p), count: num(m[2]!), donState: "rested" } : null; }],
  [/^(KO|rest) or (rest|KO) (up to \d+ .+)$/i, (m, ctx) => {
    const first = m[1]!.toUpperCase(), second = m[2]!.toUpperCase();
    if (first === second) return null;
    const target = fieldTarget(m[3]!, ctx);
    if (!target || target.ref !== "choose") return null;
    const act = (kind: string): Effect => (kind === "KO" ? { do: "ko", target: { ref: "var", name: "_last" } } : { do: "rest", target: { ref: "var", name: "_last" } });
    const label = (kind: string) => (kind === "KO" ? "K.O. it" : "Rest it");
    return { do: "seq", steps: [{ do: "select", bind: "_last", selector: target.selector, min: target.min, max: target.max }, { do: "choose_one", options: [{ label: label(first), effect: act(first) }, { label: label(second), effect: act(second) }] }] };
  }],
  [/^return (up to \d+ .+?) to the owner's hand or the bottom of their deck$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target && target.ref === "choose" ? { do: "seq", steps: [{ do: "select", bind: "_last", selector: target.selector, min: target.min, max: target.max }, { do: "choose_one", options: [{ label: "Return to hand", effect: { do: "to_hand", target: { ref: "var", name: "_last" } } }, { label: "Place at the bottom of the deck", effect: { do: "to_deck", target: { ref: "var", name: "_last" }, position: "bottom" } }] }] } : null; }],
  [new RegExp("^(.+?)'s? base power becomes the same as the power of your opponent's attacking leader or character " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "base_power", target, value: { count: { of: "battle_power", role: "attacker" } }, duration: d } : null; }],
  [/^(?:add|place) (.+?) (?:to|at) the top of your opponent's life cards face-up$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "to_life", target, position: "top", faceUp: true } : null; }],
  [/^(?:you and your opponent|each player) trash(?:es)? cards from (?:your|their) hands until you each have (\d+) cards in your hands$/i, () => null],
  [/^your opponent may trash (\d+) cards? from the top of their life cards$/i, (m) => opponentMay({ k: "trash_life", count: num(m[1]!) }, "trash the top card of your Life")],
  [/^your opponent returns all cards in their hand to their deck$/i, () => ({ do: "to_deck", target: { ref: "all", selector: { player: "opponent", zone: "hand" } }, position: "bottom" })],
  [/^(?:your opponent )?shuffles? their deck$/i, () => ({ do: "shuffle", player: "opponent" })],
  [new RegExp("^(.+?)'s? effects? (?:is|are) negated " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "negate", target, duration: d } : null; }],
  [/^KO any number of your (.+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { do: "ko", target: { ref: "choose", selector: p.selector, min: 0, max: 99 } } : null; }],
  [new RegExp("^(your .+?) cannot be KO'd in battle " + DUR + "$", "i"), (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); const d = parseDuration(m[2]); return p && d ? { do: "restrict", target: { ref: "all", selector: p.selector }, restriction: "cannot_be_ko_in_battle", duration: d } : null; }],
  [new RegExp("^none of your (.+?) can be KO'd by (your opponent's )?effects " + DUR + "$", "i"), (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); const d = parseDuration(m[3]); return p && d ? { do: "restrict", target: { ref: "all", selector: p.selector }, restriction: m[2] ? "cannot_be_ko_by_opponent_effect" : "cannot_be_ko_by_effect", duration: d } : null; }],
  [/^reveal (\d+) cards? from the top of your deck and play up to (\d+) (.+)$/i, (m, ctx) => { const pick = pickFrom(m[2]!, m[3]!, "play", ctx); return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_bottom", reveal: true } : null; }],
  [/^your opponent trashes (\d+) cards? from their hand and reveals their hand$/i, (m) => ({ do: "discard", player: "opponent", count: num(m[1]!), chooser: "opponent" })],
  [/^place any number of (.+?) from your trash at the bottom of your deck(?: in any order)?$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx, { zone: "trash" }); return p ? { do: "to_deck", target: { ref: "choose", selector: { ...p.selector, player: "you", zone: "trash" }, min: 0, max: 99 }, position: "bottom" } : null; }],
  [/^place up to (\d+) cards? from your opponent's trash at the bottom of their deck$/i, (m) => ({ do: "to_deck", target: { ref: "choose", selector: { player: "opponent", zone: "trash" }, min: 0, max: num(m[1]!) }, position: "bottom" })],
  [new RegExp("^your opponent cannot activate up to (\\d+) \\[Blocker\\] characters? that has (\\d+) power or less " + DUR + "$", "i"), (m) => { const d = parseDuration(m[3]); return d ? { do: "restrict", target: { ref: "choose", selector: { player: "opponent", zone: "character", filter: { keyword: "blocker", power: { op: "<=", value: num(m[2]!) } } }, min: 0, max: num(m[1]!) }, restriction: "cannot_block", duration: d } : null; }],
  [new RegExp("^(.+?) cannot be KO'd in battle and gains? ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "seq", steps: [{ do: "restrict", target, restriction: "cannot_be_ko_in_battle", duration: d }, { do: "power", target, amount: signed(m[2]!), duration: d }] } : null; }],
  [/^reveal (\d+|a) cards? from the top of (your|your opponent's) (deck|life cards)$/i, (m) => ({ do: "reveal_top", player: rel(m[2]!), bind: "_last", zone: /life/i.test(m[3]!) ? "life" : "deck" })],
  [/^select (up to \d+|\d+) (?:of )?(.+)$/i, (m, ctx) => { const p = parseCardPhrase(m[1] + " of " + m[2], ctx) ?? parseCardPhrase(m[1] + " " + m[2], ctx); if (!p) return null; const t = toTarget(p, "_last"); return t.ref === "choose" ? { do: "select", bind: "_last", selector: t.selector, min: t.min, max: t.max } : null; }],
  [/^set up to (\d+) of your DON!! cards? as active at the end of this turn$/i, (m) => ({ do: "delay", when: "end_of_turn", effect: { do: "set_don_active", count: num(m[1]!) } })],
  [/^set (.+) as active at the end of this turn$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "delay", when: "end_of_turn", effect: { do: "activate", target } } : null; }],
  [new RegExp("^(.+?) can also attack (?:your opponent's )?active characters " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "restrict", target, restriction: "can_attack_active", duration: d } : null; }],
  [new RegExp("^(.+?) can attack characters on the turn in which (?:it is|they are) played " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "keyword", target, keyword: "rush_character", duration: d } : null; }],
  [/^give up to (\d+) of your opponent's rested DON!! cards? to (.+)$/i, (m, ctx) => { const p = parseCardPhrase(m[2]!.replace(/^(\d+) of /, "up to $1 of "), ctx); if (!p) return null; const t = toTarget(p); return { do: "give_don", target: t, count: num(m[1]!), donState: "rested", player: "opponent" }; }],
  [new RegExp("^(.+?) cannot be rested " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "restrict", target, restriction: "cannot_be_rested", duration: d } : null; }],
  [new RegExp("^you cannot play character cards with (?:a )?(base )?cost of (\\d+) or more " + DUR + "$", "i"), (m) => { const d = parseDuration(m[3]); return d ? { do: "player_restrict", player: "you", restriction: "cannot_play_characters", duration: d, filter: { [m[1] ? "baseCost" : "cost"]: { op: ">=", value: num(m[2]!) } } } : null; }],
  [new RegExp("^you cannot play any character cards(?: on your field)? " + DUR + "$", "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "player_restrict", player: "you", restriction: "cannot_play_characters", duration: d } : null; }],
  [new RegExp("^you cannot set DON!! cards as active using character effects " + DUR + "$", "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "player_restrict", player: "you", restriction: "cannot_set_don_active_by_character_effects", duration: d } : null; }],
  [new RegExp("^set the power of (.+?) to (\\d+) " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "set_power", target, value: num(m[2]!), duration: d } : null; }],
  [new RegExp("^(.+?)'s? base power becomes the same as (your opponent's leader|the selected character's power|that character's power|the selected character) " + DUR + "$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); if (!target || !d) return null; const value = /leader/i.test(m[2]!) ? { count: { of: "leader_power" as const, player: "opponent" as const } } : { count: { of: "var_sum" as const, name: "_last", field: "power" as const } }; return { do: "base_power", target, value, duration: d }; }],
  [new RegExp("^your opponent cannot activate (?:a )?\\[Blocker\\](?: character)? that has (\\d+) or less power " + DUR + "$", "i"), (m) => { const d = parseDuration(m[2]); return d ? { do: "restrict", target: { ref: "self" }, restriction: "cannot_be_blocked_by_power_or_less", value: num(m[1]!), duration: d } : null; }],
  [/^trash (\d+|a) cards? from your opponent's hand$/i, (m) => ({ do: "discard", player: "opponent", count: num(m[1]!), chooser: "you", random: true })],
  // Ask first (only when the hand has a card it could trash), then pick the cards.
  [/^you may trash any number of (.+?) from your hand$/i, (m, ctx) => {
    const p = /^cards?$/i.test(m[1]!) ? null : parseCardPhrase("all " + m[1]!, ctx);
    const filter = p?.selector.filter ? { filter: p.selector.filter } : {};
    return { do: "if", cond: { c: "exists", selector: { player: "you", zone: "hand", ...filter } }, then: { do: "may", then: { do: "discard", player: "you", count: 99, min: 0, ...filter }, prompt: restoreNames(`trash ${m[1]!} from your hand`, ctx.ph) } };
  }],
  [/^play (.+?) from your deck( rested)?$/i, (m, ctx) => { const target = zoneTarget(m[1]!, "deck", ctx); return target ? { do: "play", target, ...(m[2] ? { rested: true } : {}) } : null; }],
  [/^return all cards in your hand to your deck$/i, () => ({ do: "to_deck", target: { ref: "all", selector: { player: "you", zone: "hand" } }, position: "bottom" })],
  [/^your opponent places (\d+) cards? from their trash at the (top|bottom) of their deck(?: in any order)?$/i, (m) => ({ do: "to_deck", target: { ref: "choose", selector: { player: "opponent", zone: "trash" }, min: num(m[1]!), max: num(m[1]!), chooser: "opponent" }, position: m[2]!.toLowerCase() as "top" | "bottom" })],
  [/^your opponent returns (\d+) of their (.+?) to (?:the owner's|their) hand$/i, (m, ctx) => { const p = parseCardPhrase("all your opponent's " + m[2]!, ctx); return p ? { do: "to_hand", target: { ref: "choose", selector: p.selector, min: num(m[1]!), max: num(m[1]!), chooser: "opponent" } } : null; }],
  [/^your opponent (?:chooses and )?(?:trashes|KOs) (\d+) of their (.+?)$/i, (m, ctx) => { const p = parseCardPhrase("all your opponent's " + m[2]!, ctx); return p && p.selector.zone === "character" ? { do: "ko", target: { ref: "choose", selector: p.selector, min: num(m[1]!), max: num(m[1]!), chooser: "opponent" } } : null; }],
  [/^trash cards from the top of your life cards until you have (\d+) life cards?$/i, (m) => ({ do: "trash_life", player: "you", count: { count: { of: "life", player: "you" }, plus: -num(m[1]!) } })],
  [/^activate (?:the \[Main\] effect of )?(up to \d+ .+?) (?:from your hand|in your trash|from your trash)$/i, (m, ctx) => { const zone = /trash/i.test(m[0]) ? "trash" : "hand"; const target = zoneTarget(m[1]!, zone, ctx); return target ? { do: "activate_event", target } : null; }],
  [/^give (your leader) and (\d+) (?:of your )?characters? up to (\d+) rested DON!! cards? each$/i, (m) => ({ do: "seq", steps: [{ do: "give_don", target: { ref: "leader", player: "you" }, count: num(m[3]!), donState: "rested" }, { do: "give_don", target: { ref: "choose", selector: { player: "you", zone: "character" }, min: 0, max: num(m[2]!) }, count: num(m[3]!), donState: "rested" }] })],
  [/^add up to (\d+) DON!! cards? as (rested|active) from your DON!! deck$/i, (m) => ({ do: "add_don", player: "you", count: num(m[1]!), rested: m[2]!.toLowerCase() === "rested" })],
  [/^look at all of (your|your opponent's) life cards and place them back in (?:your|their) life area in any order$/i, (m) => ({ do: "look_life", player: rel(m[1]!), count: 99, rest: "any_order" })],
  [/^look at (\d+) cards? from the top of your deck and place them at the top or bottom of your deck in any order$/i, (m) => ({ do: "look", player: "you", count: num(m[1]!), picks: [], rest: "top_or_bottom", reveal: false })],
  [/^reveal (\d+) cards? from the top of your deck, play up to (\d+) (.+?),? and place the rest at the top or bottom of your deck$/i, (m, ctx) => { const pick = pickFrom(m[2]!, m[3]!, "play", ctx); return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "top_or_bottom", reveal: true } : null; }],
  [/^look at (\d+) cards? from the top of your deck; reveal up to (\d+) (.+?), add it to your hand and place the rest at the (bottom|top) of your deck(?: in any order)?$/i, (m, ctx) => { const pick = pickFrom(m[2]!, m[3]!, "hand", ctx); return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: m[4]!.toLowerCase() === "top" ? "deck_top" : "deck_bottom", reveal: true } : null; }],
  [/^place (?:the revealed card|that card|it) at the (top|bottom|top or bottom) of (?:your|the) deck$/i, (m) => ({ do: "to_deck", target: { ref: "var", name: "_last" }, position: m[1]!.toLowerCase() === "top or bottom" ? "top_or_bottom" : m[1]!.toLowerCase() as "top" | "bottom" })],
  [/^play (?:the revealed card|that card|it)( rested)?$/i, (m) => ({ do: "play", target: { ref: "var", name: "_last" }, ...(m[1] ? { rested: true } : {}) })],
  [/^add (?:the revealed card|that card|it) to your hand$/i, () => ({ do: "to_hand", target: { ref: "var", name: "_last" } })],
  [/^trash (?:the revealed card|that card)$/i, () => ({ do: "to_trash", target: { ref: "var", name: "_last" } })],
  [new RegExp("^(.+?) gains? ([+-]\\d+) power " + DUR + " for every card trashed$", "i"), (m, ctx) => { const target = fieldTarget(m[1]!.replace(/^your leader or 1 of your characters$/i, "up to 1 of your Leader or Character cards"), ctx); const d = parseDuration(m[3]); return target && d ? { do: "power", target, amount: { count: { of: "var", name: "_discard" }, times: signed(m[2]!) }, duration: d } : null; }],
  [/^up to (\d+) of your leader with a type including (§Q\d+§) or up to \d+ of your characters with a type including §Q\d+§ gains? ([+-]\d+) power (during this battle|during this turn)$/i, (m, ctx) => { const q = quote(m[2]!, ctx); const d = parseDuration(m[4]); return q && d ? { do: "power", target: { ref: "choose", selector: { player: "you", zone: "leader_or_character", filter: { traitIncludes: [q] } }, min: 0, max: num(m[1]!) }, amount: signed(m[3]!), duration: d } : null; }],
  [/^draw (\d+|a) cards?$/i, (m) => ({ do: "draw", player: "you", count: num(m[1]!) })],
  [/^your opponent draws (\d+) cards?$/i, (m) => ({ do: "draw", player: "opponent", count: num(m[1]!) })],
  [/^draw cards equal to (.+)$/i, (m, ctx) => { const count = parseCountPhrase(m[1]!, ctx); return count ? { do: "draw", player: "you", count: { count } } : null; }],
  [/^trash (\d+|a) cards? from your hand$/i, (m) => ({ do: "discard", player: "you", count: num(m[1]!) })],
  [/^trash up to (\d+) cards? from your hand$/i, (m) => ({ do: "discard", player: "you", count: num(m[1]!), min: 0 })],
  [/^trash (\d+) (.+?) from your hand$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p ? { do: "discard", player: "you", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^your opponent trashes (\d+) cards? from their hand$/i, (m) => ({ do: "discard", player: "opponent", count: num(m[1]!), chooser: "opponent" })],
  [/^your opponent chooses (\d+) cards? from their hand and trashes (?:it|them)$/i, (m) => ({ do: "discard", player: "opponent", count: num(m[1]!), chooser: "opponent" })],
  [/^trash (\d+) cards? from the top of (your|your opponent's) deck$/i, (m) => ({ do: "mill", player: rel(m[2]!), count: num(m[1]!) })],
  [/^trash up to (\d+) cards? from the top of (your|your opponent's) deck$/i, (m) => ({ do: "mill", player: rel(m[2]!), count: num(m[1]!) })],
  [/^(?:place|return) (\d+) cards? from your hand (?:at|to) the (top|bottom|top or bottom) of your deck(?: in any order)?$/i, (m) => ({ do: "hand_to_deck", player: "you", count: num(m[1]!), position: m[2]!.toLowerCase() === "top or bottom" ? "top_or_bottom" : m[2]!.toLowerCase() as "top" | "bottom" })],
  [/^your opponent places (\d+) cards? from their hand at the (top|bottom) of their deck(?: in any order)?$/i, (m) => ({ do: "hand_to_deck", player: "opponent", count: num(m[1]!), position: m[2]!.toLowerCase() as "top" | "bottom", chooser: "opponent" })],
  [/^place up to (\d+) cards? from your hand at the (top|bottom) of your deck(?: in any order)?$/i, (m) => ({ do: "hand_to_deck", player: "you", count: num(m[1]!), position: m[2]!.toLowerCase() as "top" | "bottom", min: 0 })],
  [/^KO (.+)$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "ko", target } : null; }],
  [/^rest up to (\d+) of your opponent's DON!! cards?$/i, (m) => ({ do: "rest_don", player: "opponent", count: num(m[1]!) })],
  [/^rest (\d+) of your opponent's DON!! cards?$/i, (m) => ({ do: "rest_don", player: "opponent", count: num(m[1]!) })],
  [/^rest (.+)$/i, (m, ctx) => { if (/^the rest/i.test(m[1]!)) return null; const target = fieldTarget(m[1]!, ctx); return target ? { do: "rest", target } : null; }],
  [/^set up to (\d+) of your DON!! cards? as active$/i, (m) => ({ do: "set_don_active", count: num(m[1]!) })],
  [/^set (.+) as active$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "activate", target } : null; }],
  [/^return (.+?) to (?:the owner's|its owner's|their owner's|your|their) hand$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "to_hand", target } : null; }],
  [/^add (.+?) from your trash to your hand$/i, (m, ctx) => { const target = zoneTarget(m[1]!, "trash", ctx); return target ? { do: "to_hand", target } : null; }],
  [/^add this card to your hand$/i, () => ({ do: "to_hand", target: { ref: "self" } })],
  [/^return (.+?) to the (top|bottom) of the owner's deck$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "to_deck", target, position: m[2]!.toLowerCase() as "top" | "bottom" } : null; }],
  [/^(?:add|place) (.+?) (?:to|at) the top or bottom of (?:your opponent's|the owner's|your) life cards face-up$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "to_life", target, position: "top_or_bottom", faceUp: true } : null; }],
  [/^place (.+?) at the (top|bottom) of (?:the owner's|its owner's|their owner's|your|their) deck(?: in any order)?$/i, (m, ctx) => {
    const src = m[1]!;
    const fromTrash = /^(.+) from your trash$/i.exec(src);
    const target = fromTrash ? zoneTarget(fromTrash[1]!, "trash", ctx) : fieldTarget(src, ctx);
    return target ? { do: "to_deck", target, position: m[2]!.toLowerCase() as "top" | "bottom" } : null;
  }],
  [/^trash (.+?)$/i, (m, ctx) => {
    if (/from the top|from your hand|the rest|life/i.test(m[1]!)) return null;
    const target = fieldTarget(m[1]!, ctx); return target ? { do: "to_trash", target } : null;
  }],
  [/^play this (?:card|character card|character)(?: from your trash)?( rested)?$/i, (m) => ({ do: "play", target: { ref: "self" }, ...(m[1] ? { rested: true } : {}) })],
  [/^play (.+?) from your (hand|trash|hand or trash)( rested)?$/i, (m, ctx) => {
    const zone = m[2]!.toLowerCase();
    const z = zone === "hand or trash" ? "hand_or_trash" : (zone as "hand" | "trash");
    const target = zoneTarget(m[1]!, z, ctx);
    return target ? { do: "play", target, ...(m[3] ? { rested: true } : {}) } : null;
  }],
  [/^play (.+?)( rested)?$/i, (m, ctx) => {
    // Bare "play up to 1 [X]" means from hand.
    if (/ from /i.test(m[1]!)) return null;
    const target = zoneTarget(m[1]!, "hand", ctx);
    return target ? { do: "play", target, ...(m[2] ? { rested: true } : {}) } : null;
  }],
  [new RegExp(`^give (.+?) ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "power", target, amount: signed(m[2]!), duration: d } : null; }],
  [new RegExp(`^(.+?) gains? ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "power", target, amount: signed(m[2]!), duration: d } : null; }],
  [/^(that card|that character|it) gains? an additional ([+-]\d+) power$/i, (m) => ({ do: "power", target: { ref: "var", name: "_last" }, amount: signed(m[2]!), duration: "battle" })],
  [new RegExp(`^(.+?) gains? an additional ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "power", target, amount: signed(m[2]!), duration: d } : null; }],
  [new RegExp(`^give (.+?) ([+-]\\d+) cost ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "cost", target, amount: signed(m[2]!), duration: d } : null; }],
  [new RegExp(`^(.+?) gains? ([+-]\\d+) cost ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "cost", target, amount: signed(m[2]!), duration: d } : null; }],
  [new RegExp(`^(.+?)'s? base power becomes (\\d+) ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "base_power", target, value: num(m[2]!), duration: d } : null; }],
  [new RegExp(`^set the base power of (.+?) to (\\d+) ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[3]); return target && d ? { do: "base_power", target, value: num(m[2]!), duration: d } : null; }],
  [new RegExp(`^(.+?) gains? \\[(Rush|Blocker|Double Attack|Banish|Unblockable|Rush: Character)\\] ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const k = keywordOf(m[2]!); const d = parseDuration(m[3]); return target && k && d ? { do: "keyword", target, keyword: k, duration: d } : null; }],
  [new RegExp(`^(.+?) gains? \\[(Rush|Blocker|Double Attack|Banish|Unblockable)\\] and ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx, "_last"); const k = keywordOf(m[2]!); const d = parseDuration(m[4]); if (!target || !k || !d) return null; return { do: "seq", steps: [{ do: "keyword", target, keyword: k, duration: d }, { do: "power", target: target.ref === "choose" ? { ref: "var", name: "_last" } : target, amount: signed(m[3]!), duration: d }] }; }],
  [/^add up to (\d+) DON!! cards? from your DON!! deck and set (?:it|them) as active$/i, (m) => ({ do: "add_don", player: "you", count: num(m[1]!), rested: false })],
  [/^add up to (\d+) DON!! cards? from your DON!! deck and rest (?:it|them)$/i, (m) => ({ do: "add_don", player: "you", count: num(m[1]!), rested: true })],
  [/^add (\d+) DON!! cards? from your DON!! deck and (set (?:it|them) as active|rest (?:it|them))$/i, (m) => ({ do: "add_don", player: "you", count: num(m[1]!), rested: /rest/i.test(m[2]!) })],
  [/^add up to (\d+) additional DON!! cards? and (set (?:it|them) as active|rest (?:it|them))$/i, (m) => ({ do: "add_don", player: "you", count: num(m[1]!), rested: /rest/i.test(m[2]!) })],
  [/^your opponent adds (\d+) DON!! cards? from their DON!! deck and (sets (?:it|them) as active|rests (?:it|them))$/i, (m) => ({ do: "add_don", player: "opponent", count: num(m[1]!), rested: /rest/i.test(m[2]!) })],
  [/^give up to (\d+) (rested|active)? ?DON!! cards? to (.+)$/i, (m, ctx) => { const target = donRecipient(m[3]!, ctx); return target ? { do: "give_don", target, count: num(m[1]!), donState: (m[2]?.toLowerCase() as "rested" | "active" | undefined) ?? "any" } : null; }],
  [/^give (.+?) up to (\d+) (rested|active)? ?DON!! cards?$/i, (m, ctx) => { const target = donRecipient(m[1]!, ctx); return target ? { do: "give_don", target, count: num(m[2]!), donState: (m[3]?.toLowerCase() as "rested" | "active" | undefined) ?? "any" } : null; }],
  [/^your opponent returns (\d+) DON!! cards? from their field to their DON!! deck$/i, (m) => ({ do: "return_don", player: "opponent", count: num(m[1]!), chooser: "opponent" })],
  [/^return (\d+) DON!! cards? from your field to your DON!! deck$/i, (m) => ({ do: "return_don", player: "you", count: num(m[1]!) })],
  [/^add up to (\d+) cards? from the top of your deck to the top of your life cards( face-up)?$/i, (m) => ({ do: "deck_to_life", player: "you", count: num(m[1]!), ...(m[2] ? { faceUp: true } : {}) })],
  [/^add (\d+) cards? from the top of your deck to the top of your life cards( face-up)?$/i, (m) => ({ do: "deck_to_life", player: "you", count: num(m[1]!), ...(m[2] ? { faceUp: true } : {}) })],
  [/^add (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({ do: "life_to_hand", player: "you", count: num(m[1]!), position: "top" })],
  [/^add (\d+) cards? from the top or bottom of your life cards to your hand$/i, (m) => ({ do: "life_to_hand", player: "you", count: num(m[1]!), position: "top_or_bottom" })],
  [/^add up to (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({ do: "may", then: { do: "life_to_hand", player: "you", count: num(m[1]!), position: "top" }, prompt: "add the top card of your Life to your hand" })],
  [/^add up to (\d+) cards? from the top of your opponent's life cards to the owner's hand$/i, (m) => ({ do: "may", then: { do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top" }, prompt: "add the top card of your opponent's Life to their hand" })],
  [/^add (\d+) cards? from the top of your opponent's life cards to the owner's hand$/i, (m) => ({ do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top" })],
  [/^trash (\d+) cards? from the top of (your|your opponent's) life cards$/i, (m) => ({ do: "trash_life", player: rel(m[2]!), count: num(m[1]!) })],
  [/^trash up to (\d+) cards? from the top of (your|your opponent's) life cards$/i, (m) => ({ do: "trash_life", player: rel(m[2]!), count: num(m[1]!) })],
  [/^add up to (\d+) (.+?) from your hand to the top of your life cards( face-up)?$/i, (m, ctx) => {
    if (/^cards?$/i.test(m[2]!)) return { do: "hand_to_life", count: num(m[1]!), position: "top", faceUp: Boolean(m[3]), min: 0 };
    const p = parseCardPhrase(`all ${m[2]!}`, ctx); return p ? { do: "hand_to_life", count: num(m[1]!), position: "top", faceUp: Boolean(m[3]), min: 0, ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }],
  [/^turn (?:up to )?(\d+) cards? from the top of your life cards face-(up|down)$/i, (m) => ({ do: "life_face", player: "you", count: num(m[1]!), faceUp: m[2] === "up" })],
  [/^turn all of your life cards face-(up|down)$/i, (m) => ({ do: "life_face", player: "you", count: 99, faceUp: m[1] === "up" })],
  [/^look at (\d+) cards? from the top of (your|your opponent's) deck and place them at the top or bottom of the deck in any order$/i, (m) => ({ do: "look", player: rel(m[2]!), count: num(m[1]!), picks: [], rest: "top_or_bottom" })],
  [/^look at (\d+) cards? from the top of (your|your opponent's) deck$/i, (m) => ({ do: "look", player: rel(m[2]!), count: num(m[1]!), picks: [], rest: "deck_top" })],
  [/^look at (?:up to )?(\d+) cards? from the top of your deck; (.+?)(?:, then place the rest at the bottom of your deck(?: in any order)?)?$/i, (m, ctx) => { const picks = parseLookPicks(m[2]!, ctx); return picks ? { do: "look", player: "you", count: num(m[1]!), picks, rest: "deck_bottom", reveal: /\breveal\b/i.test(m[2]!) } : null; }],
  [/^look at (\d+) cards? from the top of your deck and (.+)$/i, (m, ctx) => { const picks = parseLookPicks(m[2]!, ctx); return picks ? { do: "look", player: "you", count: num(m[1]!), picks, rest: "deck_bottom", reveal: /\breveal\b/i.test(m[2]!) } : null; }],
  [/^look at up to (\d+) cards? from the top of (your|your opponent's|your or your opponent's) life cards(?:,)? and place (?:it|them) at the top or bottom of the life cards(?: in any order)?$/i, (m) => ({ do: "look_life", player: /or your opponent/i.test(m[2]!) ? "any" : rel(m[2]!), count: num(m[1]!), rest: "top_or_bottom" })],
  [/^look at all of your life cards and place them back in any order$/i, () => ({ do: "look_life", player: "you", count: 99, rest: "any_order" })],
  [new RegExp(`^negate the effects? of (.+?) ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "negate", target, duration: d } : null; }],
  [new RegExp(`^(.+?) cannot attack ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "restrict", target, restriction: "cannot_attack", duration: d } : null; }],
  [/^(.+?) will not become active in (?:your opponent's|your|their owner's|the owner's) next refresh phase$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "restrict", target, restriction: "no_refresh", duration: "permanent" } : null; }],
  [new RegExp(`^(.+?) cannot be KO'd by (?:your opponent's )?effects ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "restrict", target, restriction: /opponent/.test(m[0]) ? "cannot_be_ko_by_opponent_effect" : "cannot_be_ko_by_effect", duration: d } : null; }],
  [new RegExp(`^(.+?) cannot be KO'd in battle ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "restrict", target, restriction: "cannot_be_ko_in_battle", duration: d } : null; }],
  [new RegExp(`^(.+?) cannot be KO'd ${DUR}$`, "i"), (m, ctx) => { const target = fieldTarget(m[1]!, ctx); const d = parseDuration(m[2]); return target && d ? { do: "restrict", target, restriction: "cannot_be_ko", duration: d } : null; }],
  [new RegExp(`^none of your characters can be KO'd by effects ${DUR}$`, "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "restrict", target: { ref: "all", selector: { player: "you", zone: "character" } }, restriction: "cannot_be_ko_by_effect", duration: d } : null; }],
  [/^your opponent cannot activate (?:a )?\[Blocker\] during this battle$/i, () => ({ do: "keyword", target: { ref: "battle", role: "attacker" }, keyword: "unblockable", duration: "battle" })],
  [new RegExp(`^you cannot play character cards ${DUR}$`, "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "player_restrict", player: "you", restriction: "cannot_play_characters", duration: d } : null; }],
  [new RegExp(`^your opponent cannot play character cards ${DUR}$`, "i"), (m) => { const d = parseDuration(m[1]); return d ? { do: "player_restrict", player: "opponent", restriction: "cannot_play_characters", duration: d } : null; }],
  [/^activate this card's \[(Main|On Play|On KO|Counter|When Attacking)\] effect$/i, (m) => ({ do: "invoke", window: ({ Main: "main", "On Play": "on_play", "On KO": "on_ko", Counter: "counter", "When Attacking": "when_attacking" } as const)[m[1] as "Main"] })],
  [/^shuffle your deck$/i, () => ({ do: "shuffle", player: "you" })],
  [/^you win the game$/i, () => ({ do: "win" })],
  [/^take an extra turn after this one$/i, () => ({ do: "extra_turn" })],
  [/^change the attack target to (.+)$/i, (m, ctx) => { const target = fieldTarget(m[1]!, ctx); return target ? { do: "redirect_attack", target } : null; }],
];

/** Resolve the rest-placement sentence that follows a look ("Then, place the rest..."). */
export function applyRestSentence(effect: Effect, sentence: string): boolean {
  const rest = restPlacement(sentence);
  if (!rest) return false;
  const look = lastLook(effect);
  if (!look) return false;
  look.rest = rest;
  return true;
}

function lastLook(effect: Effect): Extract<Effect, { do: "look" }> | null {
  if (effect.do === "look") return effect;
  if (effect.do === "seq") return effect.steps.length ? lastLook(effect.steps[effect.steps.length - 1]!) : null;
  if (effect.do === "if" || effect.do === "may" || effect.do === "pay") return lastLook(effect.then);
  return null;
}

/** Parse a single effect clause (no leading "If ..., " handled here). */
export function parseEffectClause(text: string, ctx: Ctx): Effect | null {
  const t = clean(text);
  if (!t) return null;
  const direct = firstMatch(t, EFFECT_RULES, ctx);
  if (direct) return direct;
  // "you may X" as an optional effect with no cost
  let m = /^you may (.+)$/i.exec(t);
  if (m) {
    const inner = parseEffectClause(m[1]!, ctx);
    if (inner) return { do: "may", then: inner, bind: "_did", prompt: restoreNames(m[1]!, ctx.ph) };
  }
  // Suffix condition: "draw 1 card if you have 3 or less cards in your hand"
  m = /^(.+?) if (.+)$/i.exec(t);
  if (m) {
    const eff = parseEffectClause(m[1]!, ctx);
    const cond = eff && parseCondition(m[2]!, ctx);
    if (eff && cond) return { do: "if", cond, then: eff };
  }
  // Verb distribution: "KO up to 1 X and up to 1 Y" / "place up to 1 X and up to 1 Y at the bottom of the owner's deck"
  const dist = /^(ko|rest|return|place|trash|give) (up to .+?) and (up to .+?)( (?:to the owner's hand|at the (?:top|bottom) of the owner's deck(?: in any order)?|[+-]\d+ (?:power|cost) (?:during this turn|during this battle)))?$/i.exec(t);
  if (dist) {
    const tail = dist[4] ?? "";
    const a = parseEffectClause(dist[1] + " " + dist[2] + tail, ctx);
    const b = a && parseEffectClause(dist[1] + " " + dist[3] + tail, ctx);
    if (a && b) return { do: "seq", steps: [a, b] };
  }
  const thenSplit = t.split(/,? then,? /i);
  if (thenSplit.length === 2) {
    const a = parseEffectClause(thenSplit[0]!, ctx);
    const b = a && parseEffectClause(thenSplit[1]!, ctx);
    if (a && b) return { do: "seq", steps: [a, b] };
  }
  // Conjunction: "A and B" / "A, and B"
  const parts = t.split(/,? and (?!add it|add them|play it|rest it|set it|set them)/i);
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 1) {
      const a = parseEffectClause(parts.slice(0, i).join(" and "), ctx);
      const b = a && parseEffectClause(parts.slice(i).join(" and "), ctx);
      if (a && b) return { do: "seq", steps: [a, b] };
    }
  }
  return null;
}

/** "If COND, EFFECT" / "COND ... EFFECT" with the leftmost workable comma split. */
export function parseConditionalClause(text: string, ctx: Ctx): Effect | null {
  const t = clean(text);
  const m = /^if (.+)$/i.exec(t);
  if (!m) return parseEffectClause(t, ctx);
  if (/^if you do, /i.test(t)) {
    const inner = parseStatementBody(t.replace(/^if you do, /i, ""), ctx);
    return inner ? { do: "if", cond: { c: "var_count", name: "_did", op: ">=", value: 1 }, then: inner } : null;
  }
  const body = m[1]!;
  const commas = [...body.matchAll(/, /g)].map((x) => x.index!);
  for (const index of commas) {
    const cond = parseCondition(body.slice(0, index), ctx);
    if (!cond) continue;
    const eff = parseStatementBody(body.slice(index + 2), ctx);
    if (eff) return { do: "if", cond, then: eff };
  }
  return firstMatch(t, EFFECT_RULES, ctx);
}

/** An effect body that may itself contain a "you may X: Y" cost prefix or conditionals. */
function parseStatementBody(text: string, ctx: Ctx): Effect | null {
  const t = clean(text);
  const eff = parseEffectClause(t, ctx);
  if (eff) return eff;
  if (/^if /i.test(t)) return parseConditionalClause(t, ctx);
  return null;
}

/** Parse a multi-sentence effect body into a sequence. */
export function parseEffectBody(body: string, ctx: Ctx, split: (text: string) => string[]): { effect: Effect | null; failed: string[] } {
  const bullets = body.split(/\s*•\s*/);
  if (bullets.length > 1) {
    const head = bullets[0]!.trim();
    const chooseMatch = /^(.*?)((?:your opponent )?choose(?:s)? one|choose up to (\d+))[:.]?$/i.exec(head);
    if (chooseMatch) {
      const options: { label: string; effect: Effect }[] = [];
      const failed: string[] = [];
      for (const option of bullets.slice(1)) {
        const parsed = parseEffectBody(option, ctx, split);
        if (parsed.effect) options.push({ label: option.trim(), effect: parsed.effect });
        else failed.push(...parsed.failed);
      }
      if (failed.length) return { effect: null, failed };
      const prefix = chooseMatch[1]!.trim();
      const choose: Effect = { do: "choose_one", options, ...(/opponent/i.test(chooseMatch[2]!) ? { chooser: "opponent" as const } : {}) };
      if (!prefix) return { effect: choose, failed: [] };
      const cond = /^if (.+?),$/i.exec(prefix);
      if (cond) { const c = parseCondition(cond[1]!, ctx); if (c) return { effect: { do: "if", cond: c, then: choose }, failed: [] }; }
      const lead = /^(.+?),? then,?$/i.exec(prefix);
      if (lead) { const first = parseStatement(lead[1]!, ctx); if (first) return { effect: { do: "seq", steps: [first, choose] }, failed: [] }; }
      return { effect: null, failed: [head] };
    }
  }
  const steps: Effect[] = [];
  const failed: string[] = [];
  for (const sentence of split(body)) {
    const s = sentence.trim();
    if (!s) continue;
    if (steps.length && applyRestSentence(steps[steps.length - 1]!, s)) continue;
    // "Then, place the rest ... and play up to 1 X from your hand."
    const restAnd = /^(then, )?(place the rest at the bottom of your deck in any order|trash the rest) and (.+)$/i.exec(clean(s));
    if (restAnd && steps.length && applyRestSentence(steps[steps.length - 1]!, restAnd[2]!)) {
      const tail = parseStatement(restAnd[3]!, ctx);
      if (tail) { steps.push(tail); continue; }
      failed.push(s); continue;
    }
    const eff = parseStatement(s, ctx);
    if (eff) {
      if (eff.do === "if" && /^if you do, /i.test(clean(s))) linkIfYouDo(steps, eff, s, ctx);
      if (/^if the trashed card /i.test(clean(s)) && steps.length) bindTrashedCard(steps[steps.length - 1]!);
      steps.push(eff);
    } else failed.push(s);
  }
  if (failed.length) return { effect: null, failed };
  if (steps.length === 0) return { effect: null, failed: [body] };
  return { effect: steps.length === 1 ? steps[0]! : { do: "seq", steps }, failed: [] };
}

/** "Trash 1 card from the top of your deck. If the trashed card ...": the trash step binds the cards it trashed (`_last`) (#515). */
function bindTrashedCard(effect: Effect): void {
  if (effect.do === "mill") effect.bind = "_last";
  else if (effect.do === "seq" && effect.steps.length) bindTrashedCard(effect.steps[effect.steps.length - 1]!);
}

/**
 * Tie an "If you do, Y" sentence to the step before it.
 * After "you may X": X becomes a cost when it parses as one, so it is only offered when it can be paid in full
 * and the payoff never follows a partial payment; the prompt names X and the payoff.
 * After a plain action ("Play up to 1 ... If you do, ..."): gate on that action having affected a card.
 */
function linkIfYouDo(steps: Effect[], gate: Extract<Effect, { do: "if" }>, sentence: string, ctx: Ctx): void {
  const prev = steps[steps.length - 1];
  if (!prev || gate.cond.c !== "var_count" || gate.cond.name !== "_did") return;
  if (prev.do !== "may") { if (!JSON.stringify(prev).includes('"do":"may"')) gate.cond = { ...gate.cond, name: "_affected" }; return; }
  if (!prev.prompt || prev.costs || prev.chooser) return;
  const costs = parseCosts(prev.prompt, ctx);
  if (costs?.length) steps[steps.length - 1] = { do: "may", costs, then: { do: "nothing" }, bind: prev.bind ?? "_did", prompt: prev.prompt };
  // Not a cost (e.g. "return up to 1 ..."): accepting and then choosing nothing isn't "doing" it.
  else gate.cond = { c: "and", conds: [gate.cond, { c: "var_count", name: "_affected", op: ">=", value: 1 }] };
  (steps[steps.length - 1] as Extract<Effect, { do: "may" }>).prompt = `${prev.prompt}, and if you do, ${restoreNames(clean(sentence).replace(/^if you do, /i, ""), ctx.ph)}`;
}

/** One sentence: optional "You may COST: EFFECT", conditionals, plain effects. */
export function parseStatement(sentence: string, ctx: Ctx): Effect | null {
  const s = clean(sentence);
  // Inline cost: "you may trash 1 card from your hand: draw 2 cards" (rare mid-body)
  const colon = s.indexOf(": ");
  if (colon > 0) {
    const costs = parseCosts(s.slice(0, colon), ctx);
    const eff = costs && parseStatementBody(s.slice(colon + 2), ctx);
    if (costs && eff) return /^you may/i.test(s) ? { do: "may", costs, then: eff, bind: "_did" } : { do: "pay", costs, then: eff };
  }
  // "You may X. If you do, Y" split across sentences is handled by the "if you do" rule.
  return parseConditionalClause(s, ctx);
}

// ---------------------------------------------------------------------------
// Statics (continuous text)
// ---------------------------------------------------------------------------

function staticTarget(text: string, ctx: Ctx): StaticTarget | null {
  const t = text.trim();
  if (/^this (?:character|leader|stage|card)$/i.test(t)) return "self";
  if (/^your leader$/i.test(t)) return { all: { player: "you", zone: "leader" } };
  if (/^your opponent's leader$/i.test(t)) return { all: { player: "opponent", zone: "leader" } };
  const p = parseCardPhrase(t.replace(/^all of /i, "all of ").replace(/^(your|your opponent's) (?!leader$)/i, "all of $1 "), ctx);
  if (!p || p.quant.kind !== "all") return null;
  return { all: p.selector };
}

const STATIC_RULES: Rule<(Static & { when?: Cond[] })[]>[] = [
  [/^the counter of all of your (.+?) in your hand becomes \+(\d+)$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); return p ? [{ s: "counter", filter: p.selector.filter ?? {}, mode: "set", value: num(m[2]!) }] : null; }],
  [/^all (.+?) in your hand without a counter have a \+(\d+) counter$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); return p ? [{ s: "counter", filter: p.selector.filter ?? {}, mode: "set", value: num(m[2]!), onlyWithoutCounter: true }] : null; }],
  [/^the base power of all of your (.+?) becomes (\d+)$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? [{ s: "base_power", target: { all: p.selector }, value: num(m[2]!) }] : null; }],
  [/^all of your (§N\d+§) cards and this character gain \[(Blocker|Rush|Double Attack|Banish|Unblockable)\]$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); const k = keywordOf(m[2]!); return n && k ? [{ s: "keyword", target: { all: { player: "you", zone: "leader_or_character", filter: { names: n } } }, keyword: k }, { s: "keyword", target: "self", keyword: k }] : null; }],
  [/^(.+?) cannot be KO'd$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_ko" }] : null; }],
  [/^under the rules of this game, your DON!! deck consists of (\d+) cards$/i, (m) => [{ s: "deck_rule", rule: "don_deck:" + m[1] }]],
  [/^this character gains ([+-]\d+) power for each of your characters with a different card name$/i, (m) => [{ s: "power", target: "self", amount: { count: { of: "distinct_names", selector: { player: "you", zone: "character" } }, times: signed(m[1]!) } }]],
  [/^this character gains ([+-]\d+) cost, and if it is your opponent's turn, this character gains ([+-]\d+) power$/i, (m) => [{ s: "cost", target: "self", amount: signed(m[1]!) }, { s: "power", target: "self", amount: signed(m[2]!), when: [{ c: "opponent_turn" }] }]],
  [/^(.+?) gains? \[(Blocker)\] and ([+-]\d+) cost for every (\d+) (.+)$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); const count = parseCountPhrase(m[5]!, ctx); return target && count ? [{ s: "keyword", target, keyword: "blocker" }, { s: "cost", target, amount: { count, per: num(m[4]!), times: signed(m[3]!) } }] : null; }],
  [/^all characters with a cost of (\d+) or (\d+) cannot attack$/i, (m) => [{ s: "restrict", target: { all: { player: "any", zone: "character", filter: { any: [{ cost: { op: "==", value: num(m[1]!) } }, { cost: { op: "==", value: num(m[2]!) } }] } } }, restriction: "cannot_attack" }]],
  [/^(.+?) cannot attack unless (.+)$/i, () => null],
  [/^give (.+?) in your hand ([+-]\d+) cost$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); return p ? [{ s: "play_cost", target: { filter: p.selector.filter ?? {} }, amount: signed(m[2]!) }] : null; }],
  [/^the cost of playing (.+?) from your hand will be reduced by (\d+)$/i, (m, ctx) => { const p = parseCardPhrase("all " + m[1]!, ctx); return p ? [{ s: "play_cost", target: { filter: p.selector.filter ?? {} }, amount: -num(m[2]!) }] : null; }],
  [/^(.+?) gains? (\[[^\]]+\]|[+-]\d+ power) if (.+)$/i, () => null],
  [/^(.+?) cannot attack a leader on the turn in which it is played$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_attack_leader" }] : null; }],
  [/^(your .+?) base power becomes (\d+)$/i, (m, ctx) => { const target = staticTarget(m[1]!.replace(/'s$/i, ""), ctx); return target ? [{ s: "base_power", target, value: num(m[2]!) }] : null; }],
  [/^(.+?) cannot be KO'd in battle by leaders$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_in_battle_by_attribute", attribute: "__leader" }] : null; }],
  [/^when your deck is reduced to 0, you win the game instead of losing, according to the rules$/i, () => [{ s: "deck_rule", rule: "deck_out_win" }]],
  [/^(§T\d+§) type characters other than your (§N\d+§) cannot be KO'd in battle$/i, (m, ctx) => { const t = traitList(m[1]!, ctx); const n = nameList(m[2]!, ctx); return t && n ? [{ s: "restrict", target: { all: { player: "any", zone: "character", filter: { traits: t, notNames: n } } }, restriction: "cannot_be_ko_in_battle" }] : null; }],
  [/^your (§N\d+§) and all your characters with a type including (§Q\d+§) gain ([+-]\d+) power$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); const q = quote(m[2]!, ctx); return n && q ? [{ s: "power", target: { all: { player: "you", zone: "leader_or_character", filter: { names: n } } }, amount: signed(m[3]!) }, { s: "power", target: { all: { player: "you", zone: "character", filter: { traitIncludes: [q], notNames: n } } }, amount: signed(m[3]!) }] : null; }],
  [/^(.+?) gains? ([+-]\d+) power and ([+-]\d+) cost for every (\d+) (.+)$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); const count = parseCountPhrase(m[5]!, ctx); return target && count ? [{ s: "power", target, amount: { count, per: num(m[4]!), times: signed(m[2]!) } }, { s: "cost", target, amount: { count, per: num(m[4]!), times: signed(m[3]!) } }] : null; }],
  [/^(.+?) can also attack (?:your opponent's )?active characters$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "can_attack_active" }] : null; }],
  [/^(.+?) can attack characters on the turn in which (?:it is|they are) played$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "keyword", target, keyword: "rush_character" }] : null; }],
  [/^(.+?) cannot be KO'd in battle by <(\w+)> attribute (?:cards|characters|leaders or characters)$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_in_battle_by_attribute", attribute: m[2]! }] : null; }],
  [/^(.+?) gains? ([+-]\d+) power for every (\d+ )?(.+)$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); const count = parseCountPhrase(m[4]!, ctx) ?? parseCountPhrase("the number of " + m[4]!, ctx); return target && count ? [{ s: "power", target, amount: { count, times: signed(m[2]!), ...(m[3] ? { per: num(m[3].trim()) } : {}) } }] : null; }],
  [/^all of your (§N\d+§) cards' base power and this character's base power become (\d+)$/i, (m, ctx) => { const n = nameList(m[1]!, ctx); return n ? [{ s: "base_power", target: { all: { player: "you", zone: "character", filter: { names: n } } }, value: num(m[2]!) }, { s: "base_power", target: "self", value: num(m[2]!) }] : null; }],
  [/^(.+?) gains? ([+-]\d+) power$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "power", target, amount: signed(m[2]!) }] : null; }],
  [/^give (.+?) ([+-]\d+) power$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "power", target, amount: signed(m[2]!) }] : null; }],
  [/^(.+?) gains? ([+-]\d+) cost$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "cost", target, amount: signed(m[2]!) }] : null; }],
  [/^give (.+?) ([+-]\d+) cost$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "cost", target, amount: signed(m[2]!) }] : null; }],
  [/^(.+?) gains? \[(Blocker|Rush|Double Attack|Banish|Unblockable|Rush: Character)\]$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); const k = keywordOf(m[2]!); return target && k ? [{ s: "keyword", target, keyword: k }] : null; }],
  [/^(.+?) gains? \[(Blocker|Rush|Double Attack|Banish|Unblockable)\] and ([+-]\d+) (power|cost)$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); const k = keywordOf(m[2]!); return target && k ? [{ s: "keyword", target, keyword: k }, { s: m[4]!.toLowerCase() as "power", target, amount: signed(m[3]!) }] : null; }],
  [/^(.+?) gains? ([+-]\d+) (power|cost) and \[(Blocker|Rush|Double Attack|Banish|Unblockable)\]$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); const k = keywordOf(m[4]!); return target && k ? [{ s: "keyword", target, keyword: k }, { s: m[3]!.toLowerCase() as "power", target, amount: signed(m[2]!) }] : null; }],
  [/^(.+?) gains? ([+-]\d+) cost and ([+-]\d+) power$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "cost", target, amount: signed(m[2]!) }, { s: "power", target, amount: signed(m[3]!) }] : null; }],
  [/^(.+?) cannot attack$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_attack" }] : null; }],
  [/^(.+?) cannot be KO'd in battle$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_in_battle" }] : null; }],
  [/^(.+?) cannot be KO'd by (?:your )?opponent's effects$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_by_opponent_effect" }] : null; }],
  [/^(.+?) cannot be KO'd by effects$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_by_effect" }] : null; }],
  [/^(.+?) cannot be removed from the field by (?:your )?opponent's effects$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_removed_by_opponent_effect" }] : null; }],
  [/^(.+?) cannot be rested by (?:your )?opponent's effects$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_rested_by_opponent_effect" }] : null; }],
  [/^(.+?) can also attack active characters$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "can_attack_active" }] : null; }],
  [/^(.+?) cannot be blocked by characters with (\d+) power or less$/i, (m, ctx) => { const target = staticTarget(m[1]!, ctx); return target ? [{ s: "restrict", target, restriction: "cannot_be_blocked_by_power_or_less", value: num(m[2]!) }] : null; }],
  [/^(?:under the rules of this game, )?also treat this card's name as (.+?)(?: according to the rules)?$/i, (m, ctx) => { const names = nameList(m[1]!, ctx); return names ? [{ s: "name_alias", names }] : null; }],
  [/^according to the rules, (?:also )?treat this card's name as (.+)$/i, (m, ctx) => { const names = nameList(m[1]!, ctx); return names ? [{ s: "name_alias", names }] : null; }],
  [/^all of your (.+?) (?:cards )?without a counter have a \+(\d+) counter(?:, according to the rules)?$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[1]!}`, ctx); return p ? [{ s: "counter", filter: p.selector.filter ?? {}, mode: "set", value: num(m[2]!), onlyWithoutCounter: true }] : null; }],
  [/^all (.+?) in your hand have (?:a )?\+(\d+) counter$/i, (m, ctx) => { const p = parseCardPhrase(`all ${m[1]!}`, ctx); return p ? [{ s: "counter", filter: { ...(p.selector.filter ?? {}), ...(p.selector.filter?.types ? {} : {}) }, mode: "set", value: num(m[2]!) }] : null; }],
  [/^this character (?:card )?in your hand (?:gets|gains|has) ([+-]\d+) cost$/i, (m) => [{ s: "play_cost", target: "self", amount: signed(m[1]!) }]],
  [/^give this (?:character )?card in your hand ([+-]\d+) cost$/i, (m) => [{ s: "play_cost", target: "self", amount: signed(m[1]!) }]],
  [/^under the rules of this game, you may have any number of this card in your deck$/i, () => [{ s: "deck_rule", rule: "any_number" }]],
  [/^you cannot play character cards$/i, () => [{ s: "player_restrict", player: "you", restriction: "cannot_play_characters" }]],
];

export function parseStaticSentence(sentence: string, ctx: Ctx): { statics: (Static & { when?: Cond[] })[]; conditions: Cond[] } | null {
  const s = clean(sentence);
  const direct = firstMatch(s, STATIC_RULES, ctx);
  if (direct) return { statics: direct, conditions: [] };
  const unless = /^(.+?) cannot attack unless (.+)$/i.exec(s);
  if (unless) {
    const target = staticTarget(unless[1]!, ctx);
    const cond = parseCondition(unless[2]!, ctx);
    if (target && cond) return { statics: [{ s: "restrict", target, restriction: "cannot_attack" }], conditions: [{ c: "not", cond }] };
  }
  const trailingIf = /^(.+?) if (.+)$/i.exec(s);
  if (trailingIf) {
    const head = firstMatch(trailingIf[1]!, STATIC_RULES, ctx);
    const cond = head && parseCondition(trailingIf[2]!, ctx);
    if (head && cond) return { statics: head, conditions: [cond] };
  }
  const m = /^if (.+)$/i.exec(s);
  if (m) {
    const body = m[1]!;
    for (const match of body.matchAll(/, /g)) {
      const cond = parseCondition(body.slice(0, match.index), ctx);
      if (!cond) continue;
      const rest = parseStaticSentence(body.slice(match.index! + 2), ctx);
      if (rest) return { statics: rest.statics, conditions: [cond, ...rest.conditions] };
    }
  }
  const shared = /^(this (?:character|leader)) (cannot be .+?|gains .+?) and (gains .+|cannot .+)$/i.exec(s);
  if (shared) {
    const a = parseStaticSentence(shared[1] + " " + shared[2], ctx);
    const b = a && parseStaticSentence(shared[1] + " " + shared[3], ctx);
    if (a && b && !a.conditions.length && !b.conditions.length) return { statics: [...a.statics, ...b.statics], conditions: [] };
  }
  // "A, and B" / "A and B" static conjunctions ("this Character gains +1000 power, and all of your ... gain +2 cost")
  const parts = s.split(/,? and (?=all |this |your )/i);
  if (parts.length > 1) {
    const out: (Static & { when?: Cond[] })[] = [];
    let subject = "";
    for (const part of parts) {
      const r = parseStaticSentence(part, ctx) ?? (subject ? parseStaticSentence(`${subject} ${part}`, ctx) : null);
      if (!r || r.conditions.length) return null;
      out.push(...r.statics);
      subject = /^(this character|this leader)/i.exec(part)?.[1] ?? subject;
    }
    return { statics: out, conditions: [] };
  }
  return null;
}

export { restPlacement };
export type { Filter, Selector, Value, Restriction };
