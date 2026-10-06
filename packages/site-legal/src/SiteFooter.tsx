import type { ComponentType, ReactNode } from "react";
import { FAN_DISCLAIMER, LEGAL_PATHS, LEGAL_TITLES, OWNERSHIP_NOTICE, type LegalKind } from "./content";

export type FooterLinkProps = { to: string; className?: string; children: ReactNode };

const ORDER: LegalKind[] = ["terms", "privacy", "cookies"];

/**
 * Page-end footer: legal links (and optional feedback button) plus the fan-project blurb. In flow at the end
 * of the page (never fixed), so it never covers controls. `Link` is the app's
 * router link so the legal pages open without a reload.
 */
export function SiteFooter({
  Link,
  className,
  onFeedback,
}: {
  Link: ComponentType<FooterLinkProps>;
  className?: string;
  /** When set, a "Send feedback" button follows the legal links. */
  onFeedback?: () => void;
}) {
  return (
    <footer className={`site-footer${className ? ` ${className}` : ""}`}>
      <div className="site-footer-inner">
        <nav className="site-footer-links" aria-label="Legal">
          {ORDER.map((kind) => (
            <Link key={kind} to={LEGAL_PATHS[kind]} className="site-footer-link">
              {LEGAL_TITLES[kind]}
            </Link>
          ))}
          {onFeedback ? (
            <button type="button" className="site-footer-link site-footer-feedback" onClick={onFeedback}>
              Send feedback
            </button>
          ) : null}
        </nav>
        <p className="site-footer-disclaimer">{FAN_DISCLAIMER}</p>
        <p className="site-footer-notice">{OWNERSHIP_NOTICE}</p>
      </div>
    </footer>
  );
}

/** Switcher between the three legal pages, shown at the top of each. */
export function LegalNav({ Link, current }: { Link: ComponentType<FooterLinkProps>; current: LegalKind }) {
  return (
    <nav className="legal-nav" aria-label="Legal pages">
      {ORDER.map((kind) =>
        kind === current ? (
          <a key={kind} aria-current="page">
            {LEGAL_TITLES[kind]}
          </a>
        ) : (
          <Link key={kind} to={LEGAL_PATHS[kind]}>
            {LEGAL_TITLES[kind]}
          </Link>
        ),
      )}
    </nav>
  );
}
