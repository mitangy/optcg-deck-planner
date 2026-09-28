/**
 * Compile one card's official text into DSL abilities.
 * Deterministic: the same text always yields the same JSON.
 */
import { EFFECT_SCHEMA_VERSION, type Ability, type CardAbilities, type Cond, type Cost, type Effect, type EventTrigger, type Replacement, type Static, type Trigger } from "../../effects/types.js";
import type { CardDataRow } from "../../cards/cardData.js";
import { isKeywordTag, normalizeText, protect, restoreNames, segment, sentences, type Placeholders } from "./normalize.js";
import { clean, parseCondition, parseCosts, parseEffectBody, parseStatement, parseStaticSentence } from "./grammar.js";
import { parseCardPhrase, type Ctx } from "./phrases.js";

const WINDOW_TAGS: Record<string, Trigger> = {
  "On Play": "on_play",
  "When Attacking": "when_attacking",
  "On KO": "on_ko",
  "On Block": "on_block",
  "On Your Opponent's Attack": "on_opp_attack",
  "Activate: Main": "activate_main",
  Main: "main",
  Counter: "counter",
  Trigger: "trigger",
  "End of Your Turn": "end_of_your_turn",
  "End of Your Opponent's Turn": "end_of_opponent_turn",
  "Start of Your Turn": "start_of_your_turn",
};

const KEYWORDS: Record<string, Static> = {
  Blocker: { s: "keyword", target: "self", keyword: "blocker" },
  Rush: { s: "keyword", target: "self", keyword: "rush" },
  "Rush: Character": { s: "keyword", target: "self", keyword: "rush_character" },
  "Double Attack": { s: "keyword", target: "self", keyword: "double_attack" },
  Banish: { s: "keyword", target: "self", keyword: "banish" },
  Unblockable: { s: "keyword", target: "self", keyword: "unblockable" },
};

interface Header {
  windows: Trigger[];
  don?: number;
  oncePerTurn?: boolean;
  conditions: Cond[];
  costs: Cost[];
  keywords: string[];
}

function header(tags: string[]): Header {
  const h: Header = { windows: [], conditions: [], costs: [], keywords: [] };
  for (const tag of tags) {
    if (WINDOW_TAGS[tag]) h.windows.push(WINDOW_TAGS[tag]!);
    else if (/^DON!! x(\d+)$/.test(tag)) h.don = Number(/x(\d+)/.exec(tag)![1]);
    else if (tag === "Once Per Turn") h.oncePerTurn = true;
    else if (tag === "Your Turn") h.conditions.push({ c: "your_turn" });
    else if (tag === "Opponent's Turn") h.conditions.push({ c: "opponent_turn" });
    else if (/^RDON (\d+)$/.test(tag)) h.costs.push({ k: "rest_don", count: Number(/(\d+)/.exec(tag)![1]) });
    else if (isKeywordTag(tag)) h.keywords.push(tag);
  }
  return h;
}

