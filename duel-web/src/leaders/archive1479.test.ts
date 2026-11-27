import { describe, expect, it } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import type { MetaDeck, MetaLeader } from "../decks/meta";
import { fetchSnapshot } from "./snapshotBuild";
import { ARCHIVE_DAYS, MAX_ARCHIVED_LEADERS, MIN_LEADER_DECKS, SAMPLE_DECKS, isSnapshot, snapshotPaths } from "./snapshot";

const base = leadersFixture.leaders[0] as MetaLeader;
const lead = (id: string, decks: number): MetaLeader => ({ ...base, leader_id: id, name: `Leader ${id}`, decks });
const deck = (n: number, date: string): MetaDeck => ({ ...(decksFixture.decks[0] as MetaDeck), id: n, date });

const CUR = lead("OP01-001", 30);
const CUR_TWO = lead("OP02-001", 12);
const ARCH_BIG = lead("OP03-001", 40);
const ARCH_SMALL = lead("OP04-001", 14);
const ARCH_TOO_FEW = lead("OP05-001", MIN_LEADER_DECKS - 1);
const ARCH_NO_DECKS = lead("OP06-001", 20);

type Opts = { fail180?: number; fail90?: boolean; longLeaders?: MetaLeader[]; dates?: Record<string, string[]> };

function api(o: Opts = {}) {
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const days = Number(u.searchParams.get("days"));
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    const bad = (status: number) => ({ ok: false, status, json: async () => ({}) });
    if (u.pathname === "/meta/leaders") {
      if (days === ARCHIVE_DAYS && o.fail180) return bad(o.fail180);
      if (days === 90 && o.fail90) return bad(500);
      const leaders = days === 30 ? [CUR, CUR_TWO] : (o.longLeaders ?? [CUR, CUR_TWO, ARCH_SMALL, ARCH_TOO_FEW, ARCH_NO_DECKS, ARCH_BIG]);
      return ok({ ...leadersFixture, days, leaders });
    }
    const id = u.searchParams.get("leader") ?? "";
    if (id === ARCH_NO_DECKS.leader_id) return ok({ ...decksFixture, leader_id: id, decks: [] });
    const dates = o.dates?.[id] ?? ["2026-09-01", "2026-10-15", "2026-10-02", "2026-08-01"];
    return ok({ ...decksFixture, leader_id: id, decks: dates.map((d, i) => deck(i + 1, d)) });
  };
  return { fetchFn, calls };
}

