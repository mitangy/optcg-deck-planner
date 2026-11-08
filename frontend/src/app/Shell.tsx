import { Topbar } from "./Topbar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api, User } from "../api";
import { DUEL_URL } from "./duelLink";
import { DiscordLink } from "./DiscordLink";
import { CornerNotices } from "./UpdateNotice";
import { BuildTag } from "@optcg/ui/appShell";
import { ThemeToggle } from "../ui/ThemeToggle";
import { NotificationsBell } from "../prices/PriceAlerts";
import { FriendsNavLink } from "../friends/FriendsNavLink";
import { CardLightboxActionContext } from "../ui/CardThumb";
import { renderLightboxActions } from "../pages/shopping/lightboxActions";
import { qk } from "../cache/queryKeys";

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.me() });
      navigate("/login");
    },
  });
  const shortName = (user.name || user.email).split("@")[0];
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // On phones the nav row scrolls inside itself; keep the active link visible.
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>("a.active");
    if (!nav || !active) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <CardLightboxActionContext.Provider value={renderLightboxActions}>
    <div className="app">
      <Topbar
        nav={
          <nav aria-label="Primary" ref={navRef}>
            <NavLink to="/" end>
              Shopping
            </NavLink>
            <NavLink to="/decks">Decks</NavLink>
            <NavLink to="/meta">Meta</NavLink>
            <NavLink to="/collection">Collection</NavLink>
            <NavLink to="/alerts">Alerts</NavLink>
            <FriendsNavLink />
            <NavLink to="/group-buys">Group buys</NavLink>
            <NavLink to="/import">Import</NavLink>
          </nav>
        }
      >
        <BuildTag />
        <a className="duel-nav-link" href={DUEL_URL} target="_blank" rel="noopener">
          Play Duel
        </a>
        <NotificationsBell />
        <DiscordLink />
        <ThemeToggle />
        <span className="user-name" title={user.email}>
          {shortName}
        </span>
        <button type="button" className="ghost" onClick={() => logout.mutate()}>
          Log out
        </button>
      </Topbar>
      <main className="app-main">{children}</main>
      <CornerNotices />
    </div>
    </CardLightboxActionContext.Provider>
  );
}
