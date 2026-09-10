import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { claimLoginTicket, mintSessionGameToken } from "../net/api";
import { useDuelSession } from "../state/DuelSession";

/**
 * OAuth return landing for duel-web only.
 * Claims the one-time ticket from the URL fragment, then mints a game token.
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
        if (!ticket) throw new Error("Missing login ticket");
        await claimLoginTicket(ticket);
        // Strip ticket from the URL so refreshes cannot reuse it.
        window.history.replaceState(null, "", "/auth/complete");
        const minted = await mintSessionGameToken();
        if (cancelled) return;
        setRating(minted.rating);
        navigate("/", { replace: true });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Sign-in failed");
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
        <p className="error-text" style={{ padding: 16 }}>
          {error}
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate("/")}>
          Back to lobby
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="loading arena-loading">Finishing sign-in…</div>
    </div>
  );
}
