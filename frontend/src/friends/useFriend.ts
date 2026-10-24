import { useQuery } from "@tanstack/react-query";
import { friendsApi, type Friend } from "./friendsApi";

/** Resolves /friends/:username to a friend from your list. `friend` is null once the list loaded and they are not on it. */
export function useFriend(username: string | undefined) {
  const list = useQuery({ queryKey: ["friends"], queryFn: friendsApi.list });
  const wanted = (username ?? "").toLowerCase();
  const friend: Friend | null = list.data?.friends.find((f) => f.username.toLowerCase() === wanted) ?? null;
  return { friend, isLoading: list.isLoading, error: list.error };
}
