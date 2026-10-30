import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeMetaFor, sitemapPaths, SITE_ORIGIN } from "./routeMeta";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Realistic URLs for every route that holds one player's own data or a live session.
const PRIVATE = [
  "/duel", "/hotseat", "/settings", "/history", "/history/m_123", "/replay/m_123", "/admin", "/auth/complete",
  "/welcome/username", "/demo", "/decks", "/decks/new", "/decks/abc123/configure", "/watch/room-7",
];
const PUBLIC = ["/", "/play-one-piece-tcg-online", "/decks/meta", "/leaderboard", "/whats-new", "/terms", "/privacy", "/cookies", "/events/stress-test-2026-11/rules"];

describe("duel route meta (#804)", () => {
  it.each(PRIVATE)("%s is noindex (#804)", (path) => {
    expect(routeMetaFor(path).noindex).toBe(true);
  });

  it.each(PUBLIC)("%s is indexable with its own description (#804)", (path) => {
    const meta = routeMetaFor(path);
    expect(meta.noindex).toBeFalsy();
    expect(meta.title.length).toBeGreaterThan(5);
  });

  it("an unknown path is noindex (#804)", () => {
    expect(routeMetaFor("/nope-xyz").noindex).toBe(true);
  });

  it("every URL in sitemap.xml is an indexable route and every fixed indexable route is listed (#804)", () => {
    const xml = read("../../public/sitemap.xml");
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith(SITE_ORIGIN)).toBe(true);
      const path = url.slice(SITE_ORIGIN.length) || "/";
      expect(routeMetaFor(path).noindex, `${url} is noindex`).toBeFalsy();
    }
    for (const path of sitemapPaths()) expect(urls, `${path} missing`).toContain(`${SITE_ORIGIN}${path}`);
  });
});

type VercelRoute = { src?: string; dest?: string; status?: number; handle?: string };

/** What Vercel answers for a path once the filesystem (public/ files) has not matched: first route whose src matches wins. */
function status(routes: VercelRoute[], path: string): number | null {
  const after = routes.slice(routes.findIndex((r) => r.handle === "filesystem") + 1);
  for (const r of after) {
    if (r.src && new RegExp(`^${r.src}$`).test(path)) return r.status ?? 200;
  }
  return null;
}

describe("duel vercel.json routes (#804)", () => {
  const routes = (JSON.parse(read("../../vercel.json")) as { routes: VercelRoute[] }).routes;
  const appPaths = [...read("../App.tsx").matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
  const sample = (p: string) => p.replace(/:\w+/g, "a-b_1");

  it("finds the app's routes in App.tsx (#804)", () => {
    expect(appPaths).toContain("/play-one-piece-tcg-online");
    expect(appPaths.length).toBeGreaterThan(15);
  });

  it.each(appPaths)("%s answers 200 with the app (#804)", (p) => {
    expect(status(routes, sample(p))).toBe(200);
    if (p !== "/") expect(status(routes, `${sample(p)}/`)).toBe(200);
  });

  it("an unknown path answers 404 and still serves the app (#804)", () => {
    expect(status(routes, "/nope-xyz")).toBe(404);
    expect(status(routes, "/history/a/b/c")).toBe(404);
    const last = routes[routes.length - 1];
    expect(last.dest).toBe("/index.html");
  });
});
