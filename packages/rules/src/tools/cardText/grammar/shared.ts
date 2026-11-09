/**
 * Helpers shared by the grammar's condition, cost, effect and static rule tables.
 */
import type { Duration, Keyword, Rel, Target } from "../../../effects/types.js";
import { exactly, leaderOf, upTo, v } from "../../../effects/builders.js";
import { parseCardPhrase, type CardPhrase, type Ctx, type PhraseOptions } from "../phrases.js";

export type Rule<T> = [RegExp, (m: RegExpExecArray, ctx: Ctx) => T | null];

/** One grammar rule: when `re` matches the (normalized) clause, `build` turns the match into DSL data, or null to fall through. */
export const rule = <T>(re: RegExp, build: (m: RegExpExecArray, ctx: Ctx) => T | null): Rule<T> => [re, build];

export function firstMatch<T>(text: string, rules: Rule<T>[], ctx: Ctx): T | null {
  for (const [re, build] of rules) {
    const m = re.exec(text);
    if (!m) continue;
    const out = build(m, ctx);
    if (out) return out;
  }
  return null;
}

export function clean(sentence: string): string {
  return sentence
    .trim()
    .replace(/\.$/, "")
    .replace(/^then,?\s+/i, "")
    .trim();
}

export const rel = (text: string): Rel => (/opponent|their/i.test(text) ? "opponent" : "you");

export function parseDuration(text: string | undefined): Duration | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  if (t === "during this turn" || t === "this turn") return "turn";
  if (t === "during this battle" || t === "this battle") return "battle";
  if (t === "until the start of your next turn") return "until_start_of_your_next_turn";
  if (
    t === "until the end of your opponent's next turn" ||
    t === "until the end of your opponent's next end phase" ||
    t === "during your opponent's next turn"
  )
    return "until_end_of_opponent_next_turn";
  if (t === "until the end of your next turn" || t === "during your next turn") return "until_end_of_your_next_turn";
  return null;
}
export const DUR =
  "(during this turn|during this battle|until the start of your next turn|until the end of your opponent's next turn|until the end of your opponent's next End Phase|until the end of your next turn|during your opponent's next turn)";

export function phrase(text: string, ctx: Ctx, opts?: PhraseOptions): CardPhrase | null {
  return parseCardPhrase(text, ctx, opts);
}

export function toTarget(p: CardPhrase, bind?: string): Target {
  switch (p.quant.kind) {
    case "self":
      return { ref: "self" };
    case "leader":
      return leaderOf(p.quant.player);
    case "all":
      return { ref: "all", selector: p.selector };
    case "up_to":
      return upTo(p.quant.n, p.selector, {
        ...(bind ? { bind } : {}),
        ...(p.totalCostAtMost != null ? { totalCostAtMost: p.totalCostAtMost } : {}),
        ...(p.totalPowerAtMost != null ? { totalPowerAtMost: p.totalPowerAtMost } : {}),
        ...(p.distinctNames ? { distinctNames: true } : {}),
      });
    case "exact":
      return exactly(p.quant.n, p.selector, {
        ...(bind ? { bind } : {}),
        ...(p.totalCostAtMost != null ? { totalCostAtMost: p.totalCostAtMost } : {}),
        ...(p.distinctNames ? { distinctNames: true } : {}),
      });
  }
}

/** Targets on the field ("KO up to 1 of your opponent's Characters"). */
export function fieldTarget(text: string, ctx: Ctx, bind = "_last"): Target | null {
  const t = text.trim();
  if (
    /^(?:that card|that character|it|the chosen character|that leader or character|that leader|the selected character|the selected card|the revealed card|the selected leader or character)$/i.test(
      t,
    )
  )
    return v("_last");
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

export function zoneTarget(
  text: string,
  zone: "hand" | "trash" | "deck" | "life" | "hand_or_trash" | "deck_or_trash",
  ctx: Ctx,
  bind = "_last",
): Target | null {
  const p = phrase(text, ctx, { zone, defaultPlayer: "you" });
  if (!p) return null;
  p.selector = { ...p.selector, zone };
  if (p.selector.player === "any") p.selector.player = "you";
  return toTarget(p, bind);
}

export function keywordOf(text: string): Keyword | null {
  const map: Record<string, Keyword> = {
    blocker: "blocker",
    rush: "rush",
    "rush: character": "rush_character",
    "double attack": "double_attack",
    banish: "banish",
    unblockable: "unblockable",
  };
  return map[text.toLowerCase()] ?? null;
}

export function signed(text: string): number {
  return Number(text.replace("+", ""));
}
