import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { needsUsername } from "@optcg/ui/username";
import { useAuth } from "../../auth/session";
import { fetchRatingMe, type RatingMe } from "../../net/api";
import { devKeyAllowed, loadSettings } from "../../settings";

/**
 * Who is at the lobby: the signed-in account (if any), the Bounty and rank for the top bar and the voyage card,
 * and how the next match signs in (guest, Google or the dev key).
 */
export function useLobbyAuth(watchRoomId: string | null) {
  const navigate = useNavigate();
  const [settings] = useState(loadSettings);
  const { status, user: authUser } = useAuth();
  /** Sign-in has settled, so a spectate link knows which token to mint. */
  const authChecked = status !== "loading";
  const [bounty, setBounty] = useState<number | null>(null);
  /** Your Bounty, record and rank: undefined while loading, null when signed out or the call failed. */
  const [me, setMe] = useState<RatingMe | null | undefined>(undefined);

  useEffect(() => {
    if (status === "loading") return;
    if (authUser) {
      // Fills the top bar's Bounty and the Your voyage card without minting a token.
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

  /** Account that could hold a match on another device (guest ids are per browser). */
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
