import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { friendsApi } from "./friendsApi";
import { badgeLabel, navBadgeCount } from "./tradeLogic";
import { qk } from "../cache/queryKeys";

export function FriendsNavLink() {
  const { data } = useQuery({
    queryKey: qk.tradesSummary(),
    queryFn: friendsApi.tradesSummary,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const count = navBadgeCount(data);
  return (
    <NavLink to="/friends" className="nav-friends">
      Friends
      {count > 0 ? (
        <span className="nav-badge" aria-label={`${count} waiting`}>
          {badgeLabel(count)}
        </span>
      ) : null}
    </NavLink>
  );
}
