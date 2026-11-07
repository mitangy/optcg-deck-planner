import { WhatsNewFeed, type PatchNote } from "@optcg/patch-notes";
import { BackLink } from "./BackLink";
import { NavMenu } from "../nav/NavMenu";

/** Everything that changed in the duel app, newest first. Opening it counts as seeing the latest update. `notes` is only passed by the static pre-render, which has no chunk to fetch. */
export function WhatsNewPage({ notes }: { notes?: readonly PatchNote[] }) {
  return (
    <div className="app-shell">
      <div className="page page-narrow whats-new-page">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
          <h1 className="page-title">What’s new</h1>
        </header>
        <WhatsNewFeed app="duel" notes={notes} />
      </div>
    </div>
  );
}
