import { PageShell } from "../layout/PageShell";
import { WhatsNewFeed, type PatchNote } from "@optcg/patch-notes";

export function WhatsNewPage({ notes }: { notes?: readonly PatchNote[] }) {
  return (
    <PageShell pageClass="page-narrow whats-new-page" back={{ to: "/", label: "Home", ariaLabel: "Back to home" }} title="What’s new">
      <WhatsNewFeed app="duel" notes={notes} />
    </PageShell>
  );
}
