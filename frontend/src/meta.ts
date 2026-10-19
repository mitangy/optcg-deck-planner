import type { MetaDeck, MetaDeckCard } from "./api";

/** Longest deck name POST /decks accepts. */
export const DECK_NAME_MAX = 200;

export const META_DAY_OPTIONS = [7, 14, 30] as const;
export const META_DEFAULT_DAYS = 30;

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "Silvers Rayleigh – 1st Weekly Cup"; without a placing, "Silvers Rayleigh – Weekly Cup". */
export function metaDeckName(
  leaderName: string,
  leaderId: string,
  deck: Pick<MetaDeck, "placing" | "event">,
): string {
  const leader = leaderName.trim() || leaderId;
  const place = deck.placing ? `${ordinal(deck.placing)} ` : "";
  return `${leader} – ${place}${deck.event.trim()}`.trim().slice(0, DECK_NAME_MAX).trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-28" -> "Sep 28". Parsed by hand so the viewer's time zone cannot shift the day. */
export function formatMetaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : iso;
}

/** "1st of 128 · Sep 28 · 7-0-0" */
export function formatDeckRow(deck: Pick<MetaDeck, "placing" | "players" | "date" | "record">): string {
  const { wins, losses, ties } = deck.record;
  const place = deck.placing ? `${ordinal(deck.placing)} of ${deck.players}` : `${deck.players} players`;
  return `${place} · ${formatMetaDate(deck.date)} · ${wins}-${losses}-${ties}`;
}

/** 0.081 -> "8.1%"; missing -> "–". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  return `${(value * 100).toFixed(1)}%`;
}

export type CostGroup = { label: string; cards: MetaDeckCard[] };

/** Group a decklist by cost (cheapest first). Cards without a numeric cost land last under "Other". */
export function groupCardsByCost(cards: MetaDeckCard[]): CostGroup[] {
  const byCost = new Map<number, MetaDeckCard[]>();
  const other: MetaDeckCard[] = [];
  for (const card of cards) {
    const cost = card.cost.trim() === "" ? NaN : Number(card.cost);
    if (Number.isNaN(cost)) {
      other.push(card);
      continue;
    }
    const list = byCost.get(cost) ?? [];
    list.push(card);
    byCost.set(cost, list);
  }
  const groups = [...byCost.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([cost, list]) => ({ label: `Cost ${cost}`, cards: list }));
  if (other.length) groups.push({ label: "Other", cards: other });
  return groups;
}

export type CreateMetaDeckDeps = {
  createDeck: (name: string, decklist: string) => Promise<{ id: number }>;
  onCreated: () => Promise<unknown> | unknown;
  navigate: (path: string) => void;
};

/** Create a planner deck from a tournament list, then open it. Posts the deck's `text` untouched. */
export async function createMetaDeck(
  leader: { id: string; name: string },
  deck: Pick<MetaDeck, "placing" | "event" | "text">,
  deps: CreateMetaDeckDeps,
): Promise<number> {
  const created = await deps.createDeck(metaDeckName(leader.name, leader.id, deck), deck.text);
  await deps.onCreated();
  deps.navigate(`/decks/${created.id}`);
  return created.id;
}
