/** Effect grammar: rule table, clause splitting and sentence/body parsers → `Effect`. */
import type { Cost, Effect, LookPick, Placement, Target } from "../../../effects/types.js";
import {
  and,
  count as countCards,
  countOf,
  draw,
  exactly,
  exists,
  ge,
  ko,
  keyword,
  le,
  leaderOf,
  power,
  sel,
  select,
  seq,
  upTo,
  v,
  varCount,
  when,
} from "../../../effects/builders.js";
import { restoreNames } from "../normalize.js";
import { nameList, num, parseCardPhrase, parseCountPhrase, quote, withCostAreaDon, type Ctx } from "../phrases.js";
import {
  DUR,
  clean,
  fieldTarget,
  firstMatch,
  keywordOf,
  parseDuration,
  rel,
  rule,
  signed,
  toTarget,
  zoneTarget,
  type Rule,
} from "./shared.js";
import { parseCondition } from "./conditions.js";
import { parseCosts } from "./costs.js";

const DON_TARGET: Record<string, (ctx: Ctx) => Target> = {};

function donRecipient(text: string, ctx: Ctx): Target | null {
  const t = text.trim().toLowerCase();
  if (
    t === "your leader or 1 of your characters" ||
    t === "your leader or up to 1 of your characters" ||
    t === "1 of your leader or character cards" ||
    t === "your leader or character" ||
    t === "this leader or 1 of your characters"
  )
    return upTo(1, sel("you", "leader_or_character"));
  if (t === "your leader") return leaderOf("you");
  if (t === "this character" || t === "this leader") return { ref: "self" };
  if (t === "1 of your characters" || t === "up to 1 of your characters") return upTo(1, sel("you", "character"));
  const p = parseCardPhrase(text.replace(/^(?:1|up to 1) of /i, "1 of "), ctx);
  if (p) {
    const target = toTarget(p);
    if (target.ref === "choose") return { ...target, min: 0, max: 1 };
    return target;
  }
  void DON_TARGET;
  return null;
}

function lookDest(text: string): LookPick["dest"] | null {
  const t = text.trim().toLowerCase();
  if (t === "add it to your hand" || t === "add them to your hand" || t === "add it to your hand") return "hand";
  if (t === "play it" || t === "play them") return "play";
  if (t === "play it rested") return "play_rested";
  if (t === "add it to the top of your life cards") return "life_top";
  if (t === "trash it" || t === "trash them") return "trash";
  if (t === "place it at the top of your deck") return "deck_top";
  if (t === "place it at the bottom of your deck") return "deck_bottom";
  return null;
}

export function restPlacement(text: string): Placement | null {
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
  return {
    min: 0,
    max: n,
    dest,
    ...(p.selector.filter ? { filter: p.selector.filter } : {}),
    ...(p.totalCostAtMost != null ? { totalCostAtMost: p.totalCostAtMost } : {}),
  };
}

