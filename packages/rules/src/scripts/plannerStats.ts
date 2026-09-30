/**
 * Compact per-card stats for the deck planner SPA (`frontend/public/deckStats.json`).
 * The planner cannot import @optcg/rules, so everything it needs is derived here
 * from the printed card data plus the compiled ability DSL.
 */
import { cardAbilities } from "../cards/abilities.js";
import { cardDataFor, listCardDataIds, type CardDataRow } from "../cards/cardData.js";
import type { Ability } from "../effects/types.js";

export type PlannerRole = "draw" | "search" | "removal" | "ramp" | "lifeGain";

export interface PlannerSearch {
  look: number;
  filter: Record<string, unknown>;
}

export interface PlannerCard {
  /** Printed name. */
  n: string;
  /** Extra names from name_alias statics (searcher filters match these too). */
  al?: string[];
  t: "character" | "event" | "stage" | "leader";
  col: string[];
  cost?: number;
  pow?: number;
  ctr?: number;
  life?: number;
  tr?: string[];
  at?: string[];
  /** Printed [Trigger]. */
  trg?: 1;
  kw?: string[];
  tm?: string[];
  rl?: PlannerRole[];
  /** Leaders only: deck_rule statics, e.g. "max_cost:5". */
  rules?: string[];
  /** Leaders only: traits named as {Trait} in the printed text (deck hints). */
  lt?: string[];
  /** Look-at-top-N-and-add-to-hand effects. */
  srch?: PlannerSearch[];
}

const KEYWORD_LABEL: Record<string, string> = {
  blocker: "Blocker",
  rush: "Rush",
  rush_character: "Rush: Character",
  double_attack: "Double Attack",
  banish: "Banish",
  unblockable: "Unblockable",
};

const TIMING_LABEL: Record<string, string> = {
  on_play: "On Play",
  activate_main: "Activate: Main",
  when_attacking: "When Attacking",
  on_ko: "On K.O.",
  on_block: "On Block",
  counter: "Counter",
  main: "Main",
};

const TEXT_KEYWORDS: [RegExp, string][] = [
  [/\[Blocker\]/i, "Blocker"],
  [/\[Rush\]/i, "Rush"],
  [/\[Double Attack\]/i, "Double Attack"],
  [/\[Banish\]/i, "Banish"],
  [/\[Unblockable\]/i, "Unblockable"],
];

const TEXT_TIMING: [RegExp, string][] = [
  [/\[On Play\]/i, "On Play"],
  [/\[Activate: Main\]/i, "Activate: Main"],
  [/\[When Attacking\]/i, "When Attacking"],
  [/\[On K\.O\.\]/i, "On K.O."],
  [/\[On Block\]/i, "On Block"],
  [/\[Counter\]/i, "Counter"],
  [/\[Main\]/i, "Main"],
];

const REMOVAL_DO = new Set(["ko", "rest", "to_hand", "to_deck", "to_trash"]);

function mentionsOpponent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(mentionsOpponent);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([k, v]) => (k === "player" && (v === "opponent" || v === "any")) || mentionsOpponent(v));
  }
  return false;
}

interface Found {
  roles: Set<PlannerRole>;
  search: PlannerSearch[];
}

