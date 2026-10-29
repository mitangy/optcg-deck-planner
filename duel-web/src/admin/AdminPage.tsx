import { useCallback, useEffect, useRef, useState } from "react";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@optcg/ui/tabs";
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
import { type AdminTab, type RangeDays, tabsForRole } from "./adminLogic";
import { BotsTab } from "./BotsTab";
import { EventTab } from "./EventTab";
import { HostingTab } from "./HostingTab";
import { PlayersTab } from "./PlayersTab";
import { ReportsTab } from "./ReportsTab";
import { UploadsTab } from "./UploadsTab";
import { UsersTab, type Actor } from "./UsersTab";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/**
 * One tab's data: fetched when the tab first opens, again on Refresh, and again when `key` changes (a new date range).
 * The data on screen stays until the new response lands, so the page does not blank or jump; a response for an
 * older key is dropped.
 */
function useTabData<T>(active: boolean, fetcher: (force: boolean) => Promise<T>, key: string | number = "") {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const [started, setStarted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(fetcher);
  latest.current = fetcher;
  const seq = useRef(0);
  const run = useCallback((force = false) => {
    const mine = ++seq.current;
    setRefreshing(true);
    latest.current(force)
      .then((data) => mine === seq.current && setState({ status: "ready", data }))
      .catch((e: Error) => mine === seq.current && setState((s) => (s.status === "ready" ? s : { status: "error", message: e.message })))
      .finally(() => mine === seq.current && setRefreshing(false));
  }, []);
  const lastKey = useRef(key);
  useEffect(() => {
    if (active && !started) {
      setStarted(true);
      lastKey.current = key;
      run(false);
    } else if (started && lastKey.current !== key) {
      lastKey.current = key;
      run(false);
    }
  }, [active, started, run, key]);
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

  // Each tab keeps its own date range, so switching tabs does not reset the other one.
  const [overviewDays, setOverviewDays] = useState<RangeDays>(30);
  const [botsDays, setBotsDays] = useState<RangeDays>(14);
  const overview = useTabData<AdminOverview>(current === "players", () => fetchAdminOverview(overviewDays), overviewDays);
  const bots = useTabData<AdminBots>(current === "bots", () => fetchAdminBots(botsDays), botsDays);
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
    if (current === "event") return <EventTab />;
    if (current === "reports") return <ReportsTab actor={who.status === "ok" ? who.actor : { id: 0, role: "user" }} />;
    if (current === "uploads") return <UploadsTab actor={who.status === "ok" ? who.actor : { id: 0, role: "user" }} />;
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
    if (current === "players") {
      const d = s.data as AdminOverview;
      return <PlayersTab data={d} days={overviewDays} onDaysChange={setOverviewDays} stale={refreshing || d.days !== overviewDays} />;
    }
    if (current === "bots") {
      const d = s.data as AdminBots;
      return <BotsTab data={d} days={botsDays} onDaysChange={setBotsDays} stale={refreshing || d.days !== botsDays} />;
    }
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

        <TabGroup
          selectedIndex={Math.max(0, tabs.findIndex((t) => t.id === current))}
          onChange={(i) => setTab(tabs[i]!.id)}
        >
          <div className="adm-tabbar">
            <TabList className="adm-tabs" aria-label="Admin sections">
              {tabs.map((t) => (
                <Tab key={t.id} className="adm-tab">
                  {t.label}
                </Tab>
              ))}
            </TabList>
            {tabData ? (
              <button type="button" className="btn btn-secondary btn-sm adm-refresh" onClick={() => tabData.run(true)} disabled={refreshing} aria-busy={refreshing}>
                Refresh
              </button>
            ) : null}
          </div>

          <TabPanels>
            {tabs.map((t) => (
              <TabPanel key={t.id} className="adm-body">
                {t.id === current ? body() : null}
              </TabPanel>
            ))}
          </TabPanels>
        </TabGroup>
      </div>
    </div>
  );
}
