import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dialog } from "@optcg/ui/popups";
import { DISCORD_INVITE_URL } from "@optcg/site-legal";
import { usePlannerLink } from "../auth/plannerLink";
import { activeNavHref, isShownInline, navItemsFor } from "./navItems";
import { useAccountRole } from "../auth/session";
import { useStickyHeadHeight } from "./useStickyHeadHeight";

export function NavMenu({ className, hideInline = false }: { className?: string; hideInline?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const active = activeNavHref(pathname);
  const items = navItemsFor(useAccountRole());
  const plannerLink = usePlannerLink("/");

  const close = useCallback(() => setOpen(false), []);

  useStickyHeadHeight(buttonRef);

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className ? `icon-btn nav-menu-btn ${className}` : "icon-btn nav-menu-btn"}
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
        transition
        label="Site menu"
      >
        <nav aria-label="Site menu" className="nav-drawer-nav">
          <ul className="nav-list">
            {items.map((item, i) => (
              <li key={item.href} className={hideInline && isShownInline(item.href) ? "nav-wide-dup" : undefined}>
                <Link
                  to={item.href}
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
              <a
                className="nav-link"
                {...plannerLink}
                onClick={(e) => {
                  plannerLink.onClick(e);
                  close();
                }}
              >
                Deck planner <span aria-hidden>↗</span>
              </a>
            </li>
            <li>
              <a className="nav-link" href={DISCORD_INVITE_URL} target="_blank" rel="noopener" onClick={close}>
                Discord <span aria-hidden>↗</span>
              </a>
            </li>
          </ul>
        </nav>
      </Dialog>
    </>
  );
}
