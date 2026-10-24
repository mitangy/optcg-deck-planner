import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dialog } from "@optcg/ui/popups";
import { getPlannerUrl } from "../config";
import { activeNavHref, navItemsFor } from "./navItems";
import { useAccountRole } from "./useAccountRole";
import { useStickyHeadHeight } from "./useStickyHeadHeight";

/**
 * The hamburger button every page header starts with, and the left drawer it opens.
 * The drawer is a shared Headless UI Dialog (#715): fixed and portalled to <body>, so opening it
 * moves nothing in the header; it traps Tab, closes on Escape or a tap on the backdrop, and
 * hands focus back to the button.
 */
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const active = activeNavHref(pathname);
  const items = navItemsFor(useAccountRole());

  const close = useCallback(() => setOpen(false), []);

  useStickyHeadHeight(buttonRef);

  // A navigation (link, back button) closes the drawer.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn nav-menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={open ? drawerId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
      </button>
      <Dialog
        open={open}
        onClose={close}
        className="nav-drawer-root"
        panelClassName="nav-drawer"
        panelProps={{ id: drawerId }}
        label="Site menu"
      >
        <nav aria-label="Site menu" className="nav-drawer-nav">
          <ul className="nav-list">
            {items.map((item, i) => (
              <li key={item.href}>
                <Link
                  to={item.href}
                  // Headless UI puts focus here on open (the first thing a keyboard user can pick).
                  data-autofocus={i === 0 ? "" : undefined}
                  className="nav-link"
                  aria-current={item.href === active ? "page" : undefined}
                  onClick={close}
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="nav-sep">
              <a className="nav-link" href={getPlannerUrl()} target="_blank" rel="noopener" onClick={close}>
                Deck planner <span aria-hidden>↗</span>
              </a>
            </li>
          </ul>
        </nav>
      </Dialog>
    </>
  );
}
