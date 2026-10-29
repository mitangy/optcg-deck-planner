import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { BuildTag } from "./BuildTag";
import { DUEL_URL } from "./duelLink";
import { ThemeToggle } from "./ThemeToggle";

const FEATURES: readonly { title: string; body: string }[] = [
  {
    title: "A shopping list that prices itself",
    body: "See what you still need across all your decks, with the TCGPlayer market price and recent sales next to every card.",
  },
  {
    title: "Track what you own",
    body: "Keep your collection in one place. Add cards by hand or scan them from a photo, right on your device.",
  },
  {
    title: "Deck stats and build hints",
    body: "Curve, colors, counters and trigger counts at a glance, plus hints when a deck looks off.",
  },
  {
    title: "Share and buy together",
    body: "Send a deck to a friend with a link, or split a TCGPlayer order with a group buy.",
  },
  {
    title: "Ask Log Pose",
    body: "An AI deck analyst that knows your list and can suggest changes you can apply with one tap.",
  },
];

/**
 * What a visitor who is not signed in sees at `/`. Signed-in players get the shopping list
 * there instead (see HomeRoute in App.tsx).
 */
export function PlannerLandingPage({ onDevLogin }: { onDevLogin: () => Promise<void> }) {
  const [err, setErr] = useState<string | null>(null);

  async function devLogin() {
    try {
      setErr(null);
      await onDevLogin();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app public-app landing">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <img className="brand-logo" src="/optcg-logo.png" alt="ONE PIECE CARD GAME" width={562} height={145} />
              <span>Planner</span>
            </Link>
          </div>
          <div className="user">
            <BuildTag />
            <a className="duel-nav-link" href={DUEL_URL} target="_blank" rel="noopener">
              Play Duel
            </a>
            <ThemeToggle />
            <Link className="btn secondary" to="/login">
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main className="app-main landing-main">
        <section className="landing-hero">
          <h1>One Piece TCG deck planner with live market prices</h1>
          <p className="lede">
            Plan your decks, keep track of the cards you own, and see exactly what is left to buy at today’s TCGPlayer
            prices. Free with a Google account.
          </p>
          <p className="landing-notice" role="note">
            <b>Unofficial fan project.</b> Not affiliated with or endorsed by Bandai.
          </p>
          <div className="landing-cta">
            <a className="btn primary" href={api.googleLoginUrl()}>
              Sign in with Google
            </a>
            <Link className="btn secondary" to="/meta">
              Browse meta decks
            </Link>
            {import.meta.env.DEV && (
              <button type="button" className="btn secondary" onClick={devLogin}>
                Dev login (local)
              </button>
            )}
          </div>
          {err && <p className="error">{err}</p>}
          <p className="landing-duel">
            <a href={`${DUEL_URL}/play-one-piece-tcg-online`} target="_blank" rel="noopener">
              Play your decks online
            </a>{" "}
            in OPTCG Duel, free in your browser.
          </p>
        </section>
        <section className="landing-features" aria-label="What the planner does">
          {FEATURES.map((f) => (
            <article key={f.title} className="landing-feature">
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