describe("archived leaders keep a page (#1479)", () => {
  it("archives leaders with enough decks in the long window that are not current, most played first (#1479)", async () => {
    const a = api();
    const snap = await fetchSnapshot({ fetchFn: a.fetchFn, api: "https://api.test" });
    expect(snap.leaders.map((l) => l.leader_id)).toEqual(["OP01-001", "OP02-001"]);
    expect(snap.archived?.map((x) => x.leader.leader_id)).toEqual(["OP03-001", "OP04-001"]);
    expect(snap.archiveDays).toBe(ARCHIVE_DAYS);
    const archiveCall = a.calls.find((u) => u.includes("/meta/decks") && u.includes("leader=OP03-001"));
    expect(archiveCall).toContain(`days=${ARCHIVE_DAYS}`);
    expect(Object.keys(snap.decks).sort()).toEqual(["OP01-001", "OP02-001", "OP03-001", "OP04-001"]);
  });

  it("caps the archive and keeps the most played (#1479)", async () => {
    const many = Array.from({ length: MAX_ARCHIVED_LEADERS + 6 }, (_, i) => lead(`OP10-${String(i + 1).padStart(3, "0")}`, 100 - i)).reverse();
    const snap = await fetchSnapshot({ fetchFn: api({ longLeaders: [CUR, ...many] }).fetchFn });
    expect(snap.archived).toHaveLength(MAX_ARCHIVED_LEADERS);
    expect(snap.archived?.[0].leader.leader_id).toBe("OP10-001");
    expect(snap.archived?.map((x) => x.leader.leader_id)).not.toContain(`OP10-${String(MAX_ARCHIVED_LEADERS + 6).padStart(3, "0")}`);
  });

  it("last seen is the newest deck date and the lists shown are the newest ones (#1479)", async () => {
    const snap = await fetchSnapshot({ fetchFn: api().fetchFn });
    const big = snap.archived?.find((x) => x.leader.leader_id === "OP03-001");
    expect(big?.lastSeen).toBe("2026-10-15");
    expect(snap.decks["OP03-001"]).toHaveLength(SAMPLE_DECKS);
    expect(snap.decks["OP03-001"].map((d) => d.date)).toEqual(["2026-10-15", "2026-10-02", "2026-09-01"]);
  });

  it("a failed 180-day call is retried at 90 days and the archive is built from that (#1479)", async () => {
    const a = api({ fail180: 422 });
    const logs: string[] = [];
    const snap = await fetchSnapshot({ fetchFn: a.fetchFn, log: (m) => logs.push(m) });
    expect(snap.archived?.map((x) => x.leader.leader_id)).toEqual(["OP03-001", "OP04-001"]);
    expect(snap.archiveDays).toBe(90);
    expect(a.calls.find((u) => u.includes("leader=OP03-001"))).toContain("days=90");
    expect(logs.join("\n")).toContain("422");
  });

  it("when both long windows fail the current snapshot is still built, with no archive (#1479)", async () => {
    const snap = await fetchSnapshot({ fetchFn: api({ fail180: 422, fail90: true }).fetchFn });
    expect(snap.leaders.map((l) => l.leader_id)).toEqual(["OP01-001", "OP02-001"]);
    expect(snap.archived).toBeUndefined();
    expect(Object.keys(snap.decks).sort()).toEqual(["OP01-001", "OP02-001"]);
  });

  it("the sitemap lists archived leader pages and an old snapshot file is still valid (#1479)", async () => {
    const snap = await fetchSnapshot({ fetchFn: api().fetchFn });
    const paths = snapshotPaths(snap);
    expect(paths).toContain("/leaders/op03-001-leader-op03-001");
    expect(paths).toContain("/leaders/op01-001-leader-op01-001");
    const { archived: _a, archiveDays: _d, ...old } = snap;
    expect(isSnapshot(old)).toBe(true);
    expect(snapshotPaths(old)).toEqual(["/leaders", "/leaders/op01-001-leader-op01-001", "/leaders/op02-001-leader-op02-001"]);
  });
});

describe("archived leader pages show the newest lists, not the best placings (#1493)", () => {
  // A backend that cuts the decklist at `limit` after sorting, like the real one: by placing by default, newest first for order=recent.
  const POOL_DATES = Array.from({ length: 50 }, (_, i) => `2026-0${(i % 9) + 1}-1${i % 9}`);
  const NEWEST = "2026-11-20";
  function backend() {
    const calls: string[] = [];
    const fetchFn = async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (u.pathname === "/meta/leaders") return ok({ ...leadersFixture, days: 180, leaders: u.searchParams.get("days") === "30" ? [CUR] : [CUR, ARCH_BIG] });
      const id = u.searchParams.get("leader") ?? "";
      // 50 top-8s, the weakest placing is the newest; placing order puts it last
      const pool = [...POOL_DATES.map((d, i) => ({ ...deck(i + 1, d), placing: 1 + (i % 7) })), { ...deck(99, NEWEST), placing: 8 }];
      const byPlacing = [...pool].sort((a, b) => (a.placing ?? 99) - (b.placing ?? 99));
      const byRecent = [...pool].sort((a, b) => b.date.localeCompare(a.date) || (a.placing ?? 99) - (b.placing ?? 99));
      const sorted = u.searchParams.get("order") === "recent" ? byRecent : byPlacing;
      return ok({ ...decksFixture, leader_id: id, decks: sorted.slice(0, Number(u.searchParams.get("limit"))) });
    };
    return { fetchFn, calls };
  }

  it("asks the backend for the most recent results so a leader with more top-8s than the limit keeps its newest list (#1493)", async () => {
    const b = backend();
    const snap = await fetchSnapshot({ fetchFn: b.fetchFn, api: "https://api.test" });
    const call = b.calls.find((u) => u.includes("/meta/decks") && u.includes("leader=OP03-001"));
    expect(new URL(call ?? "https://x").searchParams.get("order")).toBe("recent");
    const big = snap.archived?.find((x) => x.leader.leader_id === "OP03-001");
    expect(big?.lastSeen).toBe(NEWEST);
    expect(snap.decks["OP03-001"][0].date).toBe(NEWEST);
  });
});
