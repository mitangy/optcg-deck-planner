import { useEffect, useRef, useState } from "react";
import { usePolling } from "../../lib/usePolling";
import { mintOwnerToken } from "../../net/api";
import { fetchActiveMatches, pickOtherDeviceMatch, type ActiveMatch } from "../../net/activeMatches";
import { loadMatchResume } from "../../net/matchResume";

export function useOtherDeviceMatch(opts: {
  authChecked: boolean;
  matchOwner: "session" | "dev" | undefined;
  devUserKey: string;
  serverUrl: string;
}): ActiveMatch | null {
  const { authChecked, matchOwner, devUserKey, serverUrl } = opts;
  const [otherDevice, setOtherDevice] = useState<ActiveMatch | null>(null);
  const enabled = authChecked && Boolean(matchOwner);
  const generation = useRef(0);

  useEffect(() => {
    const gen = generation;
    gen.current++;
    if (!enabled) setOtherDevice(null);
    return () => {
      gen.current++;
    };
  }, [enabled, matchOwner]);

  usePolling(
    async () => {
      const mine = generation.current;
      try {
        const token = await mintOwnerToken(matchOwner, devUserKey.trim());
        if (!token || mine !== generation.current) return;
        const matches = await fetchActiveMatches(serverUrl, token);
        if (mine !== generation.current) return;
        setOtherDevice(pickOtherDeviceMatch(matches, loadMatchResume()));
      } catch {
        /* optional card: stay silent */
      }
    },
    null,
    enabled,
    matchOwner,
  );

  return otherDevice;
}
