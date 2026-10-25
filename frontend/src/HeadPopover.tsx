import type { ReactNode } from "react";
import { Menu, MenuButton, MenuList, Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";

/**
 * Compact page-head action that opens a panel under its trigger: a Headless UI Popover, so Escape
 * (focus back on the button), an outside click and tabbing out close it, while clicks and Tab inside
 * keep it open. The panel floats in a portal, kept on screen, so opening it never shifts the header
 * or the list below — see CLAUDE.md "No layout shift on expand/toggle".
 */
export function HeadPopover({
  label,
  badge,
  icon,
  className = "btn secondary",
  panelLabel,
  width = 320,
  children,
}: {
  label: ReactNode;
  /** Small status text inside the trigger, e.g. "On". */
  badge?: string;
  /** Decorative glyph shown instead of the text label on very narrow screens (the label stays as the accessible name). */
  icon?: ReactNode;
  className?: string;
  /** Accessible name for the dialog panel. */
  panelLabel: string;
  width?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  return (
    <Popover as="div" className={({ open }: { open: boolean }) => `head-popover${open ? " open" : ""}`}>
      {({ close }: { close: () => void }) => (
        <>
          <PopoverButton type="button" className={`${className} head-popover-btn`} title={typeof label === "string" ? label : undefined}>
            {icon ? (
              <span className="head-popover-icon" aria-hidden="true">
                {icon}
              </span>
            ) : null}
            <span className="head-popover-label">{label}</span>
            {badge ? <span className="head-popover-badge">{badge}</span> : null}
            <span className="head-popover-chevron" aria-hidden="true">
              ▾
            </span>
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom end", gap: 6, padding: 8 }}
            role="dialog"
            aria-label={panelLabel}
            className="head-popover-panel"
            style={{ width: `min(${width}px, calc(100vw - 16px))` }}
          >
            {typeof children === "function" ? children(close) : children}
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

/**
 * A page-head action that opens a list of choices (the deck's "More"): a Headless UI Menu, so arrow
 * keys, Home / End, type-ahead and Escape (focus back on the button) come with it. The list floats
 * under the trigger in a portal, kept on screen, so opening it never shifts the header or the list
 * below (CLAUDE.md "No layout shift on expand/toggle"). Fill it with `MenuItem`s.
 */
export function HeadMenu({
  label,
  icon,
  className = "btn secondary",
  width = 260,
  children,
}: {
  label: string;
  /** Decorative glyph shown instead of the text label on very narrow screens (the label stays as the accessible name). */
  icon?: ReactNode;
  className?: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <Menu as="div" className={({ open }: { open: boolean }) => `head-popover${open ? " open" : ""}`}>
      <MenuButton className={`${className} head-popover-btn`} title={label}>
        {icon ? (
          <span className="head-popover-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="head-popover-label">{label}</span>
        <span className="head-popover-chevron" aria-hidden="true">
          ▾
        </span>
      </MenuButton>
      <MenuList
        anchor={{ to: "bottom end", gap: 6, padding: 8 }}
        className="head-popover-panel head-popover-menu"
        style={{ width: `min(${width}px, calc(100vw - 16px))` }}
      >
        {children}
      </MenuList>
    </Menu>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V3M6.5 6.5 10 3l3.5 3.5M4.5 10v6h11v-6" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="15.5" cy="10" r="1.6" />
    </svg>
  );
}
