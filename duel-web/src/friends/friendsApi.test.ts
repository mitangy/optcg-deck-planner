import { describe, expect, it } from "vitest";
import type { MatchLaunch } from "../state/DuelSession";
import { friendActions, inviteFrom, pollsInvitesWhileWaiting, type Friend, type FriendInvite } from "./friendsApi";

const friend = (over: Partial<Friend>): Friend => ({
  user_id: 1,
  username: "Zoro",
  status: "offline",
  room_id: null,
  ranked: false,
  ...over,
});

const invite = (over: Partial<FriendInvite>): FriendInvite => ({
  id: 7,
  from_user_id: 1,
  from_username: "Zoro",
  room_id: "room-zoro",
  expires_at: 0,
  ...over,
});

describe("friendActions", () => {
  it("offers Watch for a friend in a game, but not Invite", () => {
    expect(friendActions(friend({ status: "in_game", room_id: "r1" }))).toEqual({ invite: false, spectate: true });
  });

  it("offers Invite only to an online friend", () => {
    expect(friendActions(friend({ status: "online" }))).toEqual({ invite: true, spectate: false });
    expect(friendActions(friend({ status: "offline" })).invite).toBe(false);
    expect(friendActions(friend({ status: "spectating", room_id: "r1" })).invite).toBe(false);
  });

  it("offers Invite to a friend waiting in their own private room (#313)", () => {
    expect(friendActions(friend({ status: "waiting" })).invite).toBe(true);
  });

  it("never offers Watch without a room to join", () => {
    expect(friendActions(friend({ status: "in_game", room_id: null })).spectate).toBe(false);
  });
});

describe("inviting a friend who already invited you (#313)", () => {
  it("finds their invite so Invite takes that seat instead of opening a second room", () => {
    const theirs = invite({ id: 9, from_user_id: 1 });
    const someoneElse = invite({ id: 8, from_user_id: 2, from_username: "Nami" });
    expect(inviteFrom(friend({ user_id: 1 }), [someoneElse, theirs])).toBe(theirs);
    expect(inviteFrom(friend({ user_id: 3 }), [someoneElse, theirs])).toBeNull();
  });
});

describe("invites while you wait in your own room (#313)", () => {
  const ownRoom: MatchLaunch = { status: "Opening your room…", leaderId: "ST01-001", invite: true, friends: true };
  const waiting = { launch: ownRoom, role: "player" as const, view: null, matchId: "room-you" };

  it("polls for invites while you sit alone in your own private room", () => {
    expect(pollsInvitesWhileWaiting(waiting)).toBe(true);
  });

  it("stops once the match starts", () => {
    expect(pollsInvitesWhileWaiting({ ...waiting, view: {} })).toBe(false);
  });

  it("never polls for a guest, a ranked queue, or a spectator", () => {
    expect(pollsInvitesWhileWaiting({ ...waiting, launch: { ...ownRoom, friends: false } })).toBe(false);
    expect(pollsInvitesWhileWaiting({ ...waiting, launch: { ...ownRoom, invite: false } })).toBe(false);
    expect(pollsInvitesWhileWaiting({ ...waiting, role: "spectator" })).toBe(false);
  });
});
