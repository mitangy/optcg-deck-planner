import { Link } from "react-router-dom";
import { BountyAmount } from "../../Bounty";
import { BrandWordmark } from "../../BrandMark";
import { getPlannerUrl } from "../../config";
import { NavMenu } from "../../nav/NavMenu";
import { googleLoginUrl } from "../../net/api";

/** The home page's own top bar (the other pages use `PageShell`): menu, wordmark, sign-in, account chip, shortcuts. */
export function LobbyTopbar({ authMode, accountName, bounty }: { authMode: "guest" | "google" | "dev"; accountName: string; bounty: number | null }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="topbar-left">
          <NavMenu />
          <Link to="/" className="topbar-mark" aria-label="OPTCG Duel home">
            <BrandWordmark />
          </Link>
        </div>
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
          <a
            href={getPlannerUrl()}
            target="_blank"
            rel="noopener"
            className="icon-btn topbar-in-menu"
            aria-label="Deck planner"
            title="Deck planner"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="currentColor"
                d="M8 2h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm0 2v14h11V4H8Zm2 3h7v2h-7V7Zm0 4h7v2h-7v-2ZM3 6h1v16h13v1a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1Z"
              />
            </svg>
            <span className="icon-btn-label">Planner</span>
          </a>
          <Link to="/history" className="icon-btn topbar-in-menu" aria-label="Match history" title="Match history">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path
                fill="currentColor"
                d="M13 3a9 9 0 0 0-9 9H1l3.9 3.9.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3Zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12Z"
              />
            </svg>
            <span className="icon-btn-label">History</span>
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
