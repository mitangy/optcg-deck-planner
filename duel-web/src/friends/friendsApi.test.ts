import { describe, expect, it } from "vitest";
import { friendActions, type Friend } from "./friendsApi";

const friend = (over: Partial<Friend>): Friend => ({
  user_id: 1,
  username: "Zoro",
  status: "offline",
  room_id: null,
  ranked: false,
  ...over,
});

describe("friendActions", () => {
  it("offers Watch for a friend in a game, but not Invite", () => {
    expect(friendActions(friend({ status: "in_game", room_id: "r1" }))).toEqual({ invite: false, spectate: true });
  });

  it("offers Invite only to an online friend", () => {
    expect(friendActions(friend({ status: "online" }))).toEqual({ invite: true, spectate: false });
    expect(friendActions(friend({ status: "offline" })).invite).toBe(false);
    expect(friendActions(friend({ status: "waiting" })).invite).toBe(false);
  });

  it("never offers Watch without a room to join", () => {
    expect(friendActions(friend({ status: "in_game", room_id: null })).spectate).toBe(false);
  });
});
