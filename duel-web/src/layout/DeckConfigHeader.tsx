import type { ReactNode } from "react";
import { NavMenu } from "../nav/NavMenu";
import { BackLink } from "./BackLink";
import type { PageBack } from "./PageShell";

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
