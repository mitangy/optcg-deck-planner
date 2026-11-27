import { createContext, useContext, useEffect, useState } from "react";
import { fetchMetaDecks, fetchMetaLeaders, type MetaDeck, type MetaLeader } from "../decks/meta";
import { ARCHIVE_DAYS, isSnapshot, pickSnapshotLeaders, SAMPLE_DECKS, SNAPSHOT_DAYS, type ArchivedLeader, type MetaSnapshot } from "./snapshot";

export const SnapshotContext = createContext<MetaSnapshot | null>(null);

export const EMBEDDED_SNAPSHOT_ID = "meta-snapshot";

export function readEmbeddedSnapshot(): MetaSnapshot | null {
  if (typeof document === "undefined") return null;
  try {
    const raw = document.getElementById(EMBEDDED_SNAPSHOT_ID)?.textContent;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let staticSnapshot: Promise<MetaSnapshot | null> | null = null;

export function fetchStaticSnapshot(): Promise<MetaSnapshot | null> {
  staticSnapshot ??= fetch("/meta-snapshot.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j: unknown) => (isSnapshot(j) ? j : null))
    .catch(() => null);
  return staticSnapshot;
}

export type MetaView = {
  leaders: MetaLeader[];
  /**
   * `leaders` plus any snapshot leader the live list dropped, so a pre-rendered leader page does not
   * turn into "not found" when its leader falls out of the live top 30. Only for resolving a page's route.
   */
  routeLeaders: MetaLeader[];
  /** Leaders that left the current top but keep a page, minus any that are current again (#1479). */
  archived: ArchivedLeader[];
  /** Set when the page's own leader is one of `archived`. */
  archivedEntry: ArchivedLeader | null;
  archiveDays: number;
  decks: MetaDeck[] | null;
  days: number;
  events: number | null;
  totalDecks: number | null;
  source: string;
  sourceUrl: string;
  updatedAt: string | null;
  settled: boolean;
};

const EMPTY_SOURCE = { source: "Limitless TCG", sourceUrl: "https://play.limitlesstcg.com/tournaments/completed?game=OP" };

export function useMetaView(leaderId: string | null): MetaView {
  const fromServer = useContext(SnapshotContext);
  const [base, setBase] = useState<MetaSnapshot | null>(() => fromServer ?? readEmbeddedSnapshot());
  const [live, setLive] = useState<{ leaders: MetaLeader[]; events: number; totalDecks: number; days: number; at: string } | null>(null);
  const [liveDecks, setLiveDecks] = useState<Record<string, MetaDeck[]>>({});
  const [liveFailed, setLiveFailed] = useState(false);
  const key = leaderId?.toUpperCase() ?? null;

  const needsStatic = base === null || (key !== null && !base.decks[key]);
  useEffect(() => {
    if (!needsStatic) return;
    let on = true;
    void fetchStaticSnapshot().then((s) => on && s && setBase(s));
    return () => {
      on = false;
    };
  }, [needsStatic]);

  useEffect(() => {
    let on = true;
    fetchMetaLeaders(SNAPSHOT_DAYS)
      .then((r) => on && setLive({ leaders: pickSnapshotLeaders(r.leaders), events: r.events, totalDecks: r.total_decks, days: r.days, at: new Date().toISOString() }))
      .catch(() => on && setLiveFailed(true));
    return () => {
      on = false;
    };
  }, []);

  useEffect(() => {
    if (!key) return;
    let on = true;
    fetchMetaDecks(key, SNAPSHOT_DAYS, true, undefined, SAMPLE_DECKS)
      .then((r) => on && r.decks.length > 0 && setLiveDecks((d) => ({ ...d, [key]: r.decks })))
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [key]);

  const leaders = live?.leaders ?? base?.leaders ?? [];
  const currentIds = new Set(leaders.map((l) => l.leader_id.toUpperCase()));
  const archived = (base?.archived ?? []).filter((a) => !currentIds.has(a.leader.leader_id.toUpperCase()));
  const archivedEntry = key ? (archived.find((a) => a.leader.leader_id.toUpperCase() === key) ?? null) : null;
  const known = live ? [...leaders, ...(base?.leaders ?? []).filter((b) => !leaders.some((l) => l.leader_id === b.leader_id))] : leaders;
  const routeLeaders = [...known, ...archived.map((a) => a.leader).filter((a) => !known.some((l) => l.leader_id === a.leader_id))];
  return {
    leaders,
    routeLeaders,
    archived,
    archivedEntry,
    archiveDays: base?.archiveDays ?? ARCHIVE_DAYS,
    decks: key ? (liveDecks[key] ?? base?.decks[key] ?? null) : null,
    days: live?.days ?? base?.days ?? SNAPSHOT_DAYS,
    events: live?.events ?? base?.events ?? null,
    totalDecks: live?.totalDecks ?? base?.total_decks ?? null,
    source: base?.source || EMPTY_SOURCE.source,
    sourceUrl: base?.source_url || EMPTY_SOURCE.sourceUrl,
    updatedAt: live?.at ?? base?.generatedAt ?? null,
    settled: base !== null || live !== null || liveFailed,
  };
}
