import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useMe } from "../auth/useMe";
import { BuildTag } from "../BuildTag";
import { consumeLoginNext, rememberLoginNext } from "../loginNext";
import { AuthLoadingSkeleton } from "../Skeleton";

export function LoginPage() {
  const { data: user, isLoading, refetch } = useMe();
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    if (next) rememberLoginNext(next);
  }, []);

  useEffect(() => {
    // Prefer fragment (not sent to servers/Referer); fall back to ?ticket= for
    // older redirects still in flight during deploy.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const ticket = hashParams.get("ticket") || queryParams.get("ticket");
    if (!ticket) return;
    let cancelled = false;
    setClaiming(true);
    // Strip ticket from the address bar before the claim request.
    queryParams.delete("ticket");
    const q = queryParams.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    api
      .claim(ticket)
      .then(async () => {
        if (cancelled) return;
        const next = consumeLoginNext() || "/";
        window.history.replaceState({}, "", next);
        await refetch();
        navigate(next, { replace: true });
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        window.history.replaceState({}, "", "/login");
      })
      .finally(() => {
        if (!cancelled) setClaiming(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, refetch]);

  if (!isLoading && user) {
    const next = consumeLoginNext() || "/";
    return <Navigate to={next} replace />;
  }
  if (claiming) return <AuthLoadingSkeleton label="Signing you in…" />;

  async function devLogin() {
    try {
      setErr(null);
      await api.devLogin();
      await refetch();
      const next = consumeLoginNext() || "/";
      navigate(next, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <h1>OPTCG Tracker</h1>
        <p className="lede">
          Chart your decks, track what you own, and see what’s left to buy at market price.
        </p>
        <a className="btn primary" href={api.googleLoginUrl()}>
          Sign in with Google
        </a>
        {import.meta.env.DEV && (
          <button type="button" className="btn secondary" onClick={devLogin}>
            Dev login (local)
          </button>
        )}
        {err && <p className="error">{err}</p>}
        {import.meta.env.DEV && <p className="hint">API: {api.apiUrl}</p>}
        <BuildTag className="build-tag-login" />
      </div>
    </div>
  );
}
