/** Duel-web ↔ FastAPI friends list, presence status, and private-room invites. */
import { getApiBaseUrl } from "../config";
import { ApiError } from "../net/api";
import type { MatchLaunch } from "../state/DuelSession";

export type FriendStatus = "offline" | "online" | "waiting" | "in_game" | "spectating";

export type Friend = {
  user_id: number;
  username: string;
  status: FriendStatus;
  /** Room the friend is playing or watching; only set when it can be spectated. */
  room_id: string | null;
  ranked: boolean;
};

export type FriendRequest = { user_id: number; username: string };

export type FriendInvite = {
  id: number;
  from_user_id: number;
  from_username: string;
  room_id: string;
  /** Epoch seconds. */
  expires_at: number;
};

export type FriendsState = {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  invites: FriendInvite[];
};

async function call<T>(path: string, init: RequestInit = {}, fallback = "Request failed"): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    ...init,
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    let detail = `${fallback} (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

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

export function inviteFriend(userId: number, roomId: string): Promise<FriendInvite> {
  return call<FriendInvite>(
    `/friends/${userId}/invite`,
    { method: "POST", body: JSON.stringify({ room_id: roomId }) },
    "Could not send invite",
  );
}

export function dismissInvite(inviteId: number): Promise<unknown> {
  return call(`/friends/invites/${inviteId}`, { method: "DELETE" }, "Could not dismiss invite");
}

/** Which actions a friend row offers. */
export function friendActions(friend: Friend): { invite: boolean; spectate: boolean } {
  return {
    // Someone free: in the lobby, or alone in their own private room, where the
    // waiting board shows incoming invites too.
    invite: friend.status === "online" || friend.status === "waiting",
    spectate: friend.room_id !== null && (friend.status === "in_game" || friend.status === "spectating"),
  };
}

/** Their live invite to you: inviting them back takes that seat instead of opening a second room. */
export function inviteFrom(friend: Friend, invites: FriendInvite[]): FriendInvite | null {
  return invites.find((i) => i.from_user_id === friend.user_id) ?? null;
}

/**
 * The waiting board polls friends only while you sit alone in your own private
 * room (signed in): otherwise an invite sent to you there would never show.
 */
export function pollsInvitesWhileWaiting(s: {
  launch: MatchLaunch | null;
  role: "player" | "spectator";
  view: unknown;
  matchId: string | null;
}): boolean {
  return Boolean(s.launch?.invite && s.launch.friends) && s.role === "player" && !s.view && s.matchId !== null;
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
