import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { setSignedInHint } from "../prerendered";

/** The one React Query key for the session. Every read, patch and invalidation of it goes through this. */
export const meQueryKey = ["me"] as const;

/**
 * The session query. Every reader must use this hook: the signed-in hint (#914) is written by its queryFn, so a
 * reader with its own queryFn under the same key could own the fetch and skip the hint.
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const user = await api.me();
      setSignedInHint(user != null);
      return user;
    },
  });
}
