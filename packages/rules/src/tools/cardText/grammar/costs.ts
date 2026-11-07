/** Cost grammar: "you may COST:" prefixes → `Cost[]`. */
import type { Cost } from "../../../effects/types.js";
import { sel } from "../../../effects/builders.js";
import { nameList, num, parseCardPhrase, withCostAreaDon, type Ctx } from "../phrases.js";
import { firstMatch, rule, type Rule } from "./shared.js";

const COST_RULES: Rule<Cost>[] = [
  rule(/^reveal a total of (\d+) (.+?) from your hand$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[2]!, ctx) ?? parseCardPhrase("all " + m[2]!.replace(/^event or /i, ""), ctx);
    if (!p) return null;
    const filter =
      /^event or /i.test(m[2]!) && p.selector.filter ? { any: [{ types: ["event" as const] }, p.selector.filter] } : p.selector.filter;
    return { k: "reveal_hand", count: num(m[1]!), ...(filter ? { filter } : {}) };
  }),
  rule(/^return (\d+) characters? to your hand$/i, (m) => ({
    k: "return_cards_to_hand",
    selector: sel("you", "character"),
    count: num(m[1]!),
  })),
  rule(/^play (\d+) (.+?) from your hand$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[2]!, ctx);
    return p ? { k: "play_from_hand", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }),
  rule(/^return (\d+) cards? from your trash to your deck and shuffle it$/i, (m) => ({ k: "trash_to_deck_shuffle", count: num(m[1]!) })),
  rule(/^place this card and (\d+) cards? from your hand at the bottom of your deck(?: in any order)?$/i, () => null),
  rule(/^give your (?:1 )?active leader -(\d+) power during this turn$/i, (m) => ({
    k: "power",
    target: "active_leader",
    amount: -num(m[1]!),
  })),
  rule(/^trash (\d+) cards? from the top or bottom of your life cards$/i, (m) => ({
    k: "trash_life",
    count: num(m[1]!),
    position: "top_or_bottom",
  })),
  rule(/^give (\d+) active DON!! cards? to (?:1 of )?(.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[2]!.replace(/^your /i, ""), ctx);
    return p ? { k: "give_don", count: num(m[1]!), selector: p.selector } : null;
  }),
  rule(/^place (\d+) (.+?) at the bottom of (?:the owner's|your) deck$/i, (m, ctx) => {
    if (/from your (hand|trash)/i.test(m[2]!)) return null;
    const p = parseCardPhrase("all your " + m[2]!, ctx);
    return p ? { k: "cards_to_deck_bottom", selector: p.selector, count: num(m[1]!) } : null;
  }),
  rule(/^rest your (?:1 )?leader$/i, () => ({ k: "rest_cards", selector: sel("you", "leader"), count: 1 })),
  rule(/^rest your leader (§N\d+§(?:(?:, | or )§N\d+§)*)$/i, (m, ctx) => {
    const n = nameList(m[1]!, ctx);
    return n ? { k: "rest_cards", selector: sel("you", "leader", { names: n, rested: false }), count: 1 } : null;
  }),
  rule(/^KO (\d+) of your (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[2]!, ctx);
    return p ? { k: "ko_cards", selector: p.selector, count: num(m[1]!) } : null;
  }),
  rule(/^return (\d+) of your active DON!! cards? to your DON!! deck$/i, (m) => ({ k: "return_active_don", count: num(m[1]!) })),
  rule(/^return (\d+) DON!! cards? from your field to your DON!! deck$/i, (m) => ({ k: "return_don", count: num(m[1]!) })),
  rule(/^add (\d+) cards? from your life area to your hand$/i, (m) => ({ k: "life_to_hand", count: num(m[1]!), position: "top" })),
  rule(/^place this (?:card|character) and (\d+) cards? from your hand at the bottom of your deck(?: in any order)?$/i, () => null),
  rule(/^DON!! -(\d+)$/i, (m) => ({ k: "return_don", count: num(m[1]!) })),
  rule(/^\[RDON (\d+)\]$/, (m) => ({ k: "rest_don", count: num(m[1]!) })),
  rule(/^rest (\d+) of your DON!! cards?$/i, (m) => ({ k: "rest_don", count: num(m[1]!) })),
  rule(/^rest this (?:character|stage|leader|card)$/i, () => ({ k: "rest_self" })),
  rule(/^trash this (?:character|stage|card)$/i, () => ({ k: "trash_self" })),
  rule(/^return this character to the owner's hand$/i, () => ({ k: "self_to_hand" })),
  rule(/^place this character at the bottom of the owner's deck$/i, () => ({ k: "self_to_deck_bottom" })),
  rule(/^trash (\d+|a) cards? from your hand$/i, (m) => ({ k: "trash_hand", count: num(m[1]!) })),
  rule(/^trash (\d+|a) (.+?) from your hand$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p ? { k: "trash_hand", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }),
  rule(/^reveal (\d+) (.+?) from your hand$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p ? { k: "reveal_hand", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }),
  rule(/^place (\d+) cards? from your hand at the bottom of your deck(?: in any order)?$/i, (m) => ({
    k: "hand_to_deck_bottom",
    count: num(m[1]!),
  })),
  rule(/^place (\d+) (.+?) from your hand at the bottom of your deck(?: in any order)?$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p ? { k: "hand_to_deck_bottom", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }),
  rule(/^(?:place|return) (\d+) cards? from your trash (?:at|to) the bottom of your deck(?: in any order)?$/i, (m) => ({
    k: "trash_to_deck_bottom",
    count: num(m[1]!),
  })),
  rule(/^(?:place|return) (\d+) (.+?) from your trash (?:at|to) the bottom of your deck(?: in any order)?$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p ? { k: "trash_to_deck_bottom", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }),
  rule(/^add (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({
    k: "life_to_hand",
    count: num(m[1]!),
    position: "top",
  })),
  rule(/^add (\d+) cards? from the top or bottom of your life cards to your hand$/i, (m) => ({
    k: "life_to_hand",
    count: num(m[1]!),
    position: "top_or_bottom",
  })),
  rule(/^trash (\d+) cards? from the top of your life cards$/i, (m) => ({ k: "trash_life", count: num(m[1]!) })),
  rule(/^turn (\d+) cards? from the top of your life cards face-down$/i, (m) => ({ k: "life_face_down", count: num(m[1]!) })),
  rule(/^turn (\d+) cards? from the top of your life cards face-up$/i, (m) => ({ k: "life_face_up", count: num(m[1]!) })),
  rule(/^trash (\d+) cards? from the top of your deck$/i, (m) => ({ k: "mill", count: num(m[1]!) })),
  rule(/^give your (active )?leader -(\d+) power during this turn$/i, (m) => ({
    k: "power",
    target: m[1] ? "active_leader" : "leader",
    amount: -num(m[2]!),
  })),
  rule(/^give this character -(\d+) power during this turn$/i, (m) => ({ k: "power", target: "self", amount: -num(m[1]!) })),
  rule(/^give (\d+) of your opponent's rested DON!! cards? to 1 of your opponent's characters$/i, (m) => ({
    k: "give_opponent_don",
    count: num(m[1]!),
  })),
  rule(/^rest (\d+) of your (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all your ${m[2]!}`, ctx);
    return p
      ? {
          k: "rest_cards",
          selector: withCostAreaDon({ ...p.selector, filter: { ...p.selector.filter, rested: false } }),
          count: num(m[1]!),
        }
      : null;
  }),
  rule(/^trash (\d+) of your (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(`all your ${m[2]!}`, ctx);
    return p ? { k: "trash_cards", selector: p.selector, count: num(m[1]!) } : null;
  }),
  rule(/^return (\d+) of your (.+?) to (?:the owner's|your) hand$/i, (m, ctx) => {
    const p = parseCardPhrase(`all your ${m[2]!}`, ctx);
    return p ? { k: "return_cards_to_hand", selector: p.selector, count: num(m[1]!) } : null;
  }),
  rule(/^place (\d+) of your (.+?) at the bottom of (?:the owner's|your) deck$/i, (m, ctx) => {
    const p = parseCardPhrase(`all your ${m[2]!}`, ctx);
    return p ? { k: "cards_to_deck_bottom", selector: p.selector, count: num(m[1]!) } : null;
  }),
  rule(/^place this card at the (top|bottom) of your life cards face-(up|down)$/i, (m) => ({
    k: "place_self_in_life",
    faceUp: m[2] === "up",
  })),
];

/** "trash this Character and 1 of your X": the "1 of your X" is another card, never the paying card itself (#656). */
function excludingSelf(costs: Cost[]): Cost[] {
  return costs.map((c) =>
    "selector" in c &&
    c.selector &&
    (c.k === "trash_cards" || c.k === "rest_cards" || c.k === "return_cards_to_hand" || c.k === "cards_to_deck_bottom")
      ? { ...c, selector: { ...c.selector, filter: { ...c.selector.filter, excludeSelf: true } } }
      : c,
  );
}

export function parseCosts(text: string, ctx: Ctx): Cost[] | null {
  const t = text
    .trim()
    .replace(/^you may /i, "")
    .replace(/,$/, "")
    .trim();
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
  if (noComma) {
    const a = parseCosts(noComma[1]!, ctx);
    const b = a && parseCosts(noComma[2]!, ctx);
    if (a && b) return [...a, ...b];
  }
  const carry = /^(rest|trash|return|place) (this (?:character|stage|leader|card)) and (\d+ .+)$/i.exec(t);
  if (carry) {
    const a = parseCosts(carry[1] + " " + carry[2], ctx);
    const b = a && parseCosts(carry[1] + " " + carry[3], ctx);
    if (a && b) return [...a, ...excludingSelf(b)];
  }
  const carry2 = /^(rest|trash|return|place) (\d+ .+?) and (this (?:character|stage|leader|card))(.*)$/i.exec(t);
  if (carry2) {
    const a = parseCosts(carry2[1] + " " + carry2[2] + carry2[4], ctx);
    const b = a && parseCosts(carry2[1] + " " + carry2[3] + carry2[4], ctx);
    if (a && b) return [...excludingSelf(a), ...b];
  }
  // "[RDON 1] you may rest this Character"
  const rdon = /^(\[RDON \d+\])\s+(.+)$/.exec(t);
  if (rdon) {
    const a = parseCosts(rdon[1]!, ctx);
    const b = a && parseCosts(rdon[2]!, ctx);
    if (a && b) return [...a, ...b];
  }
  return null;
}
