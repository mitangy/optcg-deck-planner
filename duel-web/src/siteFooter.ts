const NO_FOOTER = ["/duel", "/hotseat", "/demo", "/replay", "/auth/complete"];

export function showsSiteFooter(pathname: string): boolean {
  return !NO_FOOTER.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const FOOTER_LINKS = [
  { to: "/play-one-piece-tcg-online", label: "How to play online" },
  { to: "/optcg-sim-online", label: "OPTCG sim online" },
  { to: "/play-optcg-on-phone", label: "Play on phone" },
  { to: "/leaders", label: "Top leaders" },
] as const;

export const FOOTER_EXTERNAL_LINKS = [{ href: "https://alternativeto.net/software/optcg-duel/", label: "OPTCG Duel on AlternativeTo" }] as const;
