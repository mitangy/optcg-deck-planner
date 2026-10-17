import { useEffect, useState } from "react";
import { SAVED_DECKS_CHANGED_EVENT } from "./storage";

/** Bumps when account sync changes the saved decks, so a page that lists them re-reads. */
export function useSavedDecksVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(SAVED_DECKS_CHANGED_EVENT, bump);
    return () => window.removeEventListener(SAVED_DECKS_CHANGED_EVENT, bump);
  }, []);
  return version;
}
