import { describe, expect, it } from "vitest";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import type { MetaDeck, MetaLeader } from "../decks/meta";
import type { MetaSnapshot } from "../leaders/snapshot";
import { prerender } from "./entry";

const TEMPLATE = `<!doctype html><html lang="en"><head>
<title>OPTCG Duel</title>
<meta name="description" content="home" />
<link rel="canonical" href="https://optcgduel.app/" />
<meta property="og:title" content="home" />
<meta property="og:image" content="https://optcgduel.app/og-image.png" />
</head><body><div id="root"></div></body></html>`;

const [current, dropped] = leadersFixture.leaders.slice(0, 2) as MetaLeader[];
const decks = decksFixture.decks.slice(0, 3) as MetaDeck[];
const SNAPSHOT: MetaSnapshot = {
  version: 1,
  generatedAt: "2026-11-26T05:00:00.000Z",
  days: 30,
  events: leadersFixture.events,
  total_decks: leadersFixture.total_decks,
  source: leadersFixture.source,
  source_url: leadersFixture.source_url,
  leaders: [current],
  decks: { [current.leader_id]: decks, [dropped.leader_id]: decks },
  archived: [{ leader: dropped, lastSeen: "2026-10-15" }],
  archiveDays: 180,
};

const rootOf = (html: string) => html.slice(html.indexOf('<div id="root"'), html.indexOf("</div><script")).replace(/<!-- -->/g, "");

describe("pre-rendered archived leader pages (#1479)", async () => {
  const out = await prerender({ template: TEMPLATE, snapshot: SNAPSHOT, log: () => undefined });
  const byFile = new Map(out.map((f) => [f.file, f.content]));
  const file = "leaders/st30-001-luffy-ace/index.html";

  it("an archived leader gets an indexable page saying when it was last seen and where the lists come from (#1479)", () => {
    const html = byFile.get(file) ?? "";
    expect(html).not.toBe("");
    expect(html).not.toContain("noindex");
    expect(html).toContain('rel="canonical" href="https://optcgduel.app/leaders/st30-001-luffy-ace"');
    expect(html).toContain("last seen in the meta on Oct 15, 2026");
    const root = rootOf(html);
    expect(root).toContain("Last seen in the meta on Oct 15, 2026.");
    expect(root).toMatch(/last 180 days, from <a[^>]*>Limitless TCG<\/a>/);
    expect(root).toContain("It is no longer among the most played leaders");
    expect(root).not.toContain("most played of the");
    expect(root).toContain("Play this deck online");
    expect(root).not.toContain("no recent tournament data");
  });

  it("a current leader's page has no last-seen note (#1479)", () => {
    const root = rootOf(byFile.get("leaders/op17-039-rocks-d-xebec/index.html") ?? "");
    expect(root).not.toContain("Last seen in the meta");
    expect(root).toContain("last 30 days");
  });

  it("the sitemap lists the archived page and the leaders index links it with its date (#1479)", () => {
    expect(byFile.get("sitemap.xml")).toContain("<loc>https://optcgduel.app/leaders/st30-001-luffy-ace</loc>");
    const index = rootOf(byFile.get("leaders/index.html") ?? "");
    expect(index).toContain("Recently in the meta");
    expect(index).toMatch(/href="\/leaders\/st30-001-luffy-ace"/);
    expect(index).toContain("Oct 15, 2026");
  });
});
