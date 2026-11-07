import { useEffect, useState } from "react";

/** Desktop and tablets (a fine pointer, or 640px and wider) get the resizable drawer; anything else gets the phone sheet. */
export const DRAWER_QUERY = "(min-width: 640px), (pointer: fine)";
/** Windows too short for the chat's name on its own row under the header (#970). */
export const SHORT_QUERY = "(max-height: 500px)";

export function useMedia(query: string): boolean {
  const get = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}
