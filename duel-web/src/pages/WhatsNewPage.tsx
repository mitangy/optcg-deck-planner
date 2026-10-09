import { useEffect } from "react";
import { latestNoteDate, markSeen, notesFor, WhatsNewList } from "@optcg/patch-notes";
import { BackLink } from "./BackLink";

const NOTES = notesFor("duel");

/** Everything that changed in the duel app, newest first. Opening it counts as seeing the latest update. */
export function WhatsNewPage() {
  useEffect(() => {
    const latest = latestNoteDate("duel");
    if (latest) markSeen("duel", latest);
  }, []);
  return (
    <div className="app-shell">
      <div className="page page-narrow whats-new-page">
        <header className="page-header">
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
          <h1 className="page-title">What’s new</h1>
        </header>
        <WhatsNewList notes={NOTES} />
      </div>
    </div>
  );
}
