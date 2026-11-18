import { createHmac, timingSafeEqual } from "node:crypto";
import { getGameTokenSecret } from "./env.js";

export const TOURNAMENT_TICKET_KIND = "tournament_room";

export type TournamentTicketClaims = {
  /** The tournament match the backend opened this room for. */
  matchId: number;
  /** The two accounts that may sit in the room, in no particular seat order. */
  seats: [number, number];
};

// The key is the game-token secret with its own salt, so neither a game token nor a brief ticket verifies as one.
export function verifyTournamentTicket(
  ticket: unknown,
  nowSec: number = Math.floor(Date.now() / 1000),
): TournamentTicketClaims | null {
  if (typeof ticket !== "string") return null;
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== "tr1") return null;
  const [, body, sig] = parts as [string, string, string];
  const expected = createHmac("sha256", "tournament-room:" + getGameTokenSecret()).update(body).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || payload.k !== TOURNAMENT_TICKET_KIND) return null;
  if (typeof payload.exp !== "number" || payload.exp < nowSec) return null;
  const seats = payload.seats;
  if (!Array.isArray(seats) || seats.length !== 2) return null;
  const [x, y] = seats as unknown[];
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x === y) return null;
  if (!Number.isSafeInteger(payload.tm)) return null;
  return { matchId: payload.tm as number, seats: [x as number, y as number] };
}
