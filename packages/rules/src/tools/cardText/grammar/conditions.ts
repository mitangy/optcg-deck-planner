/** Condition grammar: "if ..." clauses → `Cond`. */
import type { Cond, Filter } from "../../../effects/types.js";
import { and, or, cmp, count as countCards, countOf, eq, exists, ge, le, none, sel } from "../../../effects/builders.js";
import { nameList, num, parseCardPhrase, parseCountPhrase, quote, traitList, withCostAreaDon, type Ctx } from "../phrases.js";
import { firstMatch, rel, rule, type Rule } from "./shared.js";

const COND_RULES: Rule<Cond>[] = [
  rule(/^either you or your opponent has (\d+) life cards?$/i, (m) =>
    or(cmp(countOf("life", "you"), "==", num(m[1]!)), cmp(countOf("life", "opponent"), "==", num(m[1]!))),
  ),
  rule(/^either you or your opponent has (\d+) DON!! cards on the field$/i, (m) =>
    or(cmp(countOf("don_field", "you"), ">=", num(m[1]!)), cmp(countOf("don_field", "opponent"), ">=", num(m[1]!))),
  ),
  rule(/^your leader has the (§T\d+§) type or is (§N\d+§)$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    const n = nameList(m[2]!, ctx);
    return t && n ? or({ c: "leader_trait", traits: t }, { c: "leader_name", names: n }) : null;
  }),
  rule(/^your leader has the (§T\d+§) type or a type including (§Q\d+§)$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    const q = quote(m[2]!, ctx);
    return t && q ? or({ c: "leader_trait", traits: t }, { c: "leader_trait_includes", text: q }) : null;
  }),
  rule(/^your opponent's leader has (\d+) power or (more|less)$/i, (m) =>
    cmp(countOf("leader_power", "opponent"), m[2]!.toLowerCase() === "more" ? ">=" : "<=", num(m[1]!)),
  ),
  rule(/^you have (§N\d+§) and (§N\d+§)$/i, (m, ctx) => {
    const a = nameList(m[1]!, ctx);
    const b = nameList(m[2]!, ctx);
    return a && b ? and(exists(sel("you", "field", { names: a })), exists(sel("you", "field", { names: b }))) : null;
  }),
  rule(/^it is your second turn or later$/i, () => ({ c: "turn_count", op: ">=", value: 2 })),
  rule(/^you have (\d+) (.+?) with different card names$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[2]!, ctx);
    return p ? cmp({ count: { of: "distinct_names", selector: p.selector } }, ">=", num(m[1]!)) : null;
  }),
  rule(/^you have (\d+) or (less|more) cards in your hand and (?:a|an) (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[3]!, ctx);
    return p ? and(cmp(countOf("hand", "you"), m[2]!.toLowerCase() === "more" ? ">=" : "<=", num(m[1]!)), exists(p.selector)) : null;
  }),
  rule(/^you have (\d+) or (more|less) DON!! cards on your field and (\d+) or (less|more) cards in your hand$/i, (m) =>
    and(
      cmp(countOf("don_field", "you"), m[2]!.toLowerCase() === "more" ? ">=" : "<=", num(m[1]!)),
      cmp(countOf("hand", "you"), m[4]!.toLowerCase() === "more" ? ">=" : "<=", num(m[3]!)),
    ),
  ),
  rule(/^your leader is (§N\d+§) or multicolored$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? or({ c: "leader_name", names: n }, { c: "leader_multicolor" }) : null;
  }),
  rule(/^your leader's colors include (red|green|blue|purple|black|yellow)$/i, (m) => ({
    c: "leader_color",
    colors: [m[1]!.toLowerCase()],
  })),
  rule(/^(your|your opponent's) leader has the <(\w+)> attribute$/i, (m) => exists(sel(rel(m[1]!), "leader", { attributes: [m[2]!] }))),
  rule(/^your leader has the (§T\d+§) type or the <(\w+)> attribute$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    return t ? or({ c: "leader_trait", traits: t }, exists(sel("you", "leader", { attributes: [m[2]!] }))) : null;
  }),
  rule(/^the number of your life cards is equal to or less than the number of your opponent's life cards$/i, () =>
    cmp(countOf("life", "you"), "<=", countOf("life", "opponent")),
  ),
  rule(/^the number of cards in your hand is at least (\d+) less than the number in your opponent's hand$/i, (m) =>
    cmp({ count: { of: "hand", player: "you" }, plus: num(m[1]!) }, "<=", countOf("hand", "opponent")),
  ),
  rule(/^the number of your characters is at least (\d+) less than the number of your opponent's characters$/i, (m) =>
    cmp({ count: { of: "cards", selector: sel("you", "character") }, plus: num(m[1]!) }, "<=", countCards(sel("opponent", "character"))),
  ),
  rule(/^(you|your opponent) (?:has|have) a total of (\d+) or more given DON!! cards$/i, (m) =>
    cmp(countOf("don_attached_total", rel(m[1]!)), ">=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) any DON!! cards given$/i, (m) => cmp(countOf("don_attached_total", rel(m[1]!)), ">=", 1)),
  rule(/^(?:there is|(you|your opponent) (?:has|have)) a character with a cost of (\d+) or with a cost of (\d+) or more$/i, (m) =>
    exists(
      sel(m[1] ? rel(m[1]) : "any", "character", {
        any: [{ cost: eq(num(m[2]!)) }, { cost: ge(num(m[3]!)) }],
      }),
    ),
  ),
  rule(/^your deck has (\d+) cards$/i, (m) => cmp(countOf("deck", "you"), "==", num(m[1]!))),
  rule(/^you only have (§T\d+§) type characters$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    return t ? onlyCharacters({ notTraits: t }) : null;
  }),
  rule(/^you only have characters with a cost of (\d+) or (more|less)$/i, (m) =>
    onlyCharacters({ cost: m[2]!.toLowerCase() === "more" ? le(num(m[1]!) - 1) : ge(num(m[1]!) + 1) }),
  ),
  // OP18-071 prints "If your Leader is {Sugar}" with the type brackets, but no card has a {Sugar} type: Sugar is the name.
  rule(/^your leader is (§T\d+§)$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    return t ? or({ c: "leader_name", names: t }, { c: "leader_trait", traits: t }) : null;
  }),
  rule(/^(?:the trashed card) (?:is|has) (.+)$/i, (m, ctx) => {
    const body = m[1]!;
    const p =
      parseCardPhrase(/^(?:a|an|\d) /i.test(body) ? body : "all cards " + body, ctx) ?? parseCardPhrase("all cards with " + body, ctx);
    return p ? { c: "var_all_match", name: "_last", filter: p.selector.filter ?? {} } : null;
  }),
  rule(/^(?:that character) (?:is|has) (.+)$/i, (m, ctx) => {
    const body = m[1]!;
    const p = parseCardPhrase("all cards with " + body, ctx) ?? parseCardPhrase("all cards " + body, ctx);
    return p ? { c: "var_all_match", name: ctx.eventCard ? "_event" : "_last", filter: p.selector.filter ?? {} } : null;
  }),
  rule(/^this (?:character|leader) has (\d+) power or (more|less)$/i, (m) =>
    cmp({ count: { of: "self_power" } }, m[2]!.toLowerCase() === "more" ? ">=" : "<=", num(m[1]!)),
  ),
  rule(/^your leader has (\d+) power or (more|less)$/i, (m) =>
    cmp(countOf("leader_power", "you"), m[2]!.toLowerCase() === "more" ? ">=" : "<=", num(m[1]!)),
  ),
  rule(/^your leader has (\d+) power or (more|less) and the (§T\d+§) type$/i, (m, ctx) => {
    const t = traitList(m[3]!, ctx);
    return t
      ? and(cmp(countOf("leader_power", "you"), m[2]!.toLowerCase() === "more" ? ">=" : "<=", num(m[1]!)), { c: "leader_trait", traits: t })
      : null;
  }),
  rule(/^your leader has the (§T\d+§) type and is active$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    return t ? and({ c: "leader_trait", traits: t }, { c: "leader_active" }) : null;
  }),
  rule(/^you have a face-up life card$/i, () => exists(sel("you", "life", { faceUp: true }))),
  rule(/^all of your DON!! cards are rested$/i, () => cmp(countOf("don_active", "you"), "==", 0)),
  rule(/^(you|your opponent) (?:has|have) (\d+) cards in (?:your|their) hand$/i, (m) => cmp(countOf("hand", rel(m[1]!)), "==", num(m[2]!))),
  rule(/^you have a total of (\d+) or (less|more) cards in your life area and hand$/i, (m) =>
    cmp(
      {
        count: {
          of: "sum",
          exprs: [
            { of: "life", player: "you" },
            { of: "hand", player: "you" },
          ],
        },
      },
      m[2]!.toLowerCase() === "more" ? ">=" : "<=",
      num(m[1]!),
    ),
  ),
  rule(/^the number of DON!! cards on your field is at least (\d+) less than the number on your opponent's field$/i, (m) =>
    cmp({ count: { of: "don_field", player: "you" }, plus: num(m[1]!) }, "<=", countOf("don_field", "opponent")),
  ),
  rule(/^you have (less|fewer|more) characters than your opponent$/i, (m) =>
    cmp(countCards(sel("you", "character")), m[1]!.toLowerCase() === "more" ? ">" : "<", countCards(sel("opponent", "character"))),
  ),
  rule(/^you have no other (§N\d+§)(?: characters?)?$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? none(sel("you", "character", { names: n, excludeSelf: true })) : null;
  }),
  rule(/^you do not have (\d+) (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[2]!, ctx);
    return p ? cmp(countCards(p.selector), "<", num(m[1]!)) : null;
  }),
  rule(/^you have (§N\d+§) and (§N\d+§) in your trash$/i, (m, ctx) => {
    const a = nameList(m[1]!, ctx);
    const b = nameList(m[2]!, ctx);
    return a && b ? and(exists(sel("you", "trash", { names: a })), exists(sel("you", "trash", { names: b }))) : null;
  }),
  rule(/^(you|your opponent) (?:has|have) (\d+) (.+?)(?: on (?:your|their) field)?$/i, (m, ctx) => {
    if (/life|cards in|DON!!/i.test(m[3]!)) return null;
    const p = parseCardPhrase("all " + (rel(m[1]!) === "you" ? "your " : "your opponent's ") + m[3]!, ctx);
    return p ? { c: "exists", selector: p.selector, atLeast: num(m[2]!) } : null;
  }),
  rule(/^you have (\d+) or (\d+) or more DON!! cards on your field$/i, (m) =>
    or(cmp(countOf("don_field", "you"), "==", num(m[1]!)), cmp(countOf("don_field", "you"), ">=", num(m[2]!))),
  ),
  rule(/^(?:the revealed card|that card|it)'s type includes (§Q\d+§)$/i, (m, ctx) => {
    const q = quote(m[1]!, ctx);
    return q ? { c: "var_all_match", name: "_last", filter: { traitIncludes: [q] } } : null;
  }),
  rule(/^(?:the revealed card|that card|it) (?:is|has) (.+)$/i, (m, ctx) => {
    const body = m[1]!;
    const p =
      parseCardPhrase(/^(?:a|an|\d) /i.test(body) ? body : "all cards " + body, ctx) ?? parseCardPhrase("all cards with " + body, ctx);
    return p ? { c: "var_all_match", name: "_last", filter: p.selector.filter ?? {} } : null;
  }),
  rule(/^you have (§N\d+§(?:(?: or |, )§N\d+§)*)(?: on your field)?$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? exists(sel("you", "field", { names: n })) : null;
  }),
  rule(/^(you|your opponent) (?:has|have) (\d+) life cards?$/i, (m) => cmp(countOf("life", rel(m[1]!)), "==", num(m[2]!))),
  rule(/^the only characters on your field are (§T\d+§(?:(?:, | or )§T\d+§)*) type characters$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    return t ? onlyCharacters({ notTraits: t }) : null;
  }),
  rule(/^you only have characters with a type including (§Q\d+§)$/i, (m, ctx) => {
    const q = quote(m[1]!, ctx);
    return q ? onlyCharacters({ notTraitIncludes: [q] }) : null;
  }),
  rule(/^you have any DON!! cards given$/i, () => cmp(countOf("don_attached_total", "you"), ">=", 1)),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (more|less) (.+?) in (?:your|their) trash$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[4]!, ctx, { zone: "trash" });
    return p
      ? cmp(countCards({ ...p.selector, player: rel(m[1]!), zone: "trash" }), m[3]!.toLowerCase() === "more" ? ">=" : "<=", num(m[2]!))
      : null;
  }),
  rule(/^your leader is (§N\d+§(?:(?:, | or |, or )§N\d+§)*)$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? { c: "leader_name", names: n } : null;
  }),
  rule(/^your leader is multicolored$/i, () => ({ c: "leader_multicolor" })),
  rule(/^your leader is active$/i, () => ({ c: "leader_active" })),
  rule(/^your leader is (red|green|blue|purple|black|yellow)$/i, (m) => ({ c: "leader_color", colors: [m[1]!.toLowerCase()] })),
  rule(/^your leader has the (§T\d+§(?:(?:, | or |, or )§T\d+§)*) type$/i, (m, ctx) => {
    const t = traitList(m[1]!, ctx);
    return t ? { c: "leader_trait", traits: t } : null;
  }),
  rule(/^your leader's type includes (§Q\d+§)$/i, (m, ctx) => {
    const q = quote(m[1]!, ctx);
    return q ? { c: "leader_trait_includes", text: q } : null;
  }),
  rule(/^your leader is (§N\d+§) or has the (§T\d+§) type$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    const t = traitList(m[2]!, ctx);
    return n && t ? or({ c: "leader_name", names: n }, { c: "leader_trait", traits: t }) : null;
  }),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) life cards?$/i, (m) =>
    cmp(countOf("life", rel(m[1]!)), /more/.test(m[3]!) ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) no life cards$/i, (m) => cmp(countOf("life", rel(m[1]!)), "==", 0)),
  rule(/^you and your opponent have a total of (\d+) or (less|more) life cards$/i, (m) =>
    cmp(countOf("life", "any"), m[2] === "less" ? "<=" : ">=", num(m[1]!)),
  ),
  rule(/^you have (less|more|fewer) life cards than your opponent$/i, (m) =>
    cmp(countOf("life", "you"), m[1] === "more" ? ">" : "<", countOf("life", "opponent")),
  ),
  rule(/^your opponent has (less|more|fewer) life cards than you$/i, (m) =>
    cmp(countOf("life", "opponent"), m[1] === "more" ? ">" : "<", countOf("life", "you")),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) cards in (?:your|their) hand$/i, (m) =>
    cmp(countOf("hand", rel(m[1]!)), /more/.test(m[3]!) ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) cards in (?:your|their) trash$/i, (m) =>
    cmp(countOf("trash", rel(m[1]!)), /more/.test(m[3]!) ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) cards in (?:your|their) deck$/i, (m) =>
    cmp(countOf("deck", rel(m[1]!)), /more/.test(m[3]!) ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^there (?:is|are) (\d+) or (less|more) cards in (your|your opponent's) deck$/i, (m) =>
    cmp(countOf("deck", rel(m[3]!)), m[2] === "more" ? ">=" : "<=", num(m[1]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more|fewer) DON!! cards on (?:your|their) field$/i, (m) =>
    cmp(countOf("don_field", rel(m[1]!)), /more/.test(m[3]!) ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) DON!! cards on (?:your|their) field$/i, (m) =>
    cmp(countOf("don_field", rel(m[1]!)), ">=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more) rested DON!! cards$/i, (m) =>
    cmp(countOf("don_rested", rel(m[1]!)), m[3] === "more" ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^(you|your opponent) (?:has|have) (\d+) or (less|more) active DON!! cards$/i, (m) =>
    cmp(countOf("don_active", rel(m[1]!)), m[3] === "more" ? ">=" : "<=", num(m[2]!)),
  ),
  rule(/^the number of DON!! cards on your field is equal to or less than the number on your opponent's field$/i, () =>
    cmp(countOf("don_field", "you"), "<=", countOf("don_field", "opponent")),
  ),
  rule(/^the number of DON!! cards on your field is equal to or more than the number on your opponent's field$/i, () =>
    cmp(countOf("don_field", "you"), ">=", countOf("don_field", "opponent")),
  ),
  rule(/^your opponent has more DON!! cards on their field than you$/i, () =>
    cmp(countOf("don_field", "opponent"), ">", countOf("don_field", "you")),
  ),
  rule(/^you have (\d+) or more cards in your hand than your opponent$/i, (m) =>
    cmp(countOf("hand", "you"), ">=", { count: { of: "hand", player: "opponent" }, plus: num(m[1]!) }),
  ),
  rule(/^this (?:character|card) was played on this turn$/i, () => ({ c: "self_played_this_turn" })),
  rule(/^this character is rested$/i, () => ({ c: "self_rested", value: true })),
  rule(/^this character is active$/i, () => ({ c: "self_rested", value: false })),
  rule(/^it is your turn$/i, () => ({ c: "your_turn" })),
  rule(/^it is your opponent's turn$/i, () => ({ c: "opponent_turn" })),
  rule(/^this character is battling (?:your opponent's|an opponent's) character$/i, () => ({ c: "battle_against", target: "character" })),
  rule(/^you don't have (§N\d+§(?:(?: or |, )§N\d+§)*)$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? none(sel("you", "leader_or_character", { names: n })) : null;
  }),
  rule(/^you have no other (§N\d+§) characters?$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? none(sel("you", "character", { names: n, excludeSelf: true })) : null;
  }),
  rule(/^(you|your opponent) (?:has|have) (\d+) or more (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[3]!}`, ctx);
    return p && p.quant.kind === "all"
      ? { c: "exists", selector: p.selector.filter?.rested === true ? withCostAreaDon(p.selector) : p.selector, atLeast: num(m[2]!) }
      : null;
  }),
  rule(/^(you|your opponent) (?:has|have) (\d+) or less (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[3]!}`, ctx);
    return p && p.quant.kind === "all" ? cmp(countCards(p.selector), "<=", num(m[2]!)) : null;
  }),
  rule(/^(you|your opponent) (?:has|have) (?:a|an|any) (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[2]!}`, ctx);
    return p && p.quant.kind === "all" ? exists(p.selector) : null;
  }),
  rule(/^(you|your opponent) (?:has|have) no (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!.toLowerCase() === "you" ? "your" : "your opponent's"} ${m[2]!}`, ctx);
    return p && p.quant.kind === "all" ? none(p.selector) : null;
  }),
  rule(/^there (?:is|are) (?:a|an) (.+?)(?: on the field)?$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[1]!}`, ctx);
    return p && p.quant.kind === "all" ? exists(p.selector) : null;
  }),
  rule(/^there are (\d+) or more (.+?)(?: on the field)?$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p && p.quant.kind === "all" ? { c: "exists", selector: p.selector, atLeast: num(m[1]!) } : null;
  }),
  rule(/^(?:the number of )?(.+?) is (\d+) or (more|less)$/i, (m, ctx) => {
    const count = parseCountPhrase(m[1]!, ctx);
    return count ? cmp({ count }, m[3] === "more" ? ">=" : "<=", num(m[2]!)) : null;
  }),
  rule(/^this character has (\d+) or more DON!! cards given to it$/i, (m) => ({ c: "self_don", atLeast: num(m[1]!) })),
  rule(/^this (?:leader|character) is attacking$/i, () => ({ c: "attacker_is_self" })),
];

/** "the only Characters on your field are X": at least one Character, and none that is not X (official Q&A: no Characters means false). */
function onlyCharacters(notMatching: Filter): Cond {
  return and(exists(sel("you", "character")), none({ player: "you", zone: "character", filter: notMatching }));
}

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
      if (left && right) return and(left, right);
    }
  }
  const ors = splitTop(t, / or /);
  if (ors.length > 1) {
    for (let i = 1; i < ors.length; i += 1) {
      const left = parseCondition(ors.slice(0, i).join(" or "), ctx);
      const right = left && parseCondition(ors.slice(i).join(" or "), ctx);
      if (left && right) return or(left, right);
    }
  }
  return null;
}

function splitTop(text: string, sep: RegExp): string[] {
  return text.split(sep);
}
