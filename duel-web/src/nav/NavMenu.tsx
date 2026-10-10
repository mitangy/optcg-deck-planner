import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { getPlannerUrl } from "../config";
import { activeNavHref, NAV_ITEMS } from "./navItems";
import { useStickyHeadHeight } from "./useStickyHeadHeight";

const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * The hamburger button every page header starts with, and the left drawer it opens.
 * The drawer is fixed and portalled to <body>, so opening it moves nothing in the header.
 */
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const drawerId = useId();
  const active = activeNavHref(pathname);

  const close = useCallback(() => setOpen(false), []);

  useStickyHeadHeight(buttonRef);

  // A navigation (link, back button) closes the drawer.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (open) {
      drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab inside the drawer while it covers the page.
      const items = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn nav-menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        aria-controls={drawerId}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
      </button>
      {createPortal(
        <div className="nav-drawer-root" data-open={open}>
          <div className="nav-backdrop" onClick={close} aria-hidden />
          <nav ref={drawerRef} id={drawerId} className="nav-drawer" aria-label="Site menu">
            <ul className="nav-list">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link
                    to={item.href}
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
        </div>,
        document.body,
      )}
    </>
  );
}
