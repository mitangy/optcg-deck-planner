import { describe, expect, it, vi } from "vitest";
import { claimMatchRoom } from "./playLoop";
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
