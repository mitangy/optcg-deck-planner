import { BrandWordmark } from "./BrandWordmark";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { markAllSeen, notesFor, WhatsNewList } from "@optcg/patch-notes";
import { ThemeToggle } from "./ThemeToggle";
import { UpdateNotice, VersionStatus } from "./UpdateNotice";

const NOTES = notesFor("planner");

/** Public page: everything that changed in the planner, newest first. Opening it counts as seeing the latest update. */
export function WhatsNewPage() {
  useEffect(() => {
    markAllSeen("planner");
  }, []);
  return (
    <div className="app public-app">
      <UpdateNotice />
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Link to="/">
              <BrandWordmark />
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
        <VersionStatus />
        <WhatsNewList notes={NOTES} />
      </main>
    </div>
  );
}
