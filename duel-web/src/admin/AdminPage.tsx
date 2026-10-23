import { useCallback, useEffect, useState } from "react";
import { NavMenu } from "../nav/NavMenu";
import { fetchAuthMe } from "../net/api";
import { BackLink } from "../pages/BackLink";
import {
  type AdminBots,
  type AdminHosting,
  type AdminMe,
  type AdminOverview,
  fetchAdminBots,
  fetchAdminHosting,
  fetchAdminMe,
  fetchAdminOverview,
} from "./adminApi";
import { type AdminTab, tabsForRole } from "./adminLogic";
import { BotsTab } from "./BotsTab";
import { HostingTab } from "./HostingTab";
import { PlayersTab } from "./PlayersTab";
import { UsersTab, type Actor } from "./UsersTab";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/** One tab's data: fetched when the tab first opens, again on Refresh. */
function useTabData<T>(active: boolean, fetcher: (force: boolean) => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const [started, setStarted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const run = useCallback((force = false) => {
    setRefreshing(true);
    fetcher(force)
      .then((data) => setState({ status: "ready", data }))
      .catch((e: Error) => setState((s) => (s.status === "ready" ? s : { status: "error", message: e.message })))
      .finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (active && !started) {
      setStarted(true);
      run(false);
    }
  }, [active, started, run]);
  return { state, refreshing, run };
}

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
          <h1 className="page-title">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [who, setWho] = useState<{ status: "loading" } | { status: "none" } | { status: "ok"; me: AdminMe; actor: Actor }>({ status: "loading" });
  const [tab, setTab] = useState<AdminTab | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchAuthMe(), fetchAdminMe()])
      .then(([u, me]) => {
        if (!live) return;
        if (!u || (me.role !== "admin" && me.role !== "moderator")) return setWho({ status: "none" });
        setWho({ status: "ok", me, actor: { id: u.id, role: me.role } });
      })
      .catch(() => live && setWho({ status: "none" }));
    return () => {
      live = false;
    };
  }, []);

  const tabs = who.status === "ok" ? tabsForRole(who.me.role) : [];
  const current = tab && tabs.some((t) => t.id === tab) ? tab : (tabs[0]?.id ?? null);

  const overview = useTabData<AdminOverview>(current === "players", () => fetchAdminOverview());
  const bots = useTabData<AdminBots>(current === "bots", () => fetchAdminBots());
  const hosting = useTabData<AdminHosting>(current === "hosting", fetchAdminHosting);

  if (who.status === "loading") {
    return (
      <Gate title="Admin">
        <p className="panel-copy" role="status">
          Loading…
        </p>
      </Gate>
    );
  }
  if (who.status === "none" || !current) {
    return (
      <Gate title="Not available">
        <section className="panel">
          <p className="panel-copy">This page is only for staff accounts.</p>
        </section>
      </Gate>
    );
  }

  const tabData = current === "players" ? overview : current === "bots" ? bots : current === "hosting" ? hosting : null;
  const refreshing = tabData?.refreshing ?? false;

  function body() {
    if (current === "users") return <UsersTab actor={who.status === "ok" ? who.actor : { id: 0, role: "user" }} />;
    const s = tabData!.state;
    if (s.status === "loading") return <p className="panel-copy adm-muted" role="status">Loading…</p>;
    if (s.status === "error") {
      return (
        <p className="panel-copy adm-error" role="alert">
          Could not load this tab: {s.message}
        </p>
      );
    }
    if (current === "players") return <PlayersTab data={s.data as AdminOverview} />;
    if (current === "bots") return <BotsTab data={s.data as AdminBots} />;
    return <HostingTab data={s.data as AdminHosting} />;
  }

  return (
    <div className="app-shell">
      <div className="page adm-page">
        <header className="page-header">
          <NavMenu />
          <BackLink to="/" label="Home" ariaLabel="Back to home" />
          <h1 className="page-title">Admin</h1>
          <span className="adm-role">{who.me.role}</span>
        </header>

        <div className="adm-tabbar">
          <div className="adm-tabs" role="tablist" aria-label="Admin sections">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === current} className="adm-tab" onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          {tabData ? (
            <button type="button" className="btn btn-secondary btn-sm adm-refresh" onClick={() => tabData.run(true)} disabled={refreshing} aria-busy={refreshing}>
              Refresh
            </button>
          ) : null}
        </div>

        <div className="adm-body" role="tabpanel">
          {body()}
        </div>
      </div>
    </div>
  );
}
