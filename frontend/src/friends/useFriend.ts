import { useQuery } from "@tanstack/react-query";
import { friendsApi, type Friend } from "./friendsApi";
import { qk } from "../cache/queryKeys";

export function useFriend(username: string | undefined) {
  const list = useQuery({ queryKey: qk.friends(), queryFn: friendsApi.list });
  const wanted = (username ?? "").toLowerCase();
  const friend: Friend | null = list.data?.friends.find((f) => f.username.toLowerCase() === wanted) ?? null;
  return { friend, isLoading: list.isLoading, error: list.error };
}
