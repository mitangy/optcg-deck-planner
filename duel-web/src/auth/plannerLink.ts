import { consumeHandoffOnLoad, otherAppClickHandler, resolveOtherAppUrl, type ClaimOutcome, type HandoffMinter } from "@optcg/ui/handoff";
import { getPlannerUrl } from "../config";
import { claimHandoffTicket, fetchAuthMe, mintHandoffTicket } from "../net/api";
import { setAuthUser, useAuthUser } from "./session";

/** Marks the visit so the planner can tell it came from a duel link (a plain query: it is not secret). */
export function withFromDuel(path: string): string {
  const hashAt = path.indexOf("#");
  const base = hashAt === -1 ? path : path.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : path.slice(hashAt);
  return `${base}${base.includes("?") ? "&" : "?"}from=duel${hash}`;
}

function minter(signedIn: boolean): HandoffMinter | null {
  return signedIn ? () => mintHandoffTicket("planner") : null;
}

/** Props for an `<a>` to the planner that keeps a signed-in person signed in. Guests get the plain link. */
export function usePlannerLink(path: string): {
  href: string;
  target: "_blank";
  rel: string;
  onClick: (e: React.MouseEvent) => void;
} {
  const signedIn = useAuthUser() !== null;
  const withMark = withFromDuel(path);
  const origin = getPlannerUrl();
  return {
    href: `${origin}${withMark}`,
    target: "_blank",
    rel: "noopener",
    onClick: otherAppClickHandler(origin, withMark, minter(signedIn), { newTab: true }),
  };
}

/** Navigates this tab to the planner; for buttons rather than anchors. */
export async function openOtherApp(path: string, signedIn: boolean): Promise<void> {
  const url = await resolveOtherAppUrl(getPlannerUrl(), withFromDuel(path), minter(signedIn));
  window.location.assign(url);
}

/** Start-up: signs in on a handoff ticket from the planner (if the address carries one) before the app renders. */
export function claimPlannerHandoff(): Promise<ClaimOutcome> {
  return consumeHandoffOnLoad({
    location: window.location,
    history: window.history,
    audience: "duel",
    referrer: document.referrer,
    siblingOrigin: getPlannerUrl(),
    currentUserId: async () => (await fetchAuthMe())?.id ?? null,
    claim: async (ticket, audience) => {
      // The session store may already have an /auth/me in flight from before the cookie existed: setAuthUser wins over it.
      setAuthUser(await claimHandoffTicket(ticket, audience));
    },
  });
}