const EVENT_RULES: [RegExp, (m: RegExpExecArray, ctx: Ctx) => EventTrigger | null][] = [
  [/^when a DON!! card on (?:the|your) field is returned to your DON!! deck$/i, () => ({ event: "don_returned", player: "you" })],
  [/^when your opponent attacks$/i, () => ({ event: "attack_declared", player: "opponent" })],
  [/^when your opponent's character attacks$/i, () => ({ event: "attack_declared", player: "opponent", filter: { types: ["character"] } })],
  [/^when (?:a card is removed from )?your or your opponent's life cards?(?: is removed)?$/i, () => ({ event: "life_removed", player: "any" })],
  [/^when your opponent activates an event or \[Trigger\]$/i, () => ({ event: "event_activated", player: "opponent" })],
  [/^when you play a character with a \[Trigger\]$/i, () => ({ event: "character_played", player: "you", filter: { hasTrigger: true } })],
  [/^when your (.+?) is removed from the field by your opponent's effect(?: or KO'd)?$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { event: "character_removed_by_effect", player: "you", byOpponentEffect: true, ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when (?:this leader or any of your characters|any of your characters or this leader) (?:is|are) given a DON!! card$/i, () => ({ event: "don_given", player: "you" })],
  [/^when your opponent activates (?:a )?\[Blocker\]$/i, () => ({ event: "blocker_activated", player: "opponent" })],
  [/^when this character battles and KOs your opponent's character$/i, () => ({ event: "battle_ko_opponent", player: "you" })],
  [/^when you deal damage to your opponent's life$/i, () => ({ event: "leader_damaged", player: "opponent" })],
  [/^when a card is added to your hand from your life$/i, () => ({ event: "life_to_hand", player: "you" })],
  [/^when a \[Trigger\] activates$/i, () => ({ event: "trigger_activated", player: "any" })],
  [/^when a card is removed from your opponent's life cards$/i, () => ({ event: "life_removed", player: "opponent" })],
  [/^when a character is removed from the field by your effect$/i, () => ({ event: "character_removed_by_effect", player: "any" })],
  [/^when your (.+?) is removed from the field by an effect$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { event: "character_removed_by_effect", player: "you", ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when you play (?:a |an )?(.+?) from your hand$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { event: "character_played", player: "you", ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when (?:one of )?your (.+?) (?:is|are) KO'd$/i, (m, ctx) => { const p = parseCardPhrase("all your " + m[1]!, ctx); return p ? { event: "character_ko", player: "you", ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when a character is KO'd$/i, () => ({ event: "character_ko", player: "any" })],
  [/^when this character is KO'd( by your opponent's effect)?$/i, (m) => ({ event: "self_ko", player: "you", ...(m[1] ? { byOpponentEffect: true } : {}) })],
  [/^when this (?:character|leader)'s attack deals damage to your opponent's life$/i, () => ({ event: "attack_damage", player: "you" })],
  [/^when your opponent's character is returned to the owner's hand(?: by your effect)?$/i, () => ({ event: "character_returned", player: "opponent" })],
  [/^when a card is trashed from your hand(?: by an effect)?$/i, () => ({ event: "card_trashed_from_hand", player: "you" })],
  [/^when a DON!! card on your field is returned to your DON!! deck by your effect$/i, () => ({ event: "don_returned", player: "you" })],
  [/^when your opponent's character is KO'd$/i, () => ({ event: "character_ko", player: "opponent" })],
  [/^when (?:one of )?your opponent's characters? (?:is|are) KO'd by your effects?$/i, () => ({ event: "character_ko", player: "opponent", byOpponentEffect: true })],
  [/^when your character is KO'd$/i, () => ({ event: "character_ko", player: "you" })],
  [/^when (?:your )?(.+?) (?:is|are) KO'd$/i, (m, ctx) => { const p = parseCardPhrase(`all your ${m[1]!}`, ctx); return p ? { event: "character_ko", player: "you", ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when a DON!! card on your field is returned to your DON!! deck$/i, () => ({ event: "don_returned", player: "you" })],
  [/^when (?:a|any) DON!! cards? (?:on your field )?(?:is|are) returned to your DON!! deck$/i, () => ({ event: "don_returned", player: "you" })],
  [/^when this character becomes rested$/i, () => ({ event: "self_rested", player: "you" })],
  [/^when you activate an event$/i, () => ({ event: "event_activated", player: "you" })],
  [/^when your opponent activates an event$/i, () => ({ event: "event_activated", player: "opponent" })],
  [/^when your opponent activates (?:a )?\[Blocker\]$/i, () => null],
  [/^when you play (?:a |an )?(.+?)$/i, (m, ctx) => { const p = parseCardPhrase(`all your ${m[1]!}`, ctx); return p ? { event: "character_played", player: "you", ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when your opponent plays (?:a |an )?(.+?)$/i, (m, ctx) => { const p = parseCardPhrase(`all your opponent's ${m[1]!}`, ctx); return p ? { event: "character_played", player: "opponent", ...(p.selector.filter ? { filter: p.selector.filter } : {}) } : null; }],
  [/^when (?:a card is removed from |)your life cards? (?:is|are) (?:removed|added to your hand)$/i, () => ({ event: "life_removed", player: "you" })],
  [/^when a card is removed from your(?: or your opponent's)? life cards$/i, (m) => ({ event: "life_removed", player: /opponent/.test(m[0]) ? "any" : "you" })],
  [/^when this character is attacked$/i, () => ({ event: "self_attacked", player: "you" })],
  [/^when you activate a \[Trigger\]$/i, () => ({ event: "trigger_activated", player: "you" })],
  [/^when your leader (?:is dealt damage|takes damage)$/i, () => ({ event: "leader_damaged", player: "you" })],
];

function parseEventTrigger(text: string, ctx: Ctx): { trigger: EventTrigger; conditions: Cond[]; rest: string } | null {
  const inverted = /^([^,]+?) (when .+?)\.?$/i.exec(clean(text));
  if (inverted && !/^when /i.test(clean(text)) && !/^if /i.test(clean(text))) {
    const again = parseEventTrigger(inverted[2]! + ", " + inverted[1]! + ".", ctx);
    if (again) return again;
  }
  const m = /^(when .+?), (.+)$/i.exec(clean(text));
  if (!m) return null;
  // The first comma may be part of a condition ("when ..., if ...,").
  const commas = [...text.matchAll(/, /g)].map((x) => x.index!);
  for (const index of commas) {
    const head = text.slice(0, index).trim();
    if (!/^when /i.test(head)) continue;
    for (const [re, build] of EVENT_RULES) {
      const mm = re.exec(head);
      if (!mm) continue;
      const trig = build(mm, ctx);
      if (!trig) continue;
      let rest = text.slice(index + 2).trim();
      const conds: Cond[] = [];
      const ifMatch = /^if (.+)$/i.exec(clean(rest));
      if (ifMatch) {
        // "if COND, EFFECT" — keep as part of the effect body (conditional effect).
      }
      return { trigger: trig, conditions: conds, rest };
    }
  }
  return null;
}

const REPLACEMENT_RE = /^if (this character|this leader|your leader|your (.+?)|(?:one of |any of )?your (.+?)) would (?:be )?(KO'd|removed from the field|leave the field|be removed from the field by your opponent's effect or KO'd)( by (?:an? |your )?(?:opponent's )?effects?| in battle)?(?: by your opponent's effect)?, (you may )?(.+?) instead$/i;

function parseReplacement(text: string, ctx: Ctx): Replacement | null {
  const m = REPLACEMENT_RE.exec(clean(text));
  if (!m) return null;
  const subject = m[1]!.replace(/^(?:one of|any of) /i, "");
  let target: Replacement["target"] = "self";
  if (!/^this /i.test(subject)) {
    const p = parseCardPhrase(`all ${subject}`, ctx);
    if (!p || p.quant.kind !== "all") return null;
    target = p.selector;
  }
  const how = (m[5] ?? "").toLowerCase();
  const byOpponent = /opponent/.test(m[0]!.toLowerCase().split("would be")[1] ?? "");
  let event: Replacement["event"];
  if (/leave the field|or KO'd/i.test(m[4]!)) event = "ko";
  else if (m[4]!.toLowerCase().startsWith("removed") && !/opponent/i.test(m[0]!)) event = "ko";
  else if (m[4]!.toLowerCase().startsWith("removed")) event = "removed_by_opponent_effect";
  else if (how.includes("battle")) event = "ko_in_battle";
  else if (how.includes("effect")) event = "ko_by_effect";
  else event = "ko";
  const insteadText = m[7]!;
  const costs = parseCosts(insteadText, ctx);
  let instead: Effect | null = costs ? { do: "pay", costs, then: { do: "nothing" } } : null;
  if (!instead) instead = parseStatement(insteadText, ctx);
  if (!instead) return null;
  return { event, target, byOpponent, instead, optional: Boolean(m[6]) };
}

function splitCostBody(body: string, ctx: Ctx): { costs: Cost[]; optional: boolean; rest: string; conditions: Cond[] } | null {
  // Top-level ": " not inside a later sentence.
  const firstSentenceEnd = body.search(/\.(\s|$)/);
  const colon = body.indexOf(": ");
  if (colon < 0 || (firstSentenceEnd >= 0 && colon > firstSentenceEnd)) return null;
  let costText = body.slice(0, colon);
  if (/(?:^|, )(?:choose one|your opponent chooses one|choose up to \d+)$/i.test(costText)) return null;
  let conditions: Cond[] = [];
  const gated = /^if (.+?), (you may .+)$/i.exec(costText);
  if (gated) { const cond = parseCondition(gated[1]!, ctx); if (!cond) return null; conditions = [cond]; costText = gated[2]!; }
  const costs = parseCosts(costText, ctx);
  if (!costs) return null;
  return { costs, optional: /you may/i.test(costText), rest: body.slice(colon + 2), conditions };
}

export function compileCardText(id: string, row: CardDataRow): CardAbilities {
  const abilities: Ability[] = [];
  const unsupported: string[] = [];
  const texts = [row.text, row.trigger].filter((t) => t && t.trim());
  if (texts.length === 0) return { id, schemaVersion: EFFECT_SCHEMA_VERSION, abilities: [], unsupported: [], status: "vanilla", origin: "generated" };
  let index = 0;
  const nextId = () => `${id.toLowerCase()}#${index++}`;
  for (const source of texts) {
    const { text, ph } = protect(normalizeText(source));
    const ctx: Ctx = { ph, selfType: row.type };
    for (const seg of segment(text)) {
      const raw = restoreNames(seg.raw, ph);
      const result = compileSegment(seg.tags, seg.body, ctx, nextId, row);
      if (result) abilities.push(...result.map((a) => ({ ...a, text: raw })));
      else unsupported.push(raw);
    }
  }
  const status = unsupported.length === 0 ? "supported" : abilities.length > 0 ? "partial" : "unsupported";
  return { id, schemaVersion: EFFECT_SCHEMA_VERSION, abilities, unsupported, status, origin: "generated" };
}

type Draft = Omit<Ability, "text">;

function compileSegment(tags: string[], body: string, ctx: Ctx, nextId: () => string, row: CardDataRow): Draft[] | null {
  const h = header(tags);
  const trimmed = body.trim().replace(/^\/\s*/, "");
  // Keyword-only segment: "[Blocker]" / "[DON!! x1] [Rush]"
  if (h.keywords.length && !trimmed && h.windows.length === 0) {
    return h.keywords.map((k) => ({ id: nextId(), trigger: "static", ...(h.don ? { don: h.don } : {}), ...(h.conditions.length ? { conditions: h.conditions } : {}), statics: [KEYWORDS[k]!] }));
  }
  if (h.keywords.length) return null;
  if (!trimmed) return null;

  if (h.windows.length === 0) return compileUntimed(h, trimmed, ctx, nextId);

  // Event cards: [Main] / [Counter]; Trigger clause of any card.
  const split = splitCostBody(trimmed, ctx);
  const costs = [...h.costs, ...(split?.costs ?? [])];
  const gateConditions = [...h.conditions, ...(split?.conditions ?? [])];
  const effectText = split ? split.rest : trimmed;
  // An event-trigger inside a timed header ("[Your Turn] [Once Per Turn] When ..., ...")
  const parsed = parseEffectBody(effectText, ctx, sentences);
  if (!parsed.effect) return null;
  const effect = parsed.effect;
  void row;
  return h.windows.map((trigger) => ({
    id: nextId(),
    trigger,
    ...(h.oncePerTurn ? { oncePerTurn: true } : {}),
    ...(h.don ? { don: h.don } : {}),
    ...(gateConditions.length ? { conditions: gateConditions } : {}),
    ...(costs.length ? { costs } : {}),
    effect,
  }));
}

function compileUntimed(h: Header, body: string, ctx: Ctx, nextId: () => string): Draft[] | null {
  const base = {
    ...(h.oncePerTurn ? { oncePerTurn: true } : {}),
    ...(h.don ? { don: h.don } : {}),
  };
  // Replacement effects.
  const replacement = parseReplacement(body, ctx);
  if (replacement) return [{ id: nextId(), trigger: "replacement", ...base, ...(h.conditions.length ? { conditions: h.conditions } : {}), replacement }];
  // "This effect can be activated when X. EFFECT" / "... at the start of your turn."
  const activatedWhen = /^this effect can be activated (when .+?|at the start of your turn)\. (.+)$/i.exec(body);
  if (activatedWhen) {
    if (/start of your turn/i.test(activatedWhen[1]!)) {
      const parsed = parseEffectBody(activatedWhen[2]!, ctx, sentences);
      return parsed.effect ? [{ id: nextId(), trigger: "start_of_your_turn", ...base, ...(h.conditions.length ? { conditions: h.conditions } : {}), effect: parsed.effect }] : null;
    }
    return compileUntimed(h, activatedWhen[1]! + ", " + activatedWhen[2]!, ctx, nextId);
  }
  // Costs before an event trigger: "You may trash 2 cards from your hand: When ..., ...".
  const costFirst = splitCostBody(body, ctx);
  if (costFirst && /^when /i.test(costFirst.rest)) {
    const inner = compileUntimed(h, costFirst.rest, ctx, nextId);
    return inner ? inner.map((a) => ({ ...a, costs: [...(a.costs ?? []), ...costFirst.costs] })) : null;
  }
  // Event triggers ("When ..., ...").
  const ev = parseEventTrigger(body, ctx);
  if (ev) {
    const split = splitCostBody(ev.rest, ctx);
    const parsed = parseEffectBody(split ? split.rest : ev.rest, ctx, sentences);
    if (!parsed.effect) return null;
    return [{ id: nextId(), trigger: "on_event", ...base, eventTrigger: ev.trigger, conditions: [...h.conditions, ...ev.conditions], ...(split?.costs.length ? { costs: split.costs } : {}), effect: parsed.effect }];
  }
  // Continuous statics, possibly multiple sentences.
  const out: Draft[] = [];
  for (const sentence of sentences(body)) {
    const s = parseStaticSentence(sentence, ctx);
    if (!s) return null;
    out.push({ id: nextId(), trigger: "static", ...base, conditions: [...h.conditions, ...s.conditions], statics: s.statics });
  }
  return out.length ? out.map((a) => (a.conditions?.length ? a : (({ conditions: _c, ...rest }) => rest)(a))) : null;
}

export type { Placeholders, Draft };
export { parseCondition };
