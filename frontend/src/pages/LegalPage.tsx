import { Link } from "react-router-dom";
import { LEGAL_TITLES, LegalDocument, LegalNav, type LegalKind } from "@optcg/site-legal";
import { ThemeToggle } from "../ui/ThemeToggle";
import { Topbar } from "../app/Topbar";

/** Public Terms & credits / Privacy / Cookies page (no sign-in needed). */
export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <div className="app public-app">
      <Topbar>
        <ThemeToggle />
      </Topbar>
      <main className="app-main legal-main">
        <div className="page-head">
          <div>
            <p className="eyebrow">Legal</p>
            <h1>{LEGAL_TITLES[kind]}</h1>
          </div>
        </div>
        <LegalNav Link={Link} current={kind} />
        <LegalDocument kind={kind} />
      </main>
    </div>
  );
}
