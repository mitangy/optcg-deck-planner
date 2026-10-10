/**
 * Noun-phrase parsing for card references in protected card text.
 * Every parser consumes its whole input or returns null.
 */
import type { Cmp, CmpOp, CountExpr, Filter, Rel, RelOrAny, Selector, Value, Zone } from "../../effects/types.js";
import type { Placeholders } from "./normalize.js";

export interface Ctx {
  ph: Placeholders;
  /** Printed type of the card whose text is being compiled. */
  selfType: "leader" | "character" | "event" | "stage";
  /** Compiling an "On Event" ability: "that Character" is the card that caused the event (`_event`), not a chosen target. */
  eventCard?: boolean;
}

export interface CardPhrase {
  selector: Selector;
  quant: { kind: "all" } | { kind: "up_to"; n: number } | { kind: "exact"; n: number } | { kind: "self" } | { kind: "leader"; player: Rel };
  totalCostAtMost?: Value;
  totalPowerAtMost?: Value;
  distinctNames?: boolean;
}

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
export function num(text: string): number {
  const lower = text.toLowerCase();
  return lower in NUM_WORDS ? NUM_WORDS[lower]! : Number(text);
}

export function traitList(text: string, ctx: Ctx): string[] | null {
  // "§T0§", "§T0§ or §T1§", "§T0§, §T1§ or §T2§", "§T0§, §T1§, or §T2§"
  const parts = text.split(/\s*(?:,\s*or|,|\bor\b)\s*/).map((part) => part.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const m = /^§T(\d+)§$/.exec(part);
    if (!m) return null;
    out.push(ctx.ph.traits[Number(m[1])]!);
  }
  return out.length ? out : null;
}

export function nameList(text: string, ctx: Ctx): string[] | null {
  const parts = text.split(/\s*(?:,\s*or|,|\bor\b|\band\b)\s*/).map((part) => part.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const m = /^§N(\d+)§$/.exec(part);
    if (!m) return null;
    out.push(ctx.ph.names[Number(m[1])]!);
  }
  return out.length ? out : null;
}

export function quote(text: string, ctx: Ctx): string | null {
  const m = /^§Q(\d+)§$/.exec(text.trim());
  return m ? ctx.ph.quotes[Number(m[1])]! : null;
}

const COLORS = ["red", "green", "blue", "purple", "black", "yellow"];

function cmp(op: string, value: Value): Cmp {
  const map: Record<string, CmpOp> = { less: "<=", more: ">=", "": "==" };
  return { op: map[op] ?? "==", value };
}

