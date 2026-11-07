import { Link } from "react-router-dom";
import { BuildTag } from "./BuildTag";
import { DUEL_URL } from "./duelLink";
import { ThemeToggle } from "./ThemeToggle";
import { Topbar } from "./Topbar";

/** The slim header of the pages a visitor can open without signing in: the landing page and the meta decks. */
export function PublicTopbar() {
  return (
    <Topbar>
      <BuildTag />
      <a className="duel-nav-link" href={DUEL_URL} target="_blank" rel="noopener">
        Play Duel
      </a>
      <ThemeToggle />
      <Link className="btn secondary" to="/login">
        Sign in
      </Link>
    </Topbar>
  );
}
