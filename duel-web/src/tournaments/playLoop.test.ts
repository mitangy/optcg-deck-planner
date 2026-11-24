import { describe, expect, it, vi } from "vitest";
import { claimMatchRoom, tournamentCreateOptions } from "./playLoop";
import type { PlayResult } from "./tournamentApi";

function script(results: PlayResult[]) {
  const play = vi.fn(async () => results.shift() ?? { action: "wait" as const });
  const sleep = vi.fn(async () => undefined);
  return { play, sleep };
}

describe("claiming a tournament match room (#997)", () => {
  it("hosts straight away when the API says host (#997)", async () => {
    const { play, sleep } = script([{ action: "host" }]);
    expect(await claimMatchRoom(play, sleep)).toEqual({ action: "host" });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("keeps the ticket the API signs for the host, and only for the host (#1344)", async () => {
    const hosted = script([{ action: "host", ticket: "tr1.a.b" }]);
    expect(await claimMatchRoom(hosted.play, hosted.sleep)).toEqual({ action: "host", ticket: "tr1.a.b" });
    const joined = script([{ action: "join", room_id: "r1", ticket: "tr1.a.b" }]);
    expect(await claimMatchRoom(joined.play, joined.sleep)).not.toHaveProperty("ticket");
  });

  it("the room the host creates carries the ticket, unranked, with both seats on the host's deck and the timer (#1344)", () => {
    const wire = { leaderId: "OP01-001", deck: ["ST01-003"] };
    expect(tournamentCreateOptions(wire, { turnSeconds: 30 }, "tr1.a.b")).toEqual({
      ranked: false,
      tournamentTicket: "tr1.a.b",
      players: [wire, wire],
      timer: { turnSeconds: 30 },
    });
  });

  it("joins the room the opponent opened, with its server (#997)", async () => {
    const { play, sleep } = script([{ action: "join", room_id: "r1", server_url: "https://g" }]);
    expect(await claimMatchRoom(play, sleep)).toEqual({ action: "join", room_id: "r1", server_url: "https://g" });
  });

  it("waits 2s and asks again while the opponent is opening the room (#997)", async () => {
    const { play, sleep } = script([{ action: "wait" }, { action: "wait" }, { action: "join", room_id: "r2" }]);
    const claim = await claimMatchRoom(play, sleep);
    expect(claim).toMatchObject({ action: "join", room_id: "r2" });
    expect(play).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("gives up after 15 waits with a message to try again (#997)", async () => {
    const { play, sleep } = script([]);
    await expect(claimMatchRoom(play, sleep)).rejects.toThrow();
    expect(sleep).toHaveBeenCalledTimes(15);
  });
});
