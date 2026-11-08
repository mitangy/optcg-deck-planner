import { Link } from "react-router-dom";
import { LEGAL_TITLES, LegalDocument, LegalNav, type LegalKind } from "@optcg/site-legal";
import { PageShell } from "../layout/PageShell";

export function LegalPage({ kind }: { kind: LegalKind }) {
  return (
    <PageShell
      pageClass="page-narrow legal-page"
      back={{ to: "/", label: "Home", ariaLabel: "Back to home", variant: "ghost" }}
      title={LEGAL_TITLES[kind]}
    >
      <LegalNav Link={Link} current={kind} />
      <LegalDocument kind={kind} />
    </PageShell>
  );
}
