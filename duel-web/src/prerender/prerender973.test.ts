import { describe, expect, it } from "vitest";
import { resolveRequest } from "../../../scripts/seo/vercel-routes.mjs";
import leadersFixture from "../decks/metaLeaders.fixture.json";
import decksFixture from "../decks/metaDecks.fixture.json";
import type { MetaDeck, MetaLeader } from "../decks/meta";
import type { MetaSnapshot } from "../leaders/snapshot";
import { fileForPath, prerender } from "./entry";
import vercel from "../../vercel.json";

const TEMPLATE = `<!doctype html><html lang="en"><head>
<title>OPTCG Duel – free unofficial One Piece TCG simulator</title>
<meta name="description" content="home" />
<link rel="canonical" href="https://optcgduel.app/" />
<script type="module" src="/assets/index-abc.js"></script>
</head><body><div id="root"></div></body></html>`;

const leaders = leadersFixture.leaders.slice(0, 2) as MetaLeader[];
const SNAPSHOT: MetaSnapshot = {
  version: 1,
  generatedAt: "2026-11-03T05:00:00.000Z",
  days: 30,
  events: leadersFixture.events,
  total_decks: leadersFixture.total_decks,
  source: leadersFixture.source,
  source_url: leadersFixture.source_url,
  leaders,
  decks: Object.fromEntries(leaders.map((l) => [l.leader_id, decksFixture.decks as MetaDeck[]])),
};

const rootOf = (html: string) => html.slice(html.indexOf('<div id="root"'), html.indexOf("</div><script")).replace(/<!-- -->/g, "");
const headOf = (html: string) => html.slice(0, html.indexOf("</head>"));
const canonicalOf = (html: string) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

const PAGES = [
  { path: "/optcg-sim-online", h1: "OPTCG sim online: play the One Piece TCG in your browser" },
  { path: "/play-optcg-on-phone", h1: "Play the One Piece TCG on your phone" },
] as const;

describe("OPTCG sim online and play on phone landing pages (#973)", async () => {
  const out = await prerender({ template: TEMPLATE, snapshot: SNAPSHOT, log: () => undefined });
  const byFile = new Map(out.map((f) => [f.file, f.content]));

  it.each(PAGES)("$path is prerendered with its H1, canonical and a FAQPage in the head that matches the visible questions (#973)", ({ path, h1 }) => {
    const html = byFile.get(fileForPath(path)) ?? "";
    const root = rootOf(html);
    expect(root).toMatch(new RegExp(`<h1[^>]*>${h1}</h1>`));
    expect(canonicalOf(html)).toBe(`https://optcgduel.app${path}`);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(root).toContain("Unofficial fan-made");

    const ld = [...headOf(html).matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    expect(ld).toHaveLength(1);
    expect(ld[0]["@type"]).toBe("FAQPage");
    const asked = ld[0].mainEntity.map((e: { name: string }) => e.name);
    const visible = [...root.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => decode(m[1]!));
    expect(asked.length).toBeGreaterThanOrEqual(5);
    expect(asked).toEqual(visible);
    const answers = ld[0].mainEntity.map((e: { acceptedAnswer: { text: string } }) => e.acceptedAnswer.text);
    expect(answers).toEqual([...root.matchAll(/<dd>([^<]+)<\/dd>/g)].map((m) => decode(m[1]!)));
  });

  it.each(PAGES)("$path has Play now buttons that all go home (#973)", ({ path }) => {
    const root = rootOf(byFile.get(fileForPath(path)) ?? "");
    const playNow = [...root.matchAll(/<a ([^>]*)>Play now<\/a>/g)].map((m) => /href="([^"]+)"/.exec(m[1]!)?.[1]);
    expect(playNow.length).toBeGreaterThanOrEqual(2);
    expect(playNow.every((h) => h === "/")).toBe(true);
  });

  it("the sim page names OPTCGSim only as a plain nofollow link to its site (#973)", () => {
    const root = rootOf(byFile.get("optcg-sim-online/index.html") ?? "");
    expect(root).toMatch(/<a [^>]*href="https:\/\/www\.optcgsim\.com\/"[^>]*rel="nofollow noopener"[^>]*>OPTCGSim<\/a>/);
    expect(root).toContain("a popular free downloadable simulator");
  });

  it("the sim page compares the browser with download simulators (#973)", () => {
    const root = rootOf(byFile.get("optcg-sim-online/index.html") ?? "");
    expect(root).toContain("<th scope=\"col\">OPTCG Duel (browser)</th>");
    expect(root).toContain("<th scope=\"col\">Download simulators</th>");
  });

  it("the pages link to each other in their text, and the how-to-play page and home page list both (#973)", () => {
    expect(rootOf(byFile.get("optcg-sim-online/index.html") ?? "")).toMatch(/<p[^>]*>Playing on a phone\? Read <a href="\/play-optcg-on-phone"/);
    expect(rootOf(byFile.get("play-optcg-on-phone/index.html") ?? "")).toMatch(/<p[^>]*>Looking for the full feature list\? See <a href="\/optcg-sim-online"/);
    expect(rootOf(byFile.get("play-one-piece-tcg-online/index.html") ?? "")).toMatch(/More: <a href="\/optcg-sim-online"[^>]*>[^<]+<\/a> and <a href="\/play-optcg-on-phone"/);
    const home = rootOf(byFile.get("index.html") ?? "");
    for (const h of ["/optcg-sim-online", "/play-optcg-on-phone"]) expect(home).toContain(`<li><a href="${h}"`);
  });

  it("every page's footer links to both (#973)", () => {
    for (const file of ["terms/index.html", "leaders/index.html", "optcg-sim-online/index.html"]) {
      const footer = /<footer[\s\S]*<\/footer>/.exec(rootOf(byFile.get(file) ?? ""))?.[0] ?? "";
      for (const h of ["/optcg-sim-online", "/play-optcg-on-phone"]) expect(footer, `${file} -> ${h}`).toContain(`href="${h}"`);
    }
  });

  it("the sitemap lists both pages (#973)", () => {
    const xml = byFile.get("sitemap.xml") ?? "";
    for (const { path } of PAGES) expect(xml).toContain(`<loc>https://optcgduel.app${path}</loc>`);
  });

  describe("vercel.json serves them (#973)", () => {
    const routes = vercel.routes as { src?: string; dest?: string; status?: number; handle?: string }[];
    const files = new Set([...byFile.keys(), "_app.html", "assets/index-abc.js"]);

    it.each(PAGES)("$path answers 200 with its own prerendered file, with or without a slash or directory indexes (#973)", ({ path }) => {
      const expected = fileForPath(path);
      expect(byFile.has(expected)).toBe(true);
      for (const p of [path, `${path}/`]) {
        expect(resolveRequest(routes, files, p), p).toMatchObject({ status: 200, file: expected });
        expect(resolveRequest(routes, files, p, { directoryIndex: false }), p).toMatchObject({ status: 200, file: expected });
      }
    });

    it("an unknown path next to them still answers 404 (#973)", () => {
      expect(resolveRequest(routes, files, "/optcg-sim-online-nope")).toMatchObject({ status: 404, file: "_app.html" });
      expect(resolveRequest(routes, files, "/play-optcg-on-phone/extra")).toMatchObject({ status: 404, file: "_app.html" });
    });
  });
});
