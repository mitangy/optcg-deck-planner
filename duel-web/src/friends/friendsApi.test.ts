import { describe, expect, it } from "vitest";
import type { MatchLaunch } from "../state/DuelSession";
import { friendActions, inviteFrom, pollsInvitesInMatch, type Friend, type FriendInvite } from "./friendsApi";

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

  it("offers Invite to a free friend, never to an offline one or one in a game", () => {
    expect(friendActions(friend({ status: "online" }))).toEqual({ invite: true, spectate: false });
    expect(friendActions(friend({ status: "offline" })).invite).toBe(false);
    expect(friendActions(friend({ status: "in_game", room_id: "r1" })).invite).toBe(false);
  });

  it("offers Invite to a friend who is watching a game, and still Watch (#1199)", () => {
    expect(friendActions(friend({ status: "spectating", room_id: "r1" }))).toEqual({ invite: true, spectate: true });
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
    expect(pollsInvitesInMatch(waiting)).toBe(true);
  });

  it("stops once the match starts", () => {
    expect(pollsInvitesInMatch({ ...waiting, view: {} })).toBe(false);
  });

  it("never polls for a guest or a ranked queue", () => {
    expect(pollsInvitesInMatch({ ...waiting, launch: { ...ownRoom, friends: false } })).toBe(false);
    expect(pollsInvitesInMatch({ ...waiting, launch: { ...ownRoom, invite: false } })).toBe(false);
  });
});

describe("invites while you spectate (#1199)", () => {
  const watching: MatchLaunch = { status: "Connecting to the match…", leaderId: null, invite: false, friends: true };
  const spectating = { launch: watching, role: "spectator" as const, view: {}, matchId: "room-zoro" };

  it("polls invites while spectating, even after the match starts (#1199)", () => {
    expect(pollsInvitesInMatch(spectating)).toBe(true);
    expect(pollsInvitesInMatch({ ...spectating, view: null })).toBe(true);
  });

  it("does not poll for a guest spectator or before a room is joined (#1199)", () => {
    expect(pollsInvitesInMatch({ ...spectating, launch: { ...watching, friends: false } })).toBe(false);
    expect(pollsInvitesInMatch({ ...spectating, launch: null })).toBe(false);
    expect(pollsInvitesInMatch({ ...spectating, matchId: null })).toBe(false);
  });

  it("does not poll a player whose own match has started, only a spectator (#1199)", () => {
    const player = { launch: { ...watching, invite: true }, role: "player" as const, view: {}, matchId: "room-you" };
    expect(pollsInvitesInMatch(player)).toBe(false);
  });
});
