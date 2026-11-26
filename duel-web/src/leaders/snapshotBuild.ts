import type { MetaDecksResponse, MetaLeader, MetaLeadersResponse } from "../decks/meta";
import fallbackJson from "./metaSnapshot.fallback.json";
import {
  ARCHIVE_DAYS,
  ARCHIVE_FETCH_DECKS,
  ARCHIVE_TOP_PLACINGS,
  isSnapshot,
  newestDeckDate,
  pickArchivedLeaders,
  pickSnapshotLeaders,
  SAMPLE_DECKS,
  SNAPSHOT_DAYS,
  type ArchivedLeader,
  type MetaSnapshot,
} from "./snapshot";

export const DEFAULT_META_API = "https://optcg-api-nutb.onrender.com";

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type SnapshotOptions = {
  fetchFn?: FetchLike;
  api?: string;
  /** Per request. The API sleeps on the free tier, so the first one can take a while. */
  timeoutMs?: number;
  log?: (msg: string) => void;
};

async function getJson<T>(fetchFn: FetchLike, url: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Leaders that left the current pick but had play in the long window (#1479). Never throws: a failed
 * long-window call is retried once with 90 days (the backend caps older deploys there), then gives up.
 */
async function fetchArchive(
  fetchFn: FetchLike,
  api: string,
  timeoutMs: number,
  current: readonly MetaLeader[],
  log: (msg: string) => void,
): Promise<{ archived: ArchivedLeader[]; decks: MetaSnapshot["decks"]; days: number }> {
  let days = ARCHIVE_DAYS;
  let window: MetaLeadersResponse | null = null;
  for (const tryDays of [ARCHIVE_DAYS, 90]) {
    try {
      const res = await getJson<MetaLeadersResponse>(fetchFn, `${api}/meta/leaders?days=${tryDays}`, timeoutMs);
      if (!res || !Array.isArray(res.leaders)) throw new Error("no leaders list");
      window = res;
      days = tryDays;
      break;
    } catch (e) {
      log(`archive: ${tryDays}-day leaders unavailable (${e instanceof Error ? e.message : e})`);
    }
  }
  if (!window) return { archived: [], decks: {}, days };
  const picked = pickArchivedLeaders(window.leaders, current);
  const decks: MetaSnapshot["decks"] = {};
  const found = await Promise.all(
    picked.map(async (l): Promise<ArchivedLeader | null> => {
      const q = new URLSearchParams({ leader: l.leader_id, days: String(days), top: String(ARCHIVE_TOP_PLACINGS), limit: String(ARCHIVE_FETCH_DECKS) });
      try {
        const res = await getJson<MetaDecksResponse>(fetchFn, `${api}/meta/decks?${q}`, timeoutMs);
        const lastSeen = Array.isArray(res.decks) ? newestDeckDate(res.decks) : null;
        if (!lastSeen) return null;
        const newest = [...res.decks].sort((a, b) => b.date.localeCompare(a.date) || (a.placing ?? 99) - (b.placing ?? 99));
        decks[l.leader_id.toUpperCase()] = newest.slice(0, SAMPLE_DECKS);
        return { leader: l, lastSeen };
      } catch (e) {
        log(`archive: no decklists for ${l.leader_id}: ${e instanceof Error ? e.message : e}`);
        return null;
      }
    }),
  );
  const archived = found.filter((a): a is ArchivedLeader => a !== null);
  log(`archive: ${archived.length} leaders from the last ${days} days`);
  return { archived, decks, days };
}

export async function fetchSnapshot(opts: SnapshotOptions = {}): Promise<MetaSnapshot> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchLike);
  const api = (opts.api ?? DEFAULT_META_API).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const lead = await getJson<MetaLeadersResponse>(fetchFn, `${api}/meta/leaders?days=${SNAPSHOT_DAYS}`, timeoutMs);
  if (!lead || !Array.isArray(lead.leaders)) throw new Error("/meta/leaders returned no leaders list");
  const picked = pickSnapshotLeaders(lead.leaders);
  const decks: MetaSnapshot["decks"] = {};
  await Promise.all(
    picked.map(async (l) => {
      const q = new URLSearchParams({ leader: l.leader_id, days: String(SNAPSHOT_DAYS), top: "8", limit: String(SAMPLE_DECKS) });
      try {
        const res = await getJson<MetaDecksResponse>(fetchFn, `${api}/meta/decks?${q}`, timeoutMs);
        if (Array.isArray(res.decks) && res.decks.length > 0) decks[l.leader_id.toUpperCase()] = res.decks.slice(0, SAMPLE_DECKS);
      } catch (e) {
        opts.log?.(`no decklists for ${l.leader_id}: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
  const leaders = picked.filter((l) => decks[l.leader_id.toUpperCase()]);
  if (leaders.length === 0) throw new Error("no leader had a decklist");
  const archive = await fetchArchive(fetchFn, api, timeoutMs, leaders, opts.log ?? (() => undefined)).catch((e) => {
    opts.log?.(`archive skipped: ${e instanceof Error ? e.message : e}`);
    return null;
  });
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    days: lead.days ?? SNAPSHOT_DAYS,
    events: lead.events,
    total_decks: lead.total_decks,
    source: lead.source,
    source_url: lead.source_url,
    leaders,
    decks: { ...(archive?.decks ?? {}), ...decks },
    ...(archive && archive.archived.length > 0 ? { archived: archive.archived, archiveDays: archive.days } : {}),
  };
}

export const FALLBACK_SNAPSHOT: MetaSnapshot = fallbackJson as unknown as MetaSnapshot;

/** The live snapshot, or the committed one when the API cannot be reached: a build never fails over the meta. */
export async function loadBuildSnapshot(opts: SnapshotOptions = {}): Promise<{ snapshot: MetaSnapshot; source: "live" | "fallback" }> {
  try {
    return { snapshot: await fetchSnapshot(opts), source: "live" };
  } catch (e) {
    opts.log?.(`meta API unavailable (${e instanceof Error ? e.message : e}); using the committed snapshot from ${FALLBACK_SNAPSHOT.generatedAt}`);
    if (!isSnapshot(FALLBACK_SNAPSHOT)) throw new Error("the committed meta snapshot is not valid");
    return { snapshot: FALLBACK_SNAPSHOT, source: "fallback" };
  }
}
