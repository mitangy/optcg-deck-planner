import { matchPath } from "react-router-dom";

/** Where the duel app is served; canonical and sitemap URLs are built from it. */
export const SITE_ORIGIN = "https://optcgduel.app";

export type RouteMetaEntry = {
  /** A React Router path pattern. */
  pattern: string;
  title: string;
  description?: string;
  /** Private or per-player pages: crawlable (so the tag is seen) but never listed. */
  noindex?: boolean;
};

const NAME = "OPTCG Duel";

const HOME_DESCRIPTION =
  "Play the One Piece Card Game online for free in your browser. No download. Ranked matches, bots to practice against, friends, and your own decks from the OPTCG Deck Planner.";

/** First match wins, so list a literal path before a parameterized one that would also match it (/decks/meta before /decks/:deckId/...). */
export const ROUTE_META: readonly RouteMetaEntry[] = [
  {
    pattern: "/",
    title: "OPTCG Duel – Play the One Piece Card Game online, free in your browser",
    description: HOME_DESCRIPTION,
  },
  {
    pattern: "/play-one-piece-tcg-online",
    title: "Play the One Piece Card Game online – free, no download | OPTCG Duel",
    description:
      "How to play the One Piece Card Game online in your browser: pick a deck, play ranked, practice against a bot or invite a friend. Free, works on phone and desktop.",
  },
  {
    pattern: "/decks/meta",
    title: "One Piece TCG meta decks – try them free | OPTCG Duel",
    description:
      "Browse the leaders and decklists doing well in the One Piece Card Game right now, then copy one and play it online against a bot or a friend.",
  },
  {
    pattern: "/leaderboard",
    title: "Ranked leaderboard – OPTCG Duel",
    description: "The top players on the OPTCG Duel ranked ladder and their Bounties. Climb it with a free account.",
  },
  {
    pattern: "/whats-new",
    title: "What’s new – OPTCG Duel",
    description: "Everything that changed in OPTCG Duel recently: new features, fixes and card updates, newest first.",
  },
  {
    pattern: "/events/:eventId/rules",
    title: "Event rules – OPTCG Duel",
    description: "The official rules, schedule and prize details of an OPTCG Duel event.",
  },
  { pattern: "/terms", title: `Terms & credits – ${NAME}`, description: "Terms of use and credits for OPTCG Duel, an unofficial fan-made One Piece Card Game simulator." },
  { pattern: "/privacy", title: `Privacy policy – ${NAME}`, description: "What OPTCG Duel stores about you, why, and how to delete it." },
  { pattern: "/cookies", title: `Cookies – ${NAME}`, description: "The cookies and local storage OPTCG Duel uses and why." },

  { pattern: "/duel", title: NAME, noindex: true },
  { pattern: "/hotseat", title: `Practice – ${NAME}`, noindex: true },
  { pattern: "/settings", title: `Settings – ${NAME}`, noindex: true },
  { pattern: "/history", title: `Match history – ${NAME}`, noindex: true },
  { pattern: "/history/:matchId", title: `Match log – ${NAME}`, noindex: true },
  { pattern: "/replay/:matchId", title: `Replay – ${NAME}`, noindex: true },
  { pattern: "/admin", title: `Admin – ${NAME}`, noindex: true },
  { pattern: "/auth/complete", title: `Signing in – ${NAME}`, noindex: true },
  { pattern: "/welcome/username", title: `Choose a username – ${NAME}`, noindex: true },
  { pattern: "/demo", title: `Demo – ${NAME}`, noindex: true },
  { pattern: "/decks", title: `My decks – ${NAME}`, noindex: true },
  { pattern: "/decks/new", title: `New deck – ${NAME}`, noindex: true },
  { pattern: "/decks/:deckId/configure", title: `Edit deck – ${NAME}`, noindex: true },
  { pattern: "/watch/:roomId", title: `Spectate – ${NAME}`, noindex: true },
];

/** Unknown paths redirect home in the app and answer 404 on the server, so they must not be listed. */
const FALLBACK: RouteMetaEntry = { pattern: "*", title: NAME, description: HOME_DESCRIPTION, noindex: true };

/** The meta for a pathname. Pages without their own description get the home one, so a stale description never lingers. */
export function routeMetaFor(pathname: string): RouteMetaEntry & { description: string } {
  const entry = ROUTE_META.find((e) => matchPath({ path: e.pattern, end: true }, pathname)) ?? FALLBACK;
  return { ...entry, description: entry.description ?? HOME_DESCRIPTION };
}

/** Pages with a fixed URL that belong in sitemap.xml. */
export function sitemapPaths(): string[] {
  return ROUTE_META.filter((e) => !e.noindex && !e.pattern.includes(":")).map((e) => e.pattern);
}
