import { useEffect, useMemo, useState } from "react";
import { canOfferFullscreen, readInstallEnv } from "../../installPrompt";

export function useFullscreen() {
  const fullscreenOffered = useMemo(() => canOfferFullscreen(readInstallEnv()), []);
  const [isFullscreen, setIsFullscreen] = useState(
    () => typeof document !== "undefined" && document.fullscreenElement != null,
  );
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  function toggleFullscreen() {
    const request =
      document.fullscreenElement != null
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
    request.catch(() => {});
  }
  return { fullscreenOffered, isFullscreen, toggleFullscreen };
}
