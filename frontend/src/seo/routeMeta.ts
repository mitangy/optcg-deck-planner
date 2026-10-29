import { matchPath } from "react-router-dom";

/** Where the planner is served; canonical and sitemap URLs are built from it. */
export const SITE_ORIGIN = "https://optcg-deck-planner.app";

export type RouteMetaEntry = {
  /** A React Router path pattern. */
  pattern: string;
  title: string;
  description?: string;
  /** Private or per-player pages: crawlable (so the tag is seen) but never listed. */
  noindex?: boolean;
};

const NAME = "OPTCG Deck Planner";

const HOME_DESCRIPTION =
  "Plan One Piece Card Game decks, track the cards you own and see what you still need to buy, with live TCGPlayer market prices and recent sales. Free with a Google account.";

/** First match wins. */
export const ROUTE_META: readonly RouteMetaEntry[] = [
  {
    pattern: "/",
    title: "OPTCG Deck Planner – One Piece TCG deck builder with live TCGPlayer prices",
    description: HOME_DESCRIPTION,
  },
  {
    pattern: "/meta",
    title: "One Piece TCG meta decks and prices – OPTCG Deck Planner",
    description:
      "See which leaders and decklists are winning in the One Piece Card Game, with the TCGPlayer price of each list, and copy one into your planner.",
  },
  { pattern: "/whats-new", title: `What’s new – ${NAME}`, description: "Everything that changed in the OPTCG Deck Planner recently, newest first." },
  { pattern: "/terms", title: `Terms & credits – ${NAME}`, description: "Terms of use and credits for the OPTCG Deck Planner, an unofficial fan-made One Piece Card Game tool." },
  { pattern: "/privacy", title: `Privacy policy – ${NAME}`, description: "What the OPTCG Deck Planner stores about you, why, and how to delete it." },
  { pattern: "/cookies", title: `Cookies – ${NAME}`, description: "The cookies and local storage the OPTCG Deck Planner uses and why." },

  { pattern: "/login", title: `Sign in – ${NAME}`, noindex: true },
  { pattern: "/share/:token", title: `Shared deck – ${NAME}`, noindex: true },
  { pattern: "/group-buy/join/:token", title: `Join group buy – ${NAME}`, noindex: true },
  { pattern: "/group-buy/view/:token", title: `Group buy – ${NAME}`, noindex: true },
  { pattern: "/decks", title: `My decks – ${NAME}`, noindex: true },
  { pattern: "/decks/:id", title: `Deck – ${NAME}`, noindex: true },
  { pattern: "/collection", title: `Collection – ${NAME}`, noindex: true },
  { pattern: "/friends", title: `Friends – ${NAME}`, noindex: true },
  { pattern: "/friends/:username", title: `Friend – ${NAME}`, noindex: true },
  { pattern: "/friends/:username/decks/:deckId", title: `Friend’s deck – ${NAME}`, noindex: true },
  { pattern: "/group-buys", title: `Group buys – ${NAME}`, noindex: true },
  { pattern: "/group-buys/:id", title: `Group buy – ${NAME}`, noindex: true },
  { pattern: "/import", title: `Import – ${NAME}`, noindex: true },
];

/** Unknown paths redirect home in the app and answer 404 on the server, so they must not be listed. */
const FALLBACK: RouteMetaEntry = { pattern: "*", title: NAME, description: HOME_DESCRIPTION, noindex: true };

/**
 * The meta for a pathname. `/` is the public landing page for visitors, but for a signed-in
 * player it is their shopping list, which must not be listed.
 */
export function routeMetaFor(pathname: string, signedIn = false): RouteMetaEntry & { description: string } {
  const entry = ROUTE_META.find((e) => matchPath({ path: e.pattern, end: true }, pathname)) ?? FALLBACK;
  const noindex = entry.noindex || (entry.pattern === "/" && signedIn);
  const title = entry.pattern === "/" && signedIn ? `Shopping list – ${NAME}` : entry.title;
  return { ...entry, title, noindex, description: entry.description ?? HOME_DESCRIPTION };
}

/** Pages with a fixed URL that belong in sitemap.xml. */
export function sitemapPaths(): string[] {
  return ROUTE_META.filter((e) => !e.noindex && !e.pattern.includes(":")).map((e) => e.pattern);
}
