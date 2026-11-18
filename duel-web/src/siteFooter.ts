const NO_FOOTER = ["/duel", "/hotseat", "/demo", "/replay", "/auth/complete"];

const under = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

export function showsSiteFooter(pathname: string): boolean {
  return !NO_FOOTER.some((p) => under(pathname, p));
}

const FULL_FOOTER = ["/", "/watch", "/play-one-piece-tcg-online", "/optcg-sim-online", "/play-optcg-on-phone", "/leaders", "/terms", "/privacy", "/cookies", "/conduct"];

/** The lobby and the public/SEO and legal pages carry every link; other app pages get one compact line (#1343). */
export function compactSiteFooter(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return !FULL_FOOTER.some((p) => path === p || (p !== "/" && under(path, p)));
}

export const FOOTER_LINKS = [
  { to: "/play-one-piece-tcg-online", label: "How to play online" },
  { to: "/optcg-sim-online", label: "OPTCG sim online" },
  { to: "/play-optcg-on-phone", label: "Play on phone" },
  { to: "/leaders", label: "Top leaders" },
] as const;

export const FOOTER_EXTERNAL_LINKS = [{ href: "https://alternativeto.net/software/optcg-duel/", label: "OPTCG Duel on AlternativeTo" }] as const;
