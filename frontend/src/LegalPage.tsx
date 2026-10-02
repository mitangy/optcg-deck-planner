import { Link } from "react-router-dom";
import { LEGAL_TITLES, LegalDocument, LegalNav, type LegalKind } from "@optcg/site-legal";
import { ThemeToggle } from "./ThemeToggle";

/** Public Terms & credits / Privacy / Cookies page (no sign-in needed). */
export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <div className="app public-app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <img
                className="brand-logo"
                src="/optcg-logo.png"
                alt="ONE PIECE CARD GAME"
                width={562}
                height={145}
              />
              <span>Planner</span>
            </Link>
          </div>
          <div className="user">
            <ThemeToggle />
          </div>
        </div>
      </header>
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
