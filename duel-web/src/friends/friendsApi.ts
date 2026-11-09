/** Duel-web ↔ FastAPI friends list, presence status, and private-room invites. */
import { apiCall } from "../api/http";
import type { MatchLaunch } from "../state/DuelSession";

export type FriendStatus = "offline" | "online" | "waiting" | "in_game" | "spectating";

export type Friend = {
  user_id: number;
  username: string;
  status: FriendStatus;
  /** Room the friend is playing or watching; only set when it can be spectated. */
  room_id: string | null;
  /** Game server that room is on, when the API knows it (a pool flip can leave it off the current one). */
  server_url?: string | null;
  ranked: boolean;
};

export type FriendRequest = { user_id: number; username: string };

export type FriendInvite = {
  id: number;
  from_user_id: number;
  from_username: string;
  room_id: string;
  /** Game server the room was opened on; absent on older invites. */
  server_url?: string | null;
  /** Epoch seconds. */
  expires_at: number;
};

export type FriendsState = {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  invites: FriendInvite[];
};

export const call = apiCall;

export function fetchFriends(): Promise<FriendsState> {
  return call<FriendsState>("/friends", {}, "Could not load friends");
}

/** Returns "accepted" when they had already sent you a request. */
export async function sendFriendRequest(username: string): Promise<"pending" | "accepted"> {
  const body = await call<{ status: "pending" | "accepted" }>(
    "/friends/requests",
    { method: "POST", body: JSON.stringify({ username: username.trim() }) },
    "Could not send request",
  );
  return body.status;
}

export function acceptFriendRequest(userId: number): Promise<unknown> {
  return call(`/friends/requests/${userId}/accept`, { method: "POST" }, "Could not accept");
}

/** Unfriend, decline, or cancel a request. */
export function removeFriend(userId: number): Promise<unknown> {
  return call(`/friends/${userId}`, { method: "DELETE" }, "Could not remove");
}

export function inviteFriend(userId: number, roomId: string, serverUrl?: string | null): Promise<FriendInvite> {
  return call<FriendInvite>(
    `/friends/${userId}/invite`,
    { method: "POST", body: JSON.stringify({ room_id: roomId, server_url: serverUrl ?? null }) },
    "Could not send invite",
  );
}

export function dismissInvite(inviteId: number): Promise<unknown> {
  return call(`/friends/invites/${inviteId}`, { method: "DELETE" }, "Could not dismiss invite");
}

/** Which actions a friend row offers. */
export function friendActions(friend: Friend): { invite: boolean; spectate: boolean } {
  return {
    // Anyone not playing: in the lobby, alone in their own private room, or
    // watching a game (the invite shows over their spectator board).
    invite: friend.status === "online" || friend.status === "waiting" || friend.status === "spectating",
    spectate: friend.room_id !== null && (friend.status === "in_game" || friend.status === "spectating"),
  };
}

/** Their live invite to you: inviting them back takes that seat instead of opening a second room. */
export function inviteFrom(friend: Friend, invites: FriendInvite[]): FriendInvite | null {
  return invites.find((i) => i.from_user_id === friend.user_id) ?? null;
}

/**
 * The match page polls friends (signed in) only where an invite can reach you:
 * a spectator, in a started match or not, or a player sitting alone in their own
 * private room. A player whose match has started is busy and is not polled.
 */
export function pollsInvitesInMatch(s: {
  launch: MatchLaunch | null;
  role: "player" | "spectator";
  view: unknown;
  matchId: string | null;
}): boolean {
  if (!s.launch?.friends || s.matchId === null) return false;
  if (s.role === "spectator") return true;
  return Boolean(s.launch.invite) && !s.view;
}

export function statusLabel(friend: Friend): string {
  switch (friend.status) {
    case "in_game":
      return friend.ranked ? "In a ranked game" : "In a game";
    case "waiting":
      return "Waiting in a private room";
    case "spectating":
      return "Watching a game";
    case "online":
      return "Online";
    default:
      return "Offline";
  }
}
