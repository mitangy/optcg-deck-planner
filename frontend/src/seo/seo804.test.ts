import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeMetaFor, sitemapPaths, SITE_ORIGIN } from "./routeMeta";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const PRIVATE = [
  "/login", "/share/tok_1", "/group-buy/join/tok_1", "/group-buy/view/tok_1", "/decks", "/decks/abc123", "/collection",
  "/friends", "/friends/miko", "/friends/miko/decks/42", "/group-buys", "/group-buys/9", "/import",
];
const PUBLIC = ["/", "/meta", "/whats-new", "/terms", "/privacy", "/cookies"];

describe("planner route meta (#804)", () => {
  it.each(PRIVATE)("%s is noindex (#804)", (path) => {
    expect(routeMetaFor(path).noindex).toBe(true);
  });

  it.each(PUBLIC)("%s is indexable (#804)", (path) => {
    expect(routeMetaFor(path).noindex).toBeFalsy();
  });

  it("/ is the landing page for visitors but noindex for a signed-in player (#804)", () => {
    expect(routeMetaFor("/", false).noindex).toBeFalsy();
    expect(routeMetaFor("/", true).noindex).toBe(true);
    expect(routeMetaFor("/meta", true).noindex).toBeFalsy();
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

describe("planner vercel.json routes (#804)", () => {
  const routes = (JSON.parse(read("../../../vercel.json")) as { routes: VercelRoute[] }).routes;
  const appPaths = [...read("../App.tsx").matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== "*" && !p.startsWith("/dev/"));
  const sample = (p: string) => p.replace(/:\w+/g, "tok_1");

  it("finds the app's routes in App.tsx (#804)", () => {
    expect(appPaths).toContain("/friends/:username/decks/:deckId");
    expect(appPaths.length).toBeGreaterThan(15);
  });

  it.each(appPaths)("%s answers 200 with the app (#804)", (p) => {
    expect(status(routes, sample(p))).toBe(200);
    if (p !== "/") expect(status(routes, `${sample(p)}/`)).toBe(200);
  });

  it("an unknown path answers 404 and still serves the app (#804)", () => {
    expect(status(routes, "/nope-xyz")).toBe(404);
    expect(status(routes, "/decks/1/2/3")).toBe(404);
    expect(routes[routes.length - 1].dest).toBe("/index.html");
  });
});
