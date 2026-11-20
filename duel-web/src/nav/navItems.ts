export type NavItem = { href: string; label: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/decks", label: "Decks" },
  { href: "/decks/meta", label: "Meta decks" },
  { href: "/history", label: "Match history" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/whats-new", label: "What’s new" },
  { href: "/settings", label: "Settings" },
];

const INLINE_HREFS = ["/decks", "/leaderboard", "/history", "/tournaments"];

export const INLINE_NAV: readonly NavItem[] = INLINE_HREFS.map((href) => ({
  href,
  label: NAV_ITEMS.find((i) => i.href === href)!.label,
}));

const SHOWN_INLINE = new Set([...INLINE_NAV.map((i) => i.href), "/settings"]);

export function isShownInline(href: string): boolean {
  return SHOWN_INLINE.has(href);
}

const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin" };

export function navItemsFor(role: string | null | undefined): readonly NavItem[] {
  return role === "admin" || role === "moderator" ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
}

const EXACT_ONLY = new Set(["/", "/decks/meta"]);

export function activeNavHref(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const { href } of NAV_ITEMS) {
    if (path === href) return href;
  }
  for (const { href } of NAV_ITEMS) {
    if (EXACT_ONLY.has(href)) continue;
    if (path.startsWith(`${href}/`)) return href;
  }
  if (path === ADMIN_ITEM.href) return ADMIN_ITEM.href;
  return null;
}
