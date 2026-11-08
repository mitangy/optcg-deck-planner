import { describe, expect, it } from "vitest";
import { resolveRequest } from "../../../tools/seo/vercel-routes.mjs";
import vercel from "../../../vercel.json";
import type { MetaLeadersResponse } from "../api";
import { fetchLeaders, fileForPath, prerender } from "./entry";

const TEMPLATE = `<!doctype html><html lang="en"><head>
<title>OPTCG Deck Planner – One Piece TCG deck builder with live TCGPlayer prices</title>
<meta name="description" content="home" />
<link rel="canonical" href="https://optcg-deck-planner.app/" />
<meta property="og:title" content="home" />
</head><body><div id="root"></div></body></html>`;

const LEADERS = {
  days: 30,
  min_players: 8,
  events: 28,
  total_decks: 1205,
  source: "Limitless TCG",
  source_url: "https://play.limitlesstcg.com/tournaments/completed?game=OP",
  leaders: [
    { leader_id: "OP17-039", name: "Rocks.D.Xebec", color: "Blue", image_url: "https://tcgplayer-cdn.tcgplayer.com/product/712086_200w.jpg", decks: 199, share: 0.165, top8: 41, wins: 440, losses: 414, ties: 8, win_rate: 0.515 },
  ],
} as MetaLeadersResponse;

const rootOf = (html: string) => html.slice(html.indexOf('<div id="root"'), html.indexOf("</div><script") > 0 ? html.indexOf("</div><script") : undefined).replace(/<!-- -->/g, "");
const canonicalOf = (html: string) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];

describe("planner pre-rendered public pages (#914)", async () => {
  const out = await prerender({ template: TEMPLATE, leaders: LEADERS, log: () => undefined });
  const byFile = new Map(out.map((f) => [f.file, f.content]));

  it("the landing page has its H1, links and canonical in #root (#914)", () => {
    const html = byFile.get("index.html") ?? "";
    expect(rootOf(html)).toContain("One Piece TCG deck planner with live market prices");
    expect(rootOf(html)).toContain('href="/meta"');
    expect(rootOf(html)).toContain("Unofficial fan project");
    expect(canonicalOf(html)).toBe("https://optcg-deck-planner.app/");
  });

  it("/meta ships the leaders it was built with, in #root and as the seed the client reads (#914)", () => {
    const html = byFile.get("meta/index.html") ?? "";
    expect(rootOf(html)).toContain("Rocks.D.Xebec");
    expect(canonicalOf(html)).toBe("https://optcg-deck-planner.app/meta");
    const seed = JSON.parse(/<script type="application\/json" id="meta-seed">([^<]+)<\/script>/.exec(html)?.[1] ?? "{}");
    expect(seed.days).toBe(30);
    expect(seed.leaders.leaders[0].leader_id).toBe("OP17-039");
  });

  it("without the API /meta is still written, with no seed (#914)", async () => {
    const files = await prerender({ template: TEMPLATE, leaders: null, log: () => undefined });
    const html = files.find((f) => f.file === "meta/index.html")?.content ?? "";
    expect(html).toContain('data-prerendered');
    expect(html).not.toContain("meta-seed");
  });

  it("a failed or malformed API answer is no leaders, not an error (#914)", async () => {
    expect(await fetchLeaders("https://api.test", 1000, (async () => new Response(JSON.stringify(LEADERS), { status: 500 })) as typeof fetch)).toBeNull();
    expect(await fetchLeaders("https://api.test", 1000, (async () => new Response('{"leaders":5}')) as typeof fetch)).toBeNull();
    expect(await fetchLeaders("https://api.test", 1000, (async () => { throw new Error("down"); }) as typeof fetch)).toBeNull();
    expect((await fetchLeaders("https://api.test", 1000, (async () => new Response(JSON.stringify(LEADERS))) as typeof fetch))?.leaders).toHaveLength(1);
  });

  it("the legal pages are written and signed-in pages are not (#914)", () => {
    for (const p of ["/terms", "/privacy", "/cookies", "/conduct"]) expect(canonicalOf(byFile.get(fileForPath(p)) ?? ""), p).toBe(`https://optcg-deck-planner.app${p}`);
    for (const f of byFile.keys()) expect(/^(collection|decks|alerts|friends|login)\//.test(f), f).toBe(false);
  });

  describe("vercel.json serves them (#914)", () => {
    const routes = vercel.routes as { src?: string; dest?: string; status?: number; handle?: string }[];
    const files = new Set([...byFile.keys(), "_app.html"]);

    it("/, /meta and the legal pages answer with their own file, also without directory indexes (#914)", () => {
      expect(resolveRequest(routes, files, "/")).toMatchObject({ status: 200, file: "index.html" });
      for (const p of ["/meta", "/meta/", "/terms", "/privacy", "/cookies", "/conduct"]) {
        expect(resolveRequest(routes, files, p, { directoryIndex: false }), p).toMatchObject({ status: 200, file: fileForPath(p.replace(/\/$/, "")) });
      }
    });

    it("signed-in pages, the login page and unknown paths get the empty app shell, never the landing page (#914)", () => {
      for (const p of ["/login", "/decks", "/decks/12", "/collection", "/share/tok", "/whats-new"]) {
        expect(resolveRequest(routes, files, p), p).toMatchObject({ status: 200, file: "_app.html" });
      }
      expect(resolveRequest(routes, files, "/nope-xyz")).toMatchObject({ status: 404, file: "_app.html" });
    });

    it("every file a route points at is one the build writes (#914)", () => {
      for (const r of routes) {
        if (!r.dest || r.dest.startsWith("http") || r.dest.includes("$")) continue;
        expect(files.has(r.dest.replace(/^\//, "")), `${r.src} -> ${r.dest}`).toBe(true);
      }
    });
  });
});
