/**
 * Card catalog for the analyst: printed card data, the ability DSL and the deck-analytics
 * atlas, merged into one searchable row per card. Loaded once at startup from the repo's
 * generated JSON (the same files the duel engine and the deck stats panels use).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { StatsAtlas } from "@optcg/deck-analytics";

export type CardType = "leader" | "character" | "event" | "stage";

export type AbilitySupport = "supported" | "partial" | "unsupported" | "vanilla" | "unknown";

export type CardRow = {
  id: string;
  name: string;
  type: CardType;
  colors: string[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  traits: string[];
  attributes: string[];
  text: string;
  trigger: string;
  /** Keywords the card has, e.g. Rush, Blocker, Double Attack. */
  keywords: string[];
  /** Ability timings from the DSL, e.g. on_play, when_attacking, counter, trigger. */
  timings: string[];
  /** Effect verbs from the DSL, e.g. ko, draw, look, rest, to_hand. */
  effects: string[];
  /** How completely the duel engine implements the card's text. */
  support: AbilitySupport;
};

export type Ability = { id: string; trigger: string; text: string; effect?: unknown; [k: string]: unknown };

export type Catalog = {
  cards: Map<string, CardRow>;
  abilities: Map<string, Ability[]>;
  atlas: StatsAtlas;
};

type RawCard = {
  name: string;
  type: CardType;
  colors: string[];
  cost?: number;
  power?: number;
  counter?: number;
  life?: number;
  traits: string[];
  attributes: string[];
  text: string;
  trigger: string;
};

type RawAbilities = Record<string, { abilities: Ability[]; status?: string }>;

/** DSL control-flow nodes: they wrap effects but are not effects a player would search for. */
const STRUCTURAL = new Set(["if", "seq", "may", "choose_one", "nothing", "select", "pay", "invoke", "delay"]);

function collectVerbs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectVerbs(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (typeof rec.do === "string" && !STRUCTURAL.has(rec.do)) out.add(rec.do);
  for (const v of Object.values(rec)) collectVerbs(v, out);
}

const SUPPORT = new Set<AbilitySupport>(["supported", "partial", "unsupported", "vanilla"]);

export function buildCatalog(raw: { cards: Record<string, RawCard> }, abilities: RawAbilities, atlas: StatsAtlas): Catalog {
  const cards = new Map<string, CardRow>();
  const abilityMap = new Map<string, Ability[]>();
  for (const [id, c] of Object.entries(raw.cards)) {
    const rec = abilities[id];
    const list = rec?.abilities ?? [];
    abilityMap.set(id, list);
    const timings = new Set<string>();
    const effects = new Set<string>();
    for (const a of list) {
      if (typeof a.trigger === "string" && a.trigger !== "static") timings.add(a.trigger);
      collectVerbs(a.effect, effects);
    }
    if (c.trigger) timings.add("trigger");
    const status = rec?.status as AbilitySupport | undefined;
    cards.set(id, {
      id,
      name: c.name,
      type: c.type,
      colors: c.colors,
      cost: c.cost,
      power: c.power,
      counter: c.counter,
      life: c.life,
      traits: c.traits ?? [],
      attributes: c.attributes ?? [],
      text: c.text ?? "",
      trigger: c.trigger ?? "",
      keywords: atlas[id]?.kw ?? [],
      timings: [...timings].sort(),
      effects: [...effects].sort(),
      support: status && SUPPORT.has(status) ? status : "unknown",
    });
  }
  return { cards, abilities: abilityMap, atlas };
}

const repoFile = (rel: string) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const readJson = <T>(rel: string): T => JSON.parse(readFileSync(repoFile(rel), "utf8")) as T;

let cached: Catalog | null = null;

/** The catalog built from the repo's generated card files (read once). */
export function loadCatalog(): Catalog {
  cached ??= buildCatalog(
    readJson("packages/rules/src/cards/cardData.json"),
    readJson("packages/rules/src/cards/generated/abilities.json"),
    readJson("packages/deck-analytics/deckStats.json"),
  );
  return cached;
}
