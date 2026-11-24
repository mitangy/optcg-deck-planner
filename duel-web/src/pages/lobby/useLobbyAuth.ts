import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { needsUsername } from "@optcg/ui/username";
import { useAuth } from "../../auth/session";
import { fetchRatingMe, type RatingMe } from "../../net/api";
import { devKeyAllowed, loadSettings } from "../../settings";

export function useLobbyAuth(watchRoomId: string | null) {
  const navigate = useNavigate();
  const [settings] = useState(loadSettings);
  const { status, user: authUser } = useAuth();
  const authChecked = status !== "loading";
  const [bounty, setBounty] = useState<number | null>(null);
  const [me, setMe] = useState<RatingMe | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;
    if (authUser) {
      void fetchRatingMe()
        .then((r) => {
          setMe(r);
          if (r) setBounty(r.rating);
        })
        .catch(() => setMe(null));
    }
    // Signed in but never picked a username (e.g. closed the tab mid-setup).
    // A spectate link works without one.
    if (needsUsername(authUser) && !watchRoomId) navigate("/welcome/username", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, authUser?.id]);

  const authMode: "guest" | "google" | "dev" = authUser ? "google" : devKeyAllowed() && settings.useDevKey ? "dev" : "guest";

  const matchOwner: "session" | "dev" | undefined =
    authMode === "google" ? "session" : authMode === "dev" && settings.devUserKey.trim() ? "dev" : undefined;

  const accountName =
    authMode === "google" && authUser
      ? authUser.username || authUser.email
      : authMode === "dev"
        ? `Dev · ${settings.devUserKey || "web-dev"}`
        : "Guest";

  return { settings, authUser, authChecked, authMode, matchOwner, accountName, bounty, setBounty, me };
}
