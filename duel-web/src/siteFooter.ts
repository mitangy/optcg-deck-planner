/**
 * Routes that hide the legal footer: a match (online, hotseat, demo, replay) fills the
 * screen, and the sign-in hand-off redirects straight away.
 */
const NO_FOOTER = ["/duel", "/hotseat", "/demo", "/replay", "/auth/complete"];

export function showsSiteFooter(pathname: string): boolean {
  return !NO_FOOTER.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Reachable from every page, so the public landing pages are crawlable. */
export const FOOTER_LINKS = [
  { to: "/play-one-piece-tcg-online", label: "How to play online" },
  { to: "/leaders", label: "Top leaders" },
] as const;

/** Our listing on a software directory. */
export const FOOTER_EXTERNAL_LINKS = [{ href: "https://alternativeto.net/software/optcg-duel/", label: "OPTCG Duel on AlternativeTo" }] as const;
