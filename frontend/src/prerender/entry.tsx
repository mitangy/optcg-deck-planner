/**
 * Build-time pre-render entry (#914). scripts/seo/prerender-plugin.mjs bundles this for Node after
 * `vite build`, calls `prerender()` and writes what it returns into `dist/`.
 *
 * Pre-rendered: the logged-out landing page at `/`, the public `/meta` browser and the legal pages.
 * The client replaces the markup with `createRoot` and keeps showing the same page while it checks
 * the session (see prerendered.ts).
 */
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, StaticRouter } from "react-router-dom";
import { LEGAL_PATHS, SiteFooter, type LegalKind } from "@optcg/site-legal";
import { applyHead, injectRoot, type PrerenderHead } from "@optcg/ui/seo";
import { PlannerLandingPage } from "../LandingPage";
import { LegalPage } from "../LegalPage";
import { META_SEED_ID } from "../prerendered";
import { PublicMetaScreen } from "../PublicMetaScreen";
import { routeMetaFor, SITE_ORIGIN } from "../seo/routeMeta";
import type { MetaLeadersResponse } from "../api";

export type PrerenderedFile = { file: string; content: string };

const META_DAYS = 30;
const DEFAULT_API = "https://optcg-api-nutb.onrender.com";

/** The leaders for the `/meta` page, or null when the API cannot be reached: the page then ships without them and loads them in the browser. */
export async function fetchLeaders(api = DEFAULT_API, timeoutMs = 45_000, fetchFn: typeof fetch = fetch): Promise<MetaLeadersResponse | null> {
  try {
    const res = await fetchFn(`${api}/meta/leaders?days=${META_DAYS}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as MetaLeadersResponse;
    return Array.isArray(body.leaders) ? body : null;
  } catch {
    return null;
  }
}

export function fileForPath(path: string): string {
  const clean = path.replace(/^\/+|\/+$/g, "");
  return clean ? `${clean}/index.html` : "index.html";
}

function headFor(path: string): PrerenderHead {
  const meta = routeMetaFor(path);
  return { title: meta.title, description: meta.description, canonical: `${SITE_ORIGIN}${path === "/" ? "/" : path}`, noindex: meta.noindex };
}

function renderPage(path: string, page: ReactNode, leaders: MetaLeadersResponse | null): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (leaders) queryClient.setQueryData(["meta", "leaders", META_DAYS], leaders);
  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={path}>
        {page}
        <SiteFooter Link={Link} className="site-footer-centered" />
      </StaticRouter>
    </QueryClientProvider>,
  );
}

/** All pre-rendered files for a build. `leaders` is for tests; a build leaves it out and fetches them. */
export async function prerender(opts: { template: string; leaders?: MetaLeadersResponse | null; log?: (msg: string) => void }): Promise<PrerenderedFile[]> {
  const log = opts.log ?? ((m: string) => console.log(`[planner-prerender] ${m}`));
  const leaders = opts.leaders !== undefined ? opts.leaders : await fetchLeaders((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.META_API_URL || DEFAULT_API);
  if (!leaders) log("meta API unavailable: /meta is pre-rendered without leaders");

  const files: PrerenderedFile[] = [];
  const add = (path: string, page: ReactNode, withLeaders: boolean) => {
    const html = renderPage(path, page, withLeaders ? leaders : null);
    const seed = withLeaders && leaders ? { id: META_SEED_ID, value: { generatedAt: new Date().toISOString(), days: META_DAYS, leaders } } : undefined;
    files.push({ file: fileForPath(path), content: injectRoot(applyHead(opts.template, headFor(path)), html, seed) });
  };
  add("/", <PlannerLandingPage onDevLogin={async () => undefined} />, false);
  add("/meta", <PublicMetaScreen />, true);
  for (const kind of Object.keys(LEGAL_PATHS) as LegalKind[]) add(LEGAL_PATHS[kind], <LegalPage kind={kind} />, false);
  return files;
}
