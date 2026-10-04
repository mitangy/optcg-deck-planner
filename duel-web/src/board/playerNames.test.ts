import { describe, expect, it } from "vitest";
import type { SeatPlayers } from "../net/protocol";
import { parseWelcome, PROTOCOL_VERSION } from "../net/protocol";
import { playerNumberLabel, seatLabel, seatName, winnerHeadline } from "./playerNames";

const players: SeatPlayers = [{ name: "Luffy" }, { name: "Kaido" }];

describe("player names", () => {
  it("labels seats with names and falls back to Seat N", () => {
    expect(seatName(players, 1)).toBe("Kaido");
    expect(seatLabel(players, 0)).toBe("Luffy");
    expect(seatLabel(null, 1)).toBe("Seat 1");
    expect(seatLabel([{ name: null }, { name: "B" }], 0)).toBe("Seat 0");
  });

  it("headlines the winner from the viewer's perspective", () => {
    expect(winnerHeadline(players, 0, 0, false)).toBe("You win!");
    expect(winnerHeadline(players, 1, 0, false)).toBe("Kaido wins");
    expect(winnerHeadline(null, 1, 0, false)).toBe("You lose");
    expect(winnerHeadline(players, 1, 0, true)).toBe("Kaido wins");
    expect(winnerHeadline(null, 0, null, true)).toBe("Seat 0 wins");
  });
});

describe("pass-and-play labels", () => {
  it("numbers the players from 1 although seats count from 0 (#282)", () => {
    expect(playerNumberLabel(0)).toBe("Player 1");
    expect(playerNumberLabel(1)).toBe("Player 2");
  });
});

describe("parseWelcome players", () => {
  const view = {
    seat: 0,
    you: { hand: [] },
    opponent: { handCount: 0 },
    legalIntents: [],
  };

  it("parses seat-indexed names and tolerates their absence", () => {
    const withNames = parseWelcome({
      protocolVersion: PROTOCOL_VERSION,
      matchId: "m",
      seat: 0,
      view,
      players: [{ name: " Luffy " }, { name: "" }],
    });
    expect(withNames.players).toEqual([{ name: "Luffy" }, { name: null }]);

    const legacy = parseWelcome({ protocolVersion: PROTOCOL_VERSION, matchId: "m", seat: 0, view });
    expect(legacy.players).toBeUndefined();

    const junk = parseWelcome({
      protocolVersion: PROTOCOL_VERSION,
      matchId: "m",
      seat: 0,
      view,
      players: "nope",
    });
    expect(junk.players).toBeUndefined();
  });
});
