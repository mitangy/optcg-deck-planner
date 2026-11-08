import { describe, expect, it } from "vitest";
import { resolveRequest } from "../../../tools/seo/vercel-routes.mjs";
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
<meta property="og:title" content="home" />
<meta property="og:image" content="https://optcgduel.app/og-image.png" />
<script type="module" src="/assets/index-abc.js"></script>
</head><body><div id="root"></div></body></html>`;

const leaders = leadersFixture.leaders.slice(0, 3) as MetaLeader[];
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

/** The markup inside #root, without React's text-node separators. */
const rootOf = (html: string) => html.slice(html.indexOf('<div id="root"'), html.indexOf("</div><script")).replace(/<!-- -->/g, "");
const canonicalOf = (html: string) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];

describe("pre-rendered public pages (#914)", async () => {
  const out = await prerender({ template: TEMPLATE, snapshot: SNAPSHOT, log: () => undefined });
  const byFile = new Map(out.map((f) => [f.file, f.content]));

  it("a leader page has its title, canonical, H1 and decklist in #root without any script running (#914)", () => {
    const html = byFile.get("leaders/op17-039-rocks-d-xebec/index.html") ?? "";
    expect(html).toContain("<title>Rocks.D.Xebec (OP17-039) deck list and meta stats – OPTCG Duel</title>");
    expect(canonicalOf(html)).toBe("https://optcgduel.app/leaders/op17-039-rocks-d-xebec");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    const root = rootOf(html);
    expect(root).toMatch(/<h1[^>]*>Rocks\.D\.Xebec \(OP17-039\) deck list – play online free<\/h1>/);
    expect(root).toContain("Play this deck online");
    expect(root).toContain("Cost 0");
    expect(root).toContain('href="/decks/meta"');
    expect(root).toContain('href="/play-one-piece-tcg-online"');
    expect(root).toContain("Unofficial fan-made");
    expect(html).toContain('property="og:image" content="https://tcgplayer-cdn.tcgplayer.com/product/712086_in_1000x1000.jpg"');
  });

  it("the leader page's data line says the source, window and date of the snapshot (#914)", () => {
    const root = rootOf(byFile.get("leaders/op17-039-rocks-d-xebec/index.html") ?? "");
    expect(root).toMatch(/Data:\s*<a[^>]*>Limitless TCG<\/a>, last 30 days, updated Nov 3, 2026\./);
  });

  it("the page embeds its own snapshot so the browser's first render matches (#914)", () => {
    const html = byFile.get("leaders/st30-001-luffy-ace/index.html") ?? "";
    const json = /<script type="application\/json" id="meta-snapshot">([^<]+)<\/script>/.exec(html)?.[1] ?? "{}";
    const embedded = JSON.parse(json) as MetaSnapshot;
    expect(Object.keys(embedded.decks)).toEqual(["ST30-001"]);
    expect(embedded.leaders).toHaveLength(leaders.length);
  });

  it("/leaders links to every leader page and the home page links to the popular ones (#914)", () => {
    const index = rootOf(byFile.get("leaders/index.html") ?? "");
    for (const l of leaders) expect(index).toContain(`href="/leaders/${l.leader_id.toLowerCase()}-`);
    expect(canonicalOf(byFile.get("leaders/index.html") ?? "")).toBe("https://optcgduel.app/leaders");
    const home = rootOf(byFile.get("index.html") ?? "");
    expect(home).toContain('href="/leaders/op17-039-rocks-d-xebec"');
    expect(canonicalOf(byFile.get("index.html") ?? "")).toBe("https://optcgduel.app/");
  });

  it("the meta decks page ships its leaders and says every leader has a page (#914)", () => {
    const root = rootOf(byFile.get("decks/meta/index.html") ?? "");
    expect(root).toContain("Rocks.D.Xebec");
    expect(root).toMatch(/<a [^>]*href="\/leaders"[^>]*>Every popular leader has its own page<\/a>/);
  });

  it("the footer of every page links to /leaders (#914)", () => {
    expect(rootOf(byFile.get("terms/index.html") ?? "")).toContain('href="/leaders"');
  });

  it("every public route has a page with its own H1 and canonical, and private routes have none (#914)", () => {
    for (const [path, h1] of [
      ["/play-one-piece-tcg-online", "Play OPTCG online, free in your browser"],
      ["/leaderboard", "Leaderboard"],
      ["/whats-new", "What’s new"],
      ["/terms", "Terms &amp; credits"],
      ["/privacy", "Privacy policy"],
      ["/cookies", "Cookies"],
      ["/conduct", "Rules of conduct"],
    ] as const) {
      const html = byFile.get(fileForPath(path)) ?? "";
      expect(rootOf(html), path).toMatch(new RegExp(`<h1[^>]*>${h1}<\\/h1>`));
      expect(canonicalOf(html), path).toBe(`https://optcgduel.app${path}`);
    }
    for (const private_ of ["settings", "decks/index.html", "duel", "admin"]) expect([...byFile.keys()].some((f) => f.startsWith(private_)), private_).toBe(false);
  });

  it("the sitemap keeps the existing URLs and adds /leaders and every leader page (#914)", () => {
    const xml = byFile.get("sitemap.xml") ?? "";
    for (const url of ["/", "/play-one-piece-tcg-online", "/decks/meta", "/events/stress-test-2026-11/rules", "/terms", "/leaders", "/leaders/op17-039-rocks-d-xebec", "/leaders/st30-001-luffy-ace"]) {
      expect(xml, url).toContain(`<loc>https://optcgduel.app${url}</loc>`);
    }
    expect(xml).not.toContain("/settings");
  });

  it("only the static shells (home, leaderboard) are marked to be hidden from browsers that run the app (#914)", () => {
    for (const f of ["index.html", "leaderboard/index.html"]) expect(rootOf(byFile.get(f) ?? ""), f).toContain("prerender-shell");
    for (const f of ["leaders/index.html", "leaders/op17-039-rocks-d-xebec/index.html", "decks/meta/index.html", "terms/index.html", "whats-new/index.html", "play-one-piece-tcg-online/index.html"]) {
      expect(rootOf(byFile.get(f) ?? ""), f).not.toContain("prerender-shell");
    }
  });

  it("ships the snapshot as a static file (#914)", () => {
    expect(JSON.parse(byFile.get("meta-snapshot.json") ?? "{}").leaders).toHaveLength(leaders.length);
  });

  describe("vercel.json serves them (#914)", () => {
    const routes = vercel.routes as { src?: string; dest?: string; status?: number; handle?: string }[];
    const files = new Set([...byFile.keys(), "_app.html", "assets/index-abc.js"]);

    it("a leader page answers 200 with its own file (#914)", () => {
      expect(resolveRequest(routes, files, "/leaders/op17-039-rocks-d-xebec")).toMatchObject({ status: 200, file: "leaders/op17-039-rocks-d-xebec/index.html" });
      expect(resolveRequest(routes, files, "/leaders/op17-039-rocks-d-xebec/")).toMatchObject({ status: 200, file: "leaders/op17-039-rocks-d-xebec/index.html" });
    });

    it("a known leader slug serves its own page even when the platform serves no directory indexes (#914)", () => {
      for (const p of ["/leaders/op17-039-rocks-d-xebec", "/leaders/op17-039-rocks-d-xebec/"]) {
        expect(resolveRequest(routes, files, p, { directoryIndex: false }), p).toMatchObject({ status: 200, file: "leaders/op17-039-rocks-d-xebec/index.html" });
      }
    });

    it("a bare id or a leader the build did not know opens the app, which redirects or shows the live data (#914)", () => {
      expect(resolveRequest(routes, files, "/leaders/op17-039")).toMatchObject({ status: 200, file: "_app.html" });
      expect(resolveRequest(routes, files, "/leaders/op99-001-newcomer")).toMatchObject({ status: 200, file: "_app.html" });
      expect(resolveRequest(routes, files, "/leaders/op17-039", { directoryIndex: false })).toMatchObject({ status: 200, file: "_app.html" });
      expect(resolveRequest(routes, files, "/leaders/op99-001-newcomer/", { directoryIndex: false })).toMatchObject({ status: 200, file: "_app.html" });
    });

    it("each fixed public route names its own pre-rendered file, so it works without directory indexes too (#914)", () => {
      for (const path of ["/play-one-piece-tcg-online", "/decks/meta", "/leaderboard", "/whats-new", "/terms", "/privacy", "/cookies", "/conduct", "/leaders"]) {
        const expected = fileForPath(path);
        expect(byFile.has(expected), expected).toBe(true);
        for (const p of [path, `${path}/`]) {
          expect(resolveRequest(routes, files, p, { directoryIndex: false }), p).toMatchObject({ status: 200, file: expected });
        }
      }
    });

    it("pages of the app itself and unknown paths never get a pre-rendered page's markup (#914)", () => {
      for (const path of ["/duel", "/settings", "/decks", "/decks/abc/configure", "/history/m_1", "/replay/m_1", "/watch/room-7"]) {
        expect(resolveRequest(routes, files, path), path).toMatchObject({ status: 200, file: "_app.html" });
      }
      expect(resolveRequest(routes, files, "/nope-xyz")).toMatchObject({ status: 404, file: "_app.html" });
      expect(resolveRequest(routes, files, "/leaders/a/b")).toMatchObject({ status: 404, file: "_app.html" });
    });

    it("the home page is the pre-rendered index.html at / (#914)", () => {
      expect(resolveRequest(routes, files, "/")).toMatchObject({ status: 200, file: "index.html" });
      expect(resolveRequest(routes, files, "/", { directoryIndex: false })).toMatchObject({ status: 200, file: "index.html" });
    });

    it("every file a route points at is one the build writes (#914)", () => {
      for (const r of routes) {
        if (!r.dest || r.dest.startsWith("http") || r.dest.includes("$")) continue;
        expect(files.has(r.dest.replace(/^\//, "")), `${r.src} -> ${r.dest}`).toBe(true);
      }
    });
  });
});
