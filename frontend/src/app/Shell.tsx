import { Topbar } from "./Topbar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, User } from "../api";
import { duelLinkProps } from "./duelLink";
import { DiscordLink } from "./DiscordLink";
import { CornerNotices } from "./UpdateNotice";
import { ThemeToggle } from "../ui/ThemeToggle";
import { NotificationsBell } from "../prices/PriceAlerts";
import { BottomNav, TopNav } from "./primaryNav";
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

  return (
    <CardLightboxActionContext.Provider value={renderLightboxActions}>
    <div className="app">
      <Topbar nav={<TopNav />}>
        <a className="duel-nav-link" {...duelLinkProps("/")}>
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
      <BottomNav />
    </div>
    </CardLightboxActionContext.Provider>
  );
}
