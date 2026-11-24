import { createHmac } from "node:crypto";
import { getGameTokenSecret } from "../src/env.js";

/** Signs a tournament ticket the way the backend does, with knobs to break one piece at a time. */
export function mintTestTournamentTicket(opts: {
  seats: [number, number];
  now?: number;
  ttl?: number;
  kind?: string;
  secret?: string;
  tm?: unknown;
}): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const payload = { k: opts.kind ?? "tournament_room", tm: opts.tm ?? 1, seats: opts.seats, exp: now + (opts.ttl ?? 900) };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", "tournament-room:" + (opts.secret ?? getGameTokenSecret()))
    .update(body)
    .digest("base64url");
  return `tr1.${body}.${sig}`;
}