function parseLookPicks(text: string, ctx: Ctx): LookPick[] | null {
  // "reveal up to 1 {X} type card and add it to your hand"
  const t = text.trim().replace(/^and /i, "");
  let m: RegExpExecArray | null;
  if (
    (m =
      /^(?:reveal )?up to (\d+|a total of \d+) (.+?) and (add (?:it|them) to your hand|play (?:it|them)(?: rested)?|add it to the top of your life cards|trash (?:it|them))$/i.exec(
        t,
      ))
  ) {
    const dest = lookDest(m[3]!);
    const count = m[1]!.replace("a total of ", "");
    const pick = dest ? pickFrom(count, m[2]!, dest, ctx) : null;
    if (pick) return [pick];
  }
  if ((m = /^(?:reveal )?a total of up to (\d+) (.+?) and (add (?:it|them) to your hand)$/i.exec(t))) {
    const pick = pickFrom(m[1]!, m[2]!, "hand", ctx);
    if (pick) return [pick];
  }
  if ((m = /^add up to (\d+) (.+?) to your hand$/i.exec(t))) {
    const pick = pickFrom(m[1]!, m[2]!, "hand", ctx);
    if (pick) return [pick];
  }
  if ((m = /^reveal up to (\d+) (.+?) or up to (\d+) (.+?) and add (?:it|them) to your hand$/i.exec(t))) {
    const a = pickFrom(m[1]!, m[2]!, "hand", ctx);
    const b = pickFrom(m[3]!, m[4]!, "hand", ctx);
    if (a && b) return [{ min: 0, max: Math.max(a.max, b.max), dest: "hand", filter: { any: [a.filter ?? {}, b.filter ?? {}] } }];
  }
  if ((m = /^add up to (\d+) (.+?) to the top of your life cards( face-up)?$/i.exec(t))) {
    const pick = pickFrom(m[1]!, m[2]!, "life_top", ctx);
    if (pick && m[3]) pick.faceUp = true;
    return pick ? [pick] : null;
  }
  if ((m = /^play up to (\d+) (.+?)( rested)?$/i.exec(t))) {
    const pick = pickFrom(m[1]!, m[2]!, m[3] ? "play_rested" : "play", ctx);
    return pick ? [pick] : null;
  }
  if ((m = /^trash up to (\d+) (.+?)$/i.exec(t))) {
    const pick = pickFrom(m[1]!, m[2]!, "trash", ctx);
    return pick ? [pick] : null;
  }
  if ((m = /^reveal up to (\d+) (.+?) and up to (\d+) (.+?) and add them to your hand$/i.exec(t))) {
    const a = pickFrom(m[1]!, m[2]!, "hand", ctx);
    const b = pickFrom(m[3]!, m[4]!, "hand", ctx);
    return a && b ? [a, b] : null;
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
  rule(/^place the rest at the (top|bottom|top or bottom) of (?:your|the) deck$/i, (m) => ({
    do: "to_deck",
    target: v("_last"),
    position: m[1]!.toLowerCase() === "top or bottom" ? "top_or_bottom" : (m[1]!.toLowerCase() as "top" | "bottom"),
  })),
  rule(/^change the target of that attack to this leader or to one of your (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[1]!, ctx);
    return p ? { do: "redirect_attack", target: exactly(1, { player: "you", zone: "leader", also: [p.selector] }) } : null;
  }),
  rule(/^add (up to \d+ .+?) from your trash to the top of your life cards( face-up)?$/i, (m, ctx) => {
    const t = zoneTarget(m[1]!, "trash", ctx);
    return t ? { do: "to_life", target: t, position: "top", faceUp: Boolean(m[2]) } : null;
  }),
  rule(/^add (up to \d+ .+?) from your hand or trash to the top of your life cards( face-up)?$/i, (m, ctx) => {
    const t = zoneTarget(m[1]!, "hand_or_trash", ctx);
    return t ? { do: "to_life", target: t, position: "top", faceUp: Boolean(m[2]) } : null;
  }),
  rule(new RegExp("^give your opponent's leader and all of their characters ([+-]\\d+) power " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[2]);
    return d
      ? seq(power(leaderOf("opponent"), signed(m[1]!), d), power({ ref: "all", selector: sel("opponent", "character") }, signed(m[1]!), d))
      : null;
  }),
  rule(new RegExp("^negate the effects? of your opponent's leader and all of their characters " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[1]);
    return d
      ? seq(
          { do: "negate", target: leaderOf("opponent"), duration: d },
          { do: "negate", target: { ref: "all", selector: sel("opponent", "character") }, duration: d },
        )
      : null;
  }),
  rule(new RegExp("^your opponent cannot activate \\[Blocker\\] " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[1]);
    return d
      ? { do: "restrict", target: { ref: "all", selector: sel("opponent", "character") }, restriction: "cannot_block", duration: d }
      : null;
  }),
  rule(new RegExp("^your opponent cannot activate (?:a )?\\[Blocker\\] character that has (\\d+) or more power " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[2]);
    return d
      ? { do: "restrict", target: { ref: "self" }, restriction: "cannot_be_blocked_by_power_or_more", value: num(m[1]!), duration: d }
      : null;
  }),
  rule(
    /^your opponent cannot activate \[Blocker\] if (?:that leader or character|the selected character|that card) attacks (during this turn)$/i,
    () => keyword(v("_last"), "unblockable", "turn"),
  ),
  rule(/^if the selected character attacks during this turn, your opponent cannot activate \[Blocker\]$/i, () =>
    keyword(v("_last"), "unblockable", "turn"),
  ),
  rule(
    /^look at (\d+) cards? from the top of your deck and (?:return|place) them (?:at|to) the top or bottom of (?:the|your) deck in any order$/i,
    (m) => ({ do: "look", player: "you", count: num(m[1]!), picks: [], rest: "top_or_bottom", reveal: false }),
  ),
  rule(/^look at (\d+) cards? from the top of your deck and place them at the top of your deck in any order$/i, (m) => ({
    do: "look",
    player: "you",
    count: num(m[1]!),
    picks: [],
    rest: "deck_top",
    reveal: false,
  })),
  rule(
    /^look at (\d+) cards? from the top of your deck, reorganize them in any order and place them at the top or bottom of your deck$/i,
    (m) => ({ do: "look", player: "you", count: num(m[1]!), picks: [], rest: "top_or_bottom", reveal: false }),
  ),
  rule(/^trash up to (\d+) of your opponent's life cards$/i, (m) => ({
    do: "may",
    then: { do: "trash_life", player: "opponent", count: num(m[1]!) },
    prompt: "trash your opponent's top Life card",
  })),
  rule(new RegExp("^none of your characters can be KO'd " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[1]);
    return d
      ? { do: "restrict", target: { ref: "all", selector: sel("you", "character") }, restriction: "cannot_be_ko", duration: d }
      : null;
  }),
  rule(/^add (up to \d+ .+?) to the top of the owner's life cards face-(up|down)$/i, (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    return t ? { do: "to_life", target: t, position: "top", faceUp: m[2]!.toLowerCase() === "up" } : null;
  }),
  rule(/^reveal (\d+) cards? from the top of your deck and add up to (\d+) (.+?) to your hand$/i, (m, ctx) => {
    const pick = pickFrom(m[2]!, m[3]!, "hand", ctx);
    return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_top", reveal: true } : null;
  }),
  rule(/^reveal (\d+) cards? from the top of your deck and play up to (\d+) (.+?) rested$/i, (m, ctx) => {
    const pick = pickFrom(m[2]!, m[3]!, "play_rested", ctx);
    return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_bottom", reveal: true } : null;
  }),
  rule(/^trash all (?:of )?your face-up life cards$/i, () => ({
    do: "to_trash",
    target: { ref: "all", selector: sel("you", "life", { faceUp: true }) },
  })),
  rule(/^play up to (\d+) each of (.+?) (with a cost of .+?) from your hand$/i, (m, ctx) => {
    const names = nameList(m[2]!.replace(/, and /g, ", "), ctx);
    const p = names && parseCardPhrase("all cards " + m[3]!, ctx);
    return names && p
      ? {
          do: "play",
          target: upTo(num(m[1]!) * names.length, sel("you", "hand", { ...(p.selector.filter ?? {}), names }), { distinctNames: true }),
        }
      : null;
  }),
  rule(/^(.+?) gains? \[(Rush|Blocker|Double Attack|Banish|Unblockable)\]$/i, (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    const k = keywordOf(m[2]!);
    return t && k ? keyword(t, k, "permanent") : null;
  }),
  rule(/^return all of your (.+?) to the owner's hand$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[1]!, ctx);
    return p ? { do: "to_hand", target: { ref: "all", selector: p.selector } } : null;
  }),
  rule(new RegExp("^for every (.+?) on your field, give (up to \\d+ .+?) ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => {
    const p = parseCardPhrase("all your " + m[1]!, ctx);
    const t = fieldTarget(m[2]!, ctx);
    const d = parseDuration(m[4]);
    return p && t && d ? power(t, { count: { of: "cards", selector: p.selector }, times: signed(m[3]!) }, d) : null;
  }),
  rule(/^set up to (\d+) of your (.+?) and up to (\d+) of your DON!! cards as active$/i, (m, ctx) => {
    const p = parseCardPhrase("up to " + m[1] + " of your " + m[2], ctx);
    return p ? seq({ do: "activate", target: toTarget(p) }, { do: "set_don_active", count: num(m[3]!) }) : null;
  }),
  rule(/^your opponent adds (\d+) cards? from their life area to their hand$/i, (m) => ({
    do: "life_to_hand",
    player: "opponent",
    count: num(m[1]!),
    position: "top",
  })),
  rule(new RegExp("^your leader gains ([+-]\\d+) power for each of your characters " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[2]);
    return d ? power(leaderOf("you"), { count: { of: "cards", selector: sel("you", "character") }, times: signed(m[1]!) }, d) : null;
  }),
  rule(new RegExp("^this character and (up to \\d+ .+?) gain ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return t && d ? seq(power({ ref: "self" }, signed(m[2]!), d), power(t, signed(m[2]!), d)) : null;
  }),
  rule(/^place all cards in your hand at the bottom of your deck(?: in any order)?$/i, () => ({
    do: "to_deck",
    target: { ref: "all", selector: sel("you", "hand") },
    position: "bottom",
  })),
  rule(/^your opponent places (\d+) of their characters at the bottom of the owner's deck$/i, (m) => ({
    do: "to_deck",
    target: exactly(num(m[1]!), sel("opponent", "character"), { chooser: "opponent" }),
    position: "bottom",
  })),
  rule(/^return any number of characters on your field to the owner's hand$/i, () => ({
    do: "to_hand",
    target: upTo(99, sel("you", "character")),
  })),
  rule(/^you may add this (?:character )?card to your hand$/i, () => ({
    do: "may",
    then: { do: "to_hand", target: { ref: "self" } },
    prompt: "add this card to your hand",
  })),
  rule(
    /^draw (\d+) cards?, look at up to (\d+) cards? from the top of your or your opponent's life cards,? and place it at the top or bottom of the life cards$/i,
    (m) => seq(draw(num(m[1]!)), { do: "look_life", player: "any", count: num(m[2]!), rest: "top_or_bottom" }),
  ),
  rule(/^your opponent may trash (\d+) cards? from their hand$/i, (m) =>
    opponentMay({ k: "trash_hand", count: num(m[1]!) }, "trash cards from your hand"),
  ),
  rule(/^if they do not, (.+)$/i, (m, ctx) => {
    const inner = parseStatement(m[1]!, ctx);
    return inner ? when(varCount("_did", "==", 0), inner) : null;
  }),
  rule(/^if they do, (.+)$/i, (m, ctx) => {
    const inner = parseStatement(m[1]!, ctx);
    return inner ? when(varCount("_did", ">=", 1), inner) : null;
  }),
  rule(new RegExp("^give ([+-]\\d+) power " + DUR + " to (up to \\d+ .+)$", "i"), (m, ctx) => {
    const t = fieldTarget(m[3]!, ctx);
    const d = parseDuration(m[2]);
    return t && d ? power(t, signed(m[1]!), d) : null;
  }),
  rule(/^place up to (\d+) cards? from your opponent's trash at the bottom of the owner's deck$/i, (m) => ({
    do: "to_deck",
    target: upTo(num(m[1]!), sel("opponent", "trash")),
    position: "bottom",
  })),
  rule(/^your opponent may return (\d+) of their active DON!! cards to their DON!! deck$/i, (m) =>
    opponentMay({ k: "return_active_don", count: num(m[1]!) }, "return active DON!! to your DON!! deck"),
  ),
  rule(new RegExp("^your leader and this character's base power becomes? (\\d+) " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[2]);
    return d
      ? seq(
          { do: "base_power", target: leaderOf("you"), value: num(m[1]!), duration: d },
          { do: "base_power", target: { ref: "self" }, value: num(m[1]!), duration: d },
        )
      : null;
  }),
  rule(new RegExp("^(.+?)'s? base power becomes the same as your opponent's leader's power " + DUR + "$", "i"), (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return t && d ? { do: "base_power", target: t, value: countOf("leader_power", "opponent"), duration: d } : null;
  }),
  rule(
    /^look at (\d+) cards? from the top of your deck; reveal up to (\d+) (.+?), add them to your hand and place the rest at the bottom of your deck(?: in any order)?$/i,
    (m, ctx) => {
      const pick = pickFrom(m[2]!, m[3]!, "hand", ctx);
      return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_bottom", reveal: true } : null;
    },
  ),
  rule(/^place all of (your opponent's .+?) at the bottom of the owner's deck(?: in any order(?: of their choosing)?)?$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    return p ? { do: "to_deck", target: { ref: "all", selector: p.selector }, position: "bottom" } : null;
  }),
  rule(/^KO (your opponent's characters) with a total cost of (\d+) or less$/i, (m) =>
    ko(upTo(99, sel("opponent", "character"), { totalCostAtMost: num(m[2]!) })),
  ),
  rule(
    /^(?:the character played with this effect|that character) gains \[(Rush|Blocker|Double Attack|Banish|Unblockable)\] (during this turn)$/i,
    (m, ctx) => {
      const k = keywordOf(m[1]!);
      return k ? keyword(ctx.eventCard && /^that character/i.test(m[0]) ? { ref: "event_card" } : v("_affected"), k, "turn") : null;
    },
  ),
  rule(
    /^your leader with (the §T\d+§ type.*?) gains \[(Rush|Blocker|Double Attack|Banish|Unblockable)\] (during this turn)$/i,
    (m, ctx) => {
      const cond = parseCondition("your leader has " + m[1]!, ctx);
      const k = keywordOf(m[2]!);
      return cond && k ? when(cond, keyword(leaderOf("you"), k, "turn")) : null;
    },
  ),
  rule(/^rest this (?:character|leader) and (up to \d+ .+)$/i, (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    return t ? seq({ do: "rest", target: { ref: "self" } }, { do: "rest", target: t }) : null;
  }),
  rule(/^(?:then, )?your opponent adds (\d+) cards? from the top of their life cards to their hand$/i, (m) => ({
    do: "life_to_hand",
    player: "opponent",
    count: num(m[1]!),
    position: "top",
  })),
  rule(/^you take (\d+) damage$/i, (m) => ({ do: "damage", player: "you", count: num(m[1]!) })),
  // Both players' Characters: "trash all Characters" names no owner.
  rule(/^trash all characters$/i, () => ({ do: "to_trash", target: { ref: "all", selector: sel("any", "character") } })),
  rule(/^trash all cards from your hand$/i, () => ({ do: "to_trash", target: { ref: "all", selector: sel("you", "hand") } })),
  rule(/^trash cards from your hand until you have (\d+) cards in your hand$/i, (m) => ({
    do: "discard",
    player: "you",
    count: { count: { of: "hand", player: "you" }, plus: -num(m[1]!) },
  })),
  rule(/^you and your opponent trash cards from your hands until you each have (\d+) cards in your hands$/i, (m) =>
    seq(
      { do: "discard", player: "you", count: { count: { of: "hand", player: "you" }, plus: -num(m[1]!) } },
      { do: "discard", player: "opponent", chooser: "opponent", count: { count: { of: "hand", player: "opponent" }, plus: -num(m[1]!) } },
    ),
  ),
  rule(/^you cannot attack a leader (during this turn)$/i, () => ({
    do: "player_restrict",
    player: "you",
    restriction: "cannot_attack_leader",
    duration: "turn",
  })),
  rule(/^you cannot play cards from your hand (during this turn)$/i, () => ({
    do: "player_restrict",
    player: "you",
    restriction: "cannot_play_cards_from_hand",
    duration: "turn",
  })),
  rule(/^your opponent places (\d+) (.+?) from their trash at the (top|bottom) of their deck(?: in any order)?$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[2]!, ctx, { zone: "trash" });
    return p
      ? {
          do: "to_deck",
          target: exactly(num(m[1]!), { ...p.selector, player: "opponent", zone: "trash" }, { chooser: "opponent" }),
          position: m[3]!.toLowerCase() as "top" | "bottom",
        }
      : null;
  }),
  rule(/^your opponent plays (up to \d+ .+?) from their hand$/i, (m, ctx) => {
    const p = parseCardPhrase(m[1]!, ctx, { zone: "hand" });
    if (!p) return null;
    const t = toTarget({ ...p, selector: { ...p.selector, player: "opponent", zone: "hand" } });
    return t.ref === "choose" ? { do: "play", target: { ...t, chooser: "opponent" } } : null;
  }),
  rule(/^your opponent may add (\d+) DON!! cards? from their DON!! deck and set (?:it|them) as active$/i, (m) => ({
    do: "may",
    chooser: "opponent",
    then: { do: "add_don", player: "opponent", count: num(m[1]!), rested: false },
    prompt: "add DON!! from your DON!! deck",
  })),
  rule(/^give your leader and all of your characters up to (\d+) rested DON!! cards? each$/i, (m) =>
    seq(
      { do: "give_don", target: leaderOf("you"), count: num(m[1]!), donState: "rested" },
      { do: "give_don", target: { ref: "all", selector: sel("you", "character") }, count: num(m[1]!), donState: "rested" },
    ),
  ),
  rule(new RegExp("^(up to \\d+ .+?) cannot activate \\[Blocker\\] " + DUR + "$", "i"), (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return t && d ? { do: "restrict", target: t, restriction: "cannot_block", duration: d } : null;
  }),
  rule(new RegExp("^all of your opponent's (.+?) cannot activate \\[Blocker\\] " + DUR + "$", "i"), (m, ctx) => {
    const p = parseCardPhrase("all your opponent's " + m[1]!, ctx);
    const d = parseDuration(m[2]);
    return p && d ? { do: "restrict", target: { ref: "all", selector: p.selector }, restriction: "cannot_block", duration: d } : null;
  }),
  rule(/^(up to \d+ .+?) can attack characters on the turn in which (?:it is|they are) played$/i, (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    return t ? keyword(t, "rush_character", "turn") : null;
  }),
  rule(/^set this character or up to (\d+) of your DON!! cards as active$/i, (m) => ({
    do: "choose_one",
    options: [
      { label: "Set this Character as active", effect: { do: "activate", target: { ref: "self" } } },
      { label: "Set up to " + m[1] + " DON!! as active", effect: { do: "set_don_active", count: num(m[1]!) } },
    ],
  })),
  rule(new RegExp("^negate the effects? of (.+?) and give that card ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return t && d ? seq({ do: "negate", target: t, duration: d }, power(v("_last"), signed(m[2]!), d)) : null;
  }),
  rule(new RegExp("^negate the effects? of (.+?) and that character cannot attack " + DUR + "$", "i"), (m, ctx) => {
    const t = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return t && d
      ? seq({ do: "negate", target: t, duration: d }, { do: "restrict", target: v("_last"), restriction: "cannot_attack", duration: d })
      : null;
  }),
  rule(
    new RegExp(
      "^give (up to \\d+ of .+?) ([+-]\\d+) power " + DUR + " and this character gains \\[(Rush|Blocker|Double Attack|Banish)\\]$",
      "i",
    ),
    (m, ctx) => {
      const t = fieldTarget(m[1]!, ctx);
      const d = parseDuration(m[3]);
      const k = keywordOf(m[4]!);
      return t && d && k ? seq(power(t, signed(m[2]!), d), keyword({ ref: "self" }, k, d)) : null;
    },
  ),
  rule(/^if (?:the selected card|that card|that character) attacks during this turn, your opponent cannot activate \[Blocker\]$/i, () =>
    keyword(v("_last"), "unblockable", "turn"),
  ),
  rule(/^draw (?:a card|\d+ cards?) for each of (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    return p ? draw(countCards(p.selector)) : null;
  }),
  rule(/^draw cards? so that you have (\d+) cards in your hand$/i, (m) =>
    draw({ count: { of: "hand", player: "you" }, times: -1, plus: num(m[1]!) }),
  ),
  rule(/^draw up to (\d+) cards?$/i, (m) => ({
    do: "choose_one",
    options: Array.from({ length: num(m[1]!) + 1 }, (_, i) => ({
      label: "Draw " + (num(m[1]!) - i),
      effect: num(m[1]!) - i > 0 ? { do: "draw" as const, player: "you" as const, count: num(m[1]!) - i } : { do: "nothing" as const },
    })),
  })),
  rule(/^choose (up to \d+|\d+) (.+?) and (ko|rest|return) (?:it|them)(?: to the owner's hand)?$/i, (m, ctx) => {
    const p = parseCardPhrase(m[1] + " of " + m[2], ctx) ?? parseCardPhrase(m[1] + " " + m[2], ctx);
    if (!p) return null;
    const target = toTarget(p, "_last");
    const verb = m[3]!.toLowerCase();
    return verb === "ko" ? ko(target) : verb === "rest" ? { do: "rest", target } : { do: "to_hand", target };
  }),
  rule(/^your opponent chooses (\d+) cards? from your hand; trash (?:that card|those cards)$/i, (m) => ({
    do: "discard",
    player: "you",
    count: num(m[1]!),
    chooser: "opponent",
  })),
  rule(/^choose (\d+) cards? from your opponent's hand; your opponent reveals (?:that card|those cards)$/i, (m) =>
    seq(select("_last", sel("opponent", "hand"), num(m[1]!), num(m[1]!), { chooser: "you" }), { do: "reveal", target: v("_last") }),
  ),
  rule(/^set up to (\d+) of your (.+?) and your leader as active$/i, (m, ctx) => {
    const p = parseCardPhrase("up to " + m[1] + " of your " + m[2], ctx);
    return p ? seq({ do: "activate", target: toTarget(p) }, { do: "activate", target: leaderOf("you") }) : null;
  }),
  rule(/^deal (\d+) damage to your opponent$/i, (m) => ({ do: "damage", player: "opponent", count: num(m[1]!) })),
  rule(/^reveal up to (\d+) (.+?) from your deck and add (?:it|them) to your hand$/i, (m, ctx) => {
    const target = zoneTarget(m[1] ? "up to " + m[1] + " " + m[2] : m[2]!, "deck", ctx);
    if (!target) return null;
    // The opponent sees the card before it is added to the hand (#524).
    if (target.ref === "choose" && target.bind) {
      return seq({ do: "reveal", target }, { do: "to_hand", target: v(target.bind) }, { do: "shuffle", player: "you" });
    }
    return seq({ do: "to_hand", target }, { do: "shuffle", player: "you" });
  }),
  rule(/^you cannot add life cards to your hand using your own effects (during this turn)$/i, () => ({
    do: "player_restrict",
    player: "you",
    restriction: "cannot_add_life_to_hand_by_effect",
    duration: "turn",
  })),
  rule(/^the next time you play (.+?) from your hand during this turn, the cost will be reduced by (\d+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!.replace(/^(?:a|an) /i, ""), ctx);
    return p ? { do: "play_cost_reduction", filter: p.selector.filter ?? {}, amount: -num(m[2]!), duration: "turn", next: true } : null;
  }),
  rule(
    new RegExp("^your opponent cannot activate the \\[Blocker\\] of any character with a cost of (\\d+) or less " + DUR + "$", "i"),
    (m) => {
      const d = parseDuration(m[2]);
      return d
        ? { do: "restrict", target: { ref: "self" }, restriction: "cannot_be_blocked_by_cost_or_less", value: num(m[1]!), duration: d }
        : null;
    },
  ),
  rule(/^at the end of this battle, (.+)$/i, (m, ctx) => {
    const inner = parseStatement(m[1]!, ctx);
    return inner ? { do: "delay", when: "end_of_battle", effect: inner } : null;
  }),
  rule(/^(.+?) at the end of this turn$/i, (m, ctx) => {
    if (/^(?:set|add up to \d+ DON)/i.test(m[1]!)) return null;
    const inner = parseStatement(m[1]!, ctx);
    return inner ? { do: "delay", when: "end_of_turn", effect: inner } : null;
  }),
  // "Your Leader with N power or less and up to M of your Characters gain +X power": the Leader is not optional, the Characters are.
  rule(
    new RegExp("^your leader with (\\d+) power or less and up to (\\d+) of your characters gain ([+-]\\d+) power " + DUR + "$", "i"),
    (m) => {
      const d = parseDuration(m[4]);
      return d
        ? seq(
            power({ ref: "all", selector: sel("you", "leader", { power: le(num(m[1]!)) }) }, signed(m[3]!), d),
            power(upTo(num(m[2]!), sel("you", "character")), signed(m[3]!), d),
          )
        : null;
    },
  ),
  rule(new RegExp("^(your leader) and all of your characters gain ([+-]\\d+) power " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[3]);
    return d
      ? seq(power(leaderOf("you"), signed(m[2]!), d), power({ ref: "all", selector: sel("you", "character") }, signed(m[2]!), d))
      : null;
  }),
  rule(new RegExp("^set the cost of (.+?) to (\\d+) " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? { do: "set_cost", target, value: num(m[2]!), duration: d } : null;
  }),
  rule(/^give up to (\d+) rested DON!! cards? to each of (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[2]!, ctx);
    return p ? { do: "give_don", target: { ref: "all", selector: p.selector }, count: num(m[1]!), donState: "rested" } : null;
  }),
  // "to a total of up to 4 of your Leader and Characters": one pick among the Leader and Characters together.
  rule(/^give up to (\d+) rested DON!! cards? each to (?:a total of )?(up to \d+ of your) leader and (characters)$/i, (m, ctx) => {
    const p = parseCardPhrase(`${m[2]} leader or ${m[3]}`, ctx);
    return p ? { do: "give_don", target: toTarget(p), count: num(m[1]!), donState: "rested" } : null;
  }),
  rule(/^give (up to \d+ of .+?) up to (\d+) rested DON!! cards? each$/i, (m, ctx) => {
    const p = parseCardPhrase(m[1]!, ctx);
    return p ? { do: "give_don", target: toTarget(p), count: num(m[2]!), donState: "rested" } : null;
  }),
  rule(/^(KO|rest) or (rest|KO) (up to \d+ .+)$/i, (m, ctx) => {
    const first = m[1]!.toUpperCase();
    const second = m[2]!.toUpperCase();
    if (first === second) return null;
    const target = fieldTarget(m[3]!, ctx);
    if (!target || target.ref !== "choose") return null;
    const act = (kind: string): Effect => (kind === "KO" ? ko(v("_last")) : { do: "rest", target: v("_last") });
    const label = (kind: string) => (kind === "KO" ? "K.O. it" : "Rest it");
    return seq(select("_last", target.selector, target.min, target.max), {
      do: "choose_one",
      options: [
        { label: label(first), effect: act(first) },
        { label: label(second), effect: act(second) },
      ],
    });
  }),
  rule(/^return (up to \d+ .+?) to the owner's hand or the bottom of their deck$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target && target.ref === "choose"
      ? seq(select("_last", target.selector, target.min, target.max), {
          do: "choose_one",
          options: [
            { label: "Return to hand", effect: { do: "to_hand", target: v("_last") } },
            { label: "Place at the bottom of the deck", effect: { do: "to_deck", target: v("_last"), position: "bottom" } },
          ],
        })
      : null;
  }),
  rule(
    new RegExp("^(.+?)'s? base power becomes the same as the power of your opponent's attacking leader or character " + DUR + "$", "i"),
    (m, ctx) => {
      const target = fieldTarget(m[1]!, ctx);
      const d = parseDuration(m[2]);
      return target && d ? { do: "base_power", target, value: { count: { of: "battle_power", role: "attacker" } }, duration: d } : null;
    },
  ),
  rule(/^(?:add|place) (.+?) (?:to|at) the top of your opponent's life cards face-up$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "to_life", target, position: "top", faceUp: true } : null;
  }),
  rule(
    /^(?:you and your opponent|each player) trash(?:es)? cards from (?:your|their) hands until you each have (\d+) cards in your hands$/i,
    () => null,
  ),
  rule(/^your opponent may trash (\d+) cards? from the top of their life cards$/i, (m) =>
    opponentMay({ k: "trash_life", count: num(m[1]!) }, "trash the top card of your Life"),
  ),
  rule(/^your opponent returns all cards in their hand to their deck$/i, () => ({
    do: "to_deck",
    target: { ref: "all", selector: sel("opponent", "hand") },
    position: "bottom",
  })),
  rule(/^(?:your opponent )?shuffles? their deck$/i, () => ({ do: "shuffle", player: "opponent" })),
  rule(new RegExp("^(.+?)'s? effects? (?:is|are) negated " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "negate", target, duration: d } : null;
  }),
  rule(/^KO any number of your (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your " + m[1]!, ctx);
    return p ? ko(upTo(99, p.selector)) : null;
  }),
  rule(new RegExp("^(your .+?) cannot be KO'd in battle " + DUR + "$", "i"), (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx);
    const d = parseDuration(m[2]);
    return p && d
      ? { do: "restrict", target: { ref: "all", selector: p.selector }, restriction: "cannot_be_ko_in_battle", duration: d }
      : null;
  }),
  rule(new RegExp("^none of your (.+?) can be KO'd by (your opponent's )?effects " + DUR + "$", "i"), (m, ctx) => {
    const p = parseCardPhrase("all your " + m[1]!, ctx);
    const d = parseDuration(m[3]);
    return p && d
      ? {
          do: "restrict",
          target: { ref: "all", selector: p.selector },
          restriction: m[2] ? "cannot_be_ko_by_opponent_effect" : "cannot_be_ko_by_effect",
          duration: d,
        }
      : null;
  }),
  rule(/^reveal (\d+) cards? from the top of your deck and play up to (\d+) (.+)$/i, (m, ctx) => {
    const pick = pickFrom(m[2]!, m[3]!, "play", ctx);
    return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "deck_bottom", reveal: true } : null;
  }),
  rule(/^your opponent trashes (\d+) cards? from their hand and reveals their hand$/i, (m) => ({
    do: "discard",
    player: "opponent",
    count: num(m[1]!),
    chooser: "opponent",
  })),
  rule(/^place any number of (.+?) from your trash at the bottom of your deck(?: in any order)?$/i, (m, ctx) => {
    const p = parseCardPhrase("all " + m[1]!, ctx, { zone: "trash" });
    return p ? { do: "to_deck", target: upTo(99, { ...p.selector, player: "you", zone: "trash" }), position: "bottom" } : null;
  }),
  rule(/^place up to (\d+) cards? from your opponent's trash at the bottom of their deck$/i, (m) => ({
    do: "to_deck",
    target: upTo(num(m[1]!), sel("opponent", "trash")),
    position: "bottom",
  })),
  rule(
    new RegExp("^your opponent cannot activate up to (\\d+) \\[Blocker\\] characters? that has (\\d+) power or less " + DUR + "$", "i"),
    (m) => {
      const d = parseDuration(m[3]);
      return d
        ? {
            do: "restrict",
            target: upTo(num(m[1]!), sel("opponent", "character", { keyword: "blocker", power: le(num(m[2]!)) })),
            restriction: "cannot_block",
            duration: d,
          }
        : null;
    },
  ),
  rule(new RegExp("^(.+?) cannot be KO'd in battle and gains? ([+-]\\d+) power " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d
      ? seq({ do: "restrict", target, restriction: "cannot_be_ko_in_battle", duration: d }, power(target, signed(m[2]!), d))
      : null;
  }),
  rule(/^reveal (\d+|a) cards? from the top of (your|your opponent's) (deck|life cards)$/i, (m) => ({
    do: "reveal_top",
    player: rel(m[2]!),
    bind: "_last",
    zone: /life/i.test(m[3]!) ? "life" : "deck",
  })),
  rule(/^select (up to \d+|\d+) (?:of )?(.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(m[1] + " of " + m[2], ctx) ?? parseCardPhrase(m[1] + " " + m[2], ctx);
    if (!p) return null;
    const t = toTarget(p, "_last");
    return t.ref === "choose" ? select("_last", t.selector, t.min, t.max) : null;
  }),
  rule(/^set up to (\d+) of your DON!! cards? as active at the end of this turn$/i, (m) => ({
    do: "delay",
    when: "end_of_turn",
    effect: { do: "set_don_active", count: num(m[1]!) },
  })),
  rule(/^set (.+) as active at the end of this turn$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "delay", when: "end_of_turn", effect: { do: "activate", target } } : null;
  }),
  rule(new RegExp("^(.+?) can also attack (?:your opponent's )?active characters " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "restrict", target, restriction: "can_attack_active", duration: d } : null;
  }),
  rule(new RegExp("^(.+?) can attack characters on the turn in which (?:it is|they are) played " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? keyword(target, "rush_character", d) : null;
  }),
  rule(/^give up to (\d+) of your opponent's rested DON!! cards? to (.+)$/i, (m, ctx) => {
    const p = parseCardPhrase(m[2]!.replace(/^(\d+) of /, "up to $1 of "), ctx);
    if (!p) return null;
    const t = toTarget(p);
    return { do: "give_don", target: t, count: num(m[1]!), donState: "rested", player: "opponent" };
  }),
  rule(new RegExp("^(.+?) cannot be rested " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "restrict", target, restriction: "cannot_be_rested", duration: d } : null;
  }),
  rule(new RegExp("^you cannot play character cards with (?:a )?(base )?cost of (\\d+) or more " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[3]);
    return d
      ? {
          do: "player_restrict",
          player: "you",
          restriction: "cannot_play_characters",
          duration: d,
          filter: { [m[1] ? "baseCost" : "cost"]: ge(num(m[2]!)) },
        }
      : null;
  }),
  rule(new RegExp("^you cannot play any character cards(?: on your field)? " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[1]);
    return d ? { do: "player_restrict", player: "you", restriction: "cannot_play_characters", duration: d } : null;
  }),
  rule(new RegExp("^you cannot set DON!! cards as active using character effects " + DUR + "$", "i"), (m) => {
    const d = parseDuration(m[1]);
    return d ? { do: "player_restrict", player: "you", restriction: "cannot_set_don_active_by_character_effects", duration: d } : null;
  }),
  rule(new RegExp("^set the power of (.+?) to (\\d+) " + DUR + "$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? { do: "set_power", target, value: num(m[2]!), duration: d } : null;
  }),
  rule(
    new RegExp(
      "^(.+?)'s? base power becomes the same as (your opponent's leader|the selected character's power|that character's power|the selected character) " +
        DUR +
        "$",
      "i",
    ),
    (m, ctx) => {
      const target = fieldTarget(m[1]!, ctx);
      const d = parseDuration(m[3]);
      if (!target || !d) return null;
      const value = /leader/i.test(m[2]!)
        ? { count: { of: "leader_power" as const, player: "opponent" as const } }
        : { count: { of: "var_sum" as const, name: "_last", field: "power" as const } };
      const set: Effect = { do: "base_power", target, value, duration: d };
      // "Select up to 1 ...": with nothing selected there is no power to copy, so the base power does not change.
      return /leader/i.test(m[2]!) ? set : when(varCount("_last", ">=", 1), set);
    },
  ),
  rule(
    new RegExp("^your opponent cannot activate (?:a )?\\[Blocker\\](?: character)? that has (\\d+) or less power " + DUR + "$", "i"),
    (m) => {
      const d = parseDuration(m[2]);
      return d
        ? { do: "restrict", target: { ref: "self" }, restriction: "cannot_be_blocked_by_power_or_less", value: num(m[1]!), duration: d }
        : null;
    },
  ),
  rule(/^trash (\d+|a) cards? from your opponent's hand$/i, (m) => ({
    do: "discard",
    player: "opponent",
    count: num(m[1]!),
    chooser: "you",
    random: true,
  })),
  // Ask first (only when the hand has a card it could trash), then pick the cards.
  rule(/^you may trash any number of (.+?) from your hand$/i, (m, ctx) => {
    const p = /^cards?$/i.test(m[1]!) ? null : parseCardPhrase("all " + m[1]!, ctx);
    const filter = p?.selector.filter ? { filter: p.selector.filter } : {};
    return when(exists({ player: "you", zone: "hand", ...filter }), {
      do: "may",
      then: { do: "discard", player: "you", count: 99, min: 0, ...filter },
      prompt: restoreNames(`trash ${m[1]!} from your hand`, ctx.ph),
    });
  }),
  rule(/^play (.+?) from your deck( rested)?$/i, (m, ctx) => {
    const target = zoneTarget(m[1]!, "deck", ctx);
    return target ? { do: "play", target, ...(m[2] ? { rested: true } : {}) } : null;
  }),
  rule(/^return all cards in your hand to your deck$/i, () => ({
    do: "to_deck",
    target: { ref: "all", selector: sel("you", "hand") },
    position: "bottom",
  })),
  rule(/^your opponent places (\d+) cards? from their trash at the (top|bottom) of their deck(?: in any order)?$/i, (m) => ({
    do: "to_deck",
    target: exactly(num(m[1]!), sel("opponent", "trash"), { chooser: "opponent" }),
    position: m[2]!.toLowerCase() as "top" | "bottom",
  })),
  rule(/^your opponent returns (\d+) of their (.+?) to (?:the owner's|their) hand$/i, (m, ctx) => {
    const p = parseCardPhrase("all your opponent's " + m[2]!, ctx);
    return p ? { do: "to_hand", target: exactly(num(m[1]!), p.selector, { chooser: "opponent" }) } : null;
  }),
  rule(/^your opponent (?:chooses and )?(?:trashes|KOs) (\d+) of their (.+?)$/i, (m, ctx) => {
    const p = parseCardPhrase("all your opponent's " + m[2]!, ctx);
    return p && p.selector.zone === "character" ? ko(exactly(num(m[1]!), p.selector, { chooser: "opponent" })) : null;
  }),
  rule(/^trash cards from the top of your life cards until you have (\d+) life cards?$/i, (m) => ({
    do: "trash_life",
    player: "you",
    count: { count: { of: "life", player: "you" }, plus: -num(m[1]!) },
  })),
  rule(/^activate (?:the \[Main\] effect of )?(up to \d+ .+?) (?:from your hand|in your trash|from your trash)$/i, (m, ctx) => {
    const zone = /trash/i.test(m[0]) ? "trash" : "hand";
    const target = zoneTarget(m[1]!, zone, ctx);
    return target ? { do: "activate_event", target } : null;
  }),
  rule(/^give (your leader) and (\d+) (?:of your )?characters? up to (\d+) rested DON!! cards? each$/i, (m) =>
    seq(
      { do: "give_don", target: leaderOf("you"), count: num(m[3]!), donState: "rested" },
      { do: "give_don", target: upTo(num(m[2]!), sel("you", "character")), count: num(m[3]!), donState: "rested" },
    ),
  ),
  rule(/^add up to (\d+) DON!! cards? as (rested|active) from your DON!! deck$/i, (m) => ({
    do: "add_don",
    player: "you",
    count: num(m[1]!),
    rested: m[2]!.toLowerCase() === "rested",
  })),
  rule(/^look at all of (your|your opponent's) life cards and place them back in (?:your|their) life area in any order$/i, (m) => ({
    do: "look_life",
    player: rel(m[1]!),
    count: 99,
    rest: "any_order",
  })),
  rule(/^look at (\d+) cards? from the top of your deck and place them at the top or bottom of your deck in any order$/i, (m) => ({
    do: "look",
    player: "you",
    count: num(m[1]!),
    picks: [],
    rest: "top_or_bottom",
    reveal: false,
  })),
  rule(
    /^reveal (\d+) cards? from the top of your deck, play up to (\d+) (.+?),? and place the rest at the top or bottom of your deck$/i,
    (m, ctx) => {
      const pick = pickFrom(m[2]!, m[3]!, "play", ctx);
      return pick ? { do: "look", player: "you", count: num(m[1]!), picks: [pick], rest: "top_or_bottom", reveal: true } : null;
    },
  ),
  rule(
    /^look at (\d+) cards? from the top of your deck; reveal up to (\d+) (.+?), add it to your hand and place the rest at the (bottom|top) of your deck(?: in any order)?$/i,
    (m, ctx) => {
      const pick = pickFrom(m[2]!, m[3]!, "hand", ctx);
      return pick
        ? {
            do: "look",
            player: "you",
            count: num(m[1]!),
            picks: [pick],
            rest: m[4]!.toLowerCase() === "top" ? "deck_top" : "deck_bottom",
            reveal: true,
          }
        : null;
    },
  ),
  rule(/^place (?:the revealed card|that card|it) at the (top|bottom|top or bottom) of (?:your|the) deck$/i, (m) => ({
    do: "to_deck",
    target: v("_last"),
    position: m[1]!.toLowerCase() === "top or bottom" ? "top_or_bottom" : (m[1]!.toLowerCase() as "top" | "bottom"),
  })),
  rule(/^play (?:the revealed card|that card|it)( rested)?$/i, (m) => ({
    do: "play",
    target: v("_last"),
    ...(m[1] ? { rested: true } : {}),
  })),
  rule(/^add (?:the revealed card|that card|it) to your hand$/i, () => ({ do: "to_hand", target: v("_last") })),
  rule(/^trash (?:the revealed card|that card)$/i, () => ({ do: "to_trash", target: v("_last") })),
  rule(new RegExp("^(.+?) gains? ([+-]\\d+) power " + DUR + " for every card trashed$", "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!.replace(/^your leader or 1 of your characters$/i, "up to 1 of your Leader or Character cards"), ctx);
    const d = parseDuration(m[3]);
    return target && d ? power(target, { count: { of: "var", name: "_discard" }, times: signed(m[2]!) }, d) : null;
  }),
  rule(
    /^up to (\d+) of your leader with a type including (§Q\d+§) or up to \d+ of your characters with a type including §Q\d+§ gains? ([+-]\d+) power (during this battle|during this turn)$/i,
    (m, ctx) => {
      const q = quote(m[2]!, ctx);
      const d = parseDuration(m[4]);
      return q && d ? power(upTo(num(m[1]!), sel("you", "leader_or_character", { traitIncludes: [q] })), signed(m[3]!), d) : null;
    },
  ),
  rule(/^draw (\d+|a) cards?$/i, (m) => draw(num(m[1]!))),
  rule(/^your opponent draws (\d+) cards?$/i, (m) => ({ do: "draw", player: "opponent", count: num(m[1]!) })),
  rule(/^draw cards equal to (.+)$/i, (m, ctx) => {
    const count = parseCountPhrase(m[1]!, ctx);
    return count ? draw({ count }) : null;
  }),
  rule(/^trash (\d+|a) cards? from your hand$/i, (m) => ({ do: "discard", player: "you", count: num(m[1]!) })),
  rule(/^trash up to (\d+) cards? from your hand$/i, (m) => ({ do: "discard", player: "you", count: num(m[1]!), min: 0 })),
  rule(/^trash (\d+) (.+?) from your hand$/i, (m, ctx) => {
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p ? { do: "discard", player: "you", count: num(m[1]!), ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null;
  }),
  rule(/^your opponent trashes (\d+) cards? from their hand$/i, (m) => ({
    do: "discard",
    player: "opponent",
    count: num(m[1]!),
    chooser: "opponent",
  })),
  rule(/^your opponent chooses (\d+) cards? from their hand and trashes (?:it|them)$/i, (m) => ({
    do: "discard",
    player: "opponent",
    count: num(m[1]!),
    chooser: "opponent",
  })),
  rule(/^trash (\d+) cards? from the top of (your|your opponent's) deck$/i, (m) => ({ do: "mill", player: rel(m[2]!), count: num(m[1]!) })),
  rule(/^trash up to (\d+) cards? from the top of (your|your opponent's) deck$/i, (m) => ({
    do: "mill",
    player: rel(m[2]!),
    count: num(m[1]!),
  })),
  rule(/^(?:place|return) (\d+) cards? from your hand (?:at|to) the (top|bottom|top or bottom) of your deck(?: in any order)?$/i, (m) => ({
    do: "hand_to_deck",
    player: "you",
    count: num(m[1]!),
    position: m[2]!.toLowerCase() === "top or bottom" ? "top_or_bottom" : (m[2]!.toLowerCase() as "top" | "bottom"),
  })),
  rule(/^your opponent places (\d+) cards? from their hand at the (top|bottom) of their deck(?: in any order)?$/i, (m) => ({
    do: "hand_to_deck",
    player: "opponent",
    count: num(m[1]!),
    position: m[2]!.toLowerCase() as "top" | "bottom",
    chooser: "opponent",
  })),
  rule(/^place up to (\d+) cards? from your hand at the (top|bottom) of your deck(?: in any order)?$/i, (m) => ({
    do: "hand_to_deck",
    player: "you",
    count: num(m[1]!),
    position: m[2]!.toLowerCase() as "top" | "bottom",
    min: 0,
  })),
  rule(/^KO (.+)$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? ko(target) : null;
  }),
  rule(/^rest up to (\d+) of your opponent's DON!! cards?$/i, (m) => ({ do: "rest_don", player: "opponent", count: num(m[1]!) })),
  rule(/^rest (\d+) of your opponent's DON!! cards?$/i, (m) => ({ do: "rest_don", player: "opponent", count: num(m[1]!) })),
  rule(/^rest (.+)$/i, (m, ctx) => {
    if (/^the rest/i.test(m[1]!)) return null;
    const target = fieldTarget(m[1]!, ctx);
    return target
      ? { do: "rest", target: target.ref === "choose" ? { ...target, selector: withCostAreaDon(target.selector, false) } : target }
      : null;
  }),
  rule(/^set up to (\d+) of your DON!! cards? as active$/i, (m) => ({ do: "set_don_active", count: num(m[1]!) })),
  rule(/^set (.+) as active$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "activate", target } : null;
  }),
  rule(/^return (.+?) to (?:the owner's|its owner's|their owner's|your|their) hand$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "to_hand", target } : null;
  }),
  rule(/^add (.+?) from your trash to your hand$/i, (m, ctx) => {
    const target = zoneTarget(m[1]!, "trash", ctx);
    return target ? { do: "to_hand", target } : null;
  }),
  rule(/^add this card to your hand$/i, () => ({ do: "to_hand", target: { ref: "self" } })),
  rule(/^return (.+?) to the (top|bottom) of the owner's deck$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "to_deck", target, position: m[2]!.toLowerCase() as "top" | "bottom" } : null;
  }),
  rule(/^(?:add|place) (.+?) (?:to|at) the top or bottom of (?:your opponent's|the owner's|your) life cards face-up$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "to_life", target, position: "top_or_bottom", faceUp: true } : null;
  }),
  rule(
    /^place (.+?) at the (top|bottom) of (?:the owner's|its owner's|their owner's|your|their) deck(?: in any order(?: of their choosing)?)?$/i,
    (m, ctx) => {
      const src = m[1]!;
      const fromTrash = /^(.+) from your trash$/i.exec(src);
      const target = fromTrash ? zoneTarget(fromTrash[1]!, "trash", ctx) : fieldTarget(src, ctx);
      return target ? { do: "to_deck", target, position: m[2]!.toLowerCase() as "top" | "bottom" } : null;
    },
  ),
  rule(/^trash (.+?)$/i, (m, ctx) => {
    if (/from the top|from your hand|the rest|life/i.test(m[1]!)) return null;
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "to_trash", target } : null;
  }),
  rule(/^play this (?:card|character card|character)(?: from your trash)?( rested)?$/i, (m) => ({
    do: "play",
    target: { ref: "self" },
    ...(m[1] ? { rested: true } : {}),
  })),
  rule(/^play (.+?) from your (hand|trash|hand or trash|deck or trash)( rested)?$/i, (m, ctx) => {
    const zone = m[2]!.toLowerCase();
    const z = zone === "hand or trash" ? "hand_or_trash" : zone === "deck or trash" ? "deck_or_trash" : (zone as "hand" | "trash");
    const target = zoneTarget(m[1]!, z, ctx);
    return target ? { do: "play", target, ...(m[3] ? { rested: true } : {}) } : null;
  }),
  rule(/^play (.+?)( rested)?$/i, (m, ctx) => {
    // Bare "play up to 1 [X]" means from hand.
    if (/ from /i.test(m[1]!)) return null;
    const target = zoneTarget(m[1]!, "hand", ctx);
    return target ? { do: "play", target, ...(m[2] ? { rested: true } : {}) } : null;
  }),
  rule(new RegExp(`^give (.+?) ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? power(target, signed(m[2]!), d) : null;
  }),
  rule(new RegExp(`^(.+?) gains? ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? power(target, signed(m[2]!), d) : null;
  }),
  rule(/^(that card|that character|it) gains? an additional ([+-]\d+) power$/i, (m) => power(v("_last"), signed(m[2]!), "battle")),
  rule(new RegExp(`^(.+?) gains? an additional ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? power(target, signed(m[2]!), d) : null;
  }),
  rule(new RegExp(`^give (.+?) ([+-]\\d+) cost ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? { do: "cost", target, amount: signed(m[2]!), duration: d } : null;
  }),
  rule(new RegExp(`^(.+?) gains? ([+-]\\d+) cost ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? { do: "cost", target, amount: signed(m[2]!), duration: d } : null;
  }),
  rule(new RegExp(`^(.+?)'s? base power becomes (\\d+) ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? { do: "base_power", target, value: num(m[2]!), duration: d } : null;
  }),
  rule(new RegExp(`^set the base power of (.+?) to (\\d+) ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[3]);
    return target && d ? { do: "base_power", target, value: num(m[2]!), duration: d } : null;
  }),
  rule(new RegExp(`^(.+?) gains? \\[(Rush|Blocker|Double Attack|Banish|Unblockable|Rush: Character)\\] ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const k = keywordOf(m[2]!);
    const d = parseDuration(m[3]);
    return target && k && d ? keyword(target, k, d) : null;
  }),
  // "Up to 1 of your X gains [A], [B], or [C] during this turn": the player selects the card, then picks exactly one keyword to grant.
  rule(
    new RegExp(
      `^(up to \\d+ .+?) gains? ((?:\\[(?:Rush|Blocker|Double Attack|Banish|Unblockable)\\], )+(?:or )?\\[(?:Rush|Blocker|Double Attack|Banish|Unblockable)\\]|\\[(?:Rush|Blocker|Double Attack|Banish|Unblockable)\\] or \\[(?:Rush|Blocker|Double Attack|Banish|Unblockable)\\]) ${DUR}$`,
      "i",
    ),
    (m, ctx) => {
      const target = fieldTarget(m[1]!, ctx);
      const d = parseDuration(m[3]);
      const keywords = [...m[2]!.matchAll(/\[([^\]]+)\]/g)].map((k) => k[1]!);
      if (!target || target.ref !== "choose" || !d || keywords.some((k) => !keywordOf(k))) return null;
      return seq(select("_last", target.selector, target.min, target.max), {
        do: "choose_one",
        options: keywords.map((k) => ({
          label: `Gain [${k}]`,
          effect: keyword(v("_last"), keywordOf(k)!, d),
        })),
      });
    },
  ),
  rule(new RegExp(`^(.+?) gains? \\[(Rush|Blocker|Double Attack|Banish|Unblockable)\\] and ([+-]\\d+) power ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx, "_last");
    const k = keywordOf(m[2]!);
    const d = parseDuration(m[4]);
    if (!target || !k || !d) return null;
    return seq(keyword(target, k, d), power(target.ref === "choose" ? v("_last") : target, signed(m[3]!), d));
  }),
  rule(/^add up to (\d+) DON!! cards? from your DON!! deck and set (?:it|them) as active$/i, (m) => ({
    do: "add_don",
    player: "you",
    count: num(m[1]!),
    rested: false,
  })),
  rule(/^add up to (\d+) DON!! cards? from your DON!! deck and rest (?:it|them)$/i, (m) => ({
    do: "add_don",
    player: "you",
    count: num(m[1]!),
    rested: true,
  })),
  rule(/^add (\d+) DON!! cards? from your DON!! deck and (set (?:it|them) as active|rest (?:it|them))$/i, (m) => ({
    do: "add_don",
    player: "you",
    count: num(m[1]!),
    rested: /rest/i.test(m[2]!),
  })),
  rule(/^add up to (\d+) additional DON!! cards? and (set (?:it|them) as active|rest (?:it|them))$/i, (m) => ({
    do: "add_don",
    player: "you",
    count: num(m[1]!),
    rested: /rest/i.test(m[2]!),
  })),
  rule(/^your opponent adds (\d+) DON!! cards? from their DON!! deck and (sets (?:it|them) as active|rests (?:it|them))$/i, (m) => ({
    do: "add_don",
    player: "opponent",
    count: num(m[1]!),
    rested: /rest/i.test(m[2]!),
  })),
  rule(/^give up to (\d+) (rested|active)? ?DON!! cards? to (.+)$/i, (m, ctx) => {
    const target = donRecipient(m[3]!, ctx);
    return target
      ? { do: "give_don", target, count: num(m[1]!), donState: (m[2]?.toLowerCase() as "rested" | "active" | undefined) ?? "any" }
      : null;
  }),
  rule(/^give (.+?) up to (\d+) (rested|active)? ?DON!! cards?$/i, (m, ctx) => {
    const target = donRecipient(m[1]!, ctx);
    return target
      ? { do: "give_don", target, count: num(m[2]!), donState: (m[3]?.toLowerCase() as "rested" | "active" | undefined) ?? "any" }
      : null;
  }),
  rule(/^your opponent returns (\d+) DON!! cards? from their field to their DON!! deck$/i, (m) => ({
    do: "return_don",
    player: "opponent",
    count: num(m[1]!),
    chooser: "opponent",
  })),
  rule(/^return (\d+) DON!! cards? from your field to your DON!! deck$/i, (m) => ({ do: "return_don", player: "you", count: num(m[1]!) })),
  rule(/^add up to (\d+) cards? from the top of your deck to the top of your life cards( face-up)?$/i, (m) => ({
    do: "may",
    then: { do: "deck_to_life", player: "you", count: num(m[1]!), ...(m[2] ? { faceUp: true } : {}) },
    prompt: "add the top card of your deck to your Life",
  })),
  rule(/^add (\d+) cards? from the top of your deck to the top of your life cards( face-up)?$/i, (m) => ({
    do: "deck_to_life",
    player: "you",
    count: num(m[1]!),
    ...(m[2] ? { faceUp: true } : {}),
  })),
  rule(/^add (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({
    do: "life_to_hand",
    player: "you",
    count: num(m[1]!),
    position: "top",
  })),
  rule(/^add (\d+) cards? from the top or bottom of your life cards to your hand$/i, (m) => ({
    do: "life_to_hand",
    player: "you",
    count: num(m[1]!),
    position: "top_or_bottom",
  })),
  rule(/^add up to (\d+) cards? from the top of your life cards to your hand$/i, (m) => ({
    do: "may",
    then: { do: "life_to_hand", player: "you", count: num(m[1]!), position: "top" },
    prompt: "add the top card of your Life to your hand",
  })),
  rule(/^add up to (\d+) cards? from the top of your opponent's life cards to the owner's hand$/i, (m) => ({
    do: "may",
    then: { do: "life_to_hand", player: "opponent", count: num(m[1]!), position: "top" },
    prompt: "add the top card of your opponent's Life to their hand",
  })),
  rule(/^add (\d+) cards? from the top of your opponent's life cards to the owner's hand$/i, (m) => ({
    do: "life_to_hand",
    player: "opponent",
    count: num(m[1]!),
    position: "top",
  })),
  rule(/^trash (\d+) cards? from the top of (your|your opponent's) life cards$/i, (m) => ({
    do: "trash_life",
    player: rel(m[2]!),
    count: num(m[1]!),
  })),
  rule(/^trash up to (\d+) cards? from the top of (your|your opponent's) life cards$/i, (m) => ({
    do: "may",
    then: { do: "trash_life", player: rel(m[2]!), count: num(m[1]!) },
    prompt: `trash the top card of ${rel(m[2]!) === "you" ? "your" : "your opponent's"} Life`,
  })),
  rule(/^add up to (\d+) (.+?) from your hand to the (top|top or bottom) of your life cards( face-up)?$/i, (m, ctx) => {
    const position = m[3]!.toLowerCase() === "top" ? "top" : "top_or_bottom";
    if (/^cards?$/i.test(m[2]!)) return { do: "hand_to_life", count: num(m[1]!), position, faceUp: Boolean(m[4]), min: 0 };
    const p = parseCardPhrase(`all ${m[2]!}`, ctx);
    return p
      ? {
          do: "hand_to_life",
          count: num(m[1]!),
          position,
          faceUp: Boolean(m[4]),
          min: 0,
          ...(p.selector.filter ? { filter: p.selector.filter } : {}),
        }
      : null;
  }),
  rule(/^turn (?:up to )?(\d+) cards? from the top of your life cards face-(up|down)$/i, (m) => ({
    do: "life_face",
    player: "you",
    count: num(m[1]!),
    faceUp: m[2] === "up",
  })),
  rule(/^turn all of your life cards face-(up|down)$/i, (m) => ({ do: "life_face", player: "you", count: 99, faceUp: m[1] === "up" })),
  rule(
    /^look at (\d+) cards? from the top of (your|your opponent's) deck and place them at the top or bottom of the deck in any order$/i,
    (m) => ({ do: "look", player: rel(m[2]!), count: num(m[1]!), picks: [], rest: "top_or_bottom" }),
  ),
  rule(/^look at (\d+) cards? from the top of (your|your opponent's) deck$/i, (m) => ({
    do: "look",
    player: rel(m[2]!),
    count: num(m[1]!),
    picks: [],
    rest: "deck_top",
  })),
  rule(
    /^look at (?:up to )?(\d+) cards? from the top of your deck; (.+?)(?:, then place the rest at the bottom of your deck(?: in any order)?)?$/i,
    (m, ctx) => {
      const picks = parseLookPicks(m[2]!, ctx);
      return picks ? { do: "look", player: "you", count: num(m[1]!), picks, rest: "deck_bottom", reveal: /\breveal\b/i.test(m[2]!) } : null;
    },
  ),
  rule(/^look at (\d+) cards? from the top of your deck and (.+)$/i, (m, ctx) => {
    const picks = parseLookPicks(m[2]!, ctx);
    return picks ? { do: "look", player: "you", count: num(m[1]!), picks, rest: "deck_bottom", reveal: /\breveal\b/i.test(m[2]!) } : null;
  }),
  rule(
    /^look at up to (\d+) cards? from the top of (your|your opponent's|your or your opponent's) life cards(?:,)? and place (?:it|them) at the top or bottom of the life cards(?: in any order)?$/i,
    (m) => ({ do: "look_life", player: /or your opponent/i.test(m[2]!) ? "any" : rel(m[2]!), count: num(m[1]!), rest: "top_or_bottom" }),
  ),
  rule(/^look at all of your life cards and place them back in any order$/i, () => ({
    do: "look_life",
    player: "you",
    count: 99,
    rest: "any_order",
  })),
  rule(new RegExp(`^negate the effects? of (.+?) ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "negate", target, duration: d } : null;
  }),
  // "Up to 1 of X and up to 1 of Y cannot attack ...": two separate picks, and the second cannot be the card the first took.
  rule(new RegExp(`^(up to \\d+ .+?) and (up to \\d+ .+?) cannot attack ${DUR}$`, "i"), (m, ctx) => {
    const first = parseCardPhrase(m[1]!, ctx);
    const second = parseCardPhrase(m[2]!, ctx);
    const d = parseDuration(m[3]);
    if (!first || !second || !d || first.selector.zone === "leader" || second.selector.zone === "leader") return null;
    second.selector = { ...second.selector, filter: { ...(second.selector.filter ?? {}), excludeVar: "_a" } };
    return seq(
      { do: "restrict", target: toTarget(first, "_a"), restriction: "cannot_attack", duration: d },
      { do: "restrict", target: toTarget(second, "_b"), restriction: "cannot_attack", duration: d },
    );
  }),
  rule(new RegExp(`^(.+?) cannot attack ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "restrict", target, restriction: "cannot_attack", duration: d } : null;
  }),
  rule(/^(.+?) will not become active in (?:your opponent's|your|their owner's|the owner's) next refresh phase$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target
      ? {
          do: "restrict",
          target: target.ref === "choose" ? { ...target, selector: withCostAreaDon(target.selector) } : target,
          restriction: "no_refresh",
          duration: "permanent",
        }
      : null;
  }),
  rule(new RegExp(`^(.+?) cannot be KO'd by (?:your opponent's )?effects ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d
      ? {
          do: "restrict",
          target,
          restriction: /opponent/.test(m[0]) ? "cannot_be_ko_by_opponent_effect" : "cannot_be_ko_by_effect",
          duration: d,
        }
      : null;
  }),
  rule(new RegExp(`^(.+?) cannot be KO'd in battle ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "restrict", target, restriction: "cannot_be_ko_in_battle", duration: d } : null;
  }),
  rule(new RegExp(`^(.+?) cannot be KO'd ${DUR}$`, "i"), (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    const d = parseDuration(m[2]);
    return target && d ? { do: "restrict", target, restriction: "cannot_be_ko", duration: d } : null;
  }),
  rule(new RegExp(`^none of your characters can be KO'd by effects ${DUR}$`, "i"), (m) => {
    const d = parseDuration(m[1]);
    return d
      ? { do: "restrict", target: { ref: "all", selector: sel("you", "character") }, restriction: "cannot_be_ko_by_effect", duration: d }
      : null;
  }),
  rule(/^your opponent cannot activate (?:a )?\[Blocker\] during this battle$/i, () =>
    keyword({ ref: "battle", role: "attacker" }, "unblockable", "battle"),
  ),
  rule(new RegExp(`^you cannot play character cards ${DUR}$`, "i"), (m) => {
    const d = parseDuration(m[1]);
    return d ? { do: "player_restrict", player: "you", restriction: "cannot_play_characters", duration: d } : null;
  }),
  rule(new RegExp(`^your opponent cannot play character cards ${DUR}$`, "i"), (m) => {
    const d = parseDuration(m[1]);
    return d ? { do: "player_restrict", player: "opponent", restriction: "cannot_play_characters", duration: d } : null;
  }),
  rule(/^activate this card's \[(Main|On Play|On KO|Counter|When Attacking)\] effect$/i, (m) => ({
    do: "invoke",
    window: ({ Main: "main", "On Play": "on_play", "On KO": "on_ko", Counter: "counter", "When Attacking": "when_attacking" } as const)[
      m[1] as "Main"
    ],
  })),
  rule(/^shuffle your deck$/i, () => ({ do: "shuffle", player: "you" })),
  rule(/^you win the game$/i, () => ({ do: "win" })),
  rule(/^take an extra turn after this one$/i, () => ({ do: "extra_turn" })),
  rule(/^change the attack target to (.+)$/i, (m, ctx) => {
    const target = fieldTarget(m[1]!, ctx);
    return target ? { do: "redirect_attack", target } : null;
  }),
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
    if (eff && cond) return when(cond, eff);
  }
  // Verb distribution: "KO up to 1 X and up to 1 Y" / "place up to 1 X and up to 1 Y at the bottom of the owner's deck"
  const dist =
    /^(ko|rest|return|place|trash|give) (up to .+?) and (up to .+?)( (?:to the owner's hand|at the (?:top|bottom) of the owner's deck(?: in any order(?: of their choosing)?)?|[+-]\d+ (?:power|cost) (?:during this turn|during this battle)))?$/i.exec(
      t,
    );
  if (dist) {
    const tail = dist[4] ?? "";
    const a = parseEffectClause(dist[1] + " " + dist[2] + tail, ctx);
    const b = a && parseEffectClause(dist[1] + " " + dist[3] + tail, ctx);
    if (a && b) return seq(a, b);
  }
  const thenSplit = t.split(/,? then,? /i);
  if (thenSplit.length === 2) {
    const a = parseEffectClause(thenSplit[0]!, ctx);
    const b = a && parseEffectClause(thenSplit[1]!, ctx);
    if (a && b) return seq(a, b);
  }
  // Conjunction: "A and B" / "A, and B"
  const parts = t.split(/,? and (?!add it|add them|play it|rest it|set it|set them)/i);
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 1) {
      const a = parseEffectClause(parts.slice(0, i).join(" and "), ctx);
      const b = a && parseEffectClause(parts.slice(i).join(" and "), ctx);
      if (a && b) return seq(a, b);
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
    return inner ? when(varCount("_did", ">=", 1), inner) : null;
  }
  const body = m[1]!;
  const commas = [...body.matchAll(/, /g)].map((x) => x.index!);
  for (const index of commas) {
    const cond = parseCondition(body.slice(0, index), ctx);
    if (!cond) continue;
    const eff = parseStatementBody(body.slice(index + 2), ctx);
    if (eff) return when(cond, eff);
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
      if (cond) {
        const c = parseCondition(cond[1]!, ctx);
        if (c) return { effect: when(c, choose), failed: [] };
      }
      const lead = /^(.+?),? then,?$/i.exec(prefix);
      if (lead) {
        const first = parseStatement(lead[1]!, ctx);
        if (first) return { effect: seq(first, choose), failed: [] };
      }
      return { effect: null, failed: [head] };
    }
  }
  const steps: Effect[] = [];
  const failed: string[] = [];
  // The conditional "If X, A." the following "Then, B." sentences belong to (Rule 4-10-2): a "Then" after an "If"
  // is only resolved when that "If" was met, so B joins the if's `then`. A "Then" after a plain sentence stays a step.
  let openIf: Extract<Effect, { do: "if" }> | null = null;
  for (const sentence of split(body)) {
    const s = sentence.trim();
    if (!s) continue;
    if (steps.length && applyRestSentence(steps[steps.length - 1]!, s)) continue;
    if (openIf && /^then\b,?\s/i.test(s) && !openIf.else && steps[steps.length - 1] === openIf) {
      const next = parseStatement(s, ctx);
      if (next) {
        openIf.then = { do: "seq", steps: [...(openIf.then.do === "seq" ? openIf.then.steps : [openIf.then]), next] };
        continue;
      }
    }
    openIf = null;
    // "Then, place the rest ... and play up to 1 X from your hand."
    const restAnd = /^(then, )?(place the rest at the bottom of your deck in any order|trash the rest) and (.+)$/i.exec(clean(s));
    if (restAnd && steps.length && applyRestSentence(steps[steps.length - 1]!, restAnd[2]!)) {
      const tail = parseStatement(restAnd[3]!, ctx);
      if (tail) {
        steps.push(tail);
        continue;
      }
      failed.push(s);
      continue;
    }
    const eff = parseStatement(s, ctx);
    if (eff) {
      if (eff.do === "if" && /^if you do, /i.test(clean(s))) linkIfYouDo(steps, eff, s, ctx);
      if (/^if the trashed card /i.test(clean(s)) && steps.length) bindTrashedCard(steps[steps.length - 1]!);
      steps.push(eff);
      if (eff.do === "if" && /^if /i.test(s)) openIf = eff;
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
 * Effects that run through `forEachTarget` (or `play`) in `execActInner` and so reset and fill `_affected`
 * (keep in step with WRITES_AFFECTED in programLint.ts, which the grammar cannot import without a cycle).
 * Notably not `to_life`, `life_to_hand`, `give_don`, `power`, ...: those never write it.
 */
const WRITES_AFFECTED: ReadonlySet<string> = new Set(["ko", "rest", "to_hand", "to_deck", "to_trash", "play", "activate"]);

/** Whether any effect inside the tree writes `_affected`. */
function writesAffected(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(writesAffected);
  if (!node || typeof node !== "object") return false;
  const o = node as Record<string, unknown>;
  return (typeof o.do === "string" && WRITES_AFFECTED.has(o.do)) || Object.values(o).some(writesAffected);
}

/** Every `may` inside an effect tree. */
function mayEffectsIn(effect: Effect | undefined): Extract<Effect, { do: "may" }>[] {
  if (!effect) return [];
  switch (effect.do) {
    case "may":
      return [effect, ...mayEffectsIn(effect.then)];
    case "seq":
      return effect.steps.flatMap(mayEffectsIn);
    case "if":
      return [...mayEffectsIn(effect.then), ...mayEffectsIn(effect.else)];
    case "pay":
      return mayEffectsIn(effect.then);
    case "choose_one":
      return effect.options.flatMap((o) => mayEffectsIn(o.effect));
    default:
      return [];
  }
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
  if (prev.do !== "may") {
    const nested = mayEffectsIn(prev);
    if (!nested.length) gate.cond = { ...gate.cond, name: "_affected" };
    // "If that card is X, you may play that card. If you do, Y": the "you may" sits inside the conditional, and a
    // play that cannot happen is not "doing" it.
    // A nested may whose action never writes `_affected` ("Then, you may add 1 card from your Life to your hand. If
    // you do, ..." in ST22-015) would find `_affected` stale from an earlier step, so it becomes a cost instead:
    // offered only when payable, and `_did` alone proves it was done.
    else {
      for (const m of nested) {
        if (m.costs?.length || !m.prompt || writesAffected(m.then)) continue;
        const costs = parseCosts(m.prompt, ctx);
        if (costs?.length) Object.assign(m, { costs, then: { do: "nothing" }, bind: m.bind ?? "_did" });
      }
      if (nested.every((m) => !m.costs?.length)) gate.cond = and(gate.cond, varCount("_affected", ">=", 1));
    }
    return;
  }
  if (!prev.prompt || prev.costs || prev.chooser) return;
  const costs = parseCosts(prev.prompt, ctx);
  if (costs?.length) {
    steps[steps.length - 1] = { do: "may", costs, then: { do: "nothing" }, bind: prev.bind ?? "_did", prompt: prev.prompt };
  } else {
    // Not a cost (e.g. "return up to 1 ..."): accepting and then choosing nothing isn't "doing" it.
    gate.cond = and(gate.cond, varCount("_affected", ">=", 1));
  }
  (steps[steps.length - 1] as Extract<Effect, { do: "may" }>).prompt =
    `${prev.prompt}, and if you do, ${restoreNames(clean(sentence).replace(/^if you do, /i, ""), ctx.ph)}`;
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