function walkEffect(node: unknown, out: Found): void {
  if (Array.isArray(node)) {
    for (const n of node) walkEffect(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const e = node as Record<string, unknown>;
  const kind = e.do;
  if (kind === "draw" && (e.player === undefined || e.player === "you")) out.roles.add("draw");
  if (kind === "look" && e.player === "you") {
    const picks = Array.isArray(e.picks) ? (e.picks as Record<string, unknown>[]) : [];
    for (const pick of picks) {
      if (pick.dest !== "hand") continue;
      out.roles.add("search");
      out.search.push({ look: Number(e.count), filter: (pick.filter as Record<string, unknown>) ?? {} });
    }
  }
  if (typeof kind === "string" && REMOVAL_DO.has(kind) && mentionsOpponent(e.target)) out.roles.add("removal");
  if (kind === "add_don" && e.player !== "opponent") out.roles.add("ramp");
  if ((kind === "deck_to_life" || kind === "hand_to_life") && (e.player === undefined || e.player === "you")) out.roles.add("lifeGain");
  for (const v of Object.values(e)) walkEffect(v, out);
}

/** Text fallback, applied only to clauses the ability DSL could not compile. */
function roleFromText(clause: string, roles: Set<PlannerRole>): void {
  if (/\bdraw (?:up to )?\d+ cards?/i.test(clause) && !/opponent draws?/i.test(clause)) roles.add("draw");
  if (/look at \d+ cards? from the top of your deck/i.test(clause)) roles.add("search");
  if (/opponent/i.test(clause) && /(K\.O\.|\brest up to|to the owner's hand|at the (?:bottom|top) of (?:the )?owner's deck)/i.test(clause)) roles.add("removal");
  if (/add up to \d+ DON!! cards?/i.test(clause)) roles.add("ramp");
  if (/add up to \d+ cards? from (?:the top of )?your (?:deck|hand) to the top of your Life/i.test(clause)) roles.add("lifeGain");
}

export function derivePlannerCard(row: CardDataRow, abilities: readonly Ability[], unsupported: readonly string[] = []): PlannerCard {
  const out: PlannerCard = { n: row.name, t: row.type, col: [...row.colors] };
  if (row.type !== "leader" && row.cost != null) out.cost = row.cost;
  if (row.power != null) out.pow = row.power;
  if (row.counter != null) out.ctr = row.counter;
  if (row.life != null) out.life = row.life;
  if (row.traits.length) out.tr = [...row.traits];
  if (row.attributes.length) out.at = [...row.attributes];
  if (row.trigger) out.trg = 1;

  const keywords = new Set<string>();
  const timing = new Set<string>();
  const found: Found = { roles: new Set(), search: [] };
  const rules: string[] = [];
  const aliases: string[] = [];
  for (const ability of abilities) {
    const label = TIMING_LABEL[ability.trigger];
    if (label) timing.add(label);
    for (const s of ability.statics ?? []) {
      if (s.s === "keyword" && s.target === "self" && KEYWORD_LABEL[s.keyword]) keywords.add(KEYWORD_LABEL[s.keyword]!);
      if (s.s === "deck_rule") rules.push(s.rule);
      if (s.s === "name_alias") for (const a of s.names) if (!aliases.includes(a)) aliases.push(a);
    }
    walkEffect(ability.effect, found);
  }
  for (const clause of unsupported) {
    for (const [re, name] of TEXT_KEYWORDS) if (re.test(clause)) keywords.add(name);
    for (const [re, name] of TEXT_TIMING) if (re.test(clause)) timing.add(name);
    roleFromText(clause, found.roles);
  }

  if (keywords.size) out.kw = [...keywords].sort();
  if (timing.size) out.tm = [...timing].sort();
  if (found.roles.size) out.rl = [...found.roles].sort();
  if (rules.length) out.rules = rules;
  if (row.type === "leader") {
    const named = [...new Set([...row.text.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!.trim()))];
    if (named.length) out.lt = named;
  }
  if (aliases.length) out.al = aliases;
  if (found.search.length) out.srch = found.search;
  return out;
}

export function buildPlannerStats(): Record<string, PlannerCard> {
  const out: Record<string, PlannerCard> = {};
  for (const id of listCardDataIds().sort()) {
    const row = cardDataFor(id);
    if (!row) continue;
    const rec = cardAbilities(id);
    out[id] = derivePlannerCard(row, rec?.abilities ?? [], rec?.unsupported ?? []);
  }
  return out;
}

/** One card per line keeps diffs reviewable while staying compact. */
export function serializePlannerStats(stats: Record<string, PlannerCard>): string {
  const lines = Object.entries(stats).map(([id, card]) => `${JSON.stringify(id)}:${JSON.stringify(card)}`);
  return `{\n${lines.join(",\n")}\n}\n`;
}
