import type { ReactNode } from "react";
import { Menu, MenuButton, MenuList, Popover, PopoverButton, PopoverPanel } from "@optcg/ui/popups";

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
  badge?: string;
  icon?: ReactNode;
  className?: string;
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
            style={{ width: `min(${width / 16}rem, calc(100vw - 16px))` }}
          >
            {typeof children === "function" ? children(close) : children}
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

export function HeadMenu({
  label,
  icon,
  className = "btn secondary",
  width = 260,
  children,
}: {
  label: string;
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
        style={{ width: `min(${width / 16}rem, calc(100vw - 16px))` }}
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
