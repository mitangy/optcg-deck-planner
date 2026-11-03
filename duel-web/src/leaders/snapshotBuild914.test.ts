import { describe, expect, it } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import { FALLBACK_SNAPSHOT, fetchSnapshot, loadBuildSnapshot } from "./snapshotBuild";
import { MAX_SNAPSHOT_LEADERS, MIN_LEADER_DECKS, SAMPLE_DECKS, pickSnapshotLeaders, sitemapXml, snapshotPaths } from "./snapshot";
import type { MetaLeader } from "../decks/meta";

type Call = { url: string };

/** A fake API: the fixture leaders, and for each leader the fixture decks (or an error for ids in `broken`). */
function fakeApi(opts: { leadersFail?: boolean; broken?: string[]; leaders?: MetaLeader[] } = {}) {
  const calls: Call[] = [];
  const fetchFn = async (url: string) => {
    calls.push({ url });
    if (url.includes("/meta/leaders")) {
      if (opts.leadersFail) throw new Error("connect ECONNREFUSED");
      return { ok: true, status: 200, json: async () => ({ ...leadersFixture, leaders: opts.leaders ?? leadersFixture.leaders }) };
    }
    const id = new URL(url).searchParams.get("leader") ?? "";
    if (opts.broken?.includes(id)) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ ...decksFixture, leader_id: id }) };
  };
  return { fetchFn, calls };
}

describe("build-time meta snapshot (#914)", () => {
  it("keeps leaders with enough decks, most played first, and caps the list (#914)", () => {
    const make = (i: number, decks: number) => ({ ...(leadersFixture.leaders[0] as MetaLeader), leader_id: `OP01-${String(i).padStart(3, "0")}`, decks });
    const many = [make(1, MIN_LEADER_DECKS - 1), make(2, MIN_LEADER_DECKS), ...Array.from({ length: MAX_SNAPSHOT_LEADERS + 5 }, (_, i) => make(10 + i, 50 + i))];
    const picked = pickSnapshotLeaders(many);
    expect(picked).toHaveLength(MAX_SNAPSHOT_LEADERS);
    expect(picked.map((l) => l.leader_id)).not.toContain("OP01-001");
    expect(picked[0].decks).toBeGreaterThanOrEqual(picked[picked.length - 1].decks);
    expect(pickSnapshotLeaders([make(1, MIN_LEADER_DECKS - 1), make(2, MIN_LEADER_DECKS)]).map((l) => l.leader_id)).toEqual(["OP01-002"]);
  });

  it("asks for a few recent top-8 lists per leader and drops a leader whose lists cannot be read (#914)", async () => {
    const api = fakeApi({ broken: ["ST30-001"] });
    const snap = await fetchSnapshot({ fetchFn: api.fetchFn, api: "https://api.test" });
    const decksCall = api.calls.find((c) => c.url.includes("/meta/decks"));
    expect(decksCall?.url).toContain("top=8");
    expect(decksCall?.url).toContain(`limit=${SAMPLE_DECKS}`);
    expect(snap.leaders.map((l) => l.leader_id)).not.toContain("ST30-001");
    expect(snap.leaders.map((l) => l.leader_id)).toContain("OP17-039");
    expect(Object.keys(snap.decks).sort()).toEqual(snap.leaders.map((l) => l.leader_id).sort());
    expect(snap.decks["OP17-039"]).toHaveLength(SAMPLE_DECKS);
  });

  it("uses the committed snapshot instead of failing the build when the API is down (#914)", async () => {
    const logs: string[] = [];
    const { snapshot, source } = await loadBuildSnapshot({ fetchFn: fakeApi({ leadersFail: true }).fetchFn, log: (m) => logs.push(m) });
    expect(source).toBe("fallback");
    expect(snapshot).toBe(FALLBACK_SNAPSHOT);
    expect(snapshot.leaders.length).toBeGreaterThan(0);
    expect(logs.join("\n")).toContain("committed snapshot");
  });

  it("uses the committed snapshot when the API answers with an error or no usable lists (#914)", async () => {
    const err = async () => ({ ok: false, status: 503, json: async () => ({}) });
    expect((await loadBuildSnapshot({ fetchFn: err })).source).toBe("fallback");
    const allBroken = fakeApi({ broken: leadersFixture.leaders.map((l) => l.leader_id) });
    expect((await loadBuildSnapshot({ fetchFn: allBroken.fetchFn })).source).toBe("fallback");
  });

  it("takes the live data when the API answers (#914)", async () => {
    const { snapshot, source } = await loadBuildSnapshot({ fetchFn: fakeApi().fetchFn });
    expect(source).toBe("live");
    expect(snapshot.total_decks).toBe(leadersFixture.total_decks);
  });
});

describe("sitemap for the leader pages (#914)", () => {
  it("lists the index and one URL per leader under the site origin (#914)", () => {
    const leaders = [leadersFixture.leaders[0], leadersFixture.leaders[1]] as MetaLeader[];
    const paths = snapshotPaths({ leaders });
    expect(paths).toEqual(["/leaders", "/leaders/op17-039-rocks-d-xebec", "/leaders/st30-001-luffy-ace"]);
    const xml = sitemapXml("https://optcgduel.app/", [...paths, "/terms", "/leaders"]);
    expect(xml).toContain("<loc>https://optcgduel.app/leaders/op17-039-rocks-d-xebec</loc>");
    expect(xml).toContain("<loc>https://optcgduel.app/terms</loc>");
    expect(xml.match(/<loc>https:\/\/optcgduel\.app\/leaders<\/loc>/g)).toHaveLength(1);
  });
});
