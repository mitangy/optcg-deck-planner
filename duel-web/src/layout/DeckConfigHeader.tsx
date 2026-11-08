import type { ReactNode } from "react";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";
import type { PageBack } from "./PageShell";

/**
 * The header of the deck pages (`.deck-config`): the menu and a back link on one row, the heading block (an `<h1
 * className="deck-config-title">` and its `.meta` line) and any actions after it. The sibling of `PageShell`'s
 * header for pages that sit in `.deck-config` instead of `.page`.
 */
export function DeckConfigHeader({ back, heading, children }: { back: PageBack; heading: ReactNode; children?: ReactNode }) {
  return (
    <header className="deck-config-header">
      <div className="deck-config-nav">
        <NavMenu />
        <BackLink {...back} />
      </div>
      <div className="deck-config-heading">{heading}</div>
      {children}
    </header>
  );
}
