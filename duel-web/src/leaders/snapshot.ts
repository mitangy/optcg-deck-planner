import type { MetaDeck, MetaLeader } from "../decks/meta";
import { leaderPath } from "./slug";

export const SNAPSHOT_DAYS = 30;
export const MIN_LEADER_DECKS = 6;
export const MAX_SNAPSHOT_LEADERS = 30;
export const SAMPLE_DECKS = 3;
/** The longer window that keeps a leader's page alive after it leaves the current top (#1479). */
export const ARCHIVE_DAYS = 180;
export const MAX_ARCHIVED_LEADERS = 40;
/** Decks asked per archived leader: the API orders by placing, so ask for more than we show and pick the newest. */
export const ARCHIVE_FETCH_DECKS = 40;
export const ARCHIVE_TOP_PLACINGS = 8;

export type ArchivedLeader = {
  /** Stats over `archiveDays`, not the 30-day window. */
  leader: MetaLeader;
  /** YYYY-MM-DD of the newest deck we have for it. */
  lastSeen: string;
};

export type MetaSnapshot = {
  version: 1;
  generatedAt: string;
  days: number;
  events: number;
  total_decks: number;
  source: string;
  source_url: string;
  leaders: MetaLeader[];
  /** Decks of the current leaders and of the archived ones, keyed by upper-case leader id. */
  decks: Record<string, MetaDeck[]>;
  /** Leaders that fell out of the current pick but had play in the longer window (#1479). Absent in older files. */
  archived?: ArchivedLeader[];
  archiveDays?: number;
};

export function pickSnapshotLeaders(leaders: readonly MetaLeader[]): MetaLeader[] {
  return leaders
    .filter((l) => l.decks >= MIN_LEADER_DECKS)
    .sort((a, b) => b.decks - a.decks)
    .slice(0, MAX_SNAPSHOT_LEADERS);
}

/** Leaders in the long window that are not already current, most played first, capped (#1479). */
export function pickArchivedLeaders(window: readonly MetaLeader[], current: readonly MetaLeader[]): MetaLeader[] {
  const live = new Set(current.map((l) => l.leader_id.toUpperCase()));
  return window
    .filter((l) => l.decks >= MIN_LEADER_DECKS && !live.has(l.leader_id.toUpperCase()))
    .sort((x, y) => y.decks - x.decks)
    .slice(0, MAX_ARCHIVED_LEADERS);
}

/** The newest `date` among the decks ("YYYY-MM-DD"), or null when none has one. */
export function newestDeckDate(decks: readonly MetaDeck[]): string | null {
  let best: string | null = null;
  for (const d of decks) if (d.date && (best === null || d.date.slice(0, 10) > best)) best = d.date.slice(0, 10);
  return best;
}

export function snapshotPaths(snap: Pick<MetaSnapshot, "leaders" | "archived">): string[] {
  return ["/leaders", ...snap.leaders.map(leaderPath), ...(snap.archived ?? []).map((a) => leaderPath(a.leader))];
}

export function sitemapXml(origin: string, paths: readonly string[]): string {
  const base = origin.replace(/\/+$/, "");
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${base}${p === "/" ? "/" : p}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function snapshotFor(snap: MetaSnapshot, leaderId: string | null): MetaSnapshot {
  const key = leaderId?.toUpperCase();
  return { ...snap, decks: key && snap.decks[key] ? { [key]: snap.decks[key] } : {} };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-03T05:00:00Z" → "Nov 3, 2026" (the UTC date, so every viewer reads the same one). */
export function formatUpdated(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}, ${m[1]}` : iso;
}

export function isSnapshot(value: unknown): value is MetaSnapshot {
  const v = value as Partial<MetaSnapshot> | null;
  return Boolean(v && v.version === 1 && Array.isArray(v.leaders) && v.decks && typeof v.decks === "object" && typeof v.generatedAt === "string");
}
