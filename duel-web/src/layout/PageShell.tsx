import type { ReactNode } from "react";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";

export type PageBack = { to: string; label: string; ariaLabel?: string; variant?: "ghost" };

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
