/** Static (continuous) text grammar → `Static` + enabling conditions. */
import type { Cond, Static, StaticTarget } from "../../../effects/types.js";
import { eq, ge, sel } from "../../../effects/builders.js";
import { nameList, num, parseCardPhrase, parseCountPhrase, quote, traitList, type Ctx } from "../phrases.js";
import { clean, firstMatch, keywordOf, rule, signed, type Rule } from "./shared.js";
import { parseCondition } from "./conditions.js";

function staticTarget(text: string, ctx: Ctx): StaticTarget | null {
  const t = text.trim();
  if (/^this (?:character|leader|stage|card)$/i.test(t)) return "self";
  if (/^your leader$/i.test(t)) return { all: sel("you", "leader") };
  if (/^your opponent's leader$/i.test(t)) return { all: sel("opponent", "leader") };
  const p = parseCardPhrase(t.replace(/^all of /i, "all of ").replace(/^(your|your opponent's) (?!leader$)/i, "all of $1 "), ctx);
  if (!p || p.quant.kind !== "all") return null;
  return { all: p.selector };
}

const STATIC_RULES: Rule<(Static & { when?: Cond[] })[]>[] = [
  rule(/^the counter of all of your (.+?) in your hand becomes \+(\d+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    return p ? [{ s: "counter", filter: p.selector.filter ?? {}, mode: "set", value: num(m[2]!) }] : null;
  }),
  rule(/^all (.+?) in your hand without a counter have a \+(\d+) counter$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    return p ? [{ s: "counter", filter: p.selector.filter ?? {}, mode: "set", value: num(m[2]!), onlyWithoutCounter: true }] : null;
  }),
  rule(/^the base power of your active (§N\d+§) leader with (\d+) or more DON!! cards given becomes (\d+)$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? [{ s: "base_power", target: { all: sel("you", "leader", { names: n, rested: false, donGiven: ge(num(m[2]!)) }) }, value: num(m[3]!) }] : null;
  }),
  rule(/^the base power of all of your (.+?) becomes (\d+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[1]!, ctx);
    return p ? [{ s: "base_power", target: { all: p.selector }, value: num(m[2]!) }] : null;
  }),
  rule(/^all of your (§N\d+§) cards and this character gain \[(Blocker|Rush|Double Attack|Banish|Unblockable)\]$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    const k = keywordOf(m[2]!);
    return n && k
      ? [
          { s: "keyword", target: { all: sel("you", "leader_or_character", { names: n }) }, keyword: k },
          { s: "keyword", target: "self", keyword: k },
        ]
      : null;
  }),
  rule(/^(.+?) cannot be KO'd$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_ko" }] : null;
  }),
  rule(/^under the rules of this game, your DON!! deck consists of (\d+) cards$/i, (m) => [{ s: "deck_rule", rule: "don_deck:" + m[1] }]),
  rule(/^this character gains ([+-]\d+) power for each of your characters with a different card name$/i, (m) => [
    { s: "power", target: "self", amount: { count: { of: "distinct_names", selector: sel("you", "character") }, times: signed(m[1]!) } },
  ]),
  rule(/^this character gains ([+-]\d+) cost, and if it is your opponent's turn, this character gains ([+-]\d+) power$/i, (m) => [
    { s: "cost", target: "self", amount: signed(m[1]!) },
    { s: "power", target: "self", amount: signed(m[2]!), when: [{ c: "opponent_turn" }] },
  ]),
  rule(/^(.+?) gains? \[(Blocker)\] and ([+-]\d+) cost for every (\d+) (.+)$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    const count = parseCountPhrase(m[5]!, ctx);
    return target && count
      ? [
          { s: "keyword", target, keyword: "blocker" },
          { s: "cost", target, amount: { count, per: num(m[4]!), times: signed(m[3]!) } },
        ]
      : null;
  }),
  rule(/^all characters with a cost of (\d+) or (\d+) cannot attack$/i, (m) => [
    {
      s: "restrict",
      target: {
        all: sel("any", "character", { any: [{ cost: eq(num(m[1]!)) }, { cost: eq(num(m[2]!)) }] }),
      },
      restriction: "cannot_attack",
    },
  ]),
  rule(/^(.+?) cannot attack unless (.+)$/i, () => null),
  rule(/^give (.+?) in your hand ([+-]\d+) cost$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    return p ? [{ s: "play_cost", target: { filter: p.selector.filter ?? {} }, amount: signed(m[2]!) }] : null;
  }),
  rule(/^the cost of playing (.+?) from your hand will be reduced by (\d+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    return p ? [{ s: "play_cost", target: { filter: p.selector.filter ?? {} }, amount: -num(m[2]!) }] : null;
  }),
  rule(/^(.+?) gains? (\[[^\]]+\]|[+-]\d+ power) if (.+)$/i, () => null),
  rule(/^(.+?) cannot attack a leader on the turn in which it is played$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_attack_leader" }] : null;
  }),
  rule(/^(your .+?) base power becomes (\d+)$/i, (m, ctx) => {
    const target = staticTarget(m[1]!.replace(/'s$/i, ""), ctx);
    return target ? [{ s: "base_power", target, value: num(m[2]!) }] : null;
  }),
  rule(/^(.+?) cannot be KO'd in battle by leaders$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_in_battle_by_attribute", attribute: "__leader" }] : null;
  }),
  rule(/^when your deck is reduced to 0, you win the game instead of losing, according to the rules$/i, () => [
    { s: "deck_rule", rule: "deck_out_win" },
  ]),
  rule(/^(§T\d+§) type characters other than your (§N\d+§) cannot be KO'd in battle$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    const n = nameList(m[2]!, ctx);
    return t && n
      ? [{ s: "restrict", target: { all: sel("any", "character", { traits: t, notNames: n }) }, restriction: "cannot_be_ko_in_battle" }]
      : null;
  }),
  rule(/^your (§N\d+§) and all your characters with a type including (§Q\d+§) gain ([+-]\d+) power$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    const q = quote(m[2]!, ctx);
    return n && q
      ? [
          { s: "power", target: { all: sel("you", "leader_or_character", { names: n }) }, amount: signed(m[3]!) },
          { s: "power", target: { all: sel("you", "character", { traitIncludes: [q], notNames: n }) }, amount: signed(m[3]!) },
        ]
      : null;
  }),
  rule(/^(.+?) gains? ([+-]\d+) power and ([+-]\d+) cost for every (\d+) (.+)$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    const count = parseCountPhrase(m[5]!, ctx);
    return target && count
      ? [
          { s: "power", target, amount: { count, per: num(m[4]!), times: signed(m[2]!) } },
          { s: "cost", target, amount: { count, per: num(m[4]!), times: signed(m[3]!) } },
        ]
      : null;
  }),
  rule(/^(.+?) can also attack (?:your opponent's )?active characters$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "can_attack_active" }] : null;
  }),
  rule(/^(.+?) can attack characters on the turn in which (?:it is|they are) played$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "keyword", target, keyword: "rush_character" }] : null;
  }),
  rule(/^(.+?) cannot be KO'd in battle by <(\w+)> attribute (?:cards|characters|leaders or characters)$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_in_battle_by_attribute", attribute: m[2]! }] : null;
  }),
  rule(/^(.+?) gains? ([+-]\d+) power for every (\d+ )?(.+)$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    const count = parseCountPhrase(m[4]!, ctx) ?? parseCountPhrase("the number of " + m[4]!, ctx);
    return target && count
      ? [{ s: "power", target, amount: { count, times: signed(m[2]!), ...(m[3] ? { per: num(m[3].trim()) } : {}) } }]
      : null;
  }),
  rule(/^all of your (§N\d+§) cards' base power and this character's base power become (\d+)$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n
      ? [
          { s: "base_power", target: { all: sel("you", "character", { names: n }) }, value: num(m[2]!) },
          { s: "base_power", target: "self", value: num(m[2]!) },
        ]
      : null;
  }),
  rule(/^(.+?) gains? ([+-]\d+) power$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "power", target, amount: signed(m[2]!) }] : null;
  }),
  rule(/^give (.+?) ([+-]\d+) power$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "power", target, amount: signed(m[2]!) }] : null;
  }),
  rule(/^(.+?) gains? ([+-]\d+) cost$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "cost", target, amount: signed(m[2]!) }] : null;
  }),
  rule(/^give (.+?) ([+-]\d+) cost$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "cost", target, amount: signed(m[2]!) }] : null;
  }),
  rule(/^(.+?) gains? \[(Blocker|Rush|Double Attack|Banish|Unblockable|Rush: Character)\]$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    const k = keywordOf(m[2]!);
    return target && k ? [{ s: "keyword", target, keyword: k }] : null;
  }),
  rule(/^(.+?) gains? \[(Blocker|Rush|Double Attack|Banish|Unblockable)\] and ([+-]\d+) (power|cost)$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    const k = keywordOf(m[2]!);
    return target && k
      ? [
          { s: "keyword", target, keyword: k },
          { s: m[4]!.toLowerCase() as "power", target, amount: signed(m[3]!) },
        ]
      : null;
  }),
  rule(/^(.+?) gains? ([+-]\d+) (power|cost) and \[(Blocker|Rush|Double Attack|Banish|Unblockable)\]$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    const k = keywordOf(m[4]!);
    return target && k
      ? [
          { s: "keyword", target, keyword: k },
          { s: m[3]!.toLowerCase() as "power", target, amount: signed(m[2]!) },
        ]
      : null;
  }),
  rule(/^(.+?) gains? ([+-]\d+) cost and ([+-]\d+) power$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target
      ? [
          { s: "cost", target, amount: signed(m[2]!) },
          { s: "power", target, amount: signed(m[3]!) },
        ]
      : null;
  }),
  rule(/^(.+?) cannot attack$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_attack" }] : null;
  }),
  rule(/^(.+?) cannot be KO'd in battle$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_in_battle" }] : null;
  }),
  rule(/^(.+?) cannot be KO'd by (?:your )?opponent's effects$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_by_opponent_effect" }] : null;
  }),
  rule(/^(.+?) cannot be KO'd by effects$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_ko_by_effect" }] : null;
  }),
  rule(/^(.+?) cannot be removed from the field by (?:your )?opponent's effects$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_removed_by_opponent_effect" }] : null;
  }),
  rule(/^(.+?) cannot be rested by (?:your )?opponent's effects$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_rested_by_opponent_effect" }] : null;
  }),
  rule(/^(.+?) can also attack active characters$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "can_attack_active" }] : null;
  }),
  rule(/^(.+?) cannot be blocked by characters with (\d+) power or less$/i, (m, ctx) => {
    const target = staticTarget(m[1]!, ctx);
    return target ? [{ s: "restrict", target, restriction: "cannot_be_blocked_by_power_or_less", value: num(m[2]!) }] : null;
  }),
  rule(/^(?:under the rules of this game, )?also treat this card's name as (.+?)(?: according to the rules)?$/i, (m, ctx) => {
    const names = nameList(m[1]!, ctx);
    return names ? [{ s: "name_alias", names }] : null;
  }),
  rule(/^according to the rules, (?:also )?treat this card's name as (.+)$/i, (m, ctx) => {
    const names = nameList(m[1]!, ctx);
    return names ? [{ s: "name_alias", names }] : null;
  }),
  rule(/^all of your (.+?) (?:cards )?without a counter have a \+(\d+) counter(?:, according to the rules)?$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!}`, ctx);
    return p ? [{ s: "counter", filter: p.selector.filter ?? {}, mode: "set", value: num(m[2]!), onlyWithoutCounter: true }] : null;
  }),
  rule(/^all (.+?) in your hand have (?:a )?\+(\d+) counter$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!}`, ctx);
    return p
      ? [
          {
            s: "counter",
            filter: { ...(p.selector.filter ?? {}), ...(p.selector.filter?.types ? {} : {}) },
            mode: "set",
            value: num(m[2]!),
          },
        ]
      : null;
  }),
  rule(/^this character (?:card )?in your hand (?:gets|gains|has) ([+-]\d+) cost$/i, (m) => [
    { s: "play_cost", target: "self", amount: signed(m[1]!) },
  ]),
  rule(/^give this (?:character )?card in your hand ([+-]\d+) cost$/i, (m) => [{ s: "play_cost", target: "self", amount: signed(m[1]!) }]),
  rule(/^under the rules of this game, you may have any number of this card in your deck$/i, () => [
    { s: "deck_rule", rule: "any_number" },
  ]),
  rule(/^you cannot play character cards$/i, () => [{ s: "player_restrict", player: "you", restriction: "cannot_play_characters" }]),
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
