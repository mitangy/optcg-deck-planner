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
  keywords: string[];
  timings: string[];
  effects: string[];
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

const STRUCTURAL = new Set(["if", "seq", "may", "choose_one", "nothing", "select", "pay", "invoke", "delay"]);

/** Sign of a power/cost change: a plain number, or `{count, times}` (the sign is the multiplier's). */
function amountSign(amount: unknown): number {
  const n = typeof amount === "number" ? amount : (amount as { times?: unknown } | null)?.times;
  return typeof n === "number" ? Math.sign(n) : 0;
}

/** `power` and `cost` effects also get a direction tag, so "gives -power" is searchable without reading the text. */
const DIRECTED = { power: ["power_up", "power_down"], cost: ["cost_up", "cost_down"] } as const;

function collectVerbs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectVerbs(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  if (typeof rec.do === "string" && !STRUCTURAL.has(rec.do)) {
    out.add(rec.do);
    const directed = DIRECTED[rec.do as keyof typeof DIRECTED];
    const sign = directed ? amountSign(rec.amount) : 0;
    if (directed && sign) out.add(directed[sign > 0 ? 0 : 1]);
  }
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

export function loadCatalog(): Catalog {
  cached ??= buildCatalog(
    readJson("packages/rules/src/cards/cardData.json"),
    readJson("packages/rules/src/cards/generated/abilities.json"),
    readJson("packages/deck-analytics/deckStats.json"),
  );
  return cached;
}
