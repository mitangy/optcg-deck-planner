import { useQuery } from "@tanstack/react-query";
import { NavLink } from "react-router-dom";
import { friendsApi } from "./friendsApi";
import { badgeLabel, navBadgeCount } from "./tradeLogic";
import { qk } from "../cache/queryKeys";

/** Number of friend trades waiting on the viewer (0 when none or unknown). */
export function useFriendsBadgeCount(): number {
  const { data } = useQuery({
    queryKey: qk.tradesSummary(),
    queryFn: friendsApi.tradesSummary,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return navBadgeCount(data);
}

export function NavBadge({ count }: { count: number }) {
  return count > 0 ? (
    <span className="nav-badge" aria-label={`${count} waiting`}>
      {badgeLabel(count)}
    </span>
  ) : null;
}

export function FriendsNavLink() {
  const count = useFriendsBadgeCount();
  return (
    <NavLink to="/friends" className="nav-friends">
      Friends
      <NavBadge count={count} />
    </NavLink>
  );
}