/** "the number of your opponent's Life cards" etc. */
export function parseCountPhrase(text: string, ctx: Ctx): CountExpr | null {
  const t = text.trim().replace(/^the number of /i, "").replace(/^the total number of /i, "");
  const who = (s: string) => (s.toLowerCase() === "your" ? "you" : "opponent") as "you" | "opponent";
  const rules: [RegExp, (m: RegExpExecArray) => CountExpr | null][] = [
    [/^(your opponent's|your) life cards$/i, (m) => ({ of: "life", player: who(m[1]!) })],
    [/^cards in (your|your opponent's) hand$/i, (m) => ({ of: "hand", player: who(m[1]!) })],
    [/^cards in (your|your opponent's) trash$/i, (m) => ({ of: "trash", player: who(m[1]!) })],
    [/^(?:cards in )?your opponent's hand$/i, () => ({ of: "hand", player: "opponent" })],
    [/^DON!! cards on (your|your opponent's) field$/i, (m) => ({ of: "don_field", player: who(m[1]!) })],
    [/^(your|your opponent's) rested DON!! cards$/i, (m) => ({ of: "don_rested", player: who(m[1]!) })],
    [/^(your|your opponent's) active DON!! cards$/i, (m) => ({ of: "don_active", player: who(m[1]!) })],
    [/^(?:the total of )?(?:your and your opponent's|you and your opponent's) life cards$/i, () => ({ of: "life", player: "any" })],
    [/^the total of your and your opponent's life cards$/i, () => ({ of: "life", player: "any" })],
    [/^(your|your opponent's) leader's power$/i, (m) => ({ of: "leader_power", player: who(m[1]!) })],
    [/^your number of life cards$/i, () => ({ of: "life", player: "you" })],
    [/^(?:of )?(your|your opponent's) rested DON!! cards$/i, (m) => ({ of: "don_rested", player: who(m[1]!) })],
    [/^DON!! cards? given to that character$/i, () => ({ of: "don_attached_self" })],
    [/^cards? in (your|your opponent's) hand$/i, (m) => ({ of: "hand", player: who(m[1]!) })],
    [/^cards? in (your|your opponent's) trash$/i, (m) => ({ of: "trash", player: who(m[1]!) })],
    [/^(?:the )?number you returned to your deck$/i, () => ({ of: "var", name: "_affected" })],
    [/^(?:the )?number (?:of cards )?you placed at the bottom of your deck$/i, () => ({ of: "var", name: "_affected" })],
    [/^(?:card )?trashed$/i, () => ({ of: "var", name: "_discard" })],
    [/^DON!! cards given to this (?:character|leader)$/i, () => ({ of: "don_attached_self" })],
  ];
  for (const [re, build] of rules) { const m = re.exec(t); if (m) return build(m); }
  const inTrash = /^(.+?) in (your|your opponent's) trash$/i.exec(t);
  if (inTrash) {
    const p = parseCardPhrase("all " + inTrash[1]!, ctx, { zone: "trash" });
    if (p) return { of: "cards", selector: { ...p.selector, player: who(inTrash[2]!), zone: "trash" } };
  }
  const cards = /^(.+)$/.exec(t);
  if (cards) {
    const phrase = parseCardPhrase(cards[1]!, ctx, { allowBare: true });
    if (phrase && phrase.quant.kind !== "self" && phrase.quant.kind !== "leader") return { of: "cards", selector: phrase.selector };
  }
  return null;
}

/** Parse trailing qualifiers ("with a cost of 3 or less and a [Trigger] other than §N0§"). */
function parseQualifiers(text: string, ctx: Ctx, filter: Filter, extra: { totalCostAtMost?: Value; totalPowerAtMost?: Value; distinctNames?: boolean }): boolean {
  let rest = text.trim();
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(rest);
    if (!m || m.index !== 0) return null;
    rest = rest.slice(m[0].length).trim();
    rest = rest.replace(/^(?:and |, and |, )/, "").trim();
    return m;
  };
  let guard = 0;
  while (rest.length > 0 && guard++ < 20) {
    let m: RegExpExecArray | null;
    if ((m = take(/^(?:with )?(\d+) to (\d+) (base )?power/))) { const key = m[3] ? "basePower" : "power"; filter.all = [...(filter.all ?? []), { [key]: { op: ">=", value: num(m[1]!) } }, { [key]: { op: "<=", value: num(m[2]!) } }]; continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost of (\d+) to (\d+)/))) { const key = m[1] ? "baseCost" : "cost"; filter.all = [...(filter.all ?? []), { [key]: { op: ">=", value: num(m[2]!) } }, { [key]: { op: "<=", value: num(m[3]!) } }]; continue; }
    if ((m = take(/^(?:with )?(?:a )?(base )?power of (\d+) or (less|more)/))) { (m[1] ? (filter.basePower = cmp(m[3]!, num(m[2]!))) : (filter.power = cmp(m[3]!, num(m[2]!)))); continue; }
    if ((m = take(/^(?:with )?(\d+) or (more|less) (base )?power/))) { (m[3] ? (filter.basePower = cmp(m[2]!, num(m[1]!))) : (filter.power = cmp(m[2]!, num(m[1]!)))); continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost equal to or less than the total of your and your opponent's life cards/i))) { filter[m[1] ? "baseCost" : "cost"] = { op: "<=", value: { count: { of: "life", player: "any" } } }; continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost equal to or less than your number of life cards/i))) { filter[m[1] ? "baseCost" : "cost"] = { op: "<=", value: { count: { of: "life", player: "you" } } }; continue; }
    if ((m = take(/^(?:with |and )?(?:the )?<(\w+)>(?: or <(\w+)>)? attribute/i))) { filter.attributes = [m[1]!, ...(m[2] ? [m[2]] : [])]; continue; }
    if ((m = take(/^(?:with |and )?(?:the )?§Q(\d+)§(?: or §Q(\d+)§)? attribute/i))) { filter.attributes = [ctx.ph.quotes[Number(m[1])]!, ...(m[2] ? [ctx.ph.quotes[Number(m[2])]!] : [])]; continue; }
    if ((m = take(/^with (?:a )?trigger/i))) { filter.hasTrigger = true; continue; }
    if ((m = take(/^with different card names/i))) { extra.distinctNames = true; continue; }
    if ((m = take(/^(?:and )?(?:with )?a total cost of (\d+) or less/i))) { extra.totalCostAtMost = num(m[1]!); continue; }
    if ((m = take(/^(?:and )?a type including (§Q\d+§)/))) { const q = quote(m[1]!, ctx); if (!q) return false; filter.traitIncludes = [q]; continue; }
    if ((m = take(/^that is either (§N\d+§) or has the <(\w+)> attribute/i))) { const n = nameList(m[1]!, ctx); if (!n) return false; filter.any = [{ names: n }, { attributes: [m[2]!] }]; continue; }
    if ((m = take(/^with a cost of (\d+) or (\d+)(?! or)/))) { filter.any = [...(filter.any ?? []), { cost: { op: "==", value: num(m[1]!) } }, { cost: { op: "==", value: num(m[2]!) } }]; continue; }
    if ((m = take(/^(?:that has|with) (\d+) or more DON!! cards given/i))) { filter.donGiven = { op: ">=", value: num(m[1]!) }; continue; }
    if ((m = take(/^with (?:a|any) DON!! cards? given/i))) { filter.donGiven = { op: ">=", value: 1 }; continue; }
    if ((m = take(/^with a (base )?cost (\d+) or (less|more)/))) { (m[1] ? (filter.baseCost = cmp(m[3]!, num(m[2]!))) : (filter.cost = cmp(m[3]!, num(m[2]!)))); continue; }
    if ((m = take(/^with a base power of (\d+)(?! or)/))) { filter.basePower = cmp("", num(m[1]!)); continue; }
    if ((m = take(/^that do(?:es)? not have a type including (§Q\d+§)/))) { const q = quote(m[1]!, ctx); if (!q) return false; filter.notTraitIncludes = [q]; continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost of (\d+) or (less|more)/))) { (m[1] ? (filter.baseCost = cmp(m[3]!, num(m[2]!))) : (filter.cost = cmp(m[3]!, num(m[2]!)))); continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost of (\d+)(?! or)/))) { (m[1] ? (filter.baseCost = cmp("", num(m[2]!))) : (filter.cost = cmp("", num(m[2]!)))); continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost (?:equal to or less than|of or less than) (.+?)(?=(?: and | other than |,|$))/))) {
      const count = parseCountPhrase(m[2]!, ctx); if (!count) return false;
      const key = m[1] ? "baseCost" : "cost"; filter[key] = { op: "<=", value: { count } }; continue;
    }
    if ((m = take(/^(?:with )?(\d+) (base )?power or (less|more)/))) { (m[2] ? (filter.basePower = cmp(m[3]!, num(m[1]!))) : (filter.power = cmp(m[3]!, num(m[1]!)))); continue; }
    if ((m = take(/^(?:with )?(\d+) (base )?power(?! or)/))) { (m[2] ? (filter.basePower = cmp("", num(m[1]!))) : (filter.power = cmp("", num(m[1]!)))); continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?power (?:equal to or less than) (.+?)(?=(?: and | other than |,|$))/))) {
      const count = parseCountPhrase(m[2]!, ctx); if (!count) return false; filter[m[1] ? "basePower" : "power"] = { op: "<=", value: { count } }; continue;
    }
    if ((m = take(/^(?:with )?(?:a )?\[Trigger\]/))) { filter.hasTrigger = true; continue; }
    if ((m = take(/^without (?:a )?\[Trigger\]/))) { filter.hasTrigger = false; continue; }
    if ((m = take(/^without a Counter/))) { filter.hasCounter = false; continue; }
    if ((m = take(/^with a Counter/))) { filter.hasCounter = true; continue; }
    if ((m = take(/^with (?:a )?\+?(\d+) Counter or more/))) { filter.counter = { op: ">=", value: num(m[1]!) }; continue; }
    if ((m = take(/^with a type including (§Q\d+§(?: or §Q\d+§)*)/))) {
      const quotes = m[1]!.split(/ or /).map((part) => quote(part, ctx)); if (quotes.some((q) => q == null)) return false; filter.traitIncludes = quotes as string[]; continue;
    }
    if ((m = take(/^(?:with )?(?:a )?(§T\d+§(?:(?:, | or |, or )§T\d+§)*) type/))) { const traits = traitList(m[1]!, ctx); if (!traits) return false; filter.traits = traits; continue; }
    if ((m = take(/^other than (§N\d+§(?:(?:, | or |, or )§N\d+§)*)/))) { const names = nameList(m[1]!, ctx); if (!names) return false; filter.notNames = names; continue; }
    if ((m = take(/^other than this (?:character|leader|card|stage)/i))) { filter.excludeSelf = true; continue; }
    if ((m = take(/^except this (?:character|card)/i))) { filter.excludeSelf = true; continue; }
    if ((m = take(/^with (?:a )?total cost of (\d+) or less/))) { extra.totalCostAtMost = num(m[1]!); continue; }
    if ((m = take(/^with (?:a )?total power of (\d+) or less/))) { extra.totalPowerAtMost = num(m[1]!); continue; }
    if ((m = take(/^that (?:is|are) rested/))) { filter.rested = true; continue; }
    if ((m = take(/^with the <(\w+)> attribute/))) { filter.attributes = [m[1]!]; continue; }
    if ((m = take(/^with (?:a )?\[(Blocker|Rush|Double Attack|Banish)\]/))) { filter.keyword = m[1]!.toLowerCase().replace(" ", "_") as Filter["keyword"]; continue; }
    if ((m = take(/^that (?:was|were) played (?:on|during) this turn/))) { filter.playedThisTurn = true; continue; }
    if ((m = take(/^(?:with |and )?(?:both )?(?:the )?(§T\d+§(?:(?:, | or |, or )§T\d+§)*) type/))) { const traits = traitList(m[1]!, ctx); if (!traits) return false; filter.traits = traits; continue; }
    if ((m = take(/^(?:with )?(\d+) to (\d+) (base )?power/))) { const key = m[3] ? "basePower" : "power"; filter.all = [...(filter.all ?? []), { [key]: { op: ">=", value: num(m[1]!) } }, { [key]: { op: "<=", value: num(m[2]!) } }]; continue; }
    if ((m = take(/^(?:with )?(?:a |an )?(base )?cost of (\d+) to (\d+)/))) { const key = m[1] ? "baseCost" : "cost"; filter.all = [...(filter.all ?? []), { [key]: { op: ">=", value: num(m[2]!) } }, { [key]: { op: "<=", value: num(m[3]!) } }]; continue; }
    if ((m = take(/^(?:and |with )?no base effect/i))) { filter.vanilla = true; continue; }
    if ((m = take(/^without (\[(?:Blocker|Rush|Double Attack|Banish|Unblockable)\])(?! effect)/))) { filter.textExcludes = [...(filter.textExcludes ?? []), m[1]!]; continue; }
    if ((m = take(/^without (?:a |an )?(\[[^\]]+\]) effect/i))) { filter.textExcludes = [...(filter.textExcludes ?? []), m[1]!]; continue; }
    if ((m = take(/^with (?:a |an )?(\[[^\]]+\]) effect/i))) { filter.textIncludes = [...(filter.textIncludes ?? []), m[1]!]; continue; }
    if ((m = take(/^that has (\d+) or (less|more) power/))) { filter.power = cmp(m[2]!, num(m[1]!)); continue; }
    if ((m = take(/^that (?:is|are) active/))) { filter.rested = false; continue; }
    if ((m = take(/^(?:on|in) (?:your|the) field/i))) { continue; }
    if ((m = take(/^(?:with )?(\d+) (?:or more )?DON!! cards? given/i))) { continue; }
    return false;
  }
  return rest.length === 0;
}

const NOUNS: [RegExp, Zone, Filter["types"]][] = [
  [/^(?:leader or character cards?|leader or characters?|leaders? or characters?|leader and character cards?)$/i, "leader_or_character", undefined],
  [/^(?:leader or stage cards?|leaders? or stages?)$/i, "field", ["leader", "stage"]],
  [/^DON!! cards?$/i, "don", undefined],
  [/^(?:character cards?|characters?)$/i, "character", ["character"]],
  [/^leaders?$/i, "leader", ["leader"]],
  [/^(?:event cards?|events?)$/i, "hand", ["event"]],
  [/^(?:stage cards?|stages?)$/i, "stage", ["stage"]],
  [/^(?:character or event cards?)$/i, "hand", ["character", "event"]],
  [/^(?:event or stage cards?)$/i, "hand", ["event", "stage"]],
  [/^(?:character or stage cards?|characters? or stages?)$/i, "field", ["character", "stage"]],
  [/^cards?$/i, "field", undefined],
];

export interface PhraseOptions {
  /** Default zone when the phrase does not name one (e.g. "from your trash" parsed by the caller). */
  zone?: Zone;
  /** Allow phrases without a quantifier ("a {X} type Character"). */
  allowBare?: boolean;
  /** Owner when unspecified. */
  defaultPlayer?: RelOrAny;
}

/** Parse "up to 1 of your opponent's rested Characters with a cost of 3 or less". */
export function parseCardPhrase(input: string, ctx: Ctx, opts: PhraseOptions = {}): CardPhrase | null {
  // "up to 1 of your Leader or up to 1 of your Characters" picks one card among both: same as "Leader or Characters".
  let text = input.trim().replace(/^up to (\d+) of (your(?: opponent's)?) (leader(?: card)?) or up to \1 of \2 (characters?)\b/i, "up to $1 of $2 $3 or $4");
  const selfMatch = /^this (character|leader|stage|card|event)(?: card)?$/i.exec(text);
  if (selfMatch) return { selector: { player: "you", zone: "field" }, quant: { kind: "self" } };
  const leader = /^(your|your opponent's|their|its owner's) leader(?: card)?$/i.exec(text);
  if (leader) {
    const player: Rel = leader[1]!.toLowerCase() === "your" ? "you" : "opponent";
    return { selector: { player, zone: "leader" }, quant: { kind: "leader", player } };
  }
  const qualifiedLeader = /^(?:up to 1 of |1 of )?(your|your opponent's) (.+?) leader(?: card)?$/i.exec(text);
  if (qualifiedLeader && !/^(?:up to|all|\d)/i.test(qualifiedLeader[2]!)) {
    const lf = leaderFilter(qualifiedLeader[2]!, ctx);
    if (lf) return { selector: { player: qualifiedLeader[1]!.toLowerCase() === "your" ? "you" : "opponent", zone: "leader", filter: lf }, quant: { kind: "all" } };
    const inner = parseCardPhrase(`all ${qualifiedLeader[1]} ${qualifiedLeader[2]} leader`, ctx);
    if (inner && inner.selector.zone === "leader") return { selector: inner.selector, quant: { kind: "all" } };
  }
  let quant: CardPhrase["quant"] | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^up to (?:a total of )?(\d+|one|two|three) (?:of )?/i.exec(text))) { quant = { kind: "up_to", n: num(m[1]!) }; text = text.slice(m[0].length); }
  else if ((m = /^all (?:of )?/i.exec(text))) { quant = { kind: "all" }; text = text.slice(m[0].length); }
  else if ((m = /^(\d+|a|an|one|two) (?:of )?/i.exec(text))) { quant = { kind: "exact", n: num(m[1]!) }; text = text.slice(m[0].length); }
  else if (opts.allowBare) quant = { kind: "all" };
  else return null;

  let player: RelOrAny = opts.defaultPlayer ?? "any";
  if ((m = /^(?:your opponent's|their|the opponent's) /i.exec(text))) { player = "opponent"; text = text.slice(m[0].length); }
  else if ((m = /^your /i.exec(text))) { player = "you"; text = text.slice(m[0].length); }
  else if ((m = /^(?:the )?/i.exec(text))) { text = text.slice(m[0].length); }

  const filter: Filter = {};
  const extra: { totalCostAtMost?: Value; totalPowerAtMost?: Value; distinctNames?: boolean } = {};
  // Leading adjectives.
  for (let guard = 0; guard < 8; guard += 1) {
    if ((m = /^rested /i.exec(text))) { filter.rested = true; text = text.slice(m[0].length); continue; }
    if ((m = /^active /i.exec(text))) { filter.rested = false; text = text.slice(m[0].length); continue; }
    if ((m = /^multicolored /i.exec(text))) { filter.multicolor = true; text = text.slice(m[0].length); continue; }
    if ((m = new RegExp(`^(${COLORS.join("|")})(?:(?:, | or | and )(${COLORS.join("|")}))* `, "i").exec(text))) {
      filter.colors = m[0].trim().split(/, | or | and /).map((c) => c.toLowerCase()); text = text.slice(m[0].length); continue;
    }
    if ((m = /^(§T\d+§(?:(?:, | or |, or )§T\d+§)*) type /.exec(text))) { const traits = traitList(m[1]!, ctx); if (!traits) return null; filter.traits = traits; text = text.slice(m[0].length); continue; }
    if ((m = /^\[(Blocker|Rush|Double Attack|Banish|Trigger)\] /.exec(text))) {
      if (m[1] === "Trigger") filter.hasTrigger = true; else filter.keyword = m[1]!.toLowerCase().replace(" ", "_") as Filter["keyword"];
      text = text.slice(m[0].length); continue;
    }
    if ((m = /^<(\w+)>(?: or <(\w+)>)? attribute /.exec(text))) { filter.attributes = [m[1]!, ...(m[2] ? [m[2]] : [])]; text = text.slice(m[0].length); continue; }
    if ((m = /^(§T\d+§) type or <(\w+)> attribute /.exec(text))) { const t = traitList(m[1]!, ctx); if (!t) return null; filter.any = [{ traits: t }, { attributes: [m[2]!] }]; text = text.slice(m[0].length); continue; }
    if ((m = /^(\d+) cost /.exec(text))) { filter.cost = { op: "==", value: num(m[1]!) }; text = text.slice(m[0].length); continue; }
    if ((m = /^(§N\d+§(?:(?:, | or )§N\d+§)*) or (?:(red|green|blue|purple|black|yellow) )?(Event|Character|Stage)( cards?)? ?/.exec(text)) && /^(?:$|with |other than )/.test(text.slice(m[0].length))) {
      const names = nameList(m[1]!, ctx); if (!names) return null;
      const other: Filter = { types: [m[3]!.toLowerCase() as "event"], ...(m[2] ? { colors: [m[2].toLowerCase()] } : {}) };
      filter.any = [{ names }, other]; text = "cards " + text.slice(m[0].length); continue;
    }
    if ((m = /^(§T\d+§(?:(?:, | or )§T\d+§)*) type (?:cards?|characters?|character cards?) or (?:cards?|characters?|character cards?) with a type including (§Q\d+§) ?/.exec(text))) {
      const traits = traitList(m[1]!, ctx); const q = quote(m[2]!, ctx); if (!traits || !q) return null;
      filter.any = [{ traits }, { traitIncludes: [q] }]; text = (/character/i.test(m[0]) ? "character cards " : "cards ") + text.slice(m[0].length); continue;
    }
    if ((m = /^(§N\d+§(?:(?:, | or )§N\d+§)*) or (§T\d+§(?:(?:, | or |, or )§T\d+§)*) type /.exec(text))) {
      const names = nameList(m[1]!, ctx); const traits = traitList(m[2]!, ctx); if (!names || !traits) return null;
      filter.any = [{ names }, { traits }]; text = text.slice(m[0].length); continue;
    }
    break;
  }
  // Noun: named cards or a type noun, followed by qualifiers.
  let zone: Zone | null = null;
  let types: Filter["types"];
  const named = /^(§N\d+§(?:(?:, | or |, or | and |, and )§N\d+§)*)(?: cards?| characters?)?(?=$| with | other than | from | in | that )/i.exec(text);
  if (named) {
    const names = nameList(named[1]!, ctx);
    if (!names) return null;
    filter.names = names;
    text = text.slice(named[0].length).trim();
    zone = opts.zone ?? "leader_or_character";
  } else {
    const nounMatch = /^(leader or character cards?|leader or characters?|leaders? or characters?|leader and character cards?|leader or stage cards?|leaders? or stages?|DON!! cards?|character or event cards?|event or stage cards?|character or stage cards?|characters? or stages?|character cards?|characters?|leaders?|event cards?|events?|stage cards?|stages?|cards?)(?=$| |,)/i.exec(text);
    if (!nounMatch) return null;
    for (const [re, z, t] of NOUNS) if (re.test(nounMatch[1]!)) { zone = z; types = t; break; }
    text = text.slice(nounMatch[0].length).trim();
    // "Characters or [Name]" tail.
    const orNamed = /^or (§N\d+§(?:(?: or |, )§N\d+§)*)(?: cards?)?/.exec(text);
    if (orNamed) {
      const names = nameList(orNamed[1]!, ctx); if (!names) return null;
      filter.any = [{ types: types ?? undefined }, { names }];
      types = undefined; zone = "leader_or_character";
      text = text.slice(orNamed[0].length).trim();
    }
  }
  if (types) filter.types = types;
  if (opts.zone && zone !== "leader" && !(named && opts.zone)) zone = opts.zone === "field" ? zone : opts.zone;
  if (zone === "hand" && !opts.zone) zone = "field";
  if (!parseQualifiers(text, ctx, filter, extra)) return null;
  const selector: Selector = { player, zone: zone ?? "field", ...(Object.keys(filter).length ? { filter } : {}) };
  return { selector, quant, ...extra };
}

/** Adjectives before "Leader": names, traits, attributes, colors. */
function leaderFilter(adj: string, ctx: Ctx): Filter | null {
  let text = adj.trim();
  const filter: Filter = {};
  let m: RegExpExecArray | null;
  for (let guard = 0; guard < 6 && text; guard += 1) {
    if ((m = /^(§N\d+§(?:(?: or |, )§N\d+§)*)\s*/.exec(text))) { const n = nameList(m[1]!, ctx); if (!n) return null; filter.names = n; text = text.slice(m[0].length); continue; }
    if ((m = /^(§T\d+§(?:(?:, | or |, or )§T\d+§)*) type\s*/.exec(text))) { const t = traitList(m[1]!, ctx); if (!t) return null; filter.traits = t; text = text.slice(m[0].length); continue; }
    if ((m = /^<(\w+)> attribute\s*/.exec(text))) { filter.attributes = [m[1]!]; text = text.slice(m[0].length); continue; }
    if ((m = /^(red|green|blue|purple|black|yellow)\s*/i.exec(text))) { filter.colors = [m[1]!.toLowerCase()]; text = text.slice(m[0].length); continue; }
    if ((m = /^(?:rested|active)\s*/i.exec(text))) { filter.rested = /rested/i.test(m[0]); text = text.slice(m[0].length); continue; }
    if ((m = /^multicolored\s*/i.exec(text))) { filter.multicolor = true; text = text.slice(m[0].length); continue; }
    if ((m = /^monocolored\s*/i.exec(text))) { filter.multicolor = false; text = text.slice(m[0].length); continue; }
    return null;
  }
  return Object.keys(filter).length ? filter : null;
}

export function relOf(text: string): Rel | null {
  const t = text.toLowerCase().trim();
  if (t === "your" || t === "you") return "you";
  if (t === "your opponent's" || t === "your opponent" || t === "their" || t === "opponent's") return "opponent";
  return null;
}
