/**
 * Pending choices (searches, targets, orderings, optional effects) the bot owns.
 * `listLegalIntents` offers only the engine's default answer for these, so the bot builds its own
 * and keeps it inside the request's limits (counts, groups, distinct names).
 */
import { getCardDef } from "../cards/definitions.js";
import type { ChoiceOption, ChoiceRequest, Intent, PendingChoice } from "../types.js";
import type { Rng } from "../rng.js";
import type { BotLevel, BotView } from "./types.js";
import { boardValue, defValue, findBoardCard } from "./value.js";

type Look = Extract<ChoiceRequest, { type: "look" }>;
type Purpose = "hurt" | "gain" | "cost";

function optionValue(view: BotView, o: ChoiceOption): number {
  const onBoard = o.instanceId ? findBoardCard(view, o.instanceId) : null;
  if (onBoard) return boardValue(onBoard.card);
  return defValue(o.defId);
}

function optionName(o: ChoiceOption): string {
  if (!o.defId || o.defId === "HIDDEN") return o.id;
  try { return getCardDef(o.defId).name; } catch { return o.id; }
}

/** What the picks are for: opponent's cards are hurt, own cards are a cost to pay or something gained. */
function purpose(view: BotView, choice: PendingChoice, o: ChoiceOption): Purpose {
  if (o.ownerSeat != null && o.ownerSeat !== view.seat) return "hurt";
  const text = choice.prompt.toLowerCase();
  if (/\b(play|add|draw|give|gain|attach|search|look|reveal|set)\b|\+\d/.test(text)) return "gain";
  if (o.zone === "deck" || o.zone === "trash") return "gain";
  return "cost";
}

function canAssign(picked: string[], groups: Look["groups"]): boolean {
  const cap = groups.map((g) => g.max);
  const go = (i: number): boolean => {
    if (i === picked.length) return true;
    for (let g = 0; g < groups.length; g += 1) {
      if (cap[g]! > 0 && groups[g]!.eligibleIds.includes(picked[i]!)) {
        cap[g]! -= 1;
        if (go(i + 1)) return true;
        cap[g]! += 1;
      }
    }
    return false;
  };
  return go(0);
}

/** What an option adds to a "total cost / total power at most X" limit; null when its card is hidden from the seat. */
function limitStat(view: BotView, o: ChoiceOption, kind: "cost" | "power"): number | null {
  const onBoard = o.instanceId ? findBoardCard(view, o.instanceId) : null;
  if (onBoard && kind === "power") return onBoard.card.power;
  if (!o.defId || o.defId === "HIDDEN") return null;
  try {
    const def = getCardDef(o.defId);
    return kind === "cost" ? def.cost : (def.power ?? 0);
  } catch { return null; }
}

function answerSelect(view: BotView, choice: PendingChoice, r: Extract<ChoiceRequest, { type: "select" }>): Intent | null {
  const eligible = r.options.filter((o) => o.eligible);
  if (eligible.length < r.min) return null;
  if (!eligible.length) return { type: "resolve_pending_choice", accept: true, selectedOptionIds: [] };
  const kind = purpose(view, choice, eligible[0]!);
  const scored = eligible.map((o) => ({ o, v: optionValue(view, o) }));
  // Hurt and gain take the best cards, a cost gives up the cheapest ones. Stable on ties (option order).
  scored.sort((a, b) => (kind === "cost" ? a.v - b.v : b.v - a.v));
  const want = kind === "cost" ? r.min : r.max;
  const picked: ChoiceOption[] = [];
  const names = new Set<string>();
  // "Total cost / power of the picks at most X" (#635): the request carries the limit; a pick that would pass it is skipped.
  const limits = ([["cost", r.totalCostAtMost], ["power", r.totalPowerAtMost]] as const).filter((l): l is readonly ["cost" | "power", number] => l[1] != null);
  const used = { cost: 0, power: 0 };
  for (const { o } of scored) {
    if (picked.length >= want) break;
    const stats = limits.map(([k]) => limitStat(view, o, k));
    if (limits.length && (stats.some((v) => v === null) || limits.some(([k, max], i) => used[k] + stats[i]! > max))) continue;
    if (r.distinctNames) {
      const n = optionName(o);
      if (names.has(n)) continue;
      names.add(n);
    }
    limits.forEach(([k], i) => { used[k] += stats[i]!; });
    picked.push(o);
  }
  if (picked.length < r.min) return null;
  return { type: "resolve_pending_choice", accept: true, selectedOptionIds: picked.map((o) => o.id) };
}

function answerLook(view: BotView, r: Look): Intent | null {
  const ranked = [...r.options].sort((a, b) => optionValue(view, b) - optionValue(view, a));
  const picked: string[] = [];
  for (const o of ranked) {
    if (picked.length >= r.maxSelect) break;
    if (canAssign([...picked, o.id], r.groups)) picked.push(o.id);
  }
  if (picked.length < r.minSelect) return null;
  const rest = ranked.filter((o) => !picked.includes(o.id));
  const avg = rest.length ? rest.reduce((n, o) => n + optionValue(view, o), 0) / rest.length : 0;
  return {
    type: "resolve_pending_choice", accept: true, selectedOptionIds: picked, orderedOptionIds: rest.map((o) => o.id),
    // "Top or bottom" moves the rest together: keep good cards on top, send a weak batch to the bottom.
    ...(r.rest === "top_or_bottom" ? { topOptionIds: avg >= 3.5 ? rest.map((o) => o.id) : [] } : {}),
  };
}

function answerOrder(view: BotView, r: Extract<ChoiceRequest, { type: "order" }>): Intent {
  const ranked = [...r.options].sort((a, b) => optionValue(view, b) - optionValue(view, a));
  const avg = ranked.length ? ranked.reduce((n, o) => n + optionValue(view, o), 0) / ranked.length : 0;
  const ids = ranked.map((o) => o.id);
  return { type: "resolve_pending_choice", accept: true, orderedOptionIds: ids, ...(r.allowTopOrBottom ? { topOptionIds: avg >= 3.5 ? ids : [] } : {}) };
}

/** The bot's answer for the front pending choice (always the seat's own), or a legal default when unsure. */
export function chooseChoiceAnswer(view: BotView, level: BotLevel, rng: Rng): Intent {
  const legal = view.legalIntents;
  const fallback = legal[0]!;
  const choice = view.pendingChoices[0];
  if (!choice || choice.seat !== view.seat) return fallback;
  if (choice.kind === "order_effects" || choice.unpayable) return fallback;
  if (choice.kind === "life_trigger") {
    // Activating a [Trigger] is almost always better than adding the card to hand.
    return legal.find((i) => i.type === "resolve_pending_choice" && i.accept) ?? fallback;
  }
  // Easy sometimes just takes the engine's default answer.
  if (level === "easy" && rng.next() < 0.4) return fallback;
  const r = choice.request;
  if (!r || r.type === "confirm") {
    const accept = legal.find((i) => i.type === "resolve_pending_choice" && i.accept);
    return accept ?? fallback;
  }
  let answer: Intent | null = null;
  switch (r.type) {
    case "mode": answer = fallback; break;
    case "select": answer = answerSelect(view, choice, r); break;
    case "order": answer = answerOrder(view, r); break;
    case "look": answer = answerLook(view, r); break;
  }
  return answer ?? fallback;
}
