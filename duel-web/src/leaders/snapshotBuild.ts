/** Build-time only (the pre-render entry imports this, the browser bundle does not): fetch the snapshot, or fall back to the committed one. */
import type { MetaDecksResponse, MetaLeadersResponse } from "../decks/meta";
import fallbackJson from "./metaSnapshot.fallback.json";
import { isSnapshot, pickSnapshotLeaders, SAMPLE_DECKS, SNAPSHOT_DAYS, type MetaSnapshot } from "./snapshot";

/** The public API the site reads at run time too. Override with META_API_URL for a local backend. */
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

/** Reads /meta/leaders and the recent top-8 lists of each popular leader. Throws when the leaders cannot be read. */
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
  // A leader with no list to show has nothing to say on its own page.
  const leaders = picked.filter((l) => decks[l.leader_id.toUpperCase()]);
  if (leaders.length === 0) throw new Error("no leader had a decklist");
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    days: lead.days ?? SNAPSHOT_DAYS,
    events: lead.events,
    total_decks: lead.total_decks,
    source: lead.source,
    source_url: lead.source_url,
    leaders,
    decks,
  };
}

/** Refresh after a build that reached the API: `cp dist/meta-snapshot.json src/leaders/metaSnapshot.fallback.json`. */
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
