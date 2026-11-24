import { Link } from "react-router-dom";
import { LEGAL_TITLES, LegalDocument, LegalNav, type LegalKind } from "@optcg/site-legal";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Topbar } from "../app/Topbar";
import { Shell } from "../app/Shell";
import { useMe } from "../auth/useMe";

function LegalBody({ kind }: { kind: LegalKind }) {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Legal</p>
          <h1>{LEGAL_TITLES[kind]}</h1>
        </div>
      </div>
      <LegalNav Link={Link} current={kind} />
      <LegalDocument kind={kind} />
    </>
  );
}

export function LegalPage({ kind }: { kind: LegalKind }) {
  const { data: me } = useMe();
  if (me) {
    return (
      <Shell user={me}>
        <div className="legal-main">
          <LegalBody kind={kind} />
        </div>
      </Shell>
    );
  }
  return (
    <div className="app public-app">
      <Topbar>
        <ThemeToggle />
      </Topbar>
      <main className="app-main legal-main">
        <LegalBody kind={kind} />
      </main>
    </div>
  );
}
