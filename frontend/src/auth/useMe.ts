import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { setSignedInHint } from "../app/prerendered";
import { qk } from "../cache/queryKeys";

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
