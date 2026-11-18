import assert from "node:assert/strict";
import { getRankedMatchCreateSecret } from "../src/env.js";
import { parseCreateOptions } from "../src/protocol.js";
import { buildRoomConfig } from "../src/rooms/duel/config.js";
import { mintTestTournamentTicket } from "./tournamentTicketHelper.js";

describe("buildRoomConfig", () => {
  const build = (options: Record<string, unknown>) => buildRoomConfig(options, parseCreateOptions(options));

  it("makes a room ranked only when the matchmaker's attestation comes with the request (refactor 3.5b)", () => {
    const forged = build({ ranked: true });
    assert.equal(forged.requestedRanked, true);
    assert.equal(forged.ranked, false);
    const attested = build({ ranked: true, rankedAttestation: getRankedMatchCreateSecret() });
    assert.equal(attested.ranked, true);
    assert.equal(build({ rankedAttestation: getRankedMatchCreateSecret() }).ranked, false, "an attestation alone does not rank a room");
  });

  it("a valid tournament ticket makes an unranked room a tournament room for its two accounts (#1344)", () => {
    const c = build({ tournamentTicket: mintTestTournamentTicket({ seats: [11, 12] }) });
    assert.equal(c.tournament, true);
    assert.deepEqual(c.tournamentSeats, [11, 12]);
    assert.equal(c.ranked, false);
  });

  it("a missing, forged or expired ticket leaves the room a plain one instead of rejecting the create (#1344)", () => {
    const now = Math.floor(Date.now() / 1000);
    for (const tournamentTicket of [
      undefined,
      "not-a-ticket",
      mintTestTournamentTicket({ seats: [11, 12], secret: "elsewhere" }),
      mintTestTournamentTicket({ seats: [11, 12], now: now - 7200 }),
    ]) {
      const c = build({ tournamentTicket });
      assert.equal(c.tournament, false);
      assert.equal(c.tournamentSeats, undefined);
    }
  });

  it("a bot room or a ranked room is never a tournament room, whatever ticket comes with it (#1344)", () => {
    const tournamentTicket = mintTestTournamentTicket({ seats: [11, 12] });
    const bot = build({ tournamentTicket, bot: { level: "easy", deck: { leaderId: "OP01-001", deck: ["ST01-003"] } } });
    assert.equal(bot.tournament, false);
    const ranked = build({ tournamentTicket, ranked: true, rankedAttestation: getRankedMatchCreateSecret() });
    assert.equal(ranked.ranked, true);
    assert.equal(ranked.tournament, false);
  });
});
