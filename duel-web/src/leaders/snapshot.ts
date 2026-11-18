import type { MetaDeck, MetaLeader } from "../decks/meta";
import { leaderPath } from "./slug";

export const SNAPSHOT_DAYS = 30;
export const MIN_LEADER_DECKS = 6;
export const MAX_SNAPSHOT_LEADERS = 30;
export const SAMPLE_DECKS = 3;

export type MetaSnapshot = {
  version: 1;
  generatedAt: string;
  days: number;
  events: number;
  total_decks: number;
  source: string;
  source_url: string;
  leaders: MetaLeader[];
  decks: Record<string, MetaDeck[]>;
};

export function pickSnapshotLeaders(leaders: readonly MetaLeader[]): MetaLeader[] {
  return leaders
    .filter((l) => l.decks >= MIN_LEADER_DECKS)
    .sort((a, b) => b.decks - a.decks)
    .slice(0, MAX_SNAPSHOT_LEADERS);
}

export function snapshotPaths(snap: Pick<MetaSnapshot, "leaders">): string[] {
  return ["/leaders", ...snap.leaders.map(leaderPath)];
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
