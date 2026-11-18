import { LEGAL_CONTENT, LEGAL_DRAFT, LEGAL_TITLES, LEGAL_UPDATED, type LegalKind } from "./content";

export function LegalDocument({ kind }: { kind: LegalKind }) {
  return (
    <article className="legal-doc" aria-label={LEGAL_TITLES[kind]}>
      {LEGAL_DRAFT && (
        <p className="legal-draft" role="note">
          Draft: this page is still being reviewed and may change.
        </p>
      )}
      <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>
      {LEGAL_CONTENT[kind]}
    </article>
  );
}
