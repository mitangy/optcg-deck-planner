import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { stopAccountSync } from "../account/accountSync";
import { UsernameForm } from "../auth/UsernameForm";
import { fetchAuthMe, fetchUsernameSuggestion, logoutSession } from "../net/api";
import { useDuelSession } from "../state/DuelSession";

/**
 * First sign-in step: pick a public username before playing.
 *
 * Required for signed-in accounts (the lobby redirects here until one is set),
 * but prefilled with an available suggestion so it's one click. The only way
 * out without choosing is signing out, which returns you to guest play.
 */
export function UsernameSetupPage() {
  const navigate = useNavigate();
  const { setRating } = useDuelSession();
  const [initial, setInitial] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchAuthMe().catch(() => null);
      if (cancelled) return;
      if (!me) {
        navigate("/", { replace: true });
        return;
      }
      if (me.username) {
        navigate("/", { replace: true });
        return;
      }
      const suggestion = await fetchUsernameSuggestion();
      if (!cancelled) setInitial(suggestion ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="app-shell">
      <div className="page page-narrow username-setup">
        <header className="page-header">
          <h1 className="page-title">Choose a username</h1>
        </header>
        <section className="panel">
          <p className="panel-copy">
            This is the name opponents see on the board and in match results. You can change it
            later in Settings.
          </p>
          {initial === null ? (
            <p className="field-hint username-loading">Loading suggestion…</p>
          ) : (
            <UsernameForm
              initial={initial}
              submitLabel="Continue"
              autoFocus
              onSaved={() => navigate("/", { replace: true })}
            />
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void logoutSession().then(() => {
                  stopAccountSync();
                  setRating(null);
                  navigate("/", { replace: true });
                });
              }}
            >
              Sign out instead
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
