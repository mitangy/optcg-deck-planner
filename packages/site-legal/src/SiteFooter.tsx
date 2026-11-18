import type { ComponentType, ReactNode } from "react";
import { DISCORD_INVITE_URL, FAN_DISCLAIMER, LEGAL_PATHS, LEGAL_TITLES, OWNERSHIP_NOTICE, type LegalKind } from "./content";

export type FooterLinkProps = { to: string; className?: string; children: ReactNode };

const ORDER: LegalKind[] = ["terms", "privacy", "cookies", "conduct"];

export function SiteFooter({
  Link,
  className,
  onFeedback,
  extraLinks,
  externalLinks,
  compact,
}: {
  Link: ComponentType<FooterLinkProps>;
  className?: string;
  extraLinks?: readonly { to: string; label: string }[];
  /** Links to other sites, opened in a new tab (no nofollow: they are our own listings). */
  externalLinks?: readonly { href: string; label: string }[];
  onFeedback?: () => void;
  /** One line: Terms, Privacy, feedback and the fan-made disclaimer. For app pages; content pages keep the full footer. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <footer className={`site-footer site-footer-compact${className ? ` ${className}` : ""}`}>
        <div className="site-footer-inner">
          <nav className="site-footer-links" aria-label="Legal">
            <Link to={LEGAL_PATHS.terms} className="site-footer-link">
              Terms
            </Link>
            <Link to={LEGAL_PATHS.privacy} className="site-footer-link">
              Privacy
            </Link>
            {onFeedback ? (
              <button type="button" className="site-footer-link site-footer-feedback" onClick={onFeedback}>
                Send feedback
              </button>
            ) : null}
          </nav>
          <p className="site-footer-disclaimer">{FAN_DISCLAIMER}</p>
        </div>
      </footer>
    );
  }
  return (
    <footer className={`site-footer${className ? ` ${className}` : ""}`}>
      <div className="site-footer-inner">
        <nav className="site-footer-links" aria-label="Legal">
          {ORDER.map((kind) => (
            <Link key={kind} to={LEGAL_PATHS[kind]} className="site-footer-link">
              {LEGAL_TITLES[kind]}
            </Link>
          ))}
          <Link to="/whats-new" className="site-footer-link">
            What’s new
          </Link>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener" className="site-footer-link">
            Discord
          </a>
          {extraLinks?.map((l) => (
            <Link key={l.to} to={l.to} className="site-footer-link">
              {l.label}
            </Link>
          ))}
          {externalLinks?.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="site-footer-link">
              {l.label}
            </a>
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
