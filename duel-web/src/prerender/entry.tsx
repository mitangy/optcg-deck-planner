import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { Link, Route, Routes, StaticRouter } from "react-router-dom";
import { SiteFooter } from "@optcg/site-legal";
import { applyHead, injectRoot, type PrerenderHead } from "@optcg/ui/seo";
import staticSitemap from "../../public/sitemap.xml?raw";
import { leaderPageText, LeaderPage } from "../pages/LeaderPage";
import { LeadersIndexPage } from "../pages/LeadersIndexPage";
import { LegalPage } from "../pages/LegalPage";
import { MetaDecksPage } from "../pages/MetaDecksPage";
import { OptcgSimOnlinePage, OPTCG_SIM_FAQ } from "../pages/OptcgSimOnlinePage";
import { PlayOnPhonePage, PLAY_ON_PHONE_FAQ } from "../pages/PlayOnPhonePage";
import { PlayOnlinePage } from "../pages/PlayOnlinePage";
import { faqPageJsonLd } from "../seo/faqJsonLd";
import { PATCH_NOTES } from "@optcg/patch-notes/notes";
import { WhatsNewPage } from "../pages/WhatsNewPage";
import { cardImageUrl } from "@optcg/ui/cardArt";
import { leaderPath } from "../leaders/slug";
import { EMBEDDED_SNAPSHOT_ID, SnapshotContext } from "../leaders/useMetaView";
import { sitemapXml, snapshotFor, snapshotPaths, type MetaSnapshot } from "../leaders/snapshot";
import { loadBuildSnapshot } from "../leaders/snapshotBuild";
import { routeMetaFor, sitemapPaths, SITE_ORIGIN } from "../seo/routeMetaTable";
import { FOOTER_EXTERNAL_LINKS, FOOTER_LINKS } from "../siteFooter";
import { HomeShell, LeaderboardShell } from "./shells";

export type PrerenderedFile = { file: string; content: string };

type PageSpec = {
  path: string;
  element: ReactNode;
  head: PrerenderHead;
  embed?: string | null;
};

export function fileForPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/index.html` : "index.html";
}

function headFor(path: string, jsonLd?: unknown): PrerenderHead {
  const meta = routeMetaFor(path);
  return { title: meta.title, description: meta.description, canonical: `${SITE_ORIGIN}${path === "/" ? "/" : path}`, noindex: meta.noindex, jsonLd };
}

function pagesFor(snapshot: MetaSnapshot): PageSpec[] {
  const legal = (kind: "terms" | "privacy" | "cookies" | "conduct") => ({ path: `/${kind}`, element: <LegalPage kind={kind} />, head: headFor(`/${kind}`) });
  const pages: PageSpec[] = [
    { path: "/", element: <HomeShell snapshot={snapshot} />, head: headFor("/"), embed: undefined },
    { path: "/play-one-piece-tcg-online", element: <PlayOnlinePage />, head: headFor("/play-one-piece-tcg-online") },
    { path: "/optcg-sim-online", element: <OptcgSimOnlinePage />, head: headFor("/optcg-sim-online", faqPageJsonLd(OPTCG_SIM_FAQ)) },
    { path: "/play-optcg-on-phone", element: <PlayOnPhonePage />, head: headFor("/play-optcg-on-phone", faqPageJsonLd(PLAY_ON_PHONE_FAQ)) },
    { path: "/decks/meta", element: <MetaDecksPage />, head: headFor("/decks/meta"), embed: null },
    { path: "/leaderboard", element: <LeaderboardShell />, head: headFor("/leaderboard") },
    { path: "/whats-new", element: <WhatsNewPage notes={PATCH_NOTES} />, head: headFor("/whats-new") },
    legal("terms"),
    legal("privacy"),
    legal("cookies"),
    legal("conduct"),
    { path: "/leaders", element: <LeadersIndexPage />, head: headFor("/leaders"), embed: null },
  ];
  for (const l of snapshot.leaders) {
    const text = leaderPageText(l, snapshot.days);
    pages.push({
      path: leaderPath(l),
      element: (
        <Routes>
          <Route path="/leaders/:slug" element={<LeaderPage />} />
        </Routes>
      ),
      head: { title: text.title, description: text.description, canonical: `${SITE_ORIGIN}${leaderPath(l)}`, image: cardImageUrl(l.image_url, "large") || undefined },
      embed: l.leader_id,
    });
  }
  return pages;
}

function render(page: PageSpec, snapshot: MetaSnapshot): string {
  return renderToString(
    <SnapshotContext.Provider value={snapshotFor(snapshot, page.embed ?? null)}>
      <StaticRouter location={page.path}>
        {page.element}
        <SiteFooter Link={Link} className="site-footer-centered" extraLinks={FOOTER_LINKS} externalLinks={FOOTER_EXTERNAL_LINKS} />
      </StaticRouter>
    </SnapshotContext.Provider>,
  );
}

export async function prerender(opts: { template: string; snapshot?: MetaSnapshot; log?: (msg: string) => void }): Promise<PrerenderedFile[]> {
  const log = opts.log ?? ((m: string) => console.log(`[duel-prerender] ${m}`));
  const snapshot = opts.snapshot ?? (await loadBuildSnapshot({ api: (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.META_API_URL, log })).snapshot;
  const files: PrerenderedFile[] = [];
  for (const page of pagesFor(snapshot)) {
    const html = render(page, snapshot);
    const withHead = applyHead(opts.template, page.head);
    const data = page.embed === undefined ? undefined : { id: EMBEDDED_SNAPSHOT_ID, value: snapshotFor(snapshot, page.embed) };
    files.push({ file: fileForPath(page.path), content: injectRoot(withHead, html, data) });
  }
  files.push({ file: "meta-snapshot.json", content: `${JSON.stringify(snapshot)}\n` });

  const known = [...staticSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(SITE_ORIGIN.length) || "/");
  files.push({ file: "sitemap.xml", content: sitemapXml(SITE_ORIGIN, [...known, ...sitemapPaths(), ...snapshotPaths(snapshot)]) });
  return files;
}

