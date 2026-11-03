import { Link } from "react-router-dom";
import { BrandWordmark } from "./BrandWordmark";
import { BuildTag } from "./BuildTag";
import { DUEL_URL } from "./duelLink";
import { ThemeToggle } from "./ThemeToggle";

/** The slim header of the pages a visitor can open without signing in: the landing page and the meta decks. */
export function PublicTopbar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <Link to="/">
            <BrandWordmark />
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
  );
}
