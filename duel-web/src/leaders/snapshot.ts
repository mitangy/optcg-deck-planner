/**
 * The build-time meta snapshot (#914): the popular leaders and a few recent top decklists of each,
 * taken from the public /meta API when the site is built. It is pre-rendered into the leader pages,
 * shipped as `/meta-snapshot.json`, and shown instantly by the browser before the live API answers.
 */
import type { MetaDeck, MetaLeader } from "../decks/meta";
import { leaderPath } from "./slug";

/** The window the snapshot (and the pages built from it) covers. */
export const SNAPSHOT_DAYS = 30;
/** A leader with fewer tournament decks than this gets no page of its own: too little to say. */
export const MIN_LEADER_DECKS = 6;
export const MAX_SNAPSHOT_LEADERS = 30;
/** Recent top-8 lists kept per leader. */
export const SAMPLE_DECKS = 3;

export type MetaSnapshot = {
  version: 1;
  /** ISO time the data was fetched. */
  generatedAt: string;
  days: number;
  events: number;
  total_decks: number;
  source: string;
  source_url: string;
  leaders: MetaLeader[];
  /** Sample decklists by upper-case leader id. */
  decks: Record<string, MetaDeck[]>;
};

/** The leaders that get a page: enough decks to say something, most played first, capped. */
export function pickSnapshotLeaders(leaders: readonly MetaLeader[]): MetaLeader[] {
  return leaders
    .filter((l) => l.decks >= MIN_LEADER_DECKS)
    .sort((a, b) => b.decks - a.decks)
    .slice(0, MAX_SNAPSHOT_LEADERS);
}

/** Every path the snapshot adds to the site: the index and one page per leader. */
export function snapshotPaths(snap: Pick<MetaSnapshot, "leaders">): string[] {
  return ["/leaders", ...snap.leaders.map(leaderPath)];
}

/** The XML of sitemap.xml for the given paths. */
export function sitemapXml(origin: string, paths: readonly string[]): string {
  const base = origin.replace(/\/+$/, "");
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${base}${p === "/" ? "/" : p}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** The snapshot with sample decks for just one leader (or none), so a page does not embed every list. */
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
