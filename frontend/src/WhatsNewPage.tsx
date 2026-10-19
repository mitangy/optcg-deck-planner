import { useEffect } from "react";
import { Link } from "react-router-dom";
import { markAllSeen, notesFor, WhatsNewList } from "@optcg/patch-notes";
import { ThemeToggle } from "./ThemeToggle";

const NOTES = notesFor("planner");

/** Public page: everything that changed in the planner, newest first. Opening it counts as seeing the latest update. */
export function WhatsNewPage() {
  useEffect(() => {
    markAllSeen("planner");
  }, []);
  return (
    <div className="app public-app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <img className="brand-logo" src="/optcg-logo.png" alt="ONE PIECE CARD GAME" width={562} height={145} />
              <span>Planner</span>
            </Link>
          </div>
          <div className="user">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="app-main legal-main">
        <div className="page-head">
          <div>
            <p className="eyebrow">Planner</p>
            <h1>What’s new</h1>
          </div>
        </div>
        <WhatsNewList notes={NOTES} />
      </main>
    </div>
  );
}
