import { Link } from "react-router-dom";
import { LEGAL_TITLES, LegalDocument, LegalNav, type LegalKind } from "@optcg/site-legal";
import { NavMenu } from "../nav/NavMenu";

export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <div className="app-shell">
      <div className="page page-narrow legal-page">
        <header className="page-header">
          <NavMenu />
          <Link to="/" className="btn btn-ghost btn-sm page-back" aria-label="Back to home">
            ← Home
          </Link>
          <h1 className="page-title">{LEGAL_TITLES[kind]}</h1>
        </header>
        <LegalNav Link={Link} current={kind} />
        <LegalDocument kind={kind} />
      </div>
    </div>
  );
}
