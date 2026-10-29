import { describe, expect, it } from "vitest";
import type { SeatPlayers, SeatSkin } from "../net/protocol";
import { historyReportTarget, matchReportTarget } from "./reportTargets";

const players: SeatPlayers = [{ name: "Luffy" }, { name: "Nami" }];
const skin = (mat: string | null): SeatSkin => ({ playmat: mat, cardBack: null, donArt: null });
const skins: [SeatSkin | null, SeatSkin | null] = [skin("data:image/png;base64,SEAT0"), skin("data:image/png;base64,SEAT1")];

describe("who a match screen reports (#810)", () => {
  it("a player reports the other seat, with that seat's art and not their own (#810)", () => {
    const seat0 = matchReportTarget({ source: "match", matchId: "r1", spectating: false, mySeat: 0, players, seatSkins: skins });
    expect(seat0?.players).toEqual([{ name: "Nami", seat: 1, images: { playmat: "data:image/png;base64,SEAT1", cardBack: null } }]);
    const seat1 = matchReportTarget({ source: "postmatch", matchId: "r1", spectating: false, mySeat: 1, players, seatSkins: skins });
    expect(seat1?.source).toBe("postmatch");
    expect(seat1?.players.map((p) => [p.name, p.seat])).toEqual([["Luffy", 0]]);
  });

  it("a spectator chooses between both seats; a viewer with no seat and no match report nothing (#810)", () => {
    const spec = matchReportTarget({ source: "spectate", matchId: "r1", spectating: true, mySeat: null, players, seatSkins: skins });
    expect(spec?.players.map((p) => [p.name, p.seat])).toEqual([["Luffy", 0], ["Nami", 1]]);
    expect(matchReportTarget({ source: "match", matchId: "r1", spectating: false, mySeat: null, players, seatSkins: skins })).toBeNull();
    expect(matchReportTarget({ source: "match", matchId: null, spectating: false, mySeat: 0, players, seatSkins: skins })).toBeNull();
  });

  it("an opponent whose skin has not arrived shows default art (#810)", () => {
    const t = matchReportTarget({ source: "match", matchId: "r1", spectating: false, mySeat: 0, players, seatSkins: [null, null] });
    expect(t?.players[0]?.images).toEqual({ playmat: null, cardBack: null });
  });

  it("History reports the seat that is not yours, and nobody for a game with no opponent name (#810)", () => {
    expect(historyReportTarget({ match_id: "m9", your_seat: 0, opponent_name: "Nami" })?.players).toEqual([{ name: "Nami", seat: 1 }]);
    expect(historyReportTarget({ match_id: "m9", your_seat: 1, opponent_name: "Luffy" })?.players[0]?.seat).toBe(0);
    expect(historyReportTarget({ match_id: "m9", your_seat: 1, opponent_name: "" })).toBeNull();
  });
});
