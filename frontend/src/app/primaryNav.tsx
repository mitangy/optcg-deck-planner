import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { NavBadge, useFriendsBadgeCount } from "../friends/FriendsNavLink";
import { CollectionIcon, DecksIcon, MetaIcon, MoreDotsIcon, ShoppingIcon } from "./navIcons";

type MainItem = { to: string; label: string; end?: boolean; icon: () => ReactNode };

export const MAIN_NAV: readonly MainItem[] = [
  { to: "/", label: "Shopping", end: true, icon: ShoppingIcon },
  { to: "/decks", label: "Decks", icon: DecksIcon },
  { to: "/collection", label: "Collection", icon: CollectionIcon },
  { to: "/meta", label: "Meta", icon: MetaIcon },
];

export const MORE_NAV = [
  { to: "/alerts", label: "Alerts" },
  { to: "/friends", label: "Friends" },
  { to: "/group-buys", label: "Group buys" },
] as const;

/** True when the open page is one of the pages inside the More menu. */
export function isMorePath(pathname: string): boolean {
  return MORE_NAV.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
}

function MoreItems() {
  const friends = useFriendsBadgeCount();
  return (
    <>
      {MORE_NAV.map((i) => (
        <MenuItem key={i.to}>
          <NavLink to={i.to}>
            {i.label}
            {i.to === "/friends" ? <NavBadge count={friends} /> : null}
          </NavLink>
        </MenuItem>
      ))}
    </>
  );
}

function MoreMenu({ className, anchor, children }: { className: string; anchor: "bottom end" | "top end"; children: ReactNode }) {
  const { pathname } = useLocation();
  const friends = useFriendsBadgeCount();
  const active = isMorePath(pathname);
  return (
    <Menu as="div" className="nav-more-wrap">
      <MenuButton className={`${className}${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
        {children}
        <NavBadge count={friends} />
      </MenuButton>
      <MenuList anchor={{ to: anchor, gap: 6, padding: 8 }} className="head-popover-panel head-popover-menu nav-more-menu">
        <MoreItems />
      </MenuList>
    </Menu>
  );
}

/** Desktop links in the top bar: four pages and a More menu. */
export function TopNav() {
  return (
    <nav aria-label="Primary" className="top-nav">
      {MAIN_NAV.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}>
          {i.label}
        </NavLink>
      ))}
      <MoreMenu className="nav-more" anchor="bottom end">
        More
        <span className="nav-more-chev" aria-hidden="true">
          ▾
        </span>
      </MoreMenu>
    </nav>
  );
}

/** Phone tab bar fixed to the bottom of the viewport (hidden by CSS on wider or very short screens). */
export function BottomNav() {
  return (
    <nav aria-label="Primary" className="bottom-nav">
      {MAIN_NAV.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className="bottom-nav-item">
          {i.icon()}
          <span>{i.label}</span>
        </NavLink>
      ))}
      <MoreMenu className="bottom-nav-item bottom-nav-more" anchor="top end">
        <MoreDotsIcon />
        <span>More</span>
      </MoreMenu>
    </nav>
  );
}

