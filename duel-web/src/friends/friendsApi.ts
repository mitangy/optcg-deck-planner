import type { components } from "@optcg/api-client";
import { apiCall } from "../api/http";
import type { MatchLaunch } from "../state/DuelSession";

export type FriendStatus = "offline" | "online" | "waiting" | "in_game" | "spectating";

export type Friend = {
  user_id: number;
  username: string;
  status: FriendStatus;
  room_id: string | null;
  server_url?: string | null;
  ranked: boolean;
};

export type FriendRequest = components["schemas"]["FriendRequestOut"];

export type FriendInvite = components["schemas"]["DuelInviteOut"];

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

export function friendActions(friend: Friend): { invite: boolean; spectate: boolean } {
  return {
    invite: friend.status === "online" || friend.status === "waiting" || friend.status === "spectating",
    spectate: friend.room_id !== null && (friend.status === "in_game" || friend.status === "spectating"),
  };
}

export function inviteFrom(friend: Friend, invites: FriendInvite[]): FriendInvite | null {
  return invites.find((i) => i.from_user_id === friend.user_id) ?? null;
}

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
