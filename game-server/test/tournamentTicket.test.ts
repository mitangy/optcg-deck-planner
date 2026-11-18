import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "mocha";
import { getGameTokenSecret } from "../src/env.js";
import { mintBriefTicket } from "../src/briefTicket.js";
import { verifyTournamentTicket } from "../src/tournamentTicket.js";
import { mintTestTournamentTicket } from "./tournamentTicketHelper.js";

type Vector = { secret: string; now: number; claims: { tm: number; seats: [number, number] }; ticket: string };
const vector = JSON.parse(
  readFileSync(new URL("../../backend/tests/fixtures/tournament_ticket_vector.json", import.meta.url), "utf8"),
) as Vector;

function withSecret<T>(secret: string, fn: () => T): T {
  const prev = process.env.GAME_TOKEN_SECRET;
  process.env.GAME_TOKEN_SECRET = secret;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.GAME_TOKEN_SECRET;
    else process.env.GAME_TOKEN_SECRET = prev;
  }
}

describe("tournament room ticket", () => {
  it("the game server accepts the ticket the backend signs for the shared vector (#1344)", () => {
    const claims = withSecret(vector.secret, () => verifyTournamentTicket(vector.ticket, vector.now));
    assert.deepEqual(claims, { matchId: vector.claims.tm, seats: vector.claims.seats });
  });

  it("a ticket for another secret, with a changed seat list or with a bad signature is refused (#1344)", () => {
    const now = 1_000;
    const good = mintTestTournamentTicket({ seats: [1, 2], now });
    assert.deepEqual(verifyTournamentTicket(good, now)?.seats, [1, 2]);
    const [prefix, body, sig] = good.split(".");
    const widened = Buffer.from(JSON.stringify({ k: "tournament_room", tm: 1, seats: [1, 3], exp: now + 900 })).toString("base64url");
    assert.equal(verifyTournamentTicket(`${prefix}.${widened}.${sig}`, now), null);
    assert.equal(verifyTournamentTicket(`${prefix}.${body}.${sig!.slice(0, -2)}AA`, now), null);
    assert.equal(verifyTournamentTicket(mintTestTournamentTicket({ seats: [1, 2], now, secret: "another-secret" }), now), null);
    assert.equal(verifyTournamentTicket(undefined, now), null);
    assert.equal(verifyTournamentTicket("tr1.x", now), null);
  });

  it("an expired ticket is refused (#1344)", () => {
    const ticket = mintTestTournamentTicket({ seats: [1, 2], now: 1_000, ttl: 900 });
    assert.ok(verifyTournamentTicket(ticket, 1_900));
    assert.equal(verifyTournamentTicket(ticket, 1_901), null);
  });

  it("a ticket signed for another purpose is refused, and neither a game token nor a brief ticket passes for one (#1344)", () => {
    const now = 1_000;
    assert.equal(verifyTournamentTicket(mintTestTournamentTicket({ seats: [1, 2], now, kind: "match_brief" }), now), null);
    const gameBody = Buffer.from(JSON.stringify({ uid: 1, email: "a@x", exp: now + 900, k: "tournament_room", seats: [1, 2], tm: 1 })).toString("base64url");
    const gameSig = createHmac("sha256", getGameTokenSecret()).update(gameBody).digest("base64url");
    assert.equal(verifyTournamentTicket(`tr1.${gameBody}.${gameSig}`, now), null, "an unsalted signature is a game token's");
    const brief = mintBriefTicket({ mid: "r", seat: 0, ranked: false, leader: "OP01-001", opponent: "ST01-001", deck: ["ST01-003"] }, now)!;
    assert.equal(verifyTournamentTicket(brief, now), null);
    assert.equal(verifyTournamentTicket(brief.replace(/^mb1/, "tr1"), now), null);
  });

  it("a ticket naming the same account twice or no match is refused (#1344)", () => {
    const now = 1_000;
    assert.equal(verifyTournamentTicket(mintTestTournamentTicket({ seats: [5, 5], now }), now), null);
    assert.equal(verifyTournamentTicket(mintTestTournamentTicket({ seats: [1, 2], now, tm: "x" }), now), null);
  });
});
