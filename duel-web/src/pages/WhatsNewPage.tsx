import { PageShell } from "../layout/PageShell";
import { WhatsNewFeed, type PatchNote } from "@optcg/patch-notes";

/** Everything that changed in the duel app, newest first. Opening it counts as seeing the latest update. `notes` is only passed by the static pre-render, which has no chunk to fetch. */
export function WhatsNewPage({ notes }: { notes?: readonly PatchNote[] }) {
  return (
    <PageShell pageClass="page-narrow whats-new-page" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="What’s new">
      <WhatsNewFeed app="duel" notes={notes} />
    </PageShell>
  );
}
