import { WhatsNewFeed } from "@optcg/patch-notes";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Topbar } from "../app/Topbar";
import { Shell } from "../app/Shell";
import { useMe } from "../auth/useMe";
import { UpdateNotice, VersionStatus } from "../app/UpdateNotice";

function WhatsNewBody() {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Planner</p>
          <h1>What’s new</h1>
        </div>
      </div>
      <VersionStatus />
      <WhatsNewFeed app="planner" />
    </>
  );
}

export function WhatsNewPage() {
  const { data: me } = useMe();
  if (me) {
    return (
      <Shell user={me}>
        <div className="legal-main">
          <WhatsNewBody />
        </div>
      </Shell>
    );
  }
  return (
    <div className="app public-app">
      <UpdateNotice />
      <Topbar>
        <ThemeToggle />
      </Topbar>
      <main className="app-main legal-main">
        <WhatsNewBody />
      </main>
    </div>
  );
}
