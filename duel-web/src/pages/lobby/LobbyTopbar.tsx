import { Link } from "react-router-dom";
import { BountyAmount } from "../../Bounty";
import { BrandWordmark } from "../../BrandMark";
import { NavMenu } from "../../nav/NavMenu";
import { INLINE_NAV } from "../../nav/navItems";
import { googleLoginUrl } from "../../net/api";

export function LobbyTopbar({ authMode, accountName, bounty }: { authMode: "guest" | "google" | "dev"; accountName: string; bounty: number | null }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <NavMenu className="topbar-menu" hideInline />
        <Link to="/" className="topbar-mark" aria-label="OPTCG Duel home">
          <BrandWordmark />
        </Link>
        <nav className="topbar-links" aria-label="Main">
          {INLINE_NAV.map((item) => (
            <Link key={item.href} to={item.href} className="topbar-link">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-right">
          {authMode === "guest" ? (
            <a className="btn btn-primary btn-sm" href={googleLoginUrl()}>
              Sign in
            </a>
          ) : null}
          <Link to="/settings" className="account-chip" title="Account settings">
            <span className="account-dot" data-mode={authMode} aria-hidden />
            <span className="account-name">{accountName}</span>
            {bounty != null ? (
              <span className="account-rating" title="Bounty">
                <BountyAmount amount={bounty} />
              </span>
            ) : null}
          </Link>
          <Link to="/settings" className="icon-btn" aria-label="Settings" title="Settings">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="currentColor"
                d="M19.14 12.94a7.6 7.6 0 0 0 .06-.94 7.6 7.6 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.6 7.6 0 0 0 0 1.88L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
              />
            </svg>
            <span className="icon-btn-label">Settings</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
