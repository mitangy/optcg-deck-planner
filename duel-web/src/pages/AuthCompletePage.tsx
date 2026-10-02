import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { startAccountSync } from "../account/accountSync";
import { claimLoginTicket, googleLoginUrl, mintSessionGameToken } from "../net/api";
import { MissingTicketError, signInErrorMessage } from "../auth/signInError";
import { useDuelSession } from "../state/DuelSession";
import { needsUsername } from "../auth/username";

/**
 * OAuth return landing for duel-web only.
 * Claims the one-time ticket from the URL fragment, then mints a game token.
 * Accounts without a username continue to /welcome/username.
 */
export function AuthCompletePage() {
  const navigate = useNavigate();
  const { setRating } = useDuelSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const hash = window.location.hash.replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const ticket = params.get("ticket");
        if (!ticket) throw new MissingTicketError();
        const user = await claimLoginTicket(ticket);
        // Strip ticket from the URL so refreshes cannot reuse it.
        window.history.replaceState(null, "", "/auth/complete");
        void startAccountSync(user);
        const minted = await mintSessionGameToken();
        if (cancelled) return;
        setRating(minted.rating);
        // First sign-in (or never picked one): choose a public username.
        navigate(needsUsername(user) ? "/welcome/username" : "/", { replace: true });
      } catch (e) {
        if (!cancelled) {
          console.warn("Sign-in failed", e);
          setError(signInErrorMessage(e));
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate, setRating]);

  if (error) {
    return (
      <div className="app-shell">
        <div className="page page-narrow">
          <header className="page-header">
            <Link to="/" className="btn btn-ghost btn-sm page-back" aria-label="Back to home">
              ← Home
            </Link>
            <h1 className="page-title">Sign-in failed</h1>
          </header>
          <section className="panel">
            <p className="panel-copy" role="alert">
              {error}
            </p>
            <div className="btn-row">
              <a className="btn btn-primary" href={googleLoginUrl()}>
                Sign in with Google
              </a>
              <Link to="/" className="btn btn-secondary">
                Back to home
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="loading arena-loading">Finishing sign-in…</div>
    </div>
  );
}
