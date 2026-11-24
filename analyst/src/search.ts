import { normalizeCardId } from "@optcg/card-core";
import { ruleOffends } from "@optcg/deck-analytics";
import type { Catalog, CardRow, CardType } from "./catalog";

export type CardFilter = {
  query?: string;
  name?: string;
  colors?: string[];
  colorMode?: "any" | "only";
  types?: CardType[];
  costMin?: number;
  costMax?: number;
  powerMin?: number;
  powerMax?: number;
  counters?: number[];
  traits?: string[];
  attributes?: string[];
  keywords?: string[];
  timings?: string[];
  effects?: string[];
  hasTrigger?: boolean;
  set?: string;
  legalFor?: string;
  limit?: number;
  offset?: number;
};

export type SearchResult = { total: number; offset: number; cards: CardRow[]; notes: string[] };

const lower = (s: string) => s.toLowerCase();
const anyIn = (want: readonly string[] | undefined, have: readonly string[]) =>
  !want?.length || want.some((w) => have.some((h) => lower(h) === lower(w)));
const inRange = (v: number | undefined, min?: number, max?: number) =>
  (min === undefined || (v !== undefined && v >= min)) && (max === undefined || (v !== undefined && v <= max));

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

export const setOf = (id: string) => id.split("-")[0] ?? id;

/** The leader of the deck open in the app, when it names a real leader card. */
export function openLeaderOf(catalog: Catalog, leaderId: string | null | undefined): CardRow | undefined {
  const card = leaderId ? catalog.cards.get(normalizeCardId(leaderId)) : undefined;
  return card?.type === "leader" ? card : undefined;
}

/** Whether a leader's deck may include this card: it shares a color and no leader rule (Atlas) rules it out. The same check legalFor uses. */
export function legalUnder(catalog: Catalog, leader: CardRow, c: CardRow): boolean {
  if (c.type === "leader") return false;
  if (!c.colors.some((x) => leader.colors.includes(x))) return false;
  const atlasCard = catalog.atlas[c.id];
  return !(atlasCard && (catalog.atlas[leader.id]?.rules ?? []).some((r) => ruleOffends(r, atlasCard)));
}

export function searchCards(catalog: Catalog, f: CardFilter): SearchResult {
  const notes: string[] = [];
  let leader: CardRow | undefined;
  if (f.legalFor) {
    leader = catalog.cards.get(normalizeCardId(f.legalFor));
    if (!leader || leader.type !== "leader") notes.push(`${f.legalFor} is not a known leader, so legalFor was ignored.`);
  }
  const q = f.query ? lower(f.query) : null;
  const name = f.name ? lower(f.name) : null;
  const colors = f.colors?.map(lower);

  const matches: CardRow[] = [];
  for (const c of catalog.cards.values()) {
    if (q && !(lower(c.name).includes(q) || lower(c.text).includes(q) || lower(c.trigger).includes(q))) continue;
    if (name && !lower(c.name).includes(name)) continue;
    if (colors?.length) {
      const ok = f.colorMode === "only" ? c.colors.every((x) => colors.includes(lower(x))) : c.colors.some((x) => colors.includes(lower(x)));
      if (!ok) continue;
    }
    if (f.types?.length && !f.types.includes(c.type)) continue;
    if (!inRange(c.cost, f.costMin, f.costMax)) continue;
    if (!inRange(c.power, f.powerMin, f.powerMax)) continue;
    if (f.counters?.length && !f.counters.includes(c.counter ?? 0)) continue;
    if (!anyIn(f.traits, c.traits)) continue;
    if (!anyIn(f.attributes, c.attributes)) continue;
    if (f.keywords?.length && !f.keywords.every((k) => c.keywords.some((h) => lower(h) === lower(k)))) continue;
    if (!anyIn(f.timings, c.timings)) continue;
    if (!anyIn(f.effects, c.effects)) continue;
    if (f.hasTrigger !== undefined && Boolean(c.trigger) !== f.hasTrigger) continue;
    if (f.set && lower(setOf(c.id)) !== lower(f.set)) continue;
    if (leader && leader.type === "leader" && !legalUnder(catalog, leader, c)) continue;
    matches.push(c);
  }
  matches.sort((a, b) => (a.cost ?? -1) - (b.cost ?? -1) || a.id.localeCompare(b.id));
  const limit = Math.min(Math.max(f.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(f.offset ?? 0, 0);
  if (matches.length > offset + limit) notes.push(`Showing ${limit} of ${matches.length}; pass offset ${offset + limit} for more, or narrow the filter.`);
  return { total: matches.length, offset, cards: matches.slice(offset, offset + limit), notes };
}
