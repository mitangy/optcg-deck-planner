import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { setSignedInHint } from "../app/prerendered";
import { qk } from "../cache/queryKeys";

/**
 * The session query. Every reader must use this hook: the signed-in hint (#914) is written by its queryFn, so a
 * reader with its own queryFn under the same key could own the fetch and skip the hint.
 */
export function useMe() {
  return useQuery({
    queryKey: qk.me(),
    queryFn: async () => {
      const user = await api.me();
      setSignedInHint(user != null);
      return user;
    },
  });
}
