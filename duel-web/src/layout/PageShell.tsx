import type { ReactNode } from "react";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";

export type PageBack = { to: string; label: string; ariaLabel?: string; variant?: "ghost" };

/**
 * The page chrome the menu pages share: `.app-shell` > `.page` > a `.page-header` that starts with the menu,
 * then a back link, the `<h1>` and anything extra (a role chip). `pageClass` is everything after `page` on the
 * inner div, `shellClass` anything after `app-shell`. Leave `title` out when the page's own `<h1>` sits in its
 * hero, and `back` out on a page with nowhere to go back to. Prerendered pages use it too, so it stays free of
 * anything that needs a browser.
 */
export function PageShell({
  pageClass,
  shellClass,
  back,
  title,
  headerExtra,
  outside,
  children,
}: {
  pageClass: string;
  shellClass?: string;
  back?: PageBack;
  title?: ReactNode;
  headerExtra?: ReactNode;
  /** Dialogs and other siblings of `.page`, inside `.app-shell`. */
  outside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={shellClass ? `app-shell ${shellClass}` : "app-shell"}>
      <div className={`page ${pageClass}`}>
        <header className="page-header">
          <NavMenu />
          {back ? <BackLink {...back} /> : null}
          {title !== undefined ? <h1 className="page-title">{title}</h1> : null}
          {headerExtra}
        </header>
        {children}
      </div>
      {outside}
    </div>
  );
}
