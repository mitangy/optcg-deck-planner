import { Link } from "react-router-dom";
import { BuildTag } from "@optcg/ui/appShell";
import { DUEL_URL } from "../app/duelLink";
import { ThemeToggle } from "./ThemeToggle";
import { Topbar } from "../app/Topbar";

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
