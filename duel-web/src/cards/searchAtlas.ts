import {
  listAtlasIds,
  lookupCard,
  type CardAtlasEntry,
} from "./atlas";

export type CardSearchFilters = {
  query?: string;
  colors?: string[];
  types?: string[];
  attributes?: string[];
  counter?: number | null;
  counterNone?: boolean;
  costMin?: number | null;
  costMax?: number | null;
  powerMin?: number | null;
  powerMax?: number | null;
  blocker?: boolean | null;
  rush?: boolean | null;
  excludeLeaders?: boolean;
};

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function matchesQuery(entry: CardAtlasEntry, q: string): boolean {
  if (!q) return true;
  const hay = [entry.id, entry.name, entry.effectText ?? ""].join(" ").toLowerCase();
  return hay.includes(q);
}

export function listAtlasEntries(): CardAtlasEntry[] {
  return listAtlasIds().map((id) => lookupCard(id));
}

export function listAtlasColors(): string[] {
  const set = new Set<string>();
  for (const e of listAtlasEntries()) {
    for (const c of e.colors ?? []) set.add(c);
  }
  return [...set].sort();
}

export function listAtlasTypes(): string[] {
  const set = new Set<string>();
  for (const e of listAtlasEntries()) {
    if (e.type) set.add(e.type);
  }
  return [...set].sort();
}

export function listAtlasAttributes(): string[] {
  const set = new Set<string>();
  for (const e of listAtlasEntries()) {
    if (e.attribute) set.add(e.attribute);
  }
  return [...set].sort();
}

export function listAtlasCounters(): number[] {
  const set = new Set<number>();
  for (const e of listAtlasEntries()) {
    if (typeof e.counter === "number") set.add(e.counter);
  }
  return [...set].sort((a, b) => a - b);
}

export function searchAtlas(filters: CardSearchFilters = {}): CardAtlasEntry[] {
  const q = norm(filters.query ?? "");
  const colors = (filters.colors ?? []).map(norm).filter(Boolean);
  const types = (filters.types ?? []).map(norm).filter(Boolean);
  const attributes = (filters.attributes ?? []).map(norm).filter(Boolean);

  return listAtlasEntries()
    .filter((entry) => {
      if (filters.excludeLeaders && entry.type === "leader") return false;
      if (!matchesQuery(entry, q)) return false;
      if (colors.length && !entry.colors.some((c) => colors.includes(norm(c)))) {
        return false;
      }
      if (types.length && !types.includes(norm(entry.type))) return false;
      if (attributes.length) {
        const attr = entry.attribute ? norm(entry.attribute) : "";
        if (!attr || !attributes.includes(attr)) return false;
      }
      if (filters.counterNone) {
        if (entry.counter != null) return false;
      } else if (filters.counter != null && filters.counter !== undefined) {
        if (entry.counter !== filters.counter) return false;
      }
      if (filters.costMin != null && entry.cost < filters.costMin) return false;
      if (filters.costMax != null && entry.cost > filters.costMax) return false;
      if (filters.powerMin != null) {
        if (entry.power == null || entry.power < filters.powerMin) return false;
      }
      if (filters.powerMax != null) {
        if (entry.power == null || entry.power > filters.powerMax) return false;
      }
      if (filters.blocker === true && !entry.blocker) return false;
      if (filters.blocker === false && entry.blocker) return false;
      if (filters.rush === true && !entry.rush) return false;
      if (filters.rush === false && entry.rush) return false;
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function hasActiveCardSearch(filters: CardSearchFilters = {}): boolean {
  if ((filters.query ?? "").trim().length > 0) return true;
  if ((filters.colors ?? []).length > 0) return true;
  if ((filters.types ?? []).length > 0) return true;
  if ((filters.attributes ?? []).length > 0) return true;
  if (filters.counterNone) return true;
  if (filters.counter != null && filters.counter !== undefined) return true;
  if (filters.costMin != null) return true;
  if (filters.costMax != null) return true;
  if (filters.powerMin != null) return true;
  if (filters.powerMax != null) return true;
  if (filters.blocker === true || filters.blocker === false) return true;
  if (filters.rush === true || filters.rush === false) return true;
  return false;
}
