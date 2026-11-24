import { createHmac } from "node:crypto";
import { getGameTokenSecret } from "./env.js";

// Long enough for a long casual game.
export const BRIEF_TICKET_TTL_SEC = 3 * 3600;

export type BriefTicketClaims = {
  mid: string;
  seat: 0 | 1;
  ranked: boolean;
  leader: string;
  opponent: string;
  deck: string[];
};

// The key is the game-token secret with a salt, so a game token never verifies as a ticket.
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
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", "match-brief:" + getGameTokenSecret()).update(body).digest("base64url");
  return `mb1.${body}.${sig}`;
}
