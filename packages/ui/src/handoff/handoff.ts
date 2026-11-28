/**
 * Keeps a person signed in when a link takes them between OPTCG Duel and the planner (#1502).
 *
 * The sending app asks the shared backend for a single-use ticket and puts it in the URL *fragment* (never the
 * query: fragments are not sent to servers or in Referer). The receiving app strips it from the address bar before
 * it does anything else, then claims it.
 */

export type HandoffAudience = "planner" | "duel";

export const HANDOFF_PARAM = "handoff";
/** The account id the ticket was minted for: not secret, lets the receiver skip a claim it does not need. */
export const HANDOFF_USER_PARAM = "hu";

export type HandoffTicket = { ticket: string; userId: number | null };

type LocationLike = { pathname: string; search: string; hash: string };
type HistoryLike = { replaceState: (data: unknown, unused: string, url?: string | null) => void };

/** Reads `handoff=` out of the fragment and removes it (and `hu=`) from the address bar at once; other fragment params stay. */
export function takeHandoffFromLocation(loc: LocationLike, history: HistoryLike): HandoffTicket | null {
  const params = new URLSearchParams(loc.hash.replace(/^#/, ""));
  const ticket = params.get(HANDOFF_PARAM);
  if (ticket === null) return null;
  const rawUser = params.get(HANDOFF_USER_PARAM);
  params.delete(HANDOFF_PARAM);
  params.delete(HANDOFF_USER_PARAM);
  const rest = params.toString();
  history.replaceState(null, "", `${loc.pathname}${loc.search}${rest ? `#${rest}` : ""}`);
  const userId = rawUser !== null && /^\d+$/.test(rawUser) ? Number(rawUser) : null;
  return ticket ? { ticket, userId } : null;
}

export type ClaimOutcome = "none" | "skipped" | "ignored" | "claimed" | "failed";

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Runs once at start-up, before the first render. Never throws: if anything goes wrong the person simply lands on the path
 * they asked for.
 *
 * A ticket signs the browser in as whoever minted it, so a ticket planted in a link by an attacker would log a victim into the
 * attacker's account (login CSRF). Hence:
 * - already signed in as someone else, or unsure who: never claim, just drop the ticket;
 * - signed out: claim only when the visit came from the sibling app (its origin is the referrer).
 * The same-account case burns the ticket instead of leaving a live one behind.
 */
export async function consumeHandoffOnLoad(deps: {
  location: LocationLike;
  history: HistoryLike;
  audience: HandoffAudience;
  /** `document.referrer`. */
  referrer: string;
  /** Origin of the other app (the only legitimate sender). */
  siblingOrigin: string;
  /** The account this browser is already signed in as on this app, or null. */
  currentUserId: () => Promise<number | null>;
  claim: (ticket: string, audience: HandoffAudience) => Promise<unknown>;
}): Promise<ClaimOutcome> {
  const taken = takeHandoffFromLocation(deps.location, deps.history);
  if (!taken) return "none";
  try {
    const current = await deps.currentUserId().catch(() => null);
    if (current !== null) {
      if (taken.userId !== null && current === taken.userId) {
        // Already the same person: spend the ticket so it cannot be replayed, but do not wait for it.
        void deps.claim(taken.ticket, deps.audience).catch(() => undefined);
        return "skipped";
      }
      return "ignored";
    }
    const sender = originOf(deps.referrer);
    if (sender === null || sender !== originOf(deps.siblingOrigin)) return "ignored";
    await deps.claim(taken.ticket, deps.audience);
    return "claimed";
  } catch {
    return "failed";
  }
}

export type HandoffMinter = () => Promise<{ ticket: string; user_id: number } | null>;

/** `path` may carry its own query and fragment (a `#list=…` deck paste); the ticket is merged into the fragment. */
export function buildHandoffUrl(
  origin: string,
  path: string,
  handoff: { ticket: string; userId: number } | null,
): string {
  const base = origin.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  if (!handoff) return `${base}${rel}`;
  const hashAt = rel.indexOf("#");
  const beforeHash = hashAt === -1 ? rel : rel.slice(0, hashAt);
  const params = new URLSearchParams(hashAt === -1 ? "" : rel.slice(hashAt + 1));
  params.set(HANDOFF_PARAM, handoff.ticket);
  params.set(HANDOFF_USER_PARAM, String(handoff.userId));
  return `${base}${beforeHash}#${params.toString()}`;
}

/** The URL to open on the other app: with a ticket when one could be minted, otherwise plain (a guest, or a network blip). */
export async function resolveOtherAppUrl(origin: string, path: string, mint: HandoffMinter | null): Promise<string> {
  let handoff: { ticket: string; userId: number } | null = null;
  if (mint) {
    try {
      const minted = await mint();
      if (minted?.ticket) handoff = { ticket: minted.ticket, userId: minted.user_id };
    } catch {
      /* open signed out */
    }
  }
  return buildHandoffUrl(origin, path, handoff);
}

type ClickLike = {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
  preventDefault: () => void;
};

/**
 * onClick for an `<a href={plainUrl}>` that opens the other app. Modified clicks and signed-out viewers (`mint` null) keep the
 * plain link. A new tab is opened *before* the ticket request so the popup blocker still sees the click.
 */
export function otherAppClickHandler(
  origin: string,
  path: string,
  mint: HandoffMinter | null,
  opts: { newTab?: boolean } = {},
): (e: ClickLike) => void {
  return (e) => {
    if (e.defaultPrevented || (e.button ?? 0) !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!mint) return;
    if (opts.newTab) {
      const win = window.open("", "_blank");
      // Blocked: let the browser follow the plain link instead of moving this tab.
      if (!win) return;
      e.preventDefault();
      // The ticket request must not give the new tab a handle back to this page.
      win.opener = null;
      // Navigated from this page, so the other app sees this origin as the referrer (it only claims a ticket from its sibling).
      void resolveOtherAppUrl(origin, path, mint).then((url) => win.location.replace(url));
      return;
    }
    e.preventDefault();
    void resolveOtherAppUrl(origin, path, mint).then((url) => window.location.assign(url));
  };
}
