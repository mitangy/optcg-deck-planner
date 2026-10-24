import { useEffect, useState } from "react";
import { fetchAuthMe, type AuthUser } from "../net/api";

/** The signed-in account's role; null while loading, signed out or on a failed call. */
export function useAccountRole(): AuthUser["role"] | null {
  const [role, setRole] = useState<AuthUser["role"] | null>(null);
  useEffect(() => {
    let live = true;
    fetchAuthMe()
      .then((u) => live && setRole(u?.role ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return role;
}
