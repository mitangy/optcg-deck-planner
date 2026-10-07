import { createHmac } from "node:crypto";
import { getGameTokenSecret } from "./env.js";

/** A brief ticket is good for three hours (long enough for a long casual game). */
export const BRIEF_TICKET_TTL_SEC = 3 * 3600;

export type BriefTicketClaims = {
  /** The game key (`matchId`, or `matchId-rN` for a rematch). */
  mid: string;
  seat: 0 | 1;
  ranked: boolean;
  /** The seat's own leader. */
  leader: string;
  /** The other seat's leader. */
  opponent: string;
  /** The seat's own 50-card deck (no leader). */
  deck: string[];
};

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Sign a matchup-brief ticket: `mb1.<b64url(json)>.<b64url(hmac)>`. The key is the
 * game-token secret with a salt, so a game token never verifies as a ticket.
 * Ranked games never get one (the backend refuses `ranked: true` as well).
 */
export function mintBriefTicket(
  claims: BriefTicketClaims,
  nowSec: number = Math.floor(Date.now() / 1000),
): string | null {
  if (claims.ranked) return null;
  const payload = {
    p: "match_brief",
    mid: claims.mid,
    seat: claims.seat,
    ranked: false,
    leader: claims.leader,
    opponent: claims.opponent,
    deck: claims.deck,
    exp: nowSec + BRIEF_TICKET_TTL_SEC,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(
    createHmac("sha256", "match-brief:" + getGameTokenSecret()).update(body).digest(),
  );
  return `mb1.${body}.${sig}`;
}
