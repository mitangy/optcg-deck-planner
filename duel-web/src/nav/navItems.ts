/** The pages the menu links to, in the order it lists them. */
export type NavItem = { href: string; label: string };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/decks", label: "Decks" },
  { href: "/decks/meta", label: "Meta decks" },
  { href: "/history", label: "Match history" },
  { href: "/whats-new", label: "What’s new" },
  { href: "/settings", label: "Settings" },
];

const ADMIN_ITEM: NavItem = { href: "/admin", label: "Admin" };

/** The menu for a signed-in role: staff also get the Admin page. */
export function navItemsFor(role: string | null | undefined): readonly NavItem[] {
  return role === "admin" || role === "moderator" ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;
}

/** Meta decks owns exactly `/decks/meta`; every other `/decks/...` page belongs to Decks. */
const EXACT_ONLY = new Set(["/", "/decks/meta"]);

/** The menu item to mark as the current page, or null for a page the menu does not list. */
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
